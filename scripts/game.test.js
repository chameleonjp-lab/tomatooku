import assert from "node:assert/strict";
import {
  ADJUSTED_TIME,
  GAME_MODE,
  GameSession,
  N,
  OFFICIAL_STAGE_IDS,
  SESSION_STATUS,
  StageState,
  buildPracticeStageSets,
  computeAdjustedTime,
  formatAdjustedTime,
  formatCentiseconds,
  formatTime,
  pickStages,
  selectOfficialStages,
  selectPracticeStages,
  solutionSignature,
} from "../src/game.js";
import { STAGES } from "../src/stages.js";

let pass = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
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

test("ステージバンクは30問以上・各難易度あり", () => {
  assert.ok(STAGES.length >= 30);
  for (const difficulty of [1, 2, 3]) {
    assert.ok(STAGES.some((stage) => stage.difficulty === difficulty));
  }
});

test("公式ステージIDはT001→T011→T021で固定", () => {
  assert.deepEqual(OFFICIAL_STAGE_IDS, ["T001", "T011", "T021"]);
  const stages = selectOfficialStages();
  assert.deepEqual(stages.map((stage) => stage.id), OFFICIAL_STAGE_IDS);
  assert.deepEqual(stages.map((stage) => stage.difficulty), [1, 2, 3]);
  assert.equal(new Set(stages.map(solutionSignature)).size, 3);
});

test("公式設定の欠損・難易度順違反・正解重複を拒否", () => {
  assert.throws(() => selectOfficialStages(["T001", "T011"]));
  assert.throws(() => selectOfficialStages(["T001", "T999", "T021"]));
  assert.throws(() => selectOfficialStages(["T011", "T001", "T021"]));
  assert.throws(() => selectOfficialStages(["T001", "T011", "T022"]));
});

test("練習用の有効3問組を事前列挙できる", () => {
  const sets = buildPracticeStageSets();
  assert.ok(sets.length > 0);
  for (const stages of sets) {
    assert.deepEqual(stages.map((stage) => stage.difficulty), [1, 2, 3]);
    assert.equal(new Set(stages.map((stage) => stage.id)).size, 3);
    assert.equal(new Set(stages.map(solutionSignature)).size, 3);
  }
});

test("練習選出500回でID・正解配置が重複しない", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const stages = selectPracticeStages(seededRand(seed));
    assert.equal(stages.length, 3);
    assert.equal(new Set(stages.map((stage) => stage.id)).size, 3);
    assert.equal(new Set(stages.map(solutionSignature)).size, 3);
  }
});

test("pickStagesは練習選出の互換API", () => {
  const a = pickStages(() => 0);
  const b = selectPracticeStages(() => 0);
  assert.deepEqual(a.map((stage) => stage.id), b.map((stage) => stage.id));
});

test("全ステージは正解順タップでクリア", () => {
  for (const stage of STAGES) {
    const state = new StageState(stage);
    for (const [r, c] of stage.solution) {
      assert.notEqual(state.tap(r, c).type, "mistake");
    }
    assert.equal(state.cleared, true, stage.id);
  }
});

test("盤面ルール違反は誤タップ", () => {
  const state = new StageState(STAGES[0]);
  const [r, c] = STAGES[0].solution[0];
  state.tap(r, c);
  const other = c === 0 ? 1 : 0;
  assert.equal(state.tap(r, other).type, "mistake");
});

test("ヒントは誤配置を除去し正解を1つ置く", () => {
  const stage = STAGES[0];
  const state = new StageState(stage);
  const solutionSet = new Set(stage.solution.map(([r, c]) => r * N + c));
  outer: for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!solutionSet.has(r * N + c) && state.canPlace(r, c).ok) {
        state.place(r, c);
        break outer;
      }
    }
  }
  const result = state.applyHint();
  assert.ok(result.placed);
  assert.ok(result.removed.length >= 1);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (state.has(r, c)) assert.ok(solutionSet.has(r * N + c));
    }
  }
});

test("補正タイムは実時間+誤3秒+ヒント30秒", () => {
  assert.equal(
    computeAdjustedTime({ elapsedMs: 12_345, mistakeCount: 2, hintCount: 1 }),
    1234 + 600 + 3000
  );
  assert.equal(ADJUSTED_TIME.MISTAKE_CENTISECONDS, 300);
  assert.equal(ADJUSTED_TIME.HINT_CENTISECONDS, 3000);
});

