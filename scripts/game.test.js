/**
 * トマトオク ゲームロジックのテスト(DOM 非依存)。
 * 実行: node scripts/game.test.js
 */
import {
  GameSession,
  StageState,
  pickStages,
  solutionSignature,
  computeScore,
  formatTime,
  SCORE,
  SESSION_STATUS,
  N,
} from "../src/game.js";
import { STAGES } from "../src/stages.js";

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ FAIL:", msg);
  }
}
function section(name) {
  console.log("\n# " + name);
}

function seededRand(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

section("ステージバンク");
ok(STAGES.length >= 30, `30問以上ある (${STAGES.length})`);
const diffCount = { 1: 0, 2: 0, 3: 0 };
STAGES.forEach((stage) => {
  diffCount[stage.difficulty] = (diffCount[stage.difficulty] || 0) + 1;
});
ok(
  diffCount[1] >= 1 && diffCount[2] >= 1 && diffCount[3] >= 1,
  "各難易度が存在"
);

section("ステージ選出 (pickStages)");
let selectionsValid = true;
for (let seed = 1; seed <= 500; seed++) {
  const stages = pickStages(seededRand(seed));
  const ids = stages.map((stage) => stage.id);
  const signatures = stages.map(solutionSignature);
  if (
    stages.length !== 3 ||
    new Set(ids).size !== 3 ||
    new Set(signatures).size !== 3
  ) {
    selectionsValid = false;
    break;
  }
}
ok(
  selectionsValid,
  "500回の選出すべてでID・正解パターンが重複しない"
);

const example = pickStages(seededRand(42));
ok(
  example[0].difficulty <= example[1].difficulty &&
    example[1].difficulty <= example[2].difficulty,
  "難易度が やさしい→ふつう→むずかしい の順"
);

section("solution でクリア判定");
let allClear = true;
for (const stage of STAGES) {
  const state = new StageState(stage);
  let mistakes = 0;
  for (const [r, c] of stage.solution) {
    const result = state.tap(r, c);
    if (result.type === "mistake") mistakes++;
  }
  if (!state.cleared || mistakes > 0) {
    allClear = false;
    console.log(
      `  ✗ ${stage.id}: cleared=${state.cleared} mistakes=${mistakes}`
    );
  }
}
ok(allClear, "全ステージをsolution順タップでクリアできる");

section("誤タップ判定");
{
  const stage = STAGES[0];
  const state = new StageState(stage);
  const [r0, c0] = stage.solution[0];
  state.tap(r0, c0);

  let rowMistake = false;
  for (let c = 0; c < N; c++) {
    if (c === c0) continue;
    const result = state.tap(r0, c);
    rowMistake = result.type === "mistake" && result.reason === "row";
    ok(!state.has(r0, c), "誤タップ時は置かれない");
    break;
  }
  ok(rowMistake, "同じ行への配置はrow誤タップ");

  const state2 = new StageState(stage);
  state2.tap(2, 2);
  const adjacent = state2.tap(1, 1);
  ok(
    adjacent.type === "mistake" && adjacent.reason === "adjacent",
    "斜め隣接はadjacent誤タップ"
  );

  const state3 = new StageState(stage);
  const first = state3.tap(0, 0);
  ok(first.type !== "mistake", "空盤面の最初の1手は誤タップにならない");
}

section("取り除き");
{
  const state = new StageState(STAGES[0]);
  const [r, c] = STAGES[0].solution[0];
  state.tap(r, c);
  ok(state.has(r, c) && state.count === 1, "置いた");
  const result = state.tap(r, c);
  ok(
    result.type === "remove" && !state.has(r, c) && state.count === 0,
    "取り除いた"
  );
}

section("ヒント");
{
  const state = new StageState(STAGES[0]);
  const solutionSet = new Set(
    STAGES[0].solution.map(([r, c]) => r * N + c)
  );

  outer:
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (solutionSet.has(r * N + c)) continue;
      if (state.canPlace(r, c).ok) {
        state.place(r, c);
        break outer;
      }
    }
  }

  const hinted = state.applyHint();
  ok(hinted !== null, "ヒントでセルが確定される");

  let subset = true;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (state.has(r, c) && !solutionSet.has(r * N + c)) {
        subset = false;
      }
    }
  }
  ok(subset, "ヒント後の盤面はsolutionの部分集合");

  const state2 = new StageState(STAGES[Math.min(2, STAGES.length - 1)]);
  let guard = 0;
  while (state2.canHint() && guard < 10) {
    state2.applyHint();
    guard++;
  }
  ok(state2.cleared, "ヒント連打で必ずクリア");
  ok(!state2.canHint(), "クリア後はヒント不可");
}

