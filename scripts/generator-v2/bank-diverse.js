import {
  BOARD_SIZE,
  createSeededRandom,
  deterministicShuffle,
  enumerateValidColumnPatterns,
  fnv1a32,
  normalizeSeed,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
} from "./core.js";
import {
  DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  DEFAULT_STAGE_CANDIDATE_SEED,
  REGION_LABELS,
  buildStageCandidateProbeManifest,
  canonicalizeRegionGrid,
  solveRegionGrid,
  stableStageId,
  validateRegionGrid,
} from "./regions.js";
import {
  DEFAULT_ATTEMPTS_PER_BATCH_CALL,
  DEFAULT_MAX_BATCH_ROUNDS,
  DEFAULT_NEAR_DISTANCE_THRESHOLDS,
  DEFAULT_POOL_TARGET,
  DEFAULT_STAGE_BANK_SEED,
  DEFAULT_STAGE_BANK_TARGET,
  STAGE_BANK_SCHEMA_VERSION,
  analyzeHumanDifficulty,
  selectBalancedStageBank,
  validateStageBankManifest,
} from "./bank.js";

export {
  DEFAULT_ATTEMPTS_PER_BATCH_CALL,
  DEFAULT_MAX_BATCH_ROUNDS,
  DEFAULT_POOL_TARGET,
  DEFAULT_STAGE_BANK_SEED,
  DEFAULT_STAGE_BANK_TARGET,
  validateStageBankManifest,
};

export const STAGE_BANK_DIVERSE_GENERATOR_VERSION = "2.2.0-bank.3";
export const DEFAULT_DIVERSE_GROWTH_NODES = 120000;

const DIRS4 = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);

