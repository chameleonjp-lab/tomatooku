import {
  BOARD_SIZE, createSeededRandom, deterministicShuffle, enumerateValidColumnPatterns,
  fnv1a32, normalizeSeed, patternSignature, stablePatternId,
  stableSymmetryClassId, validateColumnPattern,
} from "./core.js";
import {
  DEFAULT_MAX_ATTEMPTS_PER_PATTERN, DEFAULT_STAGE_CANDIDATE_SEED, REGION_LABELS,
  buildStageCandidateProbeManifest, canonicalizeRegionGrid, solveRegionGrid,
  stableStageId, validateRegionGrid,
} from "./regions.js";
import {
  DEFAULT_NEAR_DISTANCE_THRESHOLDS, DEFAULT_STAGE_BANK_SEED,
  DEFAULT_STAGE_BANK_TARGET, STAGE_BANK_SCHEMA_VERSION, analyzeHumanDifficulty,
  selectBalancedStageBank, validateStageBankManifest,
} from "./bank.js";

export const DEFAULT_POOL_TARGET = 120;
export const DEFAULT_MAX_BATCH_ROUNDS = 30;
export const DEFAULT_ATTEMPTS_PER_BATCH_CALL = 8;
export const DEFAULT_VARIED_GROWTH_NODES = 80000;
export const STAGE_BANK_SEARCH_GENERATOR_VERSION = "2.2.0-bank.4";
export { DEFAULT_STAGE_BANK_SEED, DEFAULT_STAGE_BANK_TARGET, validateStageBankManifest };

const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
const serialSeed = (seed) => typeof seed === "bigint" ? seed.toString() : seed;
const hex32 = (value) => (value >>> 0).toString(16).padStart(8, "0");
const idx = (r, c, size = BOARD_SIZE) => r * size + c;
const coord = (index, size = BOARD_SIZE) => [Math.floor(index / size), index % size];

function frontier(grid, regionId, size) {
  const result = new Set();
  for (let index = 0; index < grid.length; index++) {
    if (grid[index] !== regionId) continue;
    const [row, col] = coord(index, size);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = idx(nr, nc, size);
      if (grid[next] === -1) result.add(next);
    }
  }
  return [...result];
}

function reachable(grid, regionId, size) {
  const queue = frontier(grid, regionId, size);
  const visited = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [row, col] = coord(queue[cursor], size);
    for (const [dr, dc] of DIRS4) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const next = idx(nr, nc, size);
      if (grid[next] === -1 && !visited.has(next)) {
        visited.add(next); queue.push(next);
      }
    }
  }
  return visited.size;
}

function toRows(grid, size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => REGION_LABELS[grid[idx(row, col, size)]]).join("")
  );
}