section("スコア計算");
ok(
  computeScore({ elapsedMs: 0, mistakeCount: 0, hintCount: 0 }) === SCORE.BASE,
  "満点 = BASE"
);
ok(
  computeScore({ elapsedMs: 10000, mistakeCount: 2, hintCount: 1 }) ===
    SCORE.BASE - 10000 - SCORE.MISTAKE_PENALTY * 2 - SCORE.HINT_PENALTY,
  "減点が正しい"
);
ok(
  computeScore({ elapsedMs: 10 ** 9, mistakeCount: 0, hintCount: 0 }) === 0,
  "0未満にならない"
);

section("playId");
{
  const first = new GameSession("a", seededRand(1));
  const second = new GameSession("b", seededRand(2));
  ok(Boolean(first.playId), "playIdが生成される");
  ok(first.playId !== second.playId, "プレイごとにplayIdが異なる");
}

section("タイマー開始前");
{
  const session = new GameSession("t", seededRand(3));
  ok(session.elapsedMs(5000) === 0, "開始前は0ms");
  ok(session.status === SESSION_STATUS.READY, "開始前statusはready");
}

section("描画後の明示開始");
{
  const session = new GameSession("t", seededRand(4));
  session.startStage(100);
  ok(session.status === SESSION_STATUS.PLAYING, "startStageでplaying");
  ok(session.elapsedMs(2100) === 2000, "進行中は経過する");
}

section("演出時間と描画待ちの除外");
{
  const session = new GameSession("t", seededRand(5));

  session.startStage(100);
  session.finishStage(1100);
  ok(session.elapsedMs(6100) === 1000, "演出中は増えない");

  const finished1 = session.advance(6100);
  ok(!finished1, "1問目では未完了");
  ok(
    session.status === SESSION_STATUS.STAGE_TRANSITION,
    "advance後もstageTransition"
  );
  ok(session.elapsedMs(9000) === 1000, "次盤面描画待ちも増えない");

  session.startStage(9000);
  session.finishStage(11000);
  session.advance(15000);

  session.startStage(16000);
  session.finishStage(19000);
  const finished3 = session.advance(20000);

  ok(finished3, "3問目で完了");
  ok(session.elapsedMs(50000) === 6000, "実プレイ時間だけ合計");
  ok(
    JSON.stringify(session.stageTimesMs) === JSON.stringify([1000, 2000, 3000]),
    "ステージ別時間を保持"
  );
  ok(
    session.accumulatedMs ===
      session.stageTimesMs.reduce((sum, value) => sum + value, 0),
    "ステージ時間合計と累計が一致"
  );
  ok(session.status === SESSION_STATUS.RESULT, "完了後statusはresult");
}

section("finishStage二重呼び出し");
{
  const session = new GameSession("t", seededRand(6));
  session.startStage(0);
  const firstDuration = session.finishStage(1000);
  const secondDuration = session.finishStage(5000);
  ok(firstDuration === 1000, "初回finishStageが計上");
  ok(secondDuration === 0, "二重finishStageは0");
  ok(session.elapsedMs(9000) === 1000, "二重加算されない");
  ok(session.stageTimesMs.length === 1, "配列も重複しない");
}

section("リタイア");
{
  const session = new GameSession("t", seededRand(7));
  session.startStage(0);
  session.retire();
  ok(session.status === SESSION_STATUS.RETIRED, "statusがretired");
  ok(session.currentStageElapsedMs(5000) === 0, "計測を停止");
  ok(session.startStage(6000) === false, "リタイア後は再開しない");
}

section("セッション全体フロー");
{
  const session = new GameSession("テスター", seededRand(8));
  let now = 0;
  let finished = false;

  for (let i = 0; i < 3; i++) {
    session.startStage(now);
    const state = session.current;
    for (const [r, c] of state.stage.solution) state.tap(r, c);
    ok(state.cleared, `ステージ${i + 1}クリア`);
    now += 1000;
    session.finishStage(now);
    now += 850;
    finished = session.advance(now);
  }

  ok(finished, "3ステージ目でfinished=true");
  ok(session.endTime != null, "endTime互換値が設定される");
}

section("formatTime");
ok(formatTime(0) === "0:00.0", "0ms");
ok(formatTime(65400) === "1:05.4", "65.4s -> 1:05.4");
ok(formatTime(-1) === "0:00.0", "負値を0へ丸める");

console.log(`\n==== TEST RESULT: PASS=${pass} FAIL=${fail} ====`);
process.exit(fail === 0 ? 0 : 1);
