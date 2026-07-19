import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BOARD_SIZE,
  DEFAULT_GENERATOR_SEED,
  TRANSFORM_NAMES,
  buildSolutionPatternManifest,
  canonicalizePattern,
  createSeededRandom,
  deterministicShuffle,
  enumerateValidColumnPatterns,
  normalizeSeed,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
  symmetrySignatures,
  transformPattern,
  validateColumnPattern,
} from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const EXPECTED_SIGNATURES = [
  "0,2,4,1,3",
  "0,3,1,4,2",
  "1,3,0,2,4",
  "1,3,0,4,2",
  "1,4,2,0,3",
  "2,0,3,1,4",
  "2,0,4,1,3",
  "2,4,0,3,1",
  "2,4,1,3,0",
  "3,0,2,4,1",
  "3,1,4,0,2",
  "3,1,4,2,0",
  "4,1,3,0,2",
  "4,2,0,3,1",
];

const patterns = enumerateValidColumnPatterns();

test("5x5の有効な正解配置を14種類すべて列挙", () => {
  assert.equal(BOARD_SIZE, 5);
  assert.equal(patterns.length, 14);
  assert.deepEqual(patterns.map(patternSignature), EXPECTED_SIGNATURES);
  patterns.forEach((pattern) => assert.equal(validateColumnPattern(pattern), true));
});

test("回転・反転8変換は有効配置を保つ", () => {
  for (const pattern of patterns) {
    for (const transformName of TRANSFORM_NAMES) {
      assert.equal(validateColumnPattern(transformPattern(pattern, transformName)), true);
    }
  }
});

test("D4対称正規化は冪等で3クラスに集約", () => {
  const classes = new Map();
  for (const pattern of patterns) {
    const canonical = canonicalizePattern(pattern);
    const canonicalColumns = canonical.split(",").map(Number);
    assert.equal(canonicalizePattern(canonicalColumns), canonical);
    const variants = symmetrySignatures(pattern);
    variants.forEach((signature) => {
      assert.equal(canonicalizePattern(signature.split(",").map(Number)), canonical);
    });
    classes.set(canonical, (classes.get(canonical) || 0) + 1);
  }
  assert.deepEqual([...classes.values()].sort((a, b) => b - a), [8, 4, 2]);
});

test("配置IDは14個で一意、対称クラスIDは3個", () => {
  const patternIds = new Set(patterns.map((pattern) => stablePatternId(pattern)));
  const classIds = new Set(
    patterns.map((pattern) => stableSymmetryClassId(pattern))
  );
  assert.equal(patternIds.size, 14);
  assert.equal(classIds.size, 3);
  assert.equal(stablePatternId(patterns[0]), "SP-a6ee2d58");
  assert.equal(stableSymmetryClassId(patterns[0]), "SC-95390462");
});

test("seed付き乱数は同じseedで同じ系列", () => {
  const left = createSeededRandom("fixture-seed");
  const right = createSeededRandom("fixture-seed");
  assert.deepEqual(
    Array.from({ length: 8 }, () => left()),
    Array.from({ length: 8 }, () => right())
  );
  assert.notEqual(normalizeSeed("fixture-seed"), normalizeSeed("other-seed"));
});

test("seed付きshuffleは入力を変更せず再現可能", () => {
  const source = [1, 2, 3, 4, 5, 6, 7];
  const first = deterministicShuffle(source, "alpha");
  const second = deterministicShuffle(source, "alpha");
  const third = deterministicShuffle(source, "beta");
  assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, third);
});

test("manifestは同じseedで完全一致し、別seedでもID集合は不変", () => {
  const first = buildSolutionPatternManifest(DEFAULT_GENERATOR_SEED);
  const second = buildSolutionPatternManifest(DEFAULT_GENERATOR_SEED);
  const other = buildSolutionPatternManifest("other-seed");
  assert.deepEqual(first, second);
  assert.equal(first.patternCount, 14);
  assert.equal(first.symmetryClassCount, 3);
  assert.notDeepEqual(
    first.patterns.map((pattern) => pattern.patternId),
    other.patterns.map((pattern) => pattern.patternId)
  );
  assert.deepEqual(
    first.patterns.map((pattern) => pattern.patternId).sort(),
    other.patterns.map((pattern) => pattern.patternId).sort()
  );
});

test("commit済みmanifestは既定seedの生成結果と一致", () => {
  const committed = JSON.parse(
    readFileSync(resolve(ROOT, "generated/solution-patterns-v2.json"), "utf8")
  );
  assert.deepEqual(committed, buildSolutionPatternManifest(DEFAULT_GENERATOR_SEED));
});

test("CLIのstdoutは純粋関数のmanifestと一致", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "scripts/generate_stages_v2.js"),
      "--seed",
      DEFAULT_GENERATOR_SEED,
      "--stdout",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(result.stdout),
    buildSolutionPatternManifest(DEFAULT_GENERATOR_SEED)
  );
  assert.match(result.stderr, /patterns=14 symmetryClasses=3/);
});

test("不正な配置とseedを拒否", () => {
  assert.equal(validateColumnPattern([0, 1, 2, 3, 4]), false);
  assert.throws(() => stablePatternId([0, 1, 2, 3, 4]), /invalid/);
  assert.throws(() => normalizeSeed(""), /seed/);
  assert.throws(() => normalizeSeed(1.5), /integer/);
});

console.log(`\n==== GENERATOR V2 FOUNDATION TEST: PASS=${pass} FAIL=0 ====`);