export function growVariedConnectedRegionGrid(
  columns, seed, { size = BOARD_SIZE, maxNodes = DEFAULT_VARIED_GROWTH_NODES } = {}
) {
  if (!validateColumnPattern(columns, size)) throw new TypeError("invalid column pattern");
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new TypeError("maxNodes must be positive");
  const random = createSeededRandom(seed);
  const grid = new Array(size * size).fill(-1);
  const counts = new Array(size).fill(1);
  const solutionIndexes = enumerateValidColumnPatterns(size).map((pattern) =>
    pattern.map((col, row) => idx(row, col, size))
  );
  columns.forEach((col, row) => { grid[idx(row, col, size)] = row; });
  let nodes = 0;

  function viableCount(cellIndex, regionId) {
    grid[cellIndex] = regionId;
    let viable = 0;
    for (const solution of solutionIndexes) {
      const assigned = new Set();
      let conflict = false;
      for (const solutionIndex of solution) {
        const region = grid[solutionIndex];
        if (region < 0) continue;
        if (assigned.has(region)) { conflict = true; break; }
        assigned.add(region);
      }
      if (!conflict) viable++;
    }
    grid[cellIndex] = -1;
    return viable;
  }

  function stateOk() {
    for (let region = 0; region < size; region++) {
      const needed = size - counts[region];
      if (needed < 0) return false;
      if (!needed) continue;
      if (!frontier(grid, region, size).length || reachable(grid, region, size) < needed) return false;
    }
    return true;
  }

  function visit(assigned) {
    if (++nodes > maxNodes) return false;
    if (assigned === size * size) return counts.every((count) => count === size);
    if (!stateOk()) return false;
    const active = [];
    for (let region = 0; region < size; region++) {
      if (counts[region] >= size) continue;
      const cells = frontier(grid, region, size);
      active.push({ region, needed: size - counts[region], cells, tie: random() });
    }
    active.sort((a, b) => (a.cells.length - a.needed) - (b.cells.length - b.needed) || a.tie - b.tie);
    const bestSlack = active[0].cells.length - active[0].needed;
    const regionTolerance = random() < 0.8 ? 0 : 1;
    const regionChoices = active.filter((item) => item.cells.length - item.needed <= bestSlack + regionTolerance);
    regionChoices.sort(() => random() - 0.5);

    for (const item of regionChoices) {
      const scored = item.cells.map((cellIndex) => ({
        cellIndex, viable: viableCount(cellIndex, item.region), tie: random(),
      }));
      const minimum = Math.min(...scored.map((entry) => entry.viable));
      const roll = random();
      const tolerance = roll < 0.68 ? 0 : roll < 0.9 ? 1 : 2;
      scored.sort((a, b) => {
        const aPreferred = a.viable <= minimum + tolerance ? 0 : 1;
        const bPreferred = b.viable <= minimum + tolerance ? 0 : 1;
        return aPreferred - bPreferred || (aPreferred ? a.viable - b.viable : a.tie - b.tie);
      });
      for (const { cellIndex } of scored) {
        grid[cellIndex] = item.region; counts[item.region]++;
        if (visit(assigned + 1)) return true;
        counts[item.region]--; grid[cellIndex] = -1;
      }
    }
    return false;
  }

  const success = visit(size);
  return success
    ? { success: true, regions: toRows(grid, size), nodes }
    : { success: false, reason: nodes > maxNodes ? "node-limit" : "dead-end", nodes };
}

export function generateVariedStageCandidate(
  columns, seed,
  { maxAttempts = DEFAULT_ATTEMPTS_PER_BATCH_CALL, maxGrowthNodes = DEFAULT_VARIED_GROWTH_NODES } = {}
) {
  const patternId = stablePatternId(columns);
  const symmetryClassId = stableSymmetryClassId(columns);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = `${seed}:${patternId}:${attempt}`;
    const grown = growVariedConnectedRegionGrid(columns, attemptSeed, { maxNodes: maxGrowthNodes });
    if (!grown.success || !validateRegionGrid(grown.regions).valid) continue;
    const solved = solveRegionGrid(grown.regions);
    if (!solved.unique || solved.firstSolution.join(",") !== columns.join(",")) continue;
    const canonicalSignature = canonicalizeRegionGrid(grown.regions);
    return {
      stageId: stableStageId(grown.regions), patternId, symmetryClassId,
      patternSignature: patternSignature(columns), sourceSeed: serialSeed(seed),
      attempt, attemptSeed, regions: grown.regions, canonicalSignature,
      solution: columns.map((col, row) => [row, col]), solverNodes: solved.nodes,
      growthNodes: grown.nodes, humanDifficulty: analyzeHumanDifficulty(grown.regions),
    };
  }
  return { stageId: null, patternId, symmetryClassId, failure: "attempt-limit", attempts: maxAttempts };
}

