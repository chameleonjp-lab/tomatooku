/**
 * トマトオク ゲームロジックのテスト(DOM 非依存)。
 * 実行: node scripts/game.test.js
 */
import {
  GameSession,
  StageState,
  pickStages,
  computeScore,
  formatTime,
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

// 決定的乱数(再現性のため)
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

// ---- 1. ステージバンク ----
section("ステージバンク");
ok(STAGES.length >= 30, `30問以上ある (${STAGES.length})`);
const diffCount = { 1: 0, 2: 0, 3: 0 };
STAGES.forEach((s) => (diffCount[s.difficulty] = (diffCount[s.difficulty] || 0) + 1));
ok(diffCount[1] >= 1 && diffCount[2] >= 1 && diffCount[3] >= 1, "各難易度が存在");
console.log("  難易度分布:", diffCount);

// ---- 2. ステージ選出 ----
section("ステージ選出 (pickStages)");
for (let seed = 1; seed <= 200; seed++) {
  const stages = pickStages(seededRand(seed));
  const ids = stages.map((s) => s.id);
  if (stages.length !== 3) ok(false, `seed ${seed}: 3ステージでない`);
  if (new Set(ids).size !== 3) ok(false, `seed ${seed}: 重複あり ${ids}`);
}
ok(true, "200回の選出すべてで3ステージ・重複なし");
// 難易度順(1,2,3)になっているか
const sExample = pickStages(seededRand(42));
ok(
  sExample[0].difficulty <= sExample[1].difficulty &&
    sExample[1].difficulty <= sExample[2].difficulty,
  "難易度が やさしい→ふつう→むずかしい の順"
);

// ---- 3. 各ステージ solution で必ずクリアできる ----
section("solution でクリア判定");
let allClear = true;
for (const stage of STAGES) {
  const st = new StageState(stage);
  let mistakes = 0;
  for (const [r, c] of stage.solution) {
    const res = st.tap(r, c);
    if (res.type === "mistake") mistakes++;
  }
  if (!st.cleared || mistakes > 0) {
    allClear = false;
    console.log(`  ✗ ${stage.id}: cleared=${st.cleared} mistakes=${mistakes}`);
  }
}
ok(allClear, "全30ステージ solution 順タップで誤タップ0・クリア");

// ---- 4. 誤タップ判定(見えているルールのみ) ----
section("誤タップ判定");
{
  const stage = STAGES[0];
  const st = new StageState(stage);
  const [r0, c0] = stage.solution[0];
  st.tap(r0, c0); // 正しく1個置く
  // 同じ行の別マスは誤タップ
  let rowMistake = false;
  for (let c = 0; c < N; c++) {
    if (c === c0) continue;
    const res = st.tap(r0, c);
    if (res.type === "mistake" && res.reason === "row") rowMistake = true;
    // 誤タップでは置かれない
    ok(!st.has(r0, c) || c === c0, "誤タップ時は置かれない");
    break;
  }
  ok(rowMistake, "同じ行への配置は row 誤タップ");

  // 隣接(斜め)誤タップ
  const st2 = new StageState(stage);
  st2.tap(2, 2);
  const adj = st2.tap(1, 1); // 斜め隣接
  ok(adj.type === "mistake" && adj.reason === "adjacent", "斜め隣接は adjacent 誤タップ");

  // 最終解と違うマスでも、ルール違反でなければ誤タップにしない
  const st3 = new StageState(stage);
  // 空盤面に任意の1マスを置く → 必ず合法(置ける)
  const first = st3.tap(0, 0);
  ok(first.type !== "mistake", "空盤面の最初の1手は誤タップにならない");
}

// ---- 5. 取り除き ----
section("取り除き");
{
  const st = new StageState(STAGES[0]);
  const [r, c] = STAGES[0].solution[0];
  st.tap(r, c);
  ok(st.has(r, c) && st.count === 1, "置いた");
  const res = st.tap(r, c);
  ok(res.type === "remove" && !st.has(r, c) && st.count === 0, "取り除いた");
}

// ---- 6. ヒント ----
section("ヒント");
{
  const st = new StageState(STAGES[0]);
  // 誤った(正解でない)合法配置をしてからヒント
  // まず solution に無い合法セルを探して置く
  const solSet = new Set(STAGES[0].solution.map(([r, c]) => r * N + c));
  let placedWrong = null;
  for (let r = 0; r < N && !placedWrong; r++) {
    for (let c = 0; c < N; c++) {
      if (solSet.has(r * N + c)) continue;
      if (st.canPlace(r, c).ok) {
        st.place(r, c);
        placedWrong = [r, c];
        break;
      }
    }
  }
  const before = st.count;
  const hinted = st.applyHint();
  ok(hinted !== null, "ヒントでセルが確定される");
  // ヒント後、置かれているセルはすべて solution の部分集合(進行不能を防ぐ正規化)
  let subset = true;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (st.has(r, c) && !solSet.has(r * N + c)) subset = false;
  ok(subset, "ヒント後の盤面は solution の部分集合(誤配置を除去)");

  // ヒントを5回(以上)使うと必ずクリアできる(進行不能にならない)
  const st2 = new StageState(STAGES[5]);
  let guard = 0;
  while (st2.canHint() && guard < 10) {
    st2.applyHint();
    guard++;
  }
  ok(st2.cleared, "ヒント連打で必ずクリア(進行不能にならない)");
  ok(!st2.canHint(), "クリア後はヒント不可");
}

// ---- 7. スコア計算 ----
section("スコア計算");
ok(computeScore({ elapsedMs: 0, mistakeCount: 0, hintCount: 0 }) === 180000, "満点180000");
ok(
  computeScore({ elapsedMs: 10000, mistakeCount: 2, hintCount: 1 }) ===
    180000 - 10000 - 6000 - 30000,
  "減点が正しい"
);
ok(
  computeScore({ elapsedMs: 10 ** 9, mistakeCount: 0, hintCount: 0 }) === 0,
  "0未満にならない"
);

// ---- 8. セッション全体フロー ----
section("セッション全体フロー");
{
  const sess = new GameSession("テスター", seededRand(7));
  sess.start(1000);
  ok(sess.totalStages === 3, "3ステージ");
  // 全ステージを solution で解く
  let finished = false;
  for (let i = 0; i < 3; i++) {
    const st = sess.current;
    for (const [r, c] of st.stage.solution) st.tap(r, c);
    ok(st.cleared, `ステージ${i + 1} クリア`);
    finished = sess.advance(2000 + i);
  }
  ok(finished, "3ステージ目で finished=true(結果へ)");
  ok(sess.endTime != null, "endTime が設定される");
}

// ---- 9. formatTime ----
section("formatTime");
ok(formatTime(0) === "0:00.0", "0ms");
ok(formatTime(65400) === "1:05.4", "65.4s -> 1:05.4");

// ---- 結果 ----
console.log(`\n==== TEST RESULT: PASS=${pass} FAIL=${fail} ====`);
process.exit(fail === 0 ? 0 : 1);
