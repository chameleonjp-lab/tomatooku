import {
  BOARD_SIZE,
  enumerateValidColumnPatterns,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
  validateColumnPattern,
} from "./core.js";
import {
  REGION_LABELS,
  canonicalizeRegionGrid,
  stableStageId,
} from "./regions.js";

export const VARIABLE_FEASIBILITY_SCHEMA_VERSION = 1;
export const VARIABLE_FEASIBILITY_AUDIT_VERSION =
  "2.4.0-variable-regions.1";
export const VARIABLE_REQUIRED_CANONICAL_TARGET = 84;
export const DEFAULT_MIN_REGION_SIZE = 4;
export const DEFAULT_MAX_REGION_SIZE = 6;

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const FULL_MASK = (1 << CELL_COUNT) - 1;
const DIRS4 = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);

const indexOf = (row, col) => row * BOARD_SIZE + col;
const coordinateOf = (index) => [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];

function bitCount(value) {
  let remaining = value >>> 0;
  let count = 0;
  while (remaining) {
    remaining &= remaining - 1;
    count++;
  }
  return count;
}

function assertRegionSizeRange(minRegionSize, maxRegionSize) {
  if (
    !Number.isInteger(minRegionSize) ||
    !Number.isInteger(maxRegionSize) ||
    minRegionSize < 1 ||
    maxRegionSize < minRegionSize
  ) {
    throw new TypeError("region size range must contain positive integers");
  }
  if (
    minRegionSize * BOARD_SIZE > CELL_COUNT ||
    maxRegionSize * BOARD_SIZE < CELL_COUNT
  ) {
    throw new RangeError("region size range cannot cover the board");
  }
}

function connectedMask(mask) {
  if (!mask) return false;
  let first = -1;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (mask & (1 << index)) {
      first = index;
      break;
    }
  }
  let visited = 1 << first;
  const queue = [first];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coordinateOf(queue[cursor]);
    for (const [dr, dc] of DIRS4) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (
        nextRow < 0 ||
        nextRow >= BOARD_SIZE ||
        nextCol < 0 ||
        nextCol >= BOARD_SIZE
      ) {
        continue;
      }
      const next = indexOf(nextRow, nextCol);
      const bit = 1 << next;
      if ((mask & bit) && !(visited & bit)) {
        visited |= bit;
        queue.push(next);
      }
    }
  }
  return visited === mask;
}

function candidateRegionMasks(
  seedIndex,
  otherSeedIndexes,
  minRegionSize,
  maxRegionSize
) {
  const excluded = new Set(otherSeedIndexes);
  const allowed = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (index !== seedIndex && !excluded.has(index)) allowed.push(index);
  }
  const results = [];
  const selected = [];

  function choose(start, targetAdditionalCells) {
    if (selected.length === targetAdditionalCells) {
      let mask = 1 << seedIndex;
      for (const index of selected) mask |= 1 << index;
      if (connectedMask(mask)) results.push(mask);
      return;
    }
    const remaining = targetAdditionalCells - selected.length;
    for (let index = start; index <= allowed.length - remaining; index++) {
      selected.push(allowed[index]);
      choose(index + 1, targetAdditionalCells);
      selected.pop();
    }
  }

  for (let size = minRegionSize; size <= maxRegionSize; size++) {
    choose(0, size - 1);
  }
  return results;
}

function rowsFromMasks(masks) {
  const grid = new Array(CELL_COUNT);
  masks.forEach((mask, regionId) => {
    for (let index = 0; index < CELL_COUNT; index++) {
      if (mask & (1 << index)) grid[index] = REGION_LABELS[regionId];
    }
  });
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    grid.slice(row * BOARD_SIZE, (row + 1) * BOARD_SIZE).join("")
  );
}

export function regionSizeProfile(rows) {
  const counts = new Map(REGION_LABELS.map((label) => [label, 0]));
  for (const row of rows) {
    for (const label of row) counts.set(label, (counts.get(label) || 0) + 1);
  }
  return REGION_LABELS.map((label) => counts.get(label) || 0).sort(
    (left, right) => left - right
  );
}