export function buildStageCandidatePool(
  seed = DEFAULT_STAGE_BANK_SEED,
  { poolTarget = DEFAULT_POOL_TARGET, maxRounds = DEFAULT_MAX_BATCH_ROUNDS,
    attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL,
    maxGrowthNodes = DEFAULT_VARIED_GROWTH_NODES } = {}
) {
  const patterns = enumerateValidColumnPatterns().sort((a, b) => patternSignature(a).localeCompare(patternSignature(b)));
  const probe = buildStageCandidateProbeManifest(DEFAULT_STAGE_CANDIDATE_SEED, {
    maxAttemptsPerPattern: DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  });
  const eligibleIds = new Set(probe.probes.filter((item) => item.status === "success").map((item) => item.patternId));
  const eligible = patterns.filter((columns) => eligibleIds.has(stablePatternId(columns)));
  const unique = new Map();
  const generatedByPattern = Object.fromEntries(eligible.map((columns) => [stablePatternId(columns), 0]));
  for (let round = 0; round < maxRounds && unique.size < poolTarget; round++) {
    for (const columns of deterministicShuffle(eligible, `${seed}:round-order:${round}`)) {
      const candidate = generateVariedStageCandidate(columns, `${seed}:round:${round}`, {
        maxAttempts: attemptsPerCall, maxGrowthNodes,
      });
      if (!candidate.stageId || unique.has(candidate.canonicalSignature)) continue;
      unique.set(candidate.canonicalSignature, candidate);
      generatedByPattern[candidate.patternId]++;
      if (unique.size >= poolTarget) break;
    }
  }
  return {
    seed: serialSeed(seed), normalizedSeed: normalizeSeed(seed), requestedPoolTarget: poolTarget,
    poolSize: unique.size, eligiblePatternIds: [...eligibleIds].sort(),
    excludedPatternIds: probe.probes.filter((item) => item.status !== "success").map((item) => item.patternId).sort(),
    generatedByPattern,
    candidates: [...unique.values()].sort((a, b) => a.stageId.localeCompare(b.stageId)),
  };
}

export function buildStageBankManifest(
  seed = DEFAULT_STAGE_BANK_SEED,
  { targetCount = DEFAULT_STAGE_BANK_TARGET, poolTarget = DEFAULT_POOL_TARGET,
    maxRounds = DEFAULT_MAX_BATCH_ROUNDS, attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL,
    distanceThresholds = DEFAULT_NEAR_DISTANCE_THRESHOLDS } = {}
) {
  const pool = buildStageCandidatePool(seed, { poolTarget, maxRounds, attemptsPerCall });
  let selection;
  try {
    selection = selectBalancedStageBank(pool.candidates, targetCount, { seed, distanceThresholds });
  } catch (error) {
    throw new Error(`${error.message}; pool=${pool.poolSize}; byPattern=${JSON.stringify(pool.generatedByPattern)}`);
  }
  const stageIds = selection.stages.map((stage) => stage.stageId).sort().join("|");
  const distributions = { difficulty: { 1: 0, 2: 0, 3: 0 }, pattern: {}, symmetry: {} };
  for (const stage of selection.stages) {
    distributions.difficulty[stage.difficulty]++;
    distributions.pattern[stage.patternId] = (distributions.pattern[stage.patternId] || 0) + 1;
    distributions.symmetry[stage.symmetryClassId] = (distributions.symmetry[stage.symmetryClassId] || 0) + 1;
  }
  return {
    schemaVersion: STAGE_BANK_SCHEMA_VERSION, generatorVersion: STAGE_BANK_SEARCH_GENERATOR_VERSION,
    bankId: `BANK-${hex32(fnv1a32(`tomatooku:v2:bank:${stageIds}`))}`,
    bankStatus: "candidate", runtimeEnabled: false, rankingEligible: false,
    boardSize: BOARD_SIZE, sourceSeed: serialSeed(seed), normalizedSeed: normalizeSeed(seed),
    targetCount, stageCount: selection.stages.length,
    pool: { requestedTarget: poolTarget, actualSize: pool.poolSize, maxRounds, attemptsPerCall,
      eligiblePatternIds: pool.eligiblePatternIds, excludedPatternIds: pool.excludedPatternIds,
      generatedByPattern: pool.generatedByPattern },
    selection: { minimumRegionDistance: selection.threshold, patternQuotas: selection.quotas,
      patternCounts: selection.counts },
    difficultyDistribution: distributions.difficulty,
    patternDistribution: distributions.pattern,
    symmetryClassDistribution: distributions.symmetry,
    stages: selection.stages,
  };
}
