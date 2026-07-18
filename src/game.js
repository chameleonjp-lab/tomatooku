/**
 * トマトオク ゲームロジック (DOM 非依存)
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

export const SESSION_STATUS = Object.freeze({
  READY: "ready",
  PLAYING: "playing",
  STAGE_TRANSITION: "stageTransition",
  RESULT: "result",
  RETIRED: "retired",
});

/** 単調増加時計。ブラウザ/Nodeの performance.now() を優先する。 */
export function monotonicNow() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.performance &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function createPlayId() {
  const cryptoObject =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `play-${Date.now().toString(36)}-${random}`;
}

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

/** ステージの正解パターン署名(行ごとの列番号)。重複検出に使う。 */
export function solutionSignature(stage) {
  return stage.solution.map((p) => p[1]).join(",");
}

/**
 * 難易度グループ(1/2/3)から1問ずつ選び、3ステージを返す。
 * 同一プレイ内ではステージIDと正解パターンの重複を避ける。
 */
export function pickStages(rand = Math.random) {
  const groups = { 1: [], 2: [], 3: [] };
  for (const st of STAGES) {
    if (groups[st.difficulty]) groups[st.difficulty].push(st);
  }

  const chosen = [];
  const usedIds = new Set();
  const usedSolutions = new Set();

  for (const diff of [1, 2, 3]) {
    const inGroup = groups[diff].filter((s) => !usedIds.has(s.id));
    const source =
      inGroup.length > 0
        ? inGroup
        : STAGES.filter((s) => !usedIds.has(s.id));
    const shuffledSource = shuffled(source, rand);
    const distinct = shuffledSource.filter(
      (s) => !usedSolutions.has(solutionSignature(s))
    );
    const pick = (distinct.length > 0 ? distinct : shuffledSource)[0];

    if (!pick) {
      throw new Error(`difficulty ${diff} のステージを選出できません`);
    }

    usedIds.add(pick.id);
    usedSolutions.add(solutionSignature(pick));
    chosen.push(pick);
  }

  return chosen;
}

/** regions 文字列配列を region id グリッド(row*N+col -> 0..4)に変換 */
export function buildRegionMap(regions) {
  const map = new Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      map[r * N + c] = regions[r].charCodeAt(c) - 65;
    }
  }
  return map;
}

/** 1ステージ分の盤面状態。 */
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

  canPlace(r, c) {
    if (this.placed[r][c]) return { ok: false, reason: "occupied" };
    if (this.count >= N) return { ok: false, reason: "full" };

    for (let cc = 0; cc < N; cc++) {
      if (cc !== c && this.placed[r][cc]) {
        return { ok: false, reason: "row" };
      }
    }
    for (let rr = 0; rr < N; rr++) {
      if (rr !== r && this.placed[rr][c]) {
        return { ok: false, reason: "col" };
      }
    }

    const region = this.regionMap[r * N + c];
    for (let rr = 0; rr < N; rr++) {
      for (let cc = 0; cc < N; cc++) {
        if (
          this.placed[rr][cc] &&
          this.regionMap[rr * N + cc] === region
        ) {
          return { ok: false, reason: "region" };
        }
      }
    }

    for (const [dr, dc] of DIRS8) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      if (this.placed[nr][nc]) {
        return { ok: false, reason: "adjacent" };
      }
    }

    return { ok: true, reason: null };
  }

  place(r, c) {
    if (!this.placed[r][c]) {
      this.placed[r][c] = true;
      this.count++;
    }
  }

  remove(r, c) {
    if (this.placed[r][c]) {
      this.placed[r][c] = false;
      this.count--;
      this.cleared = false;
    }
  }

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

    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dr = Math.abs(cells[i][0] - cells[j][0]);
        const dc = Math.abs(cells[i][1] - cells[j][1]);
        if (dr <= 1 && dc <= 1) return false;
      }
    }
    return true;
  }

  remainingSolutionCells() {
    return this.stage.solution.filter(([r, c]) => !this.placed[r][c]);
  }

  applyHint() {
    if (this.cleared) return null;

    const solSet = new Set(
      this.stage.solution.map(([r, c]) => r * N + c)
    );

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

  canHint() {
    return !this.cleared && this.remainingSolutionCells().length > 0;
  }
}

