import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeHumanDifficulty,
  minimumSymmetricRegionDistance,
  selectBalancedStageBank,
  signatureHammingDistance,
} from "./bank.js";
import { transformRegionGrid } from "./regions.js";
import {
  ACTIVE_STAGE_BANK_ID,
  STAGE_BANK_CATALOG,
  assertCandidateBankRemainsInactive,
  getStageBankDescriptor,
} from "../../src/stage-bank-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const fixture = JSON.parse(
  readFileSync(resolve(ROOT, "generated/stage-candidates-v2.json"), "utf8")
);

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const fixtureStages = fixture.stages;

test("署名Hamming距離を25マスで算出", () => {
  assert.equal(signatureHammingDistance("AAAAA|BBBBB|CCCCC|DDDDD|EEEEE", "AAAAA|BBBBB|CCCCC|DDDDD|EEEEE"), 0);
  assert.equal(signatureHammingDistance("AAAAA|BBBBB|CCCCC|DDDDD|EEEEE", "BAAAA|BBBBB|CCCCC|DDDDD|EEEEE"), 1);
});

test("回転・反転・エリア名変更は距離0", () => {
  const stage = fixtureStages[0];
  const rotated = transformRegionGrid(stage.regions, "rotate90");
  const relabeled = rotated.map((row) =>
    [...row].map((label) => ({ A: "E", B: "D", C: "C", D: "B", E: "A" })[label]).join("")
  );
  assert.equal(minimumSymmetricRegionDistance(stage.regions, rotated), 0);
  assert.equal(minimumSymmetricRegionDistance(stage.regions, relabeled), 0);
});

test("異なる候補盤面には正の対称距離", () => {
  assert.ok(minimumSymmetricRegionDistance(fixtureStages[0].regions, fixtureStages[1].regions) > 0);
});

test("人間向け難易度指標は決定論的", () => {
  for (const stage of fixtureStages) {
    const first = analyzeHumanDifficulty(stage.regions);
    const second = analyzeHumanDifficulty(stage.regions);
    assert.deepEqual(first, second);
    assert.ok(Number.isFinite(first.score));
    assert.ok(first.score > 0);
    assert.ok(first.solverNodes > 0);
    assert.ok(first.propagationRounds > 0);
  }
});

test("fixture候補を分布制御して選択可能", () => {
  const candidates = fixtureStages.map((stage) => ({
    ...stage,
    humanDifficulty: analyzeHumanDifficulty(stage.regions),
  }));
  const selected = selectBalancedStageBank(candidates, candidates.length, {
    seed: "fixture-bank-selection",
    distanceThresholds: [0],
  });
  assert.equal(selected.stages.length, fixtureStages.length);
  assert.equal(new Set(selected.stages.map((stage) => stage.stageId)).size, fixtureStages.length);
  assert.deepEqual(
    selected.stages.map((stage) => stage.order),
    [1, 2, 3, 4, 5]
  );
});

test("現行30問だけがruntime有効", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "legacy-v1");
  assert.equal(getStageBankDescriptor().runtimeEnabled, true);
  assert.equal(getStageBankDescriptor().rankingEligible, true);
  assert.equal(STAGE_BANK_CATALOG["candidate-v2"].runtimeEnabled, false);
  assert.equal(STAGE_BANK_CATALOG["candidate-v2"].rankingEligible, false);
  assert.equal(assertCandidateBankRemainsInactive(), true);
});

console.log(`\n==== GENERATOR V2 BANK TEST: PASS=${pass} FAIL=0 ====`);
