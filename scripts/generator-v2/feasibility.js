import {
  BOARD_SIZE,
  enumerateValidColumnPatterns,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
} from "./core.js";
import {
  REGION_LABELS,
  canonicalizeRegionGrid,
  solveRegionGrid,
  stableStageId,
} from "./regions.js";

export const FEASIBILITY_SCHEMA_VERSION = 1;
export const FEASIBILITY_AUDIT_VERSION = "2.3.0-feasibility.1";
export const REQUIRED_CANONICAL_TARGET = 84;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const FULL_MASK = (1 << CELL_COUNT) - 1;
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const indexOf = (row, col) => row * BOARD_SIZE + col;
const coordinateOf = (index) => [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];

function connectedMask(mask) {
  let first = -1;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (mask & (1 << index)) { first = index; break; }
  }
  if (first < 0) return false;
  let visited = 1 << first;
  const queue = [first];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coordinateOf(queue[cursor]);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const next = indexOf(nr, nc);
      const bit = 1 << next;
      if ((mask & bit) && !(visited & bit)) {
        visited |= bit;
        queue.push(next);
      }
    }
  }
  return visited === mask;
}

function candidateRegionMasks(seedIndex, otherSeedIndexes) {
  const excluded = new Set(otherSeedIndexes);
  const allowed = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (index !== seedIndex && !excluded.has(index)) allowed.push(index);
  }
  const results = [];
  const selected = [];
  function choose(start) {
    if (selected.length === BOARD_SIZE - 1) {
      let mask = 1 << seedIndex;
      for (const index of selected) mask |= 1 << index;
      if (connectedMask(mask)) results.push(mask);
      return;
    }
    const remaining = BOARD_SIZE - 1 - selected.length;
    for (let index = start; index <= allowed.length - remaining; index++) {
      selected.push(allowed[index]);
      choose(index + 1);
      selected.pop();
    }
  }
  choose(0);
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

export function enumeratePatternFeasibility(columns) {
  const seedIndexes = columns.map((col, row) => indexOf(row, col));
  const candidates = seedIndexes.map((seedIndex) =>
    candidateRegionMasks(seedIndex, seedIndexes.filter((other) => other !== seedIndex))
  );
  const order = [...Array(BOARD_SIZE).keys()].sort(
    (left, right) => candidates[left].length - candidates[right].length
  );
  const masks = new Array(BOARD_SIZE).fill(0);
  const canonicalStages = new Map();
  let connectedPartitionCount = 0;
  let uniqueSolutionCount = 0;

  function visit(depth, usedMask) {
    if (depth === BOARD_SIZE) {
      if (usedMask !== FULL_MASK) return;
      connectedPartitionCount++;
      const regions = rowsFromMasks(masks);
      const solved = solveRegionGrid(regions);
      if (!solved.unique || solved.firstSolution.join(",") !== columns.join(",")) return;
      uniqueSolutionCount++;
      const canonicalSignature = canonicalizeRegionGrid(regions);
      if (!canonicalStages.has(canonicalSignature)) {
        const canonicalRegions = canonicalSignature.split("|");
        const canonicalSolution = solveRegionGrid(canonicalRegions).firstSolution;
        canonicalStages.set(canonicalSignature, {
          stageId: stableStageId(canonicalRegions),
          canonicalSignature,
          regions: canonicalRegions,
          solution: canonicalSolution.map((col, row) => [row, col]),
        });
      }
      return;
    }
    const regionId = order[depth];
    for (const mask of candidates[regionId]) {
      if (mask & usedMask) continue;
      masks[regionId] = mask;
      visit(depth + 1, usedMask | mask);
      masks[regionId] = 0;
    }
  }

  visit(0, 0);
  return {
    patternId: stablePatternId(columns),
    symmetryClassId: stableSymmetryClassId(columns),
    patternSignature: patternSignature(columns),
    columns: columns.slice(),
    candidateRegionCounts: candidates.map((items) => items.length),
    connectedPartitionCount,
    uniqueSolutionCount,
    canonicalStageCount: canonicalStages.size,
    canonicalStages: [...canonicalStages.values()].sort((a, b) =>
      a.stageId.localeCompare(b.stageId)
    ),
  };
}

export function buildStageBankFeasibilityManifest() {
  const patterns = enumerateValidColumnPatterns().map(enumeratePatternFeasibility);
  const canonical = new Map();
  for (const pattern of patterns) {
    for (const stage of pattern.canonicalStages) {
      if (!canonical.has(stage.canonicalSignature)) {
        canonical.set(stage.canonicalSignature, { ...stage, supportingPatternIds: [] });
      }
      canonical.get(stage.canonicalSignature).supportingPatternIds.push(pattern.patternId);
    }
  }
  const canonicalStages = [...canonical.values()]
    .map((stage) => ({
      ...stage,
      supportingPatternIds: stage.supportingPatternIds.sort(),
    }))
    .sort((a, b) => a.stageId.localeCompare(b.stageId));
  const connectedPartitionCount = patterns.reduce(
    (sum, pattern) => sum + pattern.connectedPartitionCount, 0
  );
  const uniqueSolutionCount = patterns.reduce(
    (sum, pattern) => sum + pattern.uniqueSolutionCount, 0
  );
  const unsupportedPatterns = patterns.filter((pattern) => pattern.uniqueSolutionCount === 0);

  return {
    schemaVersion: FEASIBILITY_SCHEMA_VERSION,
    auditVersion: FEASIBILITY_AUDIT_VERSION,
    boardSize: BOARD_SIZE,
    constraints: {
      regionCount: BOARD_SIZE,
      cellsPerRegion: BOARD_SIZE,
      regionsMustBeFourNeighborConnected: true,
      oneTomatoPerRow: true,
      oneTomatoPerColumn: true,
      oneTomatoPerRegion: true,
      tomatoesMayNotTouchIncludingDiagonals: true,
      deduplication: "D4 transforms plus first-seen region-label normalization",
    },
    requiredCanonicalTarget: REQUIRED_CANONICAL_TARGET,
    patternCount: patterns.length,
    connectedPartitionCount,
    uniqueSolutionCount,
    maximumCanonicalStageCount: canonicalStages.length,
    unsupportedPatternCount: unsupportedPatterns.length,
    unsupportedPatternIds: unsupportedPatterns.map((pattern) => pattern.patternId).sort(),
    targetFeasible: canonicalStages.length >= REQUIRED_CANONICAL_TARGET,
    conclusion:
      canonicalStages.length >= REQUIRED_CANONICAL_TARGET
        ? "The target is feasible under the audited constraints."
        : `The target of ${REQUIRED_CANONICAL_TARGET} D4-unique stages is impossible under the audited constraints; the exhaustive maximum is ${canonicalStages.length}.`,
    patterns: patterns.map(({ canonicalStages: ignored, ...pattern }) => pattern),
    canonicalStages,
  };
}
