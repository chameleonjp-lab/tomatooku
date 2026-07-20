import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VARIABLE_STAGE_BANK_SCHEMA_VERSION,
  VARIABLE_STAGE_BANK_STATUS,
  VARIABLE_STAGE_SCHEMA_VERSION,
  assertVariableStage,
  assertVariableStageBank,
  expectedVariableStageId,
  validateVariableStage,
  validateVariableStageBank,
} from "../src/variable-stage-contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const witnessManifest = JSON.parse(
  readFileSync(
    resolve(ROOT, "generated/stage-bank-variable-feasibility-v2.json"),
    "utf8"
  )
);
const validatorSource = readFileSync(
  resolve(ROOT, "src/variable-stage-contract.js"),
  "utf8"
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toContractStage(witness, difficulty = undefined) {
  const stage = {
    schemaVersion: VARIABLE_STAGE_SCHEMA_VERSION,
    id: witness.stageId,
    regions: witness.regions,
    solution: witness.solution,
    canonicalSignature: witness.canonicalSignature,
    generatorVersion: witnessManifest.auditVersion,
  };
  if (difficulty !== undefined) stage.difficulty = difficulty;
  return stage;
}

const contractStages = witnessManifest.canonicalStages.map((witness, index) =>
  toContractStage(witness, (index % 3) + 1)
);
const contractBank = {
  schemaVersion: VARIABLE_STAGE_BANK_SCHEMA_VERSION,
  id: "candidate-v2-variable-4-6",
  status: VARIABLE_STAGE_BANK_STATUS,
  runtimeEnabled: false,
  rankingEligible: false,
  stages: contractStages,
};

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

function allColumnPermutations() {
  const result = [];
  const current = [];
  const used = new Set();
  function visit() {
    if (current.length === 5) {
      result.push(current.slice());
      return;
    }
    for (let col = 0; col < 5; col++) {
      if (used.has(col)) continue;
      used.add(col);
      current.push(col);
      visit();
      current.pop();
      used.delete(col);
    }
  }
  visit();
  return result;
}

function findSameRegionSolutionMutation(stage) {
  const original = stage.solution.map((pair) => pair[1]).join(",");
  for (const columns of allColumnPermutations()) {
    if (columns.join(",") === original) continue;
    let touches = false;
    for (let row = 1; row < 5; row++) {
      if (Math.abs(columns[row - 1] - columns[row]) < 2) touches = true;
    }
    if (touches) continue;
    const labels = new Set(
      columns.map((col, row) => stage.regions[row][col])
    );
    if (labels.size < 5) {
      const mutated = clone(stage);
      mutated.solution = columns.map((col, row) => [row, col]);
      return mutated;
    }
  }
  throw new Error("could not find a same-region solution mutation");
}

function findDisconnectedRegionMutation(stage) {
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) cells.push([row, col]);
  }
  for (let left = 0; left < cells.length; left++) {
    for (let right = left + 1; right < cells.length; right++) {
      const [leftRow, leftCol] = cells[left];
      const [rightRow, rightCol] = cells[right];
      const leftLabel = stage.regions[leftRow][leftCol];
      const rightLabel = stage.regions[rightRow][rightCol];
      if (leftLabel === rightLabel) continue;
      const mutated = clone(stage);
      const rows = mutated.regions.map((row) => [...row]);
      rows[leftRow][leftCol] = rightLabel;
      rows[rightRow][rightCol] = leftLabel;
      mutated.regions = rows.map((row) => row.join(""));
      mutated.id = expectedVariableStageId(mutated.regions);
      mutated.canonicalSignature = undefined;
      const validation = validateVariableStage(mutated);
      if (
        validation.problems.some((problem) =>
          problem.includes("four-neighbor connected")
        )
      ) {
        return mutated;
      }
    }
  }
  throw new Error("could not find a disconnected-region mutation");
}

test("validatorは生成器実装から独立", () => {
  assert.doesNotMatch(validatorSource, /generator-v2/);
  assert.doesNotMatch(validatorSource, /variable-feasibility/);
});