test("補正タイムは非負整数", () => {
  assert.equal(
    computeAdjustedTime({ elapsedMs: -1, mistakeCount: -1, hintCount: -1 }),
    0
  );
  assert.equal(
    Number.isInteger(
      computeAdjustedTime({ elapsedMs: 123.99, mistakeCount: 0, hintCount: 0 })
    ),
    true
  );
});

test("補正タイム表示は小数2桁", () => {
  assert.equal(formatCentiseconds(4835), "48.35");
  assert.equal(formatAdjustedTime(4835), "48.35秒");
});

test("3分を超える補正タイムも上限で切らない", () => {
  const score = computeAdjustedTime({
    elapsedMs: 181_000,
    mistakeCount: 1,
    hintCount: 0,
  });
  assert.equal(score, 18_100 + 300);
  assert.equal(formatCentiseconds(score), "184.00");
});

test("公式セッションは固定3問", () => {
  const session = new GameSession("A", seededRand(1), {
    mode: GAME_MODE.OFFICIAL,
    playId: "official-1",
  });
  assert.equal(session.mode, GAME_MODE.OFFICIAL);
  assert.deepEqual(session.stages.map((stage) => stage.id), OFFICIAL_STAGE_IDS);
});

test("練習セッションは練習モード", () => {
  const session = new GameSession("A", seededRand(2), {
    mode: GAME_MODE.PRACTICE,
    playId: "practice-1",
  });
  assert.equal(session.mode, GAME_MODE.PRACTICE);
  assert.deepEqual(session.stages.map((stage) => stage.difficulty), [1, 2, 3]);
});

test("計測開始前は0、startStage後だけ加算", () => {
  const session = new GameSession("A", seededRand(3), { playId: "timer-1" });
  assert.equal(session.elapsedMs(5000), 0);
  assert.equal(session.startStage(1000), true);
  assert.equal(session.elapsedMs(2500), 1500);
});

test("finishStage二重呼び出しで重複加算しない", () => {
  const session = new GameSession("A", seededRand(4), { playId: "timer-2" });
  session.startStage(1000);
  assert.equal(session.finishStage(2000), 1000);
  assert.equal(session.finishStage(5000), 0);
  assert.equal(session.accumulatedMs, 1000);
});

test("演出・描画待ちは計測されない", () => {
  const session = new GameSession("A", seededRand(5), { playId: "timer-3" });
  session.startStage(0);
  session.finishStage(1000);
  session.advance(6000);
  assert.equal(session.elapsedMs(8000), 1000);
  session.startStage(9000);
  assert.equal(session.elapsedMs(10_000), 2000);
});

test("ステージ別時間と累計が一致", () => {
  const session = new GameSession("A", seededRand(6), { playId: "timer-4" });
  let now = 0;
  for (let index = 0; index < 3; index++) {
    session.startStage(now);
    now += 1000 + index * 100;
    session.finishStage(now);
    now += 500;
    session.advance(now);
  }
  assert.deepEqual(session.stageTimesMs, [1000, 1100, 1200]);
  assert.equal(session.accumulatedMs, 3300);
  assert.equal(session.status, SESSION_STATUS.RESULT);
});

test("誤タップ・ヒントをステージ別に保持", () => {
  const session = new GameSession("A", seededRand(7), { playId: "counts" });
  session.recordMistake();
  session.recordHint();
  assert.deepEqual(session.stageMistakeCounts, [1, 0, 0]);
  assert.deepEqual(session.stageHintCounts, [1, 0, 0]);
});

test("結果内訳の補正値が一致", () => {
  const session = new GameSession("A", seededRand(8), { playId: "result" });
  session.startStage(0);
  session.recordMistake();
  session.recordHint();
  session.finishStage(5000);
  const result = session.resultBreakdown(5000);
  assert.equal(result.elapsedMs, 5000);
  assert.equal(result.mistakePenaltyCentiseconds, 300);
  assert.equal(result.hintPenaltyCentiseconds, 3000);
  assert.equal(result.adjustedTimeCentiseconds, 500 + 300 + 3000);
});

test("リタイア後は計測を停止", () => {
  const session = new GameSession("A", seededRand(9), { playId: "retire" });
  session.startStage(1000);
  assert.equal(session.retire(), true);
  assert.equal(session.elapsedMs(5000), 0);
  assert.equal(session.status, SESSION_STATUS.RETIRED);
});

test("formatTime互換", () => {
  assert.equal(formatTime(0), "0:00.0");
  assert.equal(formatTime(65_400), "1:05.4");
});

console.log(`\n==== TEST RESULT: PASS=${pass} FAIL=0 ====`);