export function validateVariableRegionGrid(
  rows,
  {
    minRegionSize = DEFAULT_MIN_REGION_SIZE,
    maxRegionSize = DEFAULT_MAX_REGION_SIZE,
  } = {}
) {
  assertRegionSizeRange(minRegionSize, maxRegionSize);
  const problems = [];
  if (!Array.isArray(rows) || rows.length !== BOARD_SIZE) {
    return { valid: false, problems: ["regions must contain 5 rows"] };
  }
  const masks = new Map(REGION_LABELS.map((label) => [label, 0]));
  for (let row = 0; row < BOARD_SIZE; row++) {
    if (typeof rows[row] !== "string" || rows[row].length !== BOARD_SIZE) {
      problems.push(`row ${row} must contain 5 characters`);
      continue;
    }
    for (let col = 0; col < BOARD_SIZE; col++) {
      const label = rows[row][col];
      if (!masks.has(label)) {
        problems.push(`unknown region label ${label}`);
      } else {
        masks.set(label, masks.get(label) | (1 << indexOf(row, col)));
      }
    }
  }
  for (const label of REGION_LABELS) {
    const mask = masks.get(label);
    const count = bitCount(mask);
    if (count < minRegionSize || count > maxRegionSize) {
      problems.push(`region ${label} size=${count}`);
    }
    if (mask && !connectedMask(mask)) problems.push(`region ${label} is disconnected`);
  }
  return { valid: problems.length === 0, problems };
}

export function solveVariableRegionGrid(
  rows,
  {
    solutionLimit = 2,
    minRegionSize = DEFAULT_MIN_REGION_SIZE,
    maxRegionSize = DEFAULT_MAX_REGION_SIZE,
  } = {}
) {
  const validation = validateVariableRegionGrid(rows, {
    minRegionSize,
    maxRegionSize,
  });
  if (!validation.valid) {
    throw new TypeError(`invalid variable region grid: ${validation.problems.join("; ")}`);
  }
  if (!Number.isInteger(solutionLimit) || solutionLimit < 1) {
    throw new TypeError("solutionLimit must be a positive integer");
  }
  const regionIndexes = new Map(
    REGION_LABELS.map((label, index) => [label, index])
  );
  const columnUsed = new Array(BOARD_SIZE).fill(false);
  const regionUsed = new Array(BOARD_SIZE).fill(false);
  const placed = new Array(BOARD_SIZE);
  const solutions = [];
  let nodes = 0;

  function visit(row) {
    if (solutions.length >= solutionLimit) return;
    if (row === BOARD_SIZE) {
      solutions.push(placed.slice());
      return;
    }
    for (let col = 0; col < BOARD_SIZE; col++) {
      nodes++;
      if (columnUsed[col]) continue;
      const region = regionIndexes.get(rows[row][col]);
      if (regionUsed[region]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - col) < 2) continue;
      columnUsed[col] = true;
      regionUsed[region] = true;
      placed[row] = col;
      visit(row + 1);
      columnUsed[col] = false;
      regionUsed[region] = false;
    }
  }

  visit(0);
  return {
    solutionCount: solutions.length,
    unique: solutions.length === 1,
    firstSolution: solutions[0] || null,
    nodes,
  };
}

function enumeratePatternWitnesses(
  columns,
  canonicalStages,
  {
    requiredCanonicalTarget,
    minRegionSize,
    maxRegionSize,
  }
) {
  if (!validateColumnPattern(columns)) throw new TypeError("invalid column pattern");
  const seedIndexes = columns.map((col, row) => indexOf(row, col));
  const candidates = seedIndexes.map((seedIndex) =>
    candidateRegionMasks(
      seedIndex,
      seedIndexes.filter((other) => other !== seedIndex),
      minRegionSize,
      maxRegionSize
    )
  );
  const masks = new Array(BOARD_SIZE).fill(0);
  let connectedPartitionCountVisited = 0;
  let uniqueSolutionCountVisited = 0;
  let thresholdReached = canonicalStages.size >= requiredCanonicalTarget;

  function visit(unassignedRegionIds, usedMask) {
    if (canonicalStages.size >= requiredCanonicalTarget) {
      thresholdReached = true;
      return true;
    }
    if (!unassignedRegionIds.length) {
      if (usedMask !== FULL_MASK) return false;
      connectedPartitionCountVisited++;
      const regions = rowsFromMasks(masks);
      const solved = solveVariableRegionGrid(regions, {
        minRegionSize,
        maxRegionSize,
      });
      if (!solved.unique || solved.firstSolution.join(",") !== columns.join(",")) {
        return false;
      }
      uniqueSolutionCountVisited++;
      const canonicalSignature = canonicalizeRegionGrid(regions);
      if (!canonicalStages.has(canonicalSignature)) {
        const canonicalRegions = canonicalSignature.split("|");
        const canonicalSolution = solveVariableRegionGrid(canonicalRegions, {
          minRegionSize,
          maxRegionSize,
        }).firstSolution;
        canonicalStages.set(canonicalSignature, {
          stageId: stableStageId(canonicalRegions),
          canonicalSignature,
          regions: canonicalRegions,
          regionSizes: regionSizeProfile(canonicalRegions),
          solution: canonicalSolution.map((col, row) => [row, col]),
        });
      }
      return canonicalStages.size >= requiredCanonicalTarget;
    }

    const remainingCells = CELL_COUNT - bitCount(usedMask);
    if (
      remainingCells < unassignedRegionIds.length * minRegionSize ||
      remainingCells > unassignedRegionIds.length * maxRegionSize
    ) {
      return false;
    }

    let chosenRegionId = null;
    let compatibleMasks = null;
    for (const regionId of unassignedRegionIds) {
      const compatible = candidates[regionId].filter((mask) => !(mask & usedMask));
      if (!compatible.length) return false;
      if (compatibleMasks === null || compatible.length < compatibleMasks.length) {
        chosenRegionId = regionId;
        compatibleMasks = compatible;
      }
    }
    const remainingRegionIds = unassignedRegionIds.filter(
      (regionId) => regionId !== chosenRegionId
    );
    for (const mask of compatibleMasks) {
      masks[chosenRegionId] = mask;
      if (visit(remainingRegionIds, usedMask | mask)) return true;
    }
    masks[chosenRegionId] = 0;
    return false;
  }

  visit([...Array(BOARD_SIZE).keys()], 0);
  return {
    patternId: stablePatternId(columns),
    symmetryClassId: stableSymmetryClassId(columns),
    patternSignature: patternSignature(columns),
    candidateRegionCounts: candidates.map((items) => items.length),
    connectedPartitionCountVisited,
    uniqueSolutionCountVisited,
    thresholdReached,
  };
}

