import {
  BOARD_SIZE,
  TRANSFORM_NAMES,
  createSeededRandom,
  enumerateValidColumnPatterns,
  fnv1a32,
  normalizeSeed,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
  transformCell,
  validateColumnPattern,
} from "./core.js";

export const REGION_LABELS = Object.freeze(["A", "B", "C", "D", "E"]);
export const STAGE_CANDIDATE_SCHEMA_VERSION = 1;
export const STAGE_CANDIDATE_GENERATOR_VERSION = "2.1.0-regions.1";
export const DEFAULT_STAGE_CANDIDATE_SEED = "tomatooku-v2-regions-slice2";
export const DEFAULT_MAX_GROWTH_NODES = 100000;
export const DEFAULT_MAX_ATTEMPTS_PER_PATTERN = 1500;

const DIRS4 = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);

function indexOf(row, col, size = BOARD_SIZE) {
  return row * size + col;
}

function coordinateOf(index, size = BOARD_SIZE) {
  return [Math.floor(index / size), index % size];
}

function serializableSeed(seed) {
  return typeof seed === "bigint" ? seed.toString() : seed;
}

function assertRegionRows(rows, size = BOARD_SIZE) {
  if (!Array.isArray(rows) || rows.length !== size) {
    throw new TypeError(`regions must contain ${size} rows`);
  }
  for (const row of rows) {
    if (typeof row !== "string" || row.length !== size) {
      throw new TypeError(`each region row must contain ${size} characters`);
    }
  }
}

export function normalizeRegionLabels(rows, size = BOARD_SIZE) {
  assertRegionRows(rows, size);
  const map = new Map();
  let next = 0;
  return rows.map((row) => {
    let normalized = "";
    for (const label of row) {
      if (!map.has(label)) {
        if (next >= size) throw new TypeError("regions contain too many labels");
        map.set(label, REGION_LABELS[next++]);
      }
      normalized += map.get(label);
    }
    return normalized;
  });
}

export function regionGridSignature(rows, size = BOARD_SIZE) {
  return normalizeRegionLabels(rows, size).join("|");
}

export function transformRegionGrid(rows, transformName, size = BOARD_SIZE) {
  assertRegionRows(rows, size);
  const output = Array.from({ length: size }, () => new Array(size));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const [targetRow, targetCol] = transformCell([row, col], transformName, size);
      output[targetRow][targetCol] = rows[row][col];
    }
  }
  return normalizeRegionLabels(output.map((row) => row.join("")), size);
}

export function regionSymmetrySignatures(rows, size = BOARD_SIZE) {
  return TRANSFORM_NAMES.map((name) =>
    regionGridSignature(transformRegionGrid(rows, name, size), size)
  );
}

export function canonicalizeRegionGrid(rows, size = BOARD_SIZE) {
  return regionSymmetrySignatures(rows, size).slice().sort()[0];
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function stableStageId(rows, size = BOARD_SIZE) {
  const canonical = canonicalizeRegionGrid(rows, size);
  return `STG-${hex32(fnv1a32(`tomatooku:v2:stage:${canonical}`))}`;
}

function regionCellIndexes(rows, size = BOARD_SIZE) {
  const cells = new Map();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const label = rows[row][col];
      if (!cells.has(label)) cells.set(label, []);
      cells.get(label).push(indexOf(row, col, size));
    }
  }
  return cells;
}

