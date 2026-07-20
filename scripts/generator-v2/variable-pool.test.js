import assert from "node:assert/strict";
import { validateVariableStage } from "../../src/variable-stage-contract.js";
import {
  buildVariableStageCandidatePool,
  minimumVariableStageDistance,
} from "./variable-pool.js";

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const small = buildVariableStageCandidatePool({
  rawTargetPerClass: 4,
  selectedTargetPerClass: 2,
  maxPartitionsPerClass: 100000,
});

test("3対称クラスから均等に6問選出", () => {
  assert.equal(small.symmetryClassCount, 3);
  assert.equal(small.rawStageCount, 12);
  assert.equal(small.stageCount, 6);
  assert.deepEqual(Object.values(small.symmetryClassDistribution).sort(), [2, 2, 2]);
});

test("選出stageは独立Stage Schema v2へ合格", () => {
  for (const stage of small.stages) {
    const validation = validateVariableStage(stage);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.problems, []);
    assert.equal(validation.canonicalSignature, stage.canonicalSignature);
  }
});

test("D4 canonicalとIDに重複なし", () => {
  assert.equal(new Set(small.stages.map((stage) => stage.id)).size, small.stageCount);
  assert.equal(
    new Set(small.stages.map((stage) => stage.canonicalSignature)).size,
    small.stageCount
  );
  assert.ok(small.minimumPairDistance > 0);
});

test("難易度1〜3を均等割当", () => {
  assert.deepEqual(small.difficultyDistribution, { 1: 2, 2: 2, 3: 2 });
  for (const stage of small.stages) {
    assert.ok([1, 2, 3].includes(stage.difficulty));
    assert.ok(Number.isFinite(small.metadata[stage.id].difficulty.score));
  }
});

test("同じ入力から同じ候補プールを再現", () => {
  assert.deepEqual(
    buildVariableStageCandidatePool({
      rawTargetPerClass: 4,
      selectedTargetPerClass: 2,
      maxPartitionsPerClass: 100000,
    }),
    small
  );
});

test("同じ盤面の構造距離は0", () => {
  assert.equal(
    minimumVariableStageDistance(small.stages[0].regions, small.stages[0].regions),
    0
  );
});

test("不正なtarget設定を拒否", () => {
  assert.throws(
    () =>
      buildVariableStageCandidatePool({
        rawTargetPerClass: 2,
        selectedTargetPerClass: 3,
      }),
    /cannot exceed/
  );
});

console.log(`\n==== VARIABLE STAGE POOL TEST: PASS=${pass} FAIL=0 ====`);
