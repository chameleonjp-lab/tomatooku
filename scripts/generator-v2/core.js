/**
 * トマトオク 生成器v2 基盤。
 *
 * このモジュールは解配置の列挙、D4対称変換の正規化、seed付き乱数、
 * 内容ベースIDだけを提供する。領域生成・難易度判定・本番バンク切替は後続sliceで扱う。
 */

export const BOARD_SIZE = 5;
export const GENERATOR_VERSION = "2.0.0-foundation.1";
export const MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_GENERATOR_SEED = "tomatooku-generator-v2-foundation";

export const TRANSFORM_NAMES = Object.freeze([
  "identity",
  "rotate90",
  "rotate180",
  "rotate270",
  "mirrorLeftRight",
  "mirrorUpDown",
  "mirrorMainDiagonal",
  "mirrorAntiDiagonal",
]);

function assertBoardSize(size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new TypeError("board size must be a positive integer");
  }
}

export function validateColumnPattern(columns, size = BOARD_SIZE) {
  assertBoardSize(size);
  if (!Array.isArray(columns) || columns.length !== size) return false;
  const used = new Set();
  for (let row = 0; row < size; row++) {
    const col = columns[row];
    if (!Number.isInteger(col) || col < 0 || col >= size || used.has(col)) {
      return false;
    }
    if (row > 0 && Math.abs(col - columns[row - 1]) < 2) return false;
    used.add(col);
  }
  return true;
}

export function enumerateValidColumnPatterns(size = BOARD_SIZE) {
  assertBoardSize(size);
  const results = [];
  const columns = new Array(size);
  const used = new Array(size).fill(false);

  function visit(row) {
    if (row === size) {
      results.push(columns.slice());
      return;
    }
    for (let col = 0; col < size; col++) {
      if (used[col]) continue;
      if (row > 0 && Math.abs(col - columns[row - 1]) < 2) continue;
      used[col] = true;
      columns[row] = col;
      visit(row + 1);
      used[col] = false;
    }
  }

  visit(0);
  return results;
}

export function patternSignature(columns) {
  if (!Array.isArray(columns)) throw new TypeError("columns must be an array");
  return columns.join(",");
}

export function patternToCells(columns, size = BOARD_SIZE) {
  if (!validateColumnPattern(columns, size)) {
    throw new TypeError("invalid column pattern");
  }
  return columns.map((col, row) => [row, col]);
}

export function cellsToColumnPattern(cells, size = BOARD_SIZE) {
  assertBoardSize(size);
  if (!Array.isArray(cells) || cells.length !== size) {
    throw new TypeError("cells must contain one coordinate per row");
  }
  const columns = new Array(size).fill(null);
  const usedCols = new Set();
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length !== 2) {
      throw new TypeError("cell must be [row, col]");
    }
    const [row, col] = cell;
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= size ||
      col < 0 ||
      col >= size ||
      columns[row] !== null ||
      usedCols.has(col)
    ) {
      throw new TypeError("cells must form a row/column permutation");
    }
    columns[row] = col;
    usedCols.add(col);
  }
  if (!validateColumnPattern(columns, size)) {
    throw new TypeError("transformed cells violate the placement rule");
  }
  return columns;
}

export function transformCell([row, col], transformName, size = BOARD_SIZE) {
  assertBoardSize(size);
  const last = size - 1;
  switch (transformName) {
    case "identity":
      return [row, col];
    case "rotate90":
      return [col, last - row];
    case "rotate180":
      return [last - row, last - col];
    case "rotate270":
      return [last - col, row];
    case "mirrorLeftRight":
      return [row, last - col];
    case "mirrorUpDown":
      return [last - row, col];
    case "mirrorMainDiagonal":
      return [col, row];
    case "mirrorAntiDiagonal":
      return [last - col, last - row];
    default:
      throw new RangeError(`unknown transform: ${transformName}`);
  }
}

export function transformPattern(columns, transformName, size = BOARD_SIZE) {
  const cells = patternToCells(columns, size).map((cell) =>
    transformCell(cell, transformName, size)
  );
  return cellsToColumnPattern(cells, size);
}

export function symmetrySignatures(columns, size = BOARD_SIZE) {
  return TRANSFORM_NAMES.map((name) =>
    patternSignature(transformPattern(columns, name, size))
  );
}

export function canonicalizePattern(columns, size = BOARD_SIZE) {
  const signatures = symmetrySignatures(columns, size);
  return signatures.slice().sort()[0];
}

export function fnv1a32(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function stablePatternId(columns, size = BOARD_SIZE) {
  if (!validateColumnPattern(columns, size)) throw new TypeError("invalid column pattern");
  return `SP-${hex32(fnv1a32(`tomatooku:v2:pattern:${patternSignature(columns)}`))}`;
}

export function stableSymmetryClassId(columns, size = BOARD_SIZE) {
  if (!validateColumnPattern(columns, size)) throw new TypeError("invalid column pattern");
  return `SC-${hex32(fnv1a32(`tomatooku:v2:class:${canonicalizePattern(columns, size)}`))}`;
}

export function normalizeSeed(seed) {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
      throw new TypeError("numeric seed must be a finite integer");
    }
    return seed >>> 0;
  }
  if (typeof seed === "bigint") return Number(seed & 0xffffffffn) >>> 0;
  if (typeof seed === "string" && seed.length > 0) {
    return fnv1a32(`tomatooku:v2:seed:${seed}`);
  }
  throw new TypeError("seed must be a non-empty string, integer, or bigint");
}

export function createSeededRandom(seed) {
  let state = normalizeSeed(seed);
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicShuffle(values, seed) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  const random = createSeededRandom(seed);
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

export function buildSolutionPatternManifest(seed = DEFAULT_GENERATOR_SEED) {
  const normalizedSeed = normalizeSeed(seed);
  const basePatterns = enumerateValidColumnPatterns(BOARD_SIZE)
    .map((columns) => {
      const signature = patternSignature(columns);
      const canonicalSignature = canonicalizePattern(columns);
      const variants = [...new Set(symmetrySignatures(columns))].sort();
      return {
        patternId: stablePatternId(columns),
        symmetryClassId: stableSymmetryClassId(columns),
        signature,
        canonicalSignature,
        orbitSize: variants.length,
        columns: columns.slice(),
        cells: patternToCells(columns),
      };
    })
    .sort((left, right) => left.signature.localeCompare(right.signature));

  const ordered = deterministicShuffle(basePatterns, normalizedSeed).map(
    (pattern, index) => ({ order: index + 1, ...pattern })
  );
  const symmetryClassCount = new Set(
    basePatterns.map((pattern) => pattern.symmetryClassId)
  ).size;

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    boardSize: BOARD_SIZE,
    sourceSeed: typeof seed === "bigint" ? seed.toString() : seed,
    normalizedSeed,
    patternCount: basePatterns.length,
    symmetryClassCount,
    patterns: ordered,
  };
}