function serializableSeed(seed) {
  return typeof seed === "bigint" ? seed.toString() : seed;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function indexOf(row, col, size = BOARD_SIZE) {
  return row * size + col;
}

function coordinateOf(index, size = BOARD_SIZE) {
  return [Math.floor(index / size), index % size];
}

function frontierForRegion(grid, regionId, size) {
  const frontier = new Set();
  for (let index = 0; index < grid.length; index++) {
    if (grid[index] !== regionId) continue;
    const [row, col] = coordinateOf(index, size);
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

function gridToRows(grid, size) {
  const rows = [];
  for (let row = 0; row < size; row++) {
    let value = "";
    for (let col = 0; col < size; col++) {
      value += REGION_LABELS[grid[indexOf(row, col, size)]];
    }
    rows.push(value);
  }
  return rows;
}

export function growDiverseConnectedRegionGrid(
  columns,
  seed,
  { size = BOARD_SIZE, maxNodes = DEFAULT_DIVERSE_GROWTH_NODES } = {}
) {
  if (!Array.isArray(columns) || columns.length !== size) {
    throw new TypeError("columns must contain one value per row");
  }
  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new TypeError("maxNodes must be a positive integer");
  }
  const random = createSeededRandom(seed);
  const grid = new Array(size * size).fill(-1);
  const counts = new Array(size).fill(1);
  for (let row = 0; row < size; row++) {
    grid[indexOf(row, columns[row], size)] = row;
  }
  let nodes = 0;

  function stateIsViable() {
    for (let regionId = 0; regionId < size; regionId++) {
      const needed = size - counts[regionId];
      if (needed < 0) return false;
      if (needed === 0) continue;
      const frontier = frontierForRegion(grid, regionId, size);
      if (!frontier.length) return false;
      if (reachableUnassignedCount(grid, regionId, size) < needed) return false;
    }
    return true;
  }

  function visit(assigned) {
    nodes++;
    if (nodes > maxNodes) return false;
    if (assigned === size * size) return counts.every((count) => count === size);
    if (!stateIsViable()) return false;

    const active = [];
    for (let regionId = 0; regionId < size; regionId++) {
      if (counts[regionId] >= size) continue;
      const frontier = frontierForRegion(grid, regionId, size);
      active.push({
        regionId,
        needed: size - counts[regionId],
        frontier,
        random: random(),
      });
    }
    active.sort((left, right) => {
      const leftSlack = left.frontier.length - left.needed;
      const rightSlack = right.frontier.length - right.needed;
      return leftSlack - rightSlack || left.random - right.random;
    });

    for (const item of active) {
      const cells = item.frontier
        .map((cellIndex) => ({ cellIndex, random: random() }))
        .sort((left, right) => left.random - right.random)
        .map((entry) => entry.cellIndex);
      for (const cellIndex of cells) {
        grid[cellIndex] = item.regionId;
        counts[item.regionId]++;
        if (visit(assigned + 1)) return true;
        counts[item.regionId]--;
        grid[cellIndex] = -1;
      }
    }
    return false;
  }

  const success = visit(size);
  return success
    ? { success: true, regions: gridToRows(grid, size), nodes }
    : { success: false, reason: nodes > maxNodes ? "node-limit" : "dead-end", nodes };
}

export function generateDiverseStageCandidate(
  columns,
  seed,
  { maxAttempts = DEFAULT_ATTEMPTS_PER_BATCH_CALL, maxGrowthNodes = DEFAULT_DIVERSE_GROWTH_NODES } = {}
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer");
  }
  const patternId = stablePatternId(columns);
  const symmetryClassId = stableSymmetryClassId(columns);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = `${seed}:${patternId}:${attempt}`;
    const grown = growDiverseConnectedRegionGrid(columns, attemptSeed, {
      maxNodes: maxGrowthNodes,
    });
    if (!grown.success) continue;
    const validation = validateRegionGrid(grown.regions);
    if (!validation.valid) continue;
    const solved = solveRegionGrid(grown.regions);
    if (!solved.unique || solved.firstSolution.join(",") !== columns.join(",")) continue;
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
      humanDifficulty: analyzeHumanDifficulty(grown.regions),
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

export function buildStageCandidatePool(
  seed = DEFAULT_STAGE_BANK_SEED,
  {
    poolTarget = DEFAULT_POOL_TARGET,
    maxRounds = DEFAULT_MAX_BATCH_ROUNDS,
    attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL,
    maxGrowthNodes = DEFAULT_DIVERSE_GROWTH_NODES,
  } = {}
) {
  const patterns = enumerateValidColumnPatterns().sort((left, right) =>
    patternSignature(left).localeCompare(patternSignature(right))
  );
  const probe = buildStageCandidateProbeManifest(DEFAULT_STAGE_CANDIDATE_SEED, {
    maxAttemptsPerPattern: DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  });
  const eligibleIds = new Set(
    probe.probes.filter((item) => item.status === "success").map((item) => item.patternId)
  );
  const eligiblePatterns = patterns.filter((columns) => eligibleIds.has(stablePatternId(columns)));
  const unique = new Map();
  const generatedByPattern = Object.fromEntries(
    eligiblePatterns.map((columns) => [stablePatternId(columns), 0])
  );

  for (let round = 0; round < maxRounds && unique.size < poolTarget; round++) {
    const roundPatterns = deterministicShuffle(eligiblePatterns, `${seed}:round-order:${round}`);
    for (const columns of roundPatterns) {
      const candidate = generateDiverseStageCandidate(
        columns,
        `${seed}:round:${round}`,
        { maxAttempts: attemptsPerCall, maxGrowthNodes }
      );
      if (!candidate.stageId || unique.has(candidate.canonicalSignature)) continue;
      unique.set(candidate.canonicalSignature, candidate);
      generatedByPattern[candidate.patternId]++;
      if (unique.size >= poolTarget) break;
    }
  }

  return {
    seed: serializableSeed(seed),
    normalizedSeed: normalizeSeed(seed),
    requestedPoolTarget: poolTarget,
    poolSize: unique.size,
    eligiblePatternIds: [...eligibleIds].sort(),
    excludedPatternIds: probe.probes
      .filter((item) => item.status !== "success")
      .map((item) => item.patternId)
      .sort(),
    generatedByPattern,
    candidates: [...unique.values()].sort((left, right) => left.stageId.localeCompare(right.stageId)),
  };
}

export function buildStageBankManifest(
  seed = DEFAULT_STAGE_BANK_SEED,
  {
    targetCount = DEFAULT_STAGE_BANK_TARGET,
    poolTarget = DEFAULT_POOL_TARGET,
    maxRounds = DEFAULT_MAX_BATCH_ROUNDS,
    attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL,
    distanceThresholds = DEFAULT_NEAR_DISTANCE_THRESHOLDS,
  } = {}
) {
  const poolResult = buildStageCandidatePool(seed, {
    poolTarget,
    maxRounds,
    attemptsPerCall,
  });
  let selection;
  try {
    selection = selectBalancedStageBank(poolResult.candidates, targetCount, {
      seed,
      distanceThresholds,
    });
  } catch (error) {
    throw new Error(
      `${error.message}; pool=${poolResult.poolSize}; byPattern=${JSON.stringify(poolResult.generatedByPattern)}`
    );
  }
  const stageIds = selection.stages.map((stage) => stage.stageId).sort().join("|");
  const bankId = `BANK-${hex32(fnv1a32(`tomatooku:v2:bank:${stageIds}`))}`;
  const difficultyDistribution = { 1: 0, 2: 0, 3: 0 };
  const patternDistribution = {};
  const symmetryClassDistribution = {};
  for (const stage of selection.stages) {
    difficultyDistribution[stage.difficulty]++;
    patternDistribution[stage.patternId] = (patternDistribution[stage.patternId] || 0) + 1;
    symmetryClassDistribution[stage.symmetryClassId] =
      (symmetryClassDistribution[stage.symmetryClassId] || 0) + 1;
  }
  return {
    schemaVersion: STAGE_BANK_SCHEMA_VERSION,
    generatorVersion: STAGE_BANK_DIVERSE_GENERATOR_VERSION,
    bankId,
    bankStatus: "candidate",
    runtimeEnabled: false,
    rankingEligible: false,
    boardSize: BOARD_SIZE,
    sourceSeed: serializableSeed(seed),
    normalizedSeed: normalizeSeed(seed),
    targetCount,
    stageCount: selection.stages.length,
    pool: {
      requestedTarget: poolTarget,
      actualSize: poolResult.poolSize,
      maxRounds,
      attemptsPerCall,
      eligiblePatternIds: poolResult.eligiblePatternIds,
      excludedPatternIds: poolResult.excludedPatternIds,
      generatedByPattern: poolResult.generatedByPattern,
    },
    selection: {
      minimumRegionDistance: selection.threshold,
      patternQuotas: selection.quotas,
      patternCounts: selection.counts,
    },
    difficultyDistribution,
    patternDistribution,
    symmetryClassDistribution,
    stages: selection.stages,
  };
}
