import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(ROOT, "review/variable-stage-review.html"), "utf8");
const css = readFileSync(resolve(ROOT, "review/variable-stage-review.css"), "utf8");
const js = readFileSync(resolve(ROOT, "review/variable-stage-review.js"), "utf8");
const index = readFileSync(resolve(ROOT, "index.html"), "utf8");
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "generated/variable-stage-candidate-pool-v2.json"), "utf8")
);

const N = 5;
const LABELS = ["A", "B", "C", "D", "E"];
const TRANSFORMS = [
  "identity",
  "rotate90",
  "rotate180",
  "rotate270",
  "mirrorLeftRight",
  "mirrorUpDown",
  "mirrorMainDiagonal",
  "mirrorAntiDiagonal",
];

function normalizeLabels(rows) {
  const mapping = new Map();
  let next = 0;
  return rows.map((row) =>
    [...row]
      .map((label) => {
        if (!mapping.has(label)) mapping.set(label, LABELS[next++]);
        return mapping.get(label);
      })
      .join("")
  );
}

function transformCell(row, col, transform) {
  const last = N - 1;
  switch (transform) {
    case "identity": return [row, col];
    case "rotate90": return [col, last - row];
    case "rotate180": return [last - row, last - col];
    case "rotate270": return [last - col, row];
    case "mirrorLeftRight": return [row, last - col];
    case "mirrorUpDown": return [last - row, col];
    case "mirrorMainDiagonal": return [col, row];
    case "mirrorAntiDiagonal": return [last - col, last - row];
    default: throw new RangeError(transform);
  }
}

function transformRegions(rows, transform) {
  const result = Array.from({ length: N }, () => new Array(N));
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const [nextRow, nextCol] = transformCell(row, col, transform);
      result[nextRow][nextCol] = rows[row][col];
    }
  }
  return result.map((row) => row.join(""));
}

function distance(left, right) {
  let count = 0;
  const flatLeft = left.join("");
  const flatRight = right.join("");
  for (let index = 0; index < flatLeft.length; index++) {
    if (flatLeft[index] !== flatRight[index]) count++;
  }
  return count;
}

function minimumDistance(left, right) {
  const canonicalLeft = left.canonicalSignature.split("|");
  return Math.min(
    ...TRANSFORMS.map((transform) =>
      distance(canonicalLeft, normalizeLabels(transformRegions(right.regions, transform)))
    )
  );
}

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

test("レビューHTMLは開発専用導線とアクセシブルな主要操作を持つ", () => {
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /開発用・ゲーム本体未接続/);
  assert.match(html, /id="current-board"/);
  assert.match(html, /id="neighbor-board"/);
  assert.match(html, /data-decision="keep"/);
  assert.match(html, /data-decision="reject"/);
  assert.match(html, /data-decision="hold"/);
  assert.match(html, /id="export-review"/);
  assert.match(html, /id="import-review"/);
  assert.match(html, /role="status"/);
  assert.match(html, /type="module" src="\.\/variable-stage-review\.js"/);
});

test("レビュー画面は320px・reduced motion・forced colorsへ対応", () => {
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /grid-template-columns:\s*1fr;/);
});

test("レビュー判断はlocalStorageのみを使いSupabaseへ送信しない", () => {
  assert.match(js, /tomatooku\.variableStageReview\.v1/);
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /localStorage\.removeItem/);
  assert.doesNotMatch(js, /supabase/i);
  assert.doesNotMatch(js, /rest\/v1/);
  assert.doesNotMatch(js, /submit_score/);
});

test("比較画面はD4整列・最近傍・差分・JSON入出力を実装", () => {
  for (const transform of TRANSFORMS) assert.match(js, new RegExp(transform));
  assert.match(js, /alignNeighbor/);
  assert.match(js, /computeNearestStages/);
  assert.match(js, /changedIndexes/);
  assert.match(js, /Blob/);
  assert.match(js, /validateImportedReview/);
  assert.match(js, /history\.replaceState/);
});

test("本番ゲームindexからレビュー画面を自動接続しない", () => {
  assert.doesNotMatch(index, /variable-stage-review/);
  assert.doesNotMatch(index, /candidate-pool-ready-for-review/);
});

test("候補manifestは安全な108問レビュー専用状態", () => {
  assert.equal(manifest.stageCount, 108);
  assert.equal(manifest.stages.length, 108);
  assert.equal(manifest.runtimeEnabled, false);
  assert.equal(manifest.rankingEligible, false);
  assert.equal(manifest.status, "candidate-pool-not-runtime");
  assert.equal(Object.keys(manifest.metadata).length, 108);
});

test("最近傍距離を独立再計算してmanifest分布と一致", () => {
  const distribution = {};
  for (const stage of manifest.stages) {
    let nearest = N * N;
    for (const other of manifest.stages) {
      if (other.id === stage.id) continue;
      nearest = Math.min(nearest, minimumDistance(stage, other));
    }
    assert.equal(nearest, manifest.metadata[stage.id].nearestStructuralDistance, stage.id);
    distribution[nearest] = (distribution[nearest] || 0) + 1;
  }
  assert.deepEqual(distribution, {
    1: 59,
    2: 33,
    3: 9,
    4: 4,
    5: 1,
    7: 1,
    9: 1,
  });
});

test("レビュー対象ID・canonical・難易度は重複や欠落がない", () => {
  assert.equal(new Set(manifest.stages.map((stage) => stage.id)).size, 108);
  assert.equal(new Set(manifest.stages.map((stage) => stage.canonicalSignature)).size, 108);
  assert.deepEqual(manifest.difficultyDistribution, { 1: 36, 2: 36, 3: 36 });
  for (const stage of manifest.stages) {
    assert.ok([1, 2, 3].includes(stage.difficulty));
    assert.equal(stage.regions.length, 5);
    assert.equal(stage.solution.length, 5);
  }
});

console.log(`\n==== VARIABLE STAGE REVIEW STATIC TEST: PASS=${pass} FAIL=0 ====`);
