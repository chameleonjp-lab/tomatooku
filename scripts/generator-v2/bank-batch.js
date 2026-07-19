import {
  BOARD_SIZE,
  createSeededRandom,
  deterministicShuffle,
  enumerateValidColumnPatterns,
  fnv1a32,
  normalizeSeed,
  patternSignature,
  stablePatternId,
} from "./core.js";
import {
  DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
  DEFAULT_MAX_GROWTH_NODES,
  DEFAULT_STAGE_CANDIDATE_SEED,
  buildStageCandidateProbeManifest,
  canonicalizeRegionGrid,
  generateStageCandidate,
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

export const STAGE_BANK_BATCH_GENERATOR_VERSION = "2.2.0-bank.2";

function serializableSeed(seed) {
  return typeof seed === "bigint" ? seed.toString() : seed;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function cellIndex(row, col, size = BOARD_SIZE) {
  return row * size + col;
}

function cellCoordinate(index, size = BOARD_SIZE) {
  return [Math.floor(index / size), index % size];
}

function boundarySwapPairs(rows) {
  const size = rows.length;
  const pairs = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const [dr, dc] of [[1, 0], [0, 1]]) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= size || nc >= size) continue;
        if (rows[row][col] === rows[nr][nc]) continue;
        pairs.push([cellIndex(row, col, size), cellIndex(nr, nc, size)]);
      }
    }
  }
  return pairs;
}

function swapRegionCells(rows, leftIndex, rightIndex) {
  const size = rows.length;
  const grid = rows.map((row) => [...row]);
  const [leftRow, leftCol] = cellCoordinate(leftIndex, size);
  const [rightRow, rightCol] = cellCoordinate(rightIndex, size);
  [grid[leftRow][leftCol], grid[rightRow][rightCol]] = [
    grid[rightRow][rightCol],
    grid[leftRow][leftCol],
  ];
  return grid.map((row) => row.join(""));
}

export function walkStageCandidateMutations(
  baseCandidate,
  seed,
  { maxTrials = 1600, maxAccepted = 16 } = {}
) {
  if (!baseCandidate?.stageId || !Array.isArray(baseCandidate.regions)) {
    throw new TypeError("baseCandidate must be a generated stage candidate");
  }
  if (!Number.isInteger(maxTrials) || maxTrials < 1) {
    throw new TypeError("maxTrials must be a positive integer");
  }
  if (!Number.isInteger(maxAccepted) || maxAccepted < 1) {
    throw new TypeError("maxAccepted must be a positive integer");
  }
  const random = createSeededRandom(seed);
  const targetColumns = baseCandidate.solution.map((cell) => cell[1]);
  const seen = new Set([baseCandidate.canonicalSignature]);
  const candidates = [];
  let current = baseCandidate.regions.slice();
  let accepted = 0;

  for (let trial = 0; trial < maxTrials && accepted < maxAccepted; trial++) {
    const pairs = boundarySwapPairs(current);
    if (!pairs.length) break;
    const [leftIndex, rightIndex] = pairs[Math.floor(random() * pairs.length)];
    const proposed = swapRegionCells(current, leftIndex, rightIndex);
    const validation = validateRegionGrid(proposed);
    if (!validation.valid) continue;
    const solved = solveRegionGrid(proposed);
    if (!solved.unique || solved.firstSolution.join(",") !== targetColumns.join(",")) continue;
    const canonicalSignature = canonicalizeRegionGrid(proposed);
    current = proposed;
    if (seen.has(canonicalSignature)) continue;
    seen.add(canonicalSignature);
    accepted++;
    candidates.push({
      ...baseCandidate,
      stageId: stableStageId(proposed),
      sourceSeed: serializableSeed(seed),
      attemptSeed: `${seed}:mutation:${trial}`,
      regions: proposed,
      canonicalSignature,
      solverNodes: solved.nodes,
      humanDifficulty: analyzeHumanDifficulty(proposed),
      mutation: { trial, accepted, leftIndex, rightIndex },
    });
  }

  return { sourceSeed: serializableSeed(seed), trials: maxTrials, accepted, candidates };
}

export function buildStageCandidatePool(
  seed = DEFAULT_STAGE_BANK_SEED,
  {
    poolTarget = DEFAULT_POOL_TARGET,
    maxRounds = DEFAULT_MAX_BATCH_ROUNDS,
    attemptsPerCall = DEFAULT_ATTEMPTS_PER_BATCH_CALL,
    maxGrowthNodes = DEFAULT_MAX_GROWTH_NODES,
  } = {}
) {
  if (!Number.isInteger(poolTarget) || poolTarget < 1) throw new TypeError("poolTarget must be positive");
  if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new TypeError("maxRounds must be positive");
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
  const mutationTrialsByPattern = new Map(
    eligiblePatterns.map((columns) => [stablePatternId(columns), 0])
  );
  const bases = new Map();

  for (const columns of eligiblePatterns) {
    const patternId = stablePatternId(columns);
    const base = generateStageCandidate(columns, DEFAULT_STAGE_CANDIDATE_SEED, {
      maxAttempts: DEFAULT_MAX_ATTEMPTS_PER_PATTERN,
      maxGrowthNodes,
    });
    if (!base.stageId) continue;
    const enriched = {
      ...base,
      humanDifficulty: analyzeHumanDifficulty(base.regions),
      mutation: null,
    };
    bases.set(patternId, enriched);
    if (!unique.has(base.canonicalSignature)) unique.set(base.canonicalSignature, enriched);
  }

  for (let round = 0; round < maxRounds && unique.size < poolTarget; round++) {
    const roundPatterns = deterministicShuffle(eligiblePatterns, `${seed}:round-order:${round}`);
    for (const columns of roundPatterns) {
      const patternId = stablePatternId(columns);
      const base = bases.get(patternId);
      if (!base) continue;
      const walk = walkStageCandidateMutations(base, `${seed}:${patternId}:round:${round}`, {
        maxTrials: attemptsPerCall * 20,
        maxAccepted: 12,
      });
      mutationTrialsByPattern.set(
        patternId,
        mutationTrialsByPattern.get(patternId) + walk.trials
      );
      for (const candidate of walk.candidates) {
        if (!unique.has(candidate.canonicalSignature)) {
          unique.set(candidate.canonicalSignature, candidate);
        }
        if (unique.size >= poolTarget) break;
      }
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
    mutationTrialsByPattern: Object.fromEntries([...mutationTrialsByPattern.entries()].sort()),
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
  const selection = selectBalancedStageBank(poolResult.candidates, targetCount, {
    seed,
    distanceThresholds,
  });
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
    generatorVersion: STAGE_BANK_BATCH_GENERATOR_VERSION,
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
      mutationTrialsByPattern: poolResult.mutationTrialsByPattern,
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
