/**
 * 出荷データ src/stages.js を独立検証する(ESM)。
 * 実行: node scripts/verify_stages.js
 *
 * 各ステージについて以下を確認:
 *   - 5x5 / エリアが5つ・各5マス
 *   - フル探索で解がちょうど1個(一意解)
 *   - solution がソルバ解と一致し、ルールを満たす
 *   - 盤面(regions)に重複が無い
 */
import { STAGES } from "../src/stages.js";

const N = 5;

function solveAll(regions) {
  const region = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      region[r * N + c] = regions[r].charCodeAt(c) - 65;
  const colUsed = Array(N).fill(false);
  const regUsed = Array(N).fill(false);
  const placed = [];
  const sols = [];
  function rec(row) {
    if (row === N) {
      sols.push(placed.slice());
      return;
    }
    for (let c = 0; c < N; c++) {
      if (colUsed[c]) continue;
      const rg = region[row * N + c];
      if (regUsed[rg]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - c) < 2) continue;
      colUsed[c] = true;
      regUsed[rg] = true;
      placed[row] = c;
      rec(row + 1);
      colUsed[c] = false;
      regUsed[rg] = false;
    }
  }
  rec(0);
  return sols;
}

let pass = 0;
let fail = 0;
const seen = new Set();

for (const st of STAGES) {
  const problems = [];

  // 形式
  if (!Array.isArray(st.regions) || st.regions.length !== N)
    problems.push("regions行数!=5");
  else
    for (const row of st.regions)
      if (typeof row !== "string" || row.length !== N) problems.push("行長!=5");

  // エリア数・サイズ
  const cnt = {};
  st.regions.forEach((row) => {
    for (const ch of row) cnt[ch] = (cnt[ch] || 0) + 1;
  });
  if (Object.keys(cnt).length !== 5) problems.push("エリア数!=5");
  for (const k in cnt) if (cnt[k] !== 5) problems.push(`エリア${k}サイズ${cnt[k]}`);

  // 一意解
  const sols = solveAll(st.regions);
  if (sols.length !== 1) problems.push(`解の個数=${sols.length}`);

  // solution 一致
  if (sols.length === 1) {
    const solCols = st.solution.map((p) => p[1]);
    for (let r = 0; r < N; r++)
      if (st.solution[r][0] !== r) problems.push("solution行順不正");
    if (solCols.join(",") !== sols[0].join(",")) problems.push("solution不一致");
  }

  // 盤面重複
  const sig = st.regions.join("|");
  if (seen.has(sig)) problems.push("盤面重複");
  seen.add(sig);

  if (problems.length) {
    fail++;
    console.log("FAIL", st.id, problems.join("; "));
  } else {
    pass++;
  }
}

const diff = { 1: 0, 2: 0, 3: 0 };
STAGES.forEach((s) => (diff[s.difficulty] = (diff[s.difficulty] || 0) + 1));

console.log(`\nstages=${STAGES.length} unique_boards=${seen.size}`);
console.log("difficulty distribution:", diff);
console.log(`==== VERIFY: PASS=${pass} FAIL=${fail} ====`);
process.exit(fail === 0 ? 0 : 1);
