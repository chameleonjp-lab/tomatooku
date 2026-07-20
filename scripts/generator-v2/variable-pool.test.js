import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateVariableStage,
  validateVariableStageBank,
} from "../../src/variable-stage-contract.js";
import {
  buildVariableStageCandidatePool,
  minimumVariableStageDistance,
} from "./variable-pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const committed = JSON.parse(
  readFileSync(
    resolve(ROOT, "generated/variable-stage-candidate-pool-v2.json"),
    "utf8"
  )
);

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const small = buildVariableStageCandidatePool({
  rawTargetPerClass: 4,
  selectedTargetTotal: 6,
  minimumSelectedPerClass: 2,
  maxPartitionsPerClass: 100000,
});

test("小型fixtureは3対称クラスから均等に6問選出", () => {
  assert.equal(small.symmetryClassCount, 3);
  assert.equal(small.rawStageCount, 12);
  assert.equal(small.stageCount, 6);
  assert.deepEqual(Object.values(small.symmetryClassDistribution).sort(), [2, 2, 2]);
});

test("小型fixtureの全stageが独立Stage Schema v2へ合格", () => {
  for (const stage of small.stages) {
    const validation = validateVariableStage(stage);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.problems, []);
    assert.equal(validation.canonicalSignature, stage.canonicalSignature);
  }
});

test("小型fixtureはD4 canonicalとIDに重複なし", () => {
  assert.equal(new Set(small.stages.map((stage) => stage.id)).size, small.stageCount);
  assert.equal(
    new Set(small.stages.map((stage) => stage.canonicalSignature)).size,
    small.stageCount
  );
  assert.ok(small.minimumPairDistance > 0);
});

test("小型fixtureは難易度1〜3を均等割当", () => {
  assert.deepEqual(small.difficultyDistribution, { 1: 2, 2: 2, 3: 2 });
  for (const stage of small.stages) {
    assert.ok([1, 2, 3].includes(stage.difficulty));
    assert.ok(Number.isFinite(small.metadata[stage.id].difficulty.score));
  }
});

test("小型fixtureは同じ入力から完全再現", () => {
  assert.deepEqual(
    buildVariableStageCandidatePool({
      rawTargetPerClass: 4,
      selectedTargetTotal: 6,
      minimumSelectedPerClass: 2,
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
        selectedTargetTotal: 7,
        minimumSelectedPerClass: 1,
      }),
    /exceeds raw capacity/
  );
});

test("コミット済み候補プールの実測値を固定", () => {
  assert.equal(committed.schemaVersion, 1);
  assert.equal(committed.generatorVersion, "2.6.0-variable-pool.1");
  assert.equal(committed.status, "candidate-pool-not-runtime");
  assert.equal(committed.runtimeEnabled, false);
  assert.equal(committed.rankingEligible, false);
  assert.equal(committed.rawTargetPerClass, 84);
  assert.equal(committed.selectedTargetTotal, 108);
  assert.equal(committed.minimumSelectedPerClass, 17);
  assert.equal(committed.symmetryClassCount, 3);
  assert.equal(committed.rawStageCount, 185);
  assert.equal(committed.stageCount, 108);
  assert.equal(committed.minimumPairDistance, 1);
  assert.deepEqual(committed.capacityLimitedClasses, ["SC-3a178cba"]);
});

test("候補プールの対称クラス分布を固定", () => {
  assert.deepEqual(committed.symmetryClassDistribution, {
    "SC-95390462": 46,
    "SC-3a178cba": 17,
    "SC-be359992": 45,
  });
  const rare = committed.classAudits.find(
    (audit) => audit.symmetryClassId === "SC-3a178cba"
  );
  assert.equal(rare.rawCount, 17);
  assert.equal(rare.selectedCount, 17);
  assert.equal(rare.rawTargetReached, false);
  assert.equal(rare.partitionLimitReached, false);
});

test("候補プールのサイズ・難易度分布を固定", () => {
  assert.deepEqual(committed.profileDistribution, {
    "4-5-5-5-6": 35,
    "4-4-5-6-6": 73,
  });
  assert.deepEqual(committed.difficultyDistribution, {
    1: 36,
    2: 36,
    3: 36,
  });
  assert.deepEqual(committed.nearestDistanceDistribution, {
    1: 59,
    2: 33,
    3: 9,
    4: 4,
    5: 1,
    7: 1,
    9: 1,
  });
});

test("コミット済み108問を独立validatorで全件検証", () => {
  assert.equal(committed.stages.length, 108);
  assert.equal(Object.keys(committed.metadata).length, 108);
  const ids = new Set();
  const canonical = new Set();
  for (const stage of committed.stages) {
    const validation = validateVariableStage(stage);
    assert.equal(validation.valid, true, validation.problems.join("; "));
    assert.equal(validation.canonicalSignature, stage.canonicalSignature);
    assert.equal(ids.has(stage.id), false);
    assert.equal(canonical.has(stage.canonicalSignature), false);
    ids.add(stage.id);
    canonical.add(stage.canonicalSignature);
    assert.ok([1, 2, 3].includes(stage.difficulty));
    assert.ok(Number.isFinite(committed.metadata[stage.id].difficulty.score));
    assert.ok(committed.metadata[stage.id].nearestStructuralDistance >= 1);
  }
});

test("108問を未接続candidate bankとして独立検証", () => {
  const validation = validateVariableStageBank(
    {
      schemaVersion: 1,
      id: "candidate-v2-variable-4-6-pool",
      status: "contract-proposed-pending-approval",
      runtimeEnabled: false,
      rankingEligible: false,
      stages: committed.stages,
    },
    { minimumStageCount: 108 }
  );
  assert.deepEqual(validation, { valid: true, problems: [] });
});

console.log(`\n==== VARIABLE STAGE POOL TEST: PASS=${pass} FAIL=0 ====`);