export function isRegionConnected(rows, label, size = BOARD_SIZE) {
  assertRegionRows(rows, size);
  const indexes = regionCellIndexes(rows, size).get(label) || [];
  if (!indexes.length) return false;
  const target = new Set(indexes);
  const visited = new Set([indexes[0]]);
  const queue = [indexes[0]];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coordinateOf(queue[cursor], size);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = indexOf(nr, nc, size);
      if (target.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited.size === target.size;
}

export function validateRegionGrid(rows, size = BOARD_SIZE) {
  const problems = [];
  try {
    assertRegionRows(rows, size);
  } catch (error) {
    return { valid: false, problems: [error.message] };
  }
  const cells = regionCellIndexes(rows, size);
  const labels = [...cells.keys()].sort();
  const expected = REGION_LABELS.slice(0, size);
  if (labels.join("") !== expected.join("")) {
    problems.push(`labels must be ${expected.join("")}`);
  }
  for (const label of expected) {
    const count = cells.get(label)?.length || 0;
    if (count !== size) problems.push(`region ${label} size=${count}`);
    if (count && !isRegionConnected(rows, label, size)) {
      problems.push(`region ${label} is disconnected`);
    }
  }
  return { valid: problems.length === 0, problems };
}

export function solveRegionGrid(rows, { solutionLimit = 2 } = {}) {
  const validation = validateRegionGrid(rows);
  if (!validation.valid) {
    throw new TypeError(`invalid region grid: ${validation.problems.join("; ")}`);
  }
  if (!Number.isInteger(solutionLimit) || solutionLimit < 1) {
    throw new TypeError("solutionLimit must be a positive integer");
  }
  const size = rows.length;
  const labels = new Map(
    REGION_LABELS.slice(0, size).map((label, index) => [label, index])
  );
  const colUsed = new Array(size).fill(false);
  const regionUsed = new Array(size).fill(false);
  const placed = new Array(size);
  const solutions = [];
  let nodes = 0;

  function visit(row) {
    if (solutions.length >= solutionLimit) return;
    if (row === size) {
      solutions.push(placed.slice());
      return;
    }
    for (let col = 0; col < size; col++) {
      nodes++;
      if (colUsed[col]) continue;
      const region = labels.get(rows[row][col]);
      if (regionUsed[region]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - col) < 2) continue;
      colUsed[col] = true;
      regionUsed[region] = true;
      placed[row] = col;
      visit(row + 1);
      colUsed[col] = false;
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

function frontierForRegion(grid, regionId, size) {
  const frontier = new Set();
  for (let cellIndex = 0; cellIndex < grid.length; cellIndex++) {
    if (grid[cellIndex] !== regionId) continue;
    const [row, col] = coordinateOf(cellIndex, size);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = indexOf(nr, nc, size);
      if (grid[next] === -1) frontier.add(next);
    }
  }
  return [...frontier];
}

function reachableUnassignedCount(grid, regionId, size) {
  const seeds = frontierForRegion(grid, regionId, size);
  const visited = new Set(seeds);
  const queue = seeds.slice();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coordinateOf(queue[cursor], size);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = indexOf(nr, nc, size);
      if (grid[next] === -1 && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited.size;
}

export function growConnectedRegionGrid(
  columns,
  seed,
  { size = BOARD_SIZE, maxNodes = DEFAULT_MAX_GROWTH_NODES } = {}
) {
  if (!validateColumnPattern(columns, size)) {
    throw new TypeError("invalid column pattern");
  }
  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new TypeError("maxNodes must be a positive integer");
  }
  const random = createSeededRandom(seed);
  const grid = new Array(size * size).fill(-1);
  const counts = new Array(size).fill(1);
  const solutionIndexes = enumerateValidColumnPatterns(size).map((pattern) =>
    pattern.map((col, row) => indexOf(row, col, size))
  );
  for (let row = 0; row < size; row++) {
    grid[indexOf(row, columns[row], size)] = row;
  }
  let nodes = 0;

  function viablePatternCount(cellIndex, regionId) {
    grid[cellIndex] = regionId;
    let viable = 0;
    for (const indexes of solutionIndexes) {
      const assignedRegions = new Set();
      let conflict = false;
      for (const solutionIndex of indexes) {
        const assignedRegion = grid[solutionIndex];
        if (assignedRegion < 0) continue;
        if (assignedRegions.has(assignedRegion)) {
          conflict = true;
          break;
        }
        assignedRegions.add(assignedRegion);
      }
      if (!conflict) viable++;
    }
    grid[cellIndex] = -1;
    return viable;
  }

  function visit(assigned) {
    nodes++;
    if (nodes > maxNodes) return false;
    if (assigned === size * size) return counts.every((count) => count === size);

    const active = [];
    for (let regionId = 0; regionId < size; regionId++) {
      if (counts[regionId] >= size) continue;
      const needed = size - counts[regionId];
      const frontier = frontierForRegion(grid, regionId, size);
      if (!frontier.length || reachableUnassignedCount(grid, regionId, size) < needed) {
        return false;
      }
      active.push({ regionId, needed, frontier });
    }
    if (!active.length) return false;

    active.sort((left, right) => {
      const leftSlack = left.frontier.length - left.needed;
      const rightSlack = right.frontier.length - right.needed;
      return leftSlack - rightSlack || left.frontier.length - right.frontier.length;
    });
    const minimumSlack = active[0].frontier.length - active[0].needed;
    const constrained = active.filter(
      (item) => item.frontier.length - item.needed === minimumSlack
    );
    const chosen = constrained[Math.floor(random() * constrained.length)];
    const candidates = chosen.frontier
      .map((cellIndex) => ({
        cellIndex,
        viable: viablePatternCount(cellIndex, chosen.regionId),
        tie: random(),
      }))
      .sort((left, right) => left.viable - right.viable || left.tie - right.tie)
      .map((item) => item.cellIndex);

    for (const cellIndex of candidates) {
      grid[cellIndex] = chosen.regionId;
      counts[chosen.regionId]++;
      if (visit(assigned + 1)) return true;
      counts[chosen.regionId]--;
      grid[cellIndex] = -1;
    }
    return false;
  }

  const success = visit(size);
  if (!success) {
    return {
      success: false,
      reason: nodes > maxNodes ? "node-limit" : "dead-end",
      nodes,
    };
  }
  const rows = [];
  for (let row = 0; row < size; row++) {
    let value = "";
    for (let col = 0; col < size; col++) {
      value += REGION_LABELS[grid[indexOf(row, col, size)]];
    }
    rows.push(value);
  }
  return { success: true, regions: normalizeRegionLabels(rows, size), nodes };
}

export function generateStageCandidate(
  columns,
  seed,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
    maxGrowthNodes = DEFAULT_MAX_GROWTH_NODES,
  } = {}
) {
  if (!validateColumnPattern(columns)) throw new TypeError("invalid column pattern");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer");
  }
  const patternId = stablePatternId(columns);
  const symmetryClassId = stableSymmetryClassId(columns);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = `${seed}:${patternId}:${attempt}`;
    const grown = growConnectedRegionGrid(columns, attemptSeed, {
      maxNodes: maxGrowthNodes,
    });
    if (!grown.success) continue;
    const solved = solveRegionGrid(grown.regions);
    if (!solved.unique) continue;
    if (solved.firstSolution.join(",") !== columns.join(",")) continue;
    const canonicalSignature = canonicalizeRegionGrid(grown.regions);
    return {
      stageId: stableStageId(grown.regions),
      patternId,
      symmetryClassId,
      patternSignature: patternSignature(columns),
      sourceSeed: serializableSeed(seed),
      attempt,
      attemptSeed,
      regions: grown.regions,
      canonicalSignature,
      solution: columns.map((col, row) => [row, col]),
      solverNodes: solved.nodes,
      growthNodes: grown.nodes,
    };
  }
  return {
    stageId: null,
    patternId,
    symmetryClassId,
    patternSignature: patternSignature(columns),
    sourceSeed: serializableSeed(seed),
    failure: "attempt-limit",
    attempts: maxAttempts,
  };
}

