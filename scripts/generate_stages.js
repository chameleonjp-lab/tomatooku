#!/usr/bin/env node
/**
 * トマトオク ステージ生成・検証スクリプト (ESM)
 *
 * ルール (5x5):
 *   - 各行に🍅は1個
 *   - 各列に🍅は1個
 *   - 各エリア(5マス)に🍅は1個
 *   - 🍅同士は上下左右斜めで隣接しない
 *
 * 本スクリプトは一意解を持つステージのみを採用し、src/stages.js を
 * 直接書き出す(乱数シード固定で再現可能)。実行: node scripts/generate_stages.js
 */

import { writeFileSync } from "fs";

const N = 5;

// --- 1. 有効な解(配置)の列挙 ---------------------------------------------
// 各行1個・各列1個 → 列の順列。隣接行は |Δcol| >= 2 (斜め隣接の禁止)。
// 行差>=2のセルは隣接し得ないので、隣接制約は連続行のみで十分。
function enumerateSolutions() {
  const results = [];
  const cols = [];
  const used = new Array(N).fill(false);
  function rec(row) {
    if (row === N) {
      results.push(cols.slice());
      return;
    }
    for (let c = 0; c < N; c++) {
      if (used[c]) continue;
      if (row > 0 && Math.abs(c - cols[row - 1]) < 2) continue;
      used[c] = true;
      cols[row] = c;
      rec(row + 1);
      used[c] = false;
    }
  }
  rec(0);
  // cols[row] = column。solution を [row,col] 配列へ。
  return results.map((cols) => cols.map((c, r) => [r, c]));
}

// --- 2. 解を含む連結エリア分割の生成 --------------------------------------
// 5つの解セルを種に、ランダムに領域を成長させ各サイズ5にする。
function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function key(r, c) {
  return r * N + c;
}
const DIRS4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function growRegions(solution, rand) {
  // region id grid, -1 = unassigned
  const grid = new Array(N * N).fill(-1);
  const regions = [];
  for (let i = 0; i < solution.length; i++) {
    const [r, c] = solution[i];
    grid[key(r, c)] = i;
    regions.push([[r, c]]);
  }
  let assigned = solution.length;
  const total = N * N;
  let guard = 0;
  while (assigned < total && guard < 100000) {
    guard++;
    // 成長させる領域(サイズ<5)を選ぶ。小さい順を優先しつつランダム性。
    const candidates = [];
    for (let i = 0; i < regions.length; i++) {
      if (regions[i].length >= 5) continue;
      // この領域に隣接する未割当セルを探す
      const frontier = [];
      for (const [r, c] of regions[i]) {
        for (const [dr, dc] of DIRS4) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          if (grid[key(nr, nc)] === -1) frontier.push([nr, nc]);
        }
      }
      if (frontier.length > 0) candidates.push([i, frontier]);
    }
    if (candidates.length === 0) break; // 行き詰まり
    // 小さい領域を優先(サイズが小さいほど成長機会を増やす)
    candidates.sort((a, b) => regions[a[0]].length - regions[b[0]].length);
    // 多様性のため: 多くは最小サイズ群から、時々それ以外からも成長させる。
    // ただし行き詰まり回避のため、サイズ差が2以上開いたら最小群に強制する。
    const minSize = regions[candidates[0][0]].length;
    const maxSize = regions[candidates[candidates.length - 1][0]].length;
    let poolCands;
    if (maxSize - minSize >= 2 || rand() < 0.7) {
      poolCands = candidates.filter((x) => regions[x[0]].length === minSize);
    } else {
      poolCands = candidates;
    }
    const pick = poolCands[Math.floor(rand() * poolCands.length)];
    const [rid, frontier] = pick;
    const [nr, nc] = frontier[Math.floor(rand() * frontier.length)];
    grid[key(nr, nc)] = rid;
    regions[rid].push([nr, nc]);
    assigned++;
  }
  if (assigned < total) return null;
  // 全領域サイズ5を確認
  for (const reg of regions) if (reg.length !== 5) return null;
  return grid;
}

function gridToRegionStrings(grid) {
  const letters = "ABCDE";
  const rows = [];
  for (let r = 0; r < N; r++) {
    let s = "";
    for (let c = 0; c < N; c++) s += letters[grid[key(r, c)]];
    rows.push(s);
  }
  return rows;
}

// --- 3. ソルバ (全解探索 / 一意性 + 難易度計測) ----------------------------
function parseRegions(regionStrings) {
  const region = new Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      region[key(r, c)] = regionStrings[r].charCodeAt(c) - 65;
    }
  }
  return region;
}

function solve(regionStrings) {
  const region = parseRegions(regionStrings);
  const colUsed = new Array(N).fill(false);
  const regUsed = new Array(N).fill(false);
  const placed = []; // [r,c] per row
  let solutions = 0;
  let nodes = 0;
  let firstSolution = null;

  function adjacentOk(r, c) {
    // 直前行のみチェックで十分(同列なし前提でも斜め隣接は前行のみ)
    if (r === 0) return true;
    const pc = placed[r - 1];
    return Math.abs(pc - c) >= 2;
  }

  function rec(row) {
    if (solutions > 1) return; // 2解見つかれば打ち切り(一意判定には十分)
    if (row === N) {
      solutions++;
      if (solutions === 1) firstSolution = placed.slice();
      return;
    }
    for (let c = 0; c < N; c++) {
      nodes++;
      if (colUsed[c]) continue;
      const rg = region[key(row, c)];
      if (regUsed[rg]) continue;
      if (!adjacentOk(row, c)) continue;
      colUsed[c] = true;
      regUsed[rg] = true;
      placed[row] = c;
      rec(row + 1);
      colUsed[c] = false;
      regUsed[rg] = false;
    }
  }
  rec(0);
  return { solutions, nodes, firstSolution };
}