test("84問のwitnessをstage schema v2へ変換して全件検証", () => {
  assert.equal(contractStages.length, 84);
  for (const stage of contractStages) {
    const validation = validateVariableStage(stage);
    assert.deepEqual(validation.problems, []);
    assert.equal(validation.valid, true);
    assert.equal(stage.id, expectedVariableStageId(stage.regions));
    assert.equal(assertVariableStage(stage), stage);
  }
});

test("84問bankを候補状態のまま検証", () => {
  assert.deepEqual(validateVariableStageBank(contractBank), {
    valid: true,
    problems: [],
  });
  assert.equal(assertVariableStageBank(contractBank), contractBank);
});

test("schema version・ID・difficulty・generatorVersionを拒否", () => {
  const invalid = clone(contractStages[0]);
  invalid.schemaVersion = 1;
  invalid.id = "T001";
  invalid.difficulty = 4;
  invalid.generatorVersion = "";
  const problems = validateVariableStage(invalid).problems.join(" | ");
  assert.match(problems, /schemaVersion/);
  assert.match(problems, /id must match/);
  assert.match(problems, /difficulty/);
  assert.match(problems, /generatorVersion/);
});

test("エリアサイズ4〜6を外れる盤面を拒否", () => {
  const invalid = clone(contractStages[0]);
  const rows = invalid.regions.map((row) => [...row]);
  const from = rows[0][0];
  let target = null;
  for (let row = 0; row < 5 && !target; row++) {
    for (let col = 0; col < 5; col++) {
      if (rows[row][col] !== from) {
        target = [row, col];
        break;
      }
    }
  }
  rows[target[0]][target[1]] = from;
  invalid.regions = rows.map((row) => row.join(""));
  invalid.id = expectedVariableStageId(invalid.regions);
  delete invalid.canonicalSignature;
  assert.match(
    validateVariableStage(invalid).problems.join(" | "),
    /size must be 4-6/
  );
});

test("非連結エリアを拒否", () => {
  const invalid = findDisconnectedRegionMutation(contractStages[0]);
  assert.match(
    validateVariableStage(invalid).problems.join(" | "),
    /four-neighbor connected/
  );
});

test("solutionの列重複を拒否", () => {
  const invalid = clone(contractStages[0]);
  invalid.solution[1][1] = invalid.solution[0][1];
  assert.match(
    validateVariableStage(invalid).problems.join(" | "),
    /column .* more than once/
  );
});

test("solutionが同じエリアへ2個置く場合を拒否", () => {
  const invalid = findSameRegionSolutionMutation(contractStages[0]);
  assert.match(
    validateVariableStage(invalid).problems.join(" | "),
    /exactly one tomato in every region/
  );
});

test("隣接するsolutionを拒否", () => {
  const invalid = clone(contractStages[0]);
  invalid.solution = [
    [0, 0],
    [1, 1],
    [2, 3],
    [3, 4],
    [4, 2],
  ];
  assert.match(
    validateVariableStage(invalid).problems.join(" | "),
    /touch/
  );
});

test("content-derived IDとcanonicalSignature不一致を拒否", () => {
  const invalid = clone(contractStages[0]);
  invalid.id = contractStages[1].id;
  invalid.canonicalSignature = contractStages[1].canonicalSignature;
  const problems = validateVariableStage(invalid).problems.join(" | ");
  assert.match(problems, /content-derived stable id/);
  assert.match(problems, /canonicalSignature/);
});

test("bankの有効化・ランキング対象化・重複IDを拒否", () => {
  const invalid = clone(contractBank);
  invalid.runtimeEnabled = true;
  invalid.rankingEligible = true;
  invalid.stages[1].id = invalid.stages[0].id;
  const problems = validateVariableStageBank(invalid).problems.join(" | ");
  assert.match(problems, /runtimeEnabled/);
  assert.match(problems, /rankingEligible/);
  assert.match(problems, /duplicate stage id/);
});

test("84問未満のbankを拒否", () => {
  const invalid = clone(contractBank);
  invalid.stages = invalid.stages.slice(0, 83);
  assert.match(
    validateVariableStageBank(invalid).problems.join(" | "),
    /at least 84 stages/
  );
});

console.log(`\n==== VARIABLE STAGE CONTRACT TEST: PASS=${pass} FAIL=0 ====`);