export function buildStageCandidateProbeManifest(
  seed = DEFAULT_STAGE_CANDIDATE_SEED,
  { maxAttemptsPerPattern = DEFAULT_MAX_ATTEMPTS_PER_PATTERN } = {}
) {
  if (!Number.isInteger(maxAttemptsPerPattern) || maxAttemptsPerPattern < 1) {
    throw new TypeError("maxAttemptsPerPattern must be a positive integer");
  }
  const patterns = enumerateValidColumnPatterns().sort((left, right) =>
    patternSignature(left).localeCompare(patternSignature(right))
  );
  const probes = [];
  const uniqueStages = new Map();

  for (const columns of patterns) {
    const patternId = stablePatternId(columns);
    const candidate = generateStageCandidate(columns, `${seed}:${patternId}`, {
      maxAttempts: maxAttemptsPerPattern,
    });
    if (candidate.stageId) {
      probes.push({
        patternId,
        symmetryClassId: candidate.symmetryClassId,
        patternSignature: candidate.patternSignature,
        status: "success",
        attempts: candidate.attempt + 1,
        stageId: candidate.stageId,
        canonicalSignature: candidate.canonicalSignature,
      });
      if (!uniqueStages.has(candidate.canonicalSignature)) {
        uniqueStages.set(candidate.canonicalSignature, candidate);
      }
    } else {
      probes.push({
        patternId,
        symmetryClassId: candidate.symmetryClassId,
        patternSignature: candidate.patternSignature,
        status: "attempt-limit",
        attempts: candidate.attempts,
      });
    }
  }

  const stages = [...uniqueStages.values()]
    .sort((left, right) => left.stageId.localeCompare(right.stageId))
    .map((stage, index) => ({ order: index + 1, ...stage }));
  const successCount = probes.filter((probe) => probe.status === "success").length;
  const successfulClassIds = new Set(
    probes
      .filter((probe) => probe.status === "success")
      .map((probe) => probe.symmetryClassId)
  );
  const allClassIds = new Set(probes.map((probe) => probe.symmetryClassId));

  return {
    schemaVersion: STAGE_CANDIDATE_SCHEMA_VERSION,
    generatorVersion: STAGE_CANDIDATE_GENERATOR_VERSION,
    boardSize: BOARD_SIZE,
    sourceSeed: serializableSeed(seed),
    normalizedSeed: normalizeSeed(seed),
    maxAttemptsPerPattern,
    patternCount: patterns.length,
    successCount,
    attemptLimitCount: patterns.length - successCount,
    uniqueStageCount: stages.length,
    confirmedSymmetryClassCount: successfulClassIds.size,
    totalSymmetryClassCount: allClassIds.size,
    probes,
    stages,
  };
}
