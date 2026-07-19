import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRANSFORM_NAMES,
  enumerateValidColumnPatterns,
} from "./core.js";
import {
  DEFAULT_STAGE_CANDIDATE_SEED,
  buildStageCandidateProbeManifest,
  canonicalizeRegionGrid,
  generateStageCandidate,
  growConnectedRegionGrid,
  isRegionConnected,
  normalizeRegionLabels,
  regionGridSignature,
  solveRegionGrid,
  stableStageId,
  transformRegionGrid,
  validateRegionGrid,
} from "./regions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const patterns = enumerateValidColumnPatterns();
const fixturePattern = patterns[0];
const grown = growConnectedRegionGrid(fixturePattern, "fixture-growth");

test("正解セルを種にした連結エリア成長が成功", () => {
  assert.equal(grown.success, true);
});

test("各エリアは5マスで4近傍連結", () => {
  const validation = validateRegionGrid(grown.regions);
  assert.equal(validation.valid, true, validation.problems.join("; "));
  for (const label of "ABCDE") {
    assert.equal(isRegionConnected(grown.regions, label), true);
  }
});

test("盤面署名はエリアラベル名に依存しない", () => {
  const swapped = grown.regions.map((row) =>
    row.replaceAll("A", "x").replaceAll("B", "A").replaceAll("x", "B")
  );
  assert.equal(regionGridSignature(swapped), regionGridSignature(grown.regions));
  assert.deepEqual(normalizeRegionLabels(swapped), normalizeRegionLabels(grown.regions));
});

test("D4変換でcanonical署名とstage IDが不変", () => {
  const canonical = canonicalizeRegionGrid(grown.regions);
  const stageId = stableStageId(grown.regions);
  for (const name of TRANSFORM_NAMES) {
    const transformed = transformRegionGrid(grown.regions, name);
    assert.equal(canonicalizeRegionGrid(transformed), canonical);
    assert.equal(stableStageId(transformed), stageId);
  }
});

test("候補生成は一意解と元の解配置を保証", () => {
  const candidate = generateStageCandidate(
    fixturePattern,
    DEFAULT_STAGE_CANDIDATE_SEED
  );
  assert.ok(candidate.stageId);
  const solved = solveRegionGrid(candidate.regions);
  assert.equal(solved.unique, true);
  assert.deepEqual(solved.firstSolution, fixturePattern);
});

test("同一seedの候補は完全一致", () => {
  const seed = "same-seed-fixture";
  assert.deepEqual(
    generateStageCandidate(patterns[11], seed),
    generateStageCandidate(patterns[11], seed)
  );
});

test("生成上限到達は構造化された失敗として返す", () => {
  const failure = generateStageCandidate(fixturePattern, "limit-fixture", {
    maxAttempts: 1,
    maxGrowthNodes: 1,
  });
  assert.equal(failure.failure, "attempt-limit");
  assert.equal(failure.attempts, 1);
});

const manifest = buildStageCandidateProbeManifest();

test("14配置を上限付きで全件probeしfixture件数を固定", () => {
  assert.equal(manifest.patternCount, 14);
  assert.equal(manifest.successCount, 10);
  assert.equal(manifest.attemptLimitCount, 4);
  assert.equal(manifest.uniqueStageCount, 5);
  assert.equal(manifest.confirmedSymmetryClassCount, 2);
  assert.equal(manifest.totalSymmetryClassCount, 3);
  assert.deepEqual(
    manifest.probes
      .filter((probe) => probe.status === "attempt-limit")
      .map((probe) => probe.patternId),
    ["SP-f5f166b0", "SP-5453e090", "SP-5d6caa30", "SP-034477b0"]
  );
});

test("dedupe後の候補は形式・連結・一意解・IDを満たす", () => {
  assert.equal(
    new Set(manifest.stages.map((stage) => stage.canonicalSignature)).size,
    5
  );
  assert.equal(new Set(manifest.stages.map((stage) => stage.stageId)).size, 5);
  for (const stage of manifest.stages) {
    assert.equal(validateRegionGrid(stage.regions).valid, true);
    const solved = solveRegionGrid(stage.regions);
    assert.equal(solved.unique, true);
    assert.equal(stableStageId(stage.regions), stage.stageId);
    assert.deepEqual(
      solved.firstSolution.map((col, row) => [row, col]),
      stage.solution
    );
  }
});

test("commit済み候補manifestは既定seedの生成結果と一致", () => {
  const committed = JSON.parse(
    readFileSync(resolve(ROOT, "generated/stage-candidates-v2.json"), "utf8")
  );
  assert.deepEqual(committed, manifest);
});

test("候補CLIのstdoutは純粋関数のmanifestと一致", () => {
  const output = execFileSync(
    process.execPath,
    [
      "scripts/generate_stage_candidates_v2.js",
      "--seed",
      DEFAULT_STAGE_CANDIDATE_SEED,
      "--stdout",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(output), manifest);
});

test("不正な盤面・上限を拒否", () => {
  assert.equal(validateRegionGrid(["AAAAA"]).valid, false);
  assert.throws(
    () =>
      buildStageCandidateProbeManifest("seed", {
        maxAttemptsPerPattern: 0,
      }),
    /positive integer/
  );
});

console.log(`\n==== GENERATOR V2 REGIONS TEST: PASS=${pass} FAIL=0 ====`);