export function buildVariableRegionFeasibilityManifest({
  requiredCanonicalTarget = VARIABLE_REQUIRED_CANONICAL_TARGET,
  minRegionSize = DEFAULT_MIN_REGION_SIZE,
  maxRegionSize = DEFAULT_MAX_REGION_SIZE,
} = {}) {
  assertRegionSizeRange(minRegionSize, maxRegionSize);
  if (!Number.isInteger(requiredCanonicalTarget) || requiredCanonicalTarget < 1) {
    throw new TypeError("requiredCanonicalTarget must be a positive integer");
  }
  const canonicalStages = new Map();
  const patternAudits = [];
  for (const columns of enumerateValidColumnPatterns()) {
    patternAudits.push(
      enumeratePatternWitnesses(columns, canonicalStages, {
        requiredCanonicalTarget,
        minRegionSize,
        maxRegionSize,
      })
    );
    if (canonicalStages.size >= requiredCanonicalTarget) break;
  }
  const stages = [...canonicalStages.values()].sort((left, right) =>
    left.stageId.localeCompare(right.stageId)
  );
  const profileDistribution = {};
  for (const stage of stages) {
    const profile = stage.regionSizes.join("-");
    profileDistribution[profile] = (profileDistribution[profile] || 0) + 1;
  }
  const connectedPartitionCountVisited = patternAudits.reduce(
    (sum, pattern) => sum + pattern.connectedPartitionCountVisited,
    0
  );
  const uniqueSolutionCountVisited = patternAudits.reduce(
    (sum, pattern) => sum + pattern.uniqueSolutionCountVisited,
    0
  );
  const targetFeasible = stages.length >= requiredCanonicalTarget;

  return {
    schemaVersion: VARIABLE_FEASIBILITY_SCHEMA_VERSION,
    auditVersion: VARIABLE_FEASIBILITY_AUDIT_VERSION,
    auditMode: "threshold-witness",
    exhaustive: false,
    boardSize: BOARD_SIZE,
    constraints: {
      regionCount: BOARD_SIZE,
      minRegionSize,
      maxRegionSize,
      regionsMustBeFourNeighborConnected: true,
      oneTomatoPerRow: true,
      oneTomatoPerColumn: true,
      oneTomatoPerRegion: true,
      tomatoesMayNotTouchIncludingDiagonals: true,
      uniqueSolutionRequired: true,
      deduplication: "D4 transforms plus first-seen region-label normalization",
    },
    requiredCanonicalTarget,
    targetFeasible,
    canonicalStageCount: stages.length,
    patternsVisited: patternAudits.length,
    connectedPartitionCountVisited,
    uniqueSolutionCountVisited,
    profileDistribution,
    conclusion: targetFeasible
      ? `The target of ${requiredCanonicalTarget} D4-unique stages is feasible with connected region sizes ${minRegionSize}-${maxRegionSize}.`
      : `The threshold audit did not find ${requiredCanonicalTarget} D4-unique stages with connected region sizes ${minRegionSize}-${maxRegionSize}.`,
    patternAudits,
    canonicalStages: stages,
  };
}
