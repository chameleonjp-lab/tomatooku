export const VARIABLE_STAGE_SCHEMA_VERSION = 2;
export const VARIABLE_STAGE_BANK_SCHEMA_VERSION = 1;
export const VARIABLE_STAGE_BOARD_SIZE = 5;
export const VARIABLE_STAGE_REGION_LABELS = Object.freeze([
  "A",
  "B",
  "C",
  "D",
  "E",
]);
export const VARIABLE_STAGE_MIN_REGION_SIZE = 4;
export const VARIABLE_STAGE_MAX_REGION_SIZE = 6;
export const VARIABLE_STAGE_MIN_BANK_SIZE = 84;
export const VARIABLE_STAGE_ID_PATTERN = /^STG-[0-9a-f]{8}$/;
export const VARIABLE_STAGE_BANK_STATUS =
  "contract-proposed-pending-approval";

const CELL_COUNT = VARIABLE_STAGE_BOARD_SIZE * VARIABLE_STAGE_BOARD_SIZE;
const DIRECTIONS_4 = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);
const TRANSFORMS = Object.freeze([
  "identity",
  "rotate90",
  "rotate180",
  "rotate270",
  "mirrorLeftRight",
  "mirrorUpDown",
  "mirrorMainDiagonal",
  "mirrorAntiDiagonal",
]);

function indexOf(row, col) {
  return row * VARIABLE_STAGE_BOARD_SIZE + col;
}

