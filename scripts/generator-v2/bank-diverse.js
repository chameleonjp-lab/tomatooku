import {
  BOARD_SIZE, createSeededRandom, enumerateValidColumnPatterns, fnv1a32,
  normalizeSeed, patternSignature, stablePatternId, stableSymmetryClassId,
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

export const DEFAULT_POOL_TARGET = 140;
export const DEFAULT_MAX_BATCH_ROUNDS = 20;
export const DEFAULT_ATTEMPTS_PER_BATCH_CALL = 10000;
export const STAGE_BANK_RANDOM_GENERATOR_VERSION = "2.2.0-bank.5";
export { DEFAULT_STAGE_BANK_SEED, DEFAULT_STAGE_BANK_TARGET, validateStageBankManifest };

const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
const serialSeed = (seed) => typeof seed === "bigint" ? seed.toString() : seed;
const hex32 = (value) => (value >>> 0).toString(16).padStart(8, "0");
const idx = (r, c, size = BOARD_SIZE) => r * size + c;

function growRandomRegions(columns, random, size = BOARD_SIZE) {
  const grid = new Array(size * size).fill(-1);
  const regions = columns.map((col, row) => {
    grid[idx(row, col, size)] = row;
    return [[row, col]];
  });
  let assigned = size;
  let guard = 0;
  while (assigned < size * size && guard++ < 100000) {
    const choices = [];
    for (let regionId = 0; regionId < size; regionId++) {
      if (regions[regionId].length >= size) continue;
      const frontier = new Set();
      for (const [row, col] of regions[regionId]) {
        for (const [dr, dc] of DIRS4) {
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (grid[idx(nr, nc, size)] === -1) frontier.add(idx(nr, nc, size));
        }
      }
      if (frontier.size) choices.push({ regionId, frontier: [...frontier] });
    }
    if (!choices.length) return null;
    choices.sort((a, b) => regions[a.regionId].length - regions[b.regionId].length);
    const minSize = regions[choices[0].regionId].length;
    const maxSize = regions[choices.at(-1).regionId].length;
    const pool = maxSize - minSize >= 2 || random() < 0.7
      ? choices.filter((choice) => regions[choice.regionId].length === minSize)
      : choices;
    const chosen = pool[Math.floor(random() * pool.length)];
    const cell = chosen.frontier[Math.floor(random() * chosen.frontier.length)];
    const row = Math.floor(cell / size), col = cell % size;
    grid[cell] = chosen.regionId;
    regions[chosen.regionId].push([row, col]);
    assigned++;
  }
  if (assigned !== size * size || regions.some((region) => region.length !== size)) return null;
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => REGION_LABELS[grid[idx(row, col, size)]]).join("")
  );
}

export function generateRandomStageCandidate(columns, seed) {
  const random = createSeededRandom(seed);
  const regions = growRandomRegions(columns, random);
  if (!regions || !validateRegionGrid(regions).valid) return null;
  const solved = solveRegionGrid(regions);
  if (!solved.unique || solved.firstSolution.join(",") !== columns.join(",")) return null;
  const canonicalSignature = canonicalizeRegionGrid(regions);
  return {
    stageId: stableStageId(regions), patternId: stablePatternId(columns),
    symmetryClassId: stableSymmetryClassId(columns), patternSignature: patternSignature(columns),
    sourceSeed: serialSeed(seed), regions, canonicalSignature,
    solution: columns.map((col, row) => [row, col]), solverNodes: solved.nodes,
    humanDifficulty: analyzeHumanDifficulty(regions),
  };
}

export function buildStageCandidatePool(
  seed = DEFAULT_STAGE_BANK_SEED,
  { poolTarget = DEFAULT_POOL_TARGET, maxRounds = DEFAULT_MAX_BATCH_ROUNDS,
    attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL } = {}
) {
  const patterns = enumerateValidColumnPatterns().sort((a, b) => patternSignature(a).localeCompare(patternSignature(b)));
  const probe = buildStageCandidateProbeManifest(DEFAULT_STAGE_CANDIDATE_SEED, {
    maxAttemptsPerPattern: DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  });
  const eligibleIds = new Set(probe.probes.filter((item) => item.status === "success").map((item) => item.patternId));
  const eligible = patterns.filter((columns) => eligibleIds.has(stablePatternId(columns)));
  const targetPerPattern = Math.ceil(poolTarget / eligible.length);
  const unique = new Map();
  const generatedByPattern = Object.fromEntries(eligible.map((columns) => [stablePatternId(columns), 0]));
  const attemptsByPattern = Object.fromEntries(eligible.map((columns) => [stablePatternId(columns), 0]));

  for (const columns of eligible) {
    const patternId = stablePatternId(columns);
    const maxAttempts = maxRounds * attemptsPerCall;
    for (let attempt = 0; attempt < maxAttempts && generatedByPattern[patternId] < targetPerPattern; attempt++) {
      attemptsByPattern[patternId]++;
      const candidate = generateRandomStageCandidate(columns, `${seed}:${patternId}:${attempt}`);
      if (!candidate || unique.has(candidate.canonicalSignature)) continue;
      unique.set(candidate.canonicalSignature, candidate);
      generatedByPattern[patternId]++;
    }
  }

  return {
    seed: serialSeed(seed), normalizedSeed: normalizeSeed(seed), requestedPoolTarget: poolTarget,
    poolSize: unique.size, targetPerPattern,
    eligiblePatternIds: [...eligibleIds].sort(),
    excludedPatternIds: probe.probes.filter((item) => item.status !== "success").map((item) => item.patternId).sort(),
    generatedByPattern, attemptsByPattern,
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
    throw new Error(`${error.message}; pool=${pool.poolSize}; byPattern=${JSON.stringify(pool.generatedByPattern)}; attempts=${JSON.stringify(pool.attemptsByPattern)}`);
  }
  const stageIds = selection.stages.map((stage) => stage.stageId).sort().join("|");
  const difficultyDistribution = { 1: 0, 2: 0, 3: 0 };
  const patternDistribution = {};
  const symmetryClassDistribution = {};
  for (const stage of selection.stages) {
    difficultyDistribution[stage.difficulty]++;
    patternDistribution[stage.patternId] = (patternDistribution[stage.patternId] || 0) + 1;
    symmetryClassDistribution[stage.symmetryClassId] = (symmetryClassDistribution[stage.symmetryClassId] || 0) + 1;
  }
  return {
    schemaVersion: STAGE_BANK_SCHEMA_VERSION, generatorVersion: STAGE_BANK_RANDOM_GENERATOR_VERSION,
    bankId: `BANK-${hex32(fnv1a32(`tomatooku:v2:bank:${stageIds}`))}`,
    bankStatus: "candidate", runtimeEnabled: false, rankingEligible: false,
    boardSize: BOARD_SIZE, sourceSeed: serialSeed(seed), normalizedSeed: normalizeSeed(seed),
    targetCount, stageCount: selection.stages.length,
    pool: { requestedTarget: poolTarget, actualSize: pool.poolSize, targetPerPattern: pool.targetPerPattern,
      maxRounds, attemptsPerCall, eligiblePatternIds: pool.eligiblePatternIds,
      excludedPatternIds: pool.excludedPatternIds, generatedByPattern: pool.generatedByPattern,
      attemptsByPattern: pool.attemptsByPattern },
    selection: { minimumRegionDistance: selection.threshold, patternQuotas: selection.quotas,
      patternCounts: selection.counts },
    difficultyDistribution, patternDistribution, symmetryClassDistribution,
    stages: selection.stages,
  };
}