/**
 * プレイ全体の状態。
 *
 * タイマーはステージ開始/終了を明示的に呼ぶ。advance()は次ステージの
 * 計測を開始しないため、UIは盤面描画後に startStage() を呼ぶ。
 */
export class GameSession {
  constructor(playerName, rand = Math.random, options = {}) {
    this.playerName = playerName;
    this.playId = String(options.playId || createPlayId());
    this.mode = options.mode || "legacy";
    this.stages = pickStages(rand);
    this.index = 0;
    this.states = this.stages.map((s) => new StageState(s));
    this.mistakeCount = 0;
    this.hintCount = 0;

    this.stageTimesMs = [];
    this.accumulatedMs = 0;
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.startedAt = null;
    this.startTime = null;
    this.completedAt = null;
    this.endTime = null;
    this.status = SESSION_STATUS.READY;
  }

  get current() {
    return this.states[this.index];
  }

  get stageNumber() {
    return this.index + 1;
  }

  get totalStages() {
    return this.stages.length;
  }

  isLastStage() {
    return this.index === this.states.length - 1;
  }

  start(now = monotonicNow()) {
    if (this.startedAt == null) {
      this.startedAt = now;
      this.startTime = now;
    }
    return this.startStage(now);
  }

  startStage(now = monotonicNow()) {
    if (
      this.status === SESSION_STATUS.RESULT ||
      this.status === SESSION_STATUS.RETIRED ||
      this.stageStartedAt != null
    ) {
      return false;
    }

    if (this.startedAt == null) {
      this.startedAt = now;
      this.startTime = now;
    }

    this.stageStartedAt = now;
    this.stageStartTime = now;
    this.status = SESSION_STATUS.PLAYING;
    return true;
  }

  finishStage(now = monotonicNow()) {
    if (this.stageStartedAt == null) return 0;

    const duration = Math.max(0, now - this.stageStartedAt);
    this.stageTimesMs[this.index] = duration;
    this.accumulatedMs = this.stageTimesMs.reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0
    );
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.status = SESSION_STATUS.STAGE_TRANSITION;
    return duration;
  }

  clearCurrentStage(now = monotonicNow()) {
    return this.finishStage(now);
  }

  advance(now = monotonicNow()) {
    this.finishStage(now);

    if (this.index < this.states.length - 1) {
      this.index++;
      this.status = SESSION_STATUS.STAGE_TRANSITION;
      return false;
    }

    this.completedAt = now;
    this.endTime = now;
    this.status = SESSION_STATUS.RESULT;
    return true;
  }

  currentStageElapsedMs(now = monotonicNow()) {
    if (this.stageStartedAt == null) return 0;
    return Math.max(0, now - this.stageStartedAt);
  }

  elapsedMs(now = monotonicNow()) {
    return this.accumulatedMs + this.currentStageElapsedMs(now);
  }

  retire() {
    if (this.status === SESSION_STATUS.RESULT) return false;
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.status = SESSION_STATUS.RETIRED;
    return true;
  }

  score(now = monotonicNow()) {
    return computeScore({
      elapsedMs: this.elapsedMs(now),
      mistakeCount: this.mistakeCount,
      hintCount: this.hintCount,
    });
  }
}

export function computeScore({ elapsedMs, mistakeCount, hintCount }) {
  const timePenalty = Math.floor(Math.max(0, Number(elapsedMs) || 0));
  const mistakePenalty =
    Math.max(0, Number(mistakeCount) || 0) * SCORE.MISTAKE_PENALTY;
  const hintPenalty =
    Math.max(0, Number(hintCount) || 0) * SCORE.HINT_PENALTY;
  return Math.max(
    0,
    SCORE.BASE - timePenalty - mistakePenalty - hintPenalty
  );
}

export function formatTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSec = safeMs / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const tenth = Math.floor((safeMs % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${tenth}`;
}
