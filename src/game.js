/**
 * トマトク ゲームロジック (DOM 非依存)
 *
 * 盤面ルール (5x5):
 *   - 各行に🍅は1個 / 各列に🍅は1個 / 各エリアに🍅は1個
 *   - 🍅同士は上下左右斜めで隣接しない
 *
 * 1プレイ = ランダムな3ステージ(やさしい/ふつう/むずかしい 各1)。
 */

import { STAGES } from "./stages.js";

export const N = 5;

export const SCORE = {
  BASE: 180000,
  MISTAKE_PENALTY: 3000,
  HINT_PENALTY: 30000,
};

/** 8方向(上下左右斜め) */
const DIRS8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Fisher-Yates シャッフル(配列のコピーを返す) */
function shuffled(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 難易度グループ(1/2/3)から1問ずつ選び、3ステージを返す。
 * 異なる難易度から取るため同一プレイ内で重複しない。
 */
export function pickStages(rand = Math.random) {
  const groups = { 1: [], 2: [], 3: [] };
  for (const st of STAGES) {
    if (groups[st.difficulty]) groups[st.difficulty].push(st);
  }
  const chosen = [];
  const usedIds = new Set();
  for (const diff of [1, 2, 3]) {
    const pool = groups[diff].filter((s) => !usedIds.has(s.id));
    // グループが空の場合のフォールバック(全ステージから補完)
    const source = pool.length > 0 ? pool : STAGES.filter((s) => !usedIds.has(s.id));
    const pick = shuffled(source, rand)[0];
    usedIds.add(pick.id);
    chosen.push(pick);
  }
  return chosen;
}

/** regions 文字列配列を region id グリッド(row*N+col -> 0..4)に変換 */
export function buildRegionMap(regions) {
  const map = new Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      map[r * N + c] = regions[r].charCodeAt(c) - 65; // 'A' = 0
    }
  }
  return map;
}

/**
 * 1ステージ分の盤面状態。placed[r][c] = true なら🍅あり。
 */
export class StageState {
  constructor(stage) {
    this.stage = stage;
    this.regionMap = buildRegionMap(stage.regions);
    this.placed = Array.from({ length: N }, () => new Array(N).fill(false));
    this.count = 0;
    this.cleared = false;
  }

  has(r, c) {
    return this.placed[r][c];
  }