// --- 4. メイン: 一意解ステージを集める ------------------------------------
function difficultyFromNodes(nodes) {
  // nodes(探索量)を難易度の代理指標に。閾値は実測分布から調整。
  if (nodes <= 30) return 1;
  if (nodes <= 45) return 2;
  return 3;
}

function main() {
  const solutions = enumerateSolutions();
  // 重複しない一意解盤面のプールを集め、難易度(探索量)の三分位で
  // 簡単/普通/難しいの3グループ各10問=30問を構成する。
  const seen = new Set();
  const pool = [];
  const POOL_TARGET = 60; // 30問を選ぶための余裕プール

  let seed = 12345;
  let attempts = 0;
  const maxAttempts = 2000000;
  while (attempts < maxAttempts && pool.length < POOL_TARGET) {
    attempts++;
    const rand = rng(seed++);
    const sol = solutions[Math.floor(rand() * solutions.length)];
    const grid = growRegions(sol, rand);
    if (!grid) continue;
    const regionStrings = gridToRegionStrings(grid);
    const sig = regionStrings.join("|");
    if (seen.has(sig)) continue;
    const { solutions: count, nodes, firstSolution } = solve(regionStrings);
    if (count !== 1) continue; // 一意解のみ
    seen.add(sig);
    const solArr = firstSolution.map((c, r) => [r, c]);
    pool.push({ regions: regionStrings, solution: solArr, nodes });
  }

  // 探索量(nodes)昇順に並べ、三分位で難易度を割り当てる。
  pool.sort((a, b) => a.nodes - b.nodes);
  const nodeVals = pool.map((p) => p.nodes);
  console.error(
    `enumSolutions=${solutions.length} attempts=${attempts} poolSize=${pool.length}`
  );
  console.error(
    `nodes min=${nodeVals[0]} max=${nodeVals[nodeVals.length - 1]} ` +
      `median=${nodeVals[Math.floor(nodeVals.length / 2)]}`
  );

  // プールから簡単10/普通10/難しい10を、各三分位の連続区間から取る。
  const out = [];
  let counter = 1;
  function emit(item, diff) {
    const id = "T" + String(counter).padStart(3, "0");
    counter++;
    out.push({
      id,
      difficulty: diff,
      regions: item.regions,
      solution: item.solution,
    });
  }
  const third = Math.floor(pool.length / 3);
  // 簡単: 先頭から10、普通: 中央付近から10、難しい: 末尾から10
  const easy = pool.slice(0, 10);
  const mid = pool.slice(third, third + 10);
  const hard = pool.slice(pool.length - 10);
  easy.forEach((it) => emit(it, 1));
  mid.forEach((it) => emit(it, 2));
  hard.forEach((it) => emit(it, 3));

  // 最終検証
  let ok = true;
  for (const st of out) {
    const v = validateStage(st);
    if (!v.valid) {
      ok = false;
      console.error(`INVALID ${st.id}: ${v.reason}`);
    }
  }
  console.error("final validation:", ok ? "ALL PASS" : "FAILURES");
  if (!ok) process.exit(1);

  // src/stages.js を整形して書き出す
  const lines = out.map(
    (st) =>
      `  { id: ${JSON.stringify(st.id)}, difficulty: ${st.difficulty}, ` +
      `regions: ${JSON.stringify(st.regions)}, solution: ${JSON.stringify(st.solution)} }`
  );
  const header = `/**
 * トマトオク ステージバンク (自動生成: scripts/generate_stages.js)
 *
 * 各ステージは 5x5。regions は 5 行の文字列で、A〜E の 5 エリアを表す。
 * 各エリアはちょうど 5 マス。solution は正解の🍅配置 [row, col] x5。
 * すべて一意解であることを scripts/verify_stages.js で検証済み。
 *
 * difficulty: 1=やさしい / 2=ふつう / 3=むずかしい (各10問)
 *
 * 手で編集しないこと。再生成は npm run gen を参照。
 */
export const STAGES = [`;
  const body = header + "\n" + lines.join(",\n") + "\n];\n\nexport default STAGES;\n";
  const url = new URL("../src/stages.js", import.meta.url);
  writeFileSync(url, body);
  console.error(`wrote src/stages.js (${out.length} stages)`);
}

// --- 検証関数(出力ステージの独立チェック) --------------------------------
function validateStage(st) {
  const { regions, solution } = st;
  if (!Array.isArray(regions) || regions.length !== N)
    return { valid: false, reason: "regions not 5 rows" };
  for (const row of regions)
    if (typeof row !== "string" || row.length !== N)
      return { valid: false, reason: "row not length 5" };
  // エリアが5つ・各5マス
  const counts = {};
  for (const row of regions)
    for (const ch of row) counts[ch] = (counts[ch] || 0) + 1;
  const keys = Object.keys(counts).sort();
  if (keys.length !== 5) return { valid: false, reason: "not 5 regions" };
  for (const k of keys)
    if (counts[k] !== 5) return { valid: false, reason: `region ${k} size ${counts[k]}` };
  // 一意解
  const { solutions, firstSolution } = solve(regions);
  if (solutions !== 1)
    return { valid: false, reason: `solutions=${solutions}` };
  // solution がルールを満たし、ソルバ解と一致
  const solCols = solution.map((p) => p[1]);
  for (let r = 0; r < N; r++) {
    if (solution[r][0] !== r)
      return { valid: false, reason: "solution row order" };
  }
  if (solCols.join(",") !== firstSolution.join(","))
    return { valid: false, reason: "solution mismatch solver" };
  return { valid: true };
}

main();
