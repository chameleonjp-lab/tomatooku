import assert from "node:assert/strict";
import {
  buildVariableRegionFeasibilityManifest,
  regionSizeProfile,
  solveVariableRegionGrid,
  validateVariableRegionGrid,
} from "./variable-feasibility.js";

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const small = buildVariableRegionFeasibilityManifest({
  requiredCanonicalTarget: 5,
  minRegionSize: 4,
  maxRegionSize: 6,
});

test("4〜6マスの最小緩和で5問の存在証拠を生成", () => {
  assert.equal(small.targetFeasible, true);
  assert.equal(small.canonicalStageCount, 5);
  assert.equal(small.patternsVisited, 1);
  assert.equal(small.connectedPartitionCountVisited, 2826);
  assert.equal(small.uniqueSolutionCountVisited, 5);
});

test("最初の正解配置の候補領域数をfixture化", () => {
  assert.deepEqual(small.patternAudits[0].candidateRegionCounts, [66, 516, 197, 409, 142]);
  assert.equal(small.patternAudits[0].patternSignature, "0,2,4,1,3");
});

test("全証拠盤面が4〜6マス・連結・一意解", () => {
  for (const stage of small.canonicalStages) {
    const validation = validateVariableRegionGrid(stage.regions, {
      minRegionSize: 4,
      maxRegionSize: 6,
    });
    assert.deepEqual(validation, { valid: true, problems: [] });
    assert.deepEqual(regionSizeProfile(stage.regions), stage.regionSizes);
    const solved = solveVariableRegionGrid(stage.regions, {
      minRegionSize: 4,
      maxRegionSize: 6,
    });
    assert.equal(solved.unique, true);
    assert.deepEqual(
      solved.firstSolution.map((col, row) => [row, col]),
      stage.solution
    );
  }
});

test("同じ条件から同じmanifestを再現", () => {
  assert.deepEqual(
    buildVariableRegionFeasibilityManifest({
      requiredCanonicalTarget: 5,
      minRegionSize: 4,
      maxRegionSize: 6,
    }),
    small
  );
});

test("成立しないサイズ範囲を拒否", () => {
  assert.throws(
    () =>
      buildVariableRegionFeasibilityManifest({
        requiredCanonicalTarget: 1,
        minRegionSize: 6,
        maxRegionSize: 7,
      }),
    /cannot cover/
  );
});

console.log(`\n==== VARIABLE REGION FEASIBILITY TEST: PASS=${pass} FAIL=0 ====`);