function coordinateOf(index) {
  return [
    Math.floor(index / VARIABLE_STAGE_BOARD_SIZE),
    index % VARIABLE_STAGE_BOARD_SIZE,
  ];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRegionRowsShape(rows, problems) {
  if (!Array.isArray(rows) || rows.length !== VARIABLE_STAGE_BOARD_SIZE) {
    problems.push("regions must contain exactly 5 rows");
    return false;
  }
  let valid = true;
  for (let row = 0; row < VARIABLE_STAGE_BOARD_SIZE; row++) {
    if (
      typeof rows[row] !== "string" ||
      rows[row].length !== VARIABLE_STAGE_BOARD_SIZE
    ) {
      problems.push(`regions[${row}] must be a 5-character string`);
      valid = false;
    }
  }
  return valid;
}

function normalizeRegionLabels(rows) {
  const labelMap = new Map();
  let nextLabelIndex = 0;
  return rows.map((row) => {
    let normalized = "";
    for (const label of row) {
      if (!labelMap.has(label)) {
        if (nextLabelIndex >= VARIABLE_STAGE_REGION_LABELS.length) {
          throw new TypeError("regions contain more than five labels");
        }
        labelMap.set(
          label,
          VARIABLE_STAGE_REGION_LABELS[nextLabelIndex++]
        );
      }
      normalized += labelMap.get(label);
    }
    return normalized;
  });
}

function transformCell(row, col, transformName) {
  const last = VARIABLE_STAGE_BOARD_SIZE - 1;
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

function transformRegionRows(rows, transformName) {
  const transformed = Array.from(
    { length: VARIABLE_STAGE_BOARD_SIZE },
    () => new Array(VARIABLE_STAGE_BOARD_SIZE)
  );
  for (let row = 0; row < VARIABLE_STAGE_BOARD_SIZE; row++) {
    for (let col = 0; col < VARIABLE_STAGE_BOARD_SIZE; col++) {
      const [targetRow, targetCol] = transformCell(row, col, transformName);
      transformed[targetRow][targetCol] = rows[row][col];
    }
  }
  return normalizeRegionLabels(
    transformed.map((transformedRow) => transformedRow.join(""))
  );
}

export function canonicalizeVariableStageRegions(rows) {
  const shapeProblems = [];
  if (!validateRegionRowsShape(rows, shapeProblems)) {
    throw new TypeError(shapeProblems.join("; "));
  }
  return TRANSFORMS.map((transformName) =>
    transformRegionRows(rows, transformName).join("|")
  ).sort()[0];
}

function fnv1a32(value) {
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

export function expectedVariableStageId(rows) {
  const canonicalSignature = canonicalizeVariableStageRegions(rows);
  return `STG-${hex32(
    fnv1a32(`tomatooku:v2:stage:${canonicalSignature}`)
  )}`;
}

function collectRegionMasks(rows, problems) {
  const masks = new Map(
    VARIABLE_STAGE_REGION_LABELS.map((label) => [label, 0])
  );
  for (let row = 0; row < VARIABLE_STAGE_BOARD_SIZE; row++) {
    for (let col = 0; col < VARIABLE_STAGE_BOARD_SIZE; col++) {
      const label = rows[row][col];
      if (!masks.has(label)) {
        problems.push(`regions contains unsupported label ${JSON.stringify(label)}`);
        continue;
      }
      masks.set(label, masks.get(label) | (1 << indexOf(row, col)));
    }
  }
  return masks;
}

function bitCount(value) {
  let remaining = value >>> 0;
  let count = 0;
  while (remaining) {
    remaining &= remaining - 1;
    count++;
  }
  return count;
}

function isConnectedMask(mask) {
  if (!mask) return false;
  let firstIndex = -1;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (mask & (1 << index)) {
      firstIndex = index;
      break;
    }
  }
  let visitedMask = 1 << firstIndex;
  const queue = [firstIndex];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coordinateOf(queue[cursor]);
    for (const [deltaRow, deltaCol] of DIRECTIONS_4) {
      const nextRow = row + deltaRow;
      const nextCol = col + deltaCol;
      if (
        nextRow < 0 ||
        nextRow >= VARIABLE_STAGE_BOARD_SIZE ||
        nextCol < 0 ||
        nextCol >= VARIABLE_STAGE_BOARD_SIZE
      ) {
        continue;
      }
      const nextIndex = indexOf(nextRow, nextCol);
      const nextBit = 1 << nextIndex;
      if ((mask & nextBit) && !(visitedMask & nextBit)) {
        visitedMask |= nextBit;
        queue.push(nextIndex);
      }
    }
  }
  return visitedMask === mask;
}

function solveRegions(rows, solutionLimit = 2) {
  const regionIndexes = new Map(
    VARIABLE_STAGE_REGION_LABELS.map((label, index) => [label, index])
  );
  const usedColumns = new Array(VARIABLE_STAGE_BOARD_SIZE).fill(false);
  const usedRegions = new Array(VARIABLE_STAGE_BOARD_SIZE).fill(false);
  const placedColumns = new Array(VARIABLE_STAGE_BOARD_SIZE);
  const solutions = [];

  function visit(row) {
    if (solutions.length >= solutionLimit) return;
    if (row === VARIABLE_STAGE_BOARD_SIZE) {
      solutions.push(placedColumns.slice());
      return;
    }
    for (let col = 0; col < VARIABLE_STAGE_BOARD_SIZE; col++) {
      if (usedColumns[col]) continue;
      const regionIndex = regionIndexes.get(rows[row][col]);
      if (usedRegions[regionIndex]) continue;
      if (
        row > 0 &&
        Math.abs(placedColumns[row - 1] - col) < 2
      ) {
        continue;
      }
      usedColumns[col] = true;
      usedRegions[regionIndex] = true;
      placedColumns[row] = col;
      visit(row + 1);
      usedColumns[col] = false;
      usedRegions[regionIndex] = false;
    }
  }

  visit(0);
  return solutions;
}

function validateSolutionShape(solution, problems) {
  if (
    !Array.isArray(solution) ||
    solution.length !== VARIABLE_STAGE_BOARD_SIZE
  ) {
    problems.push("solution must contain exactly 5 [row, col] pairs");
    return null;
  }
  const columns = new Array(VARIABLE_STAGE_BOARD_SIZE);
  const usedColumns = new Set();
  let valid = true;
  for (let index = 0; index < VARIABLE_STAGE_BOARD_SIZE; index++) {
    const pair = solution[index];
    if (!Array.isArray(pair) || pair.length !== 2) {
      problems.push(`solution[${index}] must be [row, col]`);
      valid = false;
      continue;
    }
    const [row, col] = pair;
    if (row !== index) {
      problems.push(`solution[${index}] row must be ${index}`);
      valid = false;
    }
    if (
      !Number.isInteger(col) ||
      col < 0 ||
      col >= VARIABLE_STAGE_BOARD_SIZE
    ) {
      problems.push(`solution[${index}] column must be an integer from 0 to 4`);
      valid = false;
      continue;
    }
    if (usedColumns.has(col)) {
      problems.push(`solution uses column ${col} more than once`);
      valid = false;
    }
    usedColumns.add(col);
    columns[index] = col;
  }
  return valid ? columns : null;
}

export function validateVariableStage(stage) {
  const problems = [];
  if (!isPlainObject(stage)) {
    return { valid: false, problems: ["stage must be an object"] };
  }
  if (stage.schemaVersion !== VARIABLE_STAGE_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${VARIABLE_STAGE_SCHEMA_VERSION}`
    );
  }
  if (
    typeof stage.id !== "string" ||
    !VARIABLE_STAGE_ID_PATTERN.test(stage.id)
  ) {
    problems.push("id must match STG-xxxxxxxx using lowercase hexadecimal");
  }

  const regionsShapeValid = validateRegionRowsShape(stage.regions, problems);
  let canonicalSignature = null;
  if (regionsShapeValid) {
    const regionProblems = [];
    const masks = collectRegionMasks(stage.regions, regionProblems);
    problems.push(...regionProblems);
    for (const label of VARIABLE_STAGE_REGION_LABELS) {
      const mask = masks.get(label);
      const size = bitCount(mask);
      if (
        size < VARIABLE_STAGE_MIN_REGION_SIZE ||
        size > VARIABLE_STAGE_MAX_REGION_SIZE
      ) {
        problems.push(
          `region ${label} size must be ${VARIABLE_STAGE_MIN_REGION_SIZE}-${VARIABLE_STAGE_MAX_REGION_SIZE}; got ${size}`
        );
      }
      if (mask && !isConnectedMask(mask)) {
        problems.push(`region ${label} must be four-neighbor connected`);
      }
    }
    if (!regionProblems.length) {
      canonicalSignature = canonicalizeVariableStageRegions(stage.regions);
      const expectedId = expectedVariableStageId(stage.regions);
      if (
        typeof stage.id === "string" &&
        VARIABLE_STAGE_ID_PATTERN.test(stage.id) &&
        stage.id !== expectedId
      ) {
        problems.push(`id must equal content-derived stable id ${expectedId}`);
      }
      if (
        stage.canonicalSignature !== undefined &&
        stage.canonicalSignature !== canonicalSignature
      ) {
        problems.push("canonicalSignature does not match regions");
      }
    }
  }

  const solutionColumns = validateSolutionShape(stage.solution, problems);
  if (regionsShapeValid && solutionColumns) {
    const usedRegionLabels = new Set();
    for (let row = 0; row < VARIABLE_STAGE_BOARD_SIZE; row++) {
      const col = solutionColumns[row];
      usedRegionLabels.add(stage.regions[row][col]);
      if (
        row > 0 &&
        Math.abs(solutionColumns[row - 1] - col) < 2
      ) {
        problems.push(
          `solution tomatoes at rows ${row - 1} and ${row} touch`
        );
      }
    }
    if (usedRegionLabels.size !== VARIABLE_STAGE_BOARD_SIZE) {
      problems.push("solution must place exactly one tomato in every region");
    }

    if (!problems.some((problem) => problem.startsWith("region "))) {
      const solutions = solveRegions(stage.regions, 2);
      if (solutions.length !== 1) {
        problems.push(`regions must have exactly one solution; got ${solutions.length}`);
      } else if (solutions[0].join(",") !== solutionColumns.join(",")) {
        problems.push("solution does not match the unique solver result");
      }
    }
  }

  if (
    stage.difficulty !== undefined &&
    ![1, 2, 3].includes(stage.difficulty)
  ) {
    problems.push("difficulty must be 1, 2, or 3 when provided");
  }
  if (
    stage.generatorVersion !== undefined &&
    (typeof stage.generatorVersion !== "string" ||
      stage.generatorVersion.trim().length === 0)
  ) {
    problems.push("generatorVersion must be a non-empty string when provided");
  }

  return {
    valid: problems.length === 0,
    problems,
    canonicalSignature,
  };
}

export function assertVariableStage(stage) {
  const validation = validateVariableStage(stage);
  if (!validation.valid) {
    throw new TypeError(
      `invalid variable stage: ${validation.problems.join("; ")}`
    );
  }
  return stage;
}

export function validateVariableStageBank(
  bank,
  { minimumStageCount = VARIABLE_STAGE_MIN_BANK_SIZE } = {}
) {
  const problems = [];
  if (!isPlainObject(bank)) {
    return { valid: false, problems: ["bank must be an object"] };
  }
  if (bank.schemaVersion !== VARIABLE_STAGE_BANK_SCHEMA_VERSION) {
    problems.push(
      `bank schemaVersion must be ${VARIABLE_STAGE_BANK_SCHEMA_VERSION}`
    );
  }
  if (typeof bank.id !== "string" || bank.id.trim().length === 0) {
    problems.push("bank id must be a non-empty string");
  }
  if (bank.status !== VARIABLE_STAGE_BANK_STATUS) {
    problems.push(`bank status must be ${VARIABLE_STAGE_BANK_STATUS}`);
  }
  if (bank.runtimeEnabled !== false) {
    problems.push("candidate bank runtimeEnabled must be false");
  }
  if (bank.rankingEligible !== false) {
    problems.push("candidate bank rankingEligible must be false");
  }
  if (!Number.isInteger(minimumStageCount) || minimumStageCount < 1) {
    problems.push("minimumStageCount must be a positive integer");
  }
  if (!Array.isArray(bank.stages)) {
    problems.push("bank stages must be an array");
    return { valid: false, problems };
  }
  if (
    Number.isInteger(minimumStageCount) &&
    minimumStageCount > 0 &&
    bank.stages.length < minimumStageCount
  ) {
    problems.push(
      `bank must contain at least ${minimumStageCount} stages; got ${bank.stages.length}`
    );
  }

  const ids = new Set();
  const canonicalSignatures = new Set();
  bank.stages.forEach((stage, index) => {
    const validation = validateVariableStage(stage);
    for (const problem of validation.problems) {
      problems.push(`stages[${index}]: ${problem}`);
    }
    if (typeof stage?.id === "string") {
      if (ids.has(stage.id)) problems.push(`duplicate stage id ${stage.id}`);
      ids.add(stage.id);
    }
    if (validation.canonicalSignature) {
      if (canonicalSignatures.has(validation.canonicalSignature)) {
        problems.push(
          `stages[${index}] duplicates a D4-equivalent canonical stage`
        );
      }
      canonicalSignatures.add(validation.canonicalSignature);
    }
  });

  return { valid: problems.length === 0, problems };
}

export function assertVariableStageBank(bank, options) {
  const validation = validateVariableStageBank(bank, options);
  if (!validation.valid) {
    throw new TypeError(
      `invalid variable stage bank: ${validation.problems.join("; ")}`
    );
  }
  return bank;
}