  /**
   * (r,c) に🍅を「見えているルール上」置けるか。
   * 既に置かれているマスは置けない(=取り除き操作)。
   * 返り値: { ok: boolean, reason: string|null }
   */
  canPlace(r, c) {
    if (this.placed[r][c]) return { ok: false, reason: "occupied" };
    if (this.count >= N) return { ok: false, reason: "full" };
    // 行
    for (let cc = 0; cc < N; cc++) {
      if (cc !== c && this.placed[r][cc]) return { ok: false, reason: "row" };
    }
    // 列
    for (let rr = 0; rr < N; rr++) {
      if (rr !== r && this.placed[rr][c]) return { ok: false, reason: "col" };
    }
    // エリア
    const region = this.regionMap[r * N + c];
    for (let rr = 0; rr < N; rr++) {
      for (let cc = 0; cc < N; cc++) {
        if (this.placed[rr][cc] && this.regionMap[rr * N + cc] === region) {
          return { ok: false, reason: "region" };
        }
      }
    }
    // 隣接(8方向)
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      if (this.placed[nr][nc]) return { ok: false, reason: "adjacent" };
    }
    return { ok: true, reason: null };
  }

  /** 🍅を置く(検証なし。canPlace 済みのときに使う) */
  place(r, c) {
    if (!this.placed[r][c]) {
      this.placed[r][c] = true;
      this.count++;
    }
  }

  /** 🍅を取り除く */
  remove(r, c) {
    if (this.placed[r][c]) {
      this.placed[r][c] = false;
      this.count--;
      this.cleared = false;
    }
  }

  /**
   * タップ処理。返り値:
   *   { type: "place" } 置いた
   *   { type: "remove" } 取り除いた
   *   { type: "mistake", reason } 誤タップ(置けない)
   */
  tap(r, c) {
    if (this.placed[r][c]) {
      this.remove(r, c);
      return { type: "remove" };
    }
    const chk = this.canPlace(r, c);
    if (!chk.ok) {
      return { type: "mistake", reason: chk.reason };
    }
    this.place(r, c);
    if (this.checkCleared()) this.cleared = true;
    return { type: "place" };
  }

  /** クリア条件を満たしているか(明示チェック) */
  checkCleared() {
    if (this.count !== N) return false;
    const rows = new Array(N).fill(0);
    const cols = new Array(N).fill(0);
    const regs = new Array(N).fill(0);
    const cells = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!this.placed[r][c]) continue;
        rows[r]++;
        cols[c]++;
        regs[this.regionMap[r * N + c]]++;
        cells.push([r, c]);
      }
    }
    if (rows.some((x) => x !== 1)) return false;
    if (cols.some((x) => x !== 1)) return false;
    if (regs.some((x) => x !== 1)) return false;
    // 隣接禁止
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dr = Math.abs(cells[i][0] - cells[j][0]);
        const dc = Math.abs(cells[i][1] - cells[j][1]);
        if (dr <= 1 && dc <= 1) return false;
      }
    }
    return true;
  }

  /** solution に含まれるがまだ置かれていないセル一覧 */
  remainingSolutionCells() {
    return this.stage.solution.filter(([r, c]) => !this.placed[r][c]);
  }

  /**
   * ヒント: 未配置の正解セルを1つ確定配置する。
   * 進行不能を避けるため、正解でない(誤った)配置を先に取り除き、
   * 盤面を必ず solution の部分集合に正規化してから1マス追加する。
   * 返り値: 追加したセル [r,c] または null(残り正解なし)。
   */
  applyHint() {
    if (this.cleared) return null;
    // solution セル集合
    const solSet = new Set(this.stage.solution.map(([r, c]) => r * N + c));
    // 正解でない配置を除去
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.placed[r][c] && !solSet.has(r * N + c)) {
          this.remove(r, c);
        }
      }
    }
    const remaining = this.remainingSolutionCells();
    if (remaining.length === 0) return null;
    const [r, c] = remaining[0];
    this.place(r, c);
    if (this.checkCleared()) this.cleared = true;
    return [r, c];
  }

  /** ヒントが使えるか(クリア済みでなく、残り正解がある) */
  canHint() {
    return !this.cleared && this.remainingSolutionCells().length > 0;
  }
}

/**
 * プレイ全体の状態(3ステージ・累計の誤タップ/ヒント・タイマー)。
 */
export class GameSession {
  constructor(playerName, rand = Math.random) {
    this.playerName = playerName;
    this.stages = pickStages(rand);
    this.index = 0;
    this.states = this.stages.map((s) => new StageState(s));
    this.mistakeCount = 0;
    this.hintCount = 0;
    this.startTime = null;
    this.endTime = null;
  }

  start(now = Date.now()) {
    this.startTime = now;
  }

  get current() {
    return this.states[this.index];
  }

  get stageNumber() {
    return this.index + 1; // 1-based
  }

  get totalStages() {
    return this.stages.length;
  }

  /** 次のステージへ。最後なら true(=全クリア)を返す */
  advance(now = Date.now()) {
    if (this.index < this.states.length - 1) {
      this.index++;
      return false;
    }
    this.endTime = now;
    return true;
  }

  isLastStage() {
    return this.index === this.states.length - 1;
  }

  elapsedMs(now = Date.now()) {
    if (this.startTime == null) return 0;
    const end = this.endTime != null ? this.endTime : now;
    return Math.max(0, end - this.startTime);
  }

  /** 現在(または終了時)の見込みスコア */
  score(now = Date.now()) {
    return computeScore({
      elapsedMs: this.elapsedMs(now),
      mistakeCount: this.mistakeCount,
      hintCount: this.hintCount,
    });
  }
}

/** スコア計算(整数) */
export function computeScore({ elapsedMs, mistakeCount, hintCount }) {
  const timePenalty = Math.floor(elapsedMs);
  const mistakePenalty = mistakeCount * SCORE.MISTAKE_PENALTY;
  const hintPenalty = hintCount * SCORE.HINT_PENALTY;
  return Math.max(0, SCORE.BASE - timePenalty - mistakePenalty - hintPenalty);
}

/** ミリ秒を mm:ss.S 形式へ */
export function formatTime(ms) {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const tenth = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${tenth}`;
}
