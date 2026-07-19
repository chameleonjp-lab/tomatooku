import {
  BOARD_SIZE,
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
  regionGridSignature,
  regionSymmetrySignatures,
  solveRegionGrid,
  stableStageId,
  validateRegionGrid,
} from "./regions.js";

export const STAGE_BANK_SCHEMA_VERSION = 1;
export const STAGE_BANK_GENERATOR_VERSION = "2.2.0-bank.1";
export const DEFAULT_STAGE_BANK_SEED = "tomatooku-v2-stage-bank-slice3";
export const DEFAULT_STAGE_BANK_TARGET = 84;
export const DEFAULT_POOL_TARGET = 240;
export const DEFAULT_MAX_BATCH_ROUNDS = 60;
export const DEFAULT_ATTEMPTS_PER_BATCH_CALL = 80;
export const DEFAULT_NEAR_DISTANCE_THRESHOLDS = Object.freeze([8, 7, 6, 5, 4, 3, 2, 1, 0]);

function serializableSeed(seed) {
  return typeof seed === "bigint" ? seed.toString() : seed;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function compactSignature(signature) {
  return signature.replaceAll("|", "");
}

export function signatureHammingDistance(left, right) {
  const a = compactSignature(left);
  const b = compactSignature(right);
  if (a.length !== b.length) throw new TypeError("signatures must have the same size");
  let distance = 0;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) distance++;
  }
  return distance;
}

export function minimumSymmetricRegionDistance(leftRows, rightRows) {
  const right = regionGridSignature(rightRows);
  return Math.min(
    ...regionSymmetrySignatures(leftRows).map((signature) =>
      signatureHammingDistance(signature, right)
    )
  );
}

function cloneDomains(domains) {
  return domains.map((domain) => new Set(domain));
}

function domainCandidateCount(domains) {
  return domains.reduce((sum, domain) => sum + domain.size, 0);
}

function propagateDomains(regions, inputDomains, metrics = null) {
  const domains = cloneDomains(inputDomains);
  const size = regions.length;
  let changed = true;
  let contradiction = false;
  let rounds = 0;

  function remove(row, col) {
    const domain = domains[row];
    if (!domain.has(col)) return false;
    domain.delete(col);
    if (metrics) metrics.eliminations++;
    if (domain.size === 0) contradiction = true;
    return true;
  }

  function force(row, col, kind) {
    const domain = domains[row];
    if (!domain.has(col)) {
      contradiction = true;
      return false;
    }
    if (domain.size === 1) return false;
    for (const candidate of [...domain]) {
      if (candidate !== col) remove(row, candidate);
    }
    if (metrics) {
      metrics.forcedPlacements++;
      if (kind === "hidden") metrics.hiddenSingles++;
    }
    return true;
  }

  while (changed && !contradiction) {
    changed = false;
    rounds++;

    const singletonRows = [];
    const usedCols = new Map();
    const usedRegions = new Map();
    for (let row = 0; row < size; row++) {
      if (domains[row].size !== 1) continue;
      const col = [...domains[row]][0];
      const region = regions[row][col];
      if (usedCols.has(col) && usedCols.get(col) !== row) contradiction = true;
      if (usedRegions.has(region) && usedRegions.get(region) !== row) contradiction = true;
      usedCols.set(col, row);
      usedRegions.set(region, row);
      singletonRows.push([row, col, region]);
    }
    if (contradiction) break;

    for (const [fixedRow, fixedCol, fixedRegion] of singletonRows) {
      for (let row = 0; row < size; row++) {
        if (row === fixedRow) continue;
        if (remove(row, fixedCol)) changed = true;
        for (const col of [...domains[row]]) {
          if (regions[row][col] === fixedRegion && remove(row, col)) changed = true;
        }
      }
      for (const adjacentRow of [fixedRow - 1, fixedRow + 1]) {
        if (adjacentRow < 0 || adjacentRow >= size) continue;
        for (const col of [...domains[adjacentRow]]) {
          if (Math.abs(col - fixedCol) < 2 && remove(adjacentRow, col)) changed = true;
        }
      }
    }
    if (contradiction) break;

    for (let col = 0; col < size; col++) {
      const locations = [];
      for (let row = 0; row < size; row++) {
        if (domains[row].has(col)) locations.push(row);
      }
      if (locations.length === 0) {
        contradiction = true;
        break;
      }
      if (locations.length === 1 && force(locations[0], col, "hidden")) changed = true;
    }
    if (contradiction) break;

    for (const region of ["A", "B", "C", "D", "E"].slice(0, size)) {
      const locations = [];
      for (let row = 0; row < size; row++) {
        for (const col of domains[row]) {
          if (regions[row][col] === region) locations.push([row, col]);
        }
      }
      if (locations.length === 0) {
        contradiction = true;
        break;
      }
      if (locations.length === 1 && force(locations[0][0], locations[0][1], "hidden")) {
        changed = true;
      }
    }
  }

  if (metrics) metrics.propagationRounds += rounds;
  return { domains, contradiction };
}

export function analyzeHumanDifficulty(regions) {
  const validation = validateRegionGrid(regions);
  if (!validation.valid) {
    throw new TypeError(`invalid region grid: ${validation.problems.join("; ")}`);
  }
  const size = regions.length;
  const initial = Array.from({ length: size }, () => new Set(Array.from({ length: size }, (_, col) => col)));
  const metrics = {
    eliminations: 0,
    forcedPlacements: 0,
    hiddenSingles: 0,
    propagationRounds: 0,
    guesses: 0,
    backtracks: 0,
    maxGuessDepth: 0,
  };
  const propagated = propagateDomains(regions, initial, metrics);
  if (propagated.contradiction) throw new Error("initial propagation produced a contradiction");
  const unresolvedRowsAfterPropagation = propagated.domains.filter((domain) => domain.size > 1).length;
  const remainingCandidatesAfterPropagation = domainCandidateCount(propagated.domains);

  function search(inputDomains, depth) {
    const state = propagateDomains(regions, inputDomains);
    if (state.contradiction) return null;
    const unresolved = state.domains
      .map((domain, row) => ({ row, size: domain.size }))
      .filter((item) => item.size > 1)
      .sort((left, right) => left.size - right.size || left.row - right.row);
    if (!unresolved.length) return state.domains;
    const row = unresolved[0].row;
    for (const col of [...state.domains[row]].sort((a, b) => a - b)) {
      metrics.guesses++;
      metrics.maxGuessDepth = Math.max(metrics.maxGuessDepth, depth + 1);
      const branch = cloneDomains(state.domains);
      branch[row] = new Set([col]);
      const solved = search(branch, depth + 1);
      if (solved) return solved;
      metrics.backtracks++;
    }
    return null;
  }

  const solvedDomains = search(propagated.domains, 0);
  if (!solvedDomains) throw new Error("human difficulty search could not solve the stage");
  const solver = solveRegionGrid(regions);
  const score =
    metrics.guesses * 220 +
    metrics.backtracks * 320 +
    metrics.maxGuessDepth * 90 +
    unresolvedRowsAfterPropagation * 35 +
    remainingCandidatesAfterPropagation * 4 +
    solver.nodes +
    metrics.propagationRounds * 3;

  return {
    ...metrics,
    unresolvedRowsAfterPropagation,
    remainingCandidatesAfterPropagation,
    solverNodes: solver.nodes,
    score,
  };
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
  const attemptsByPattern = new Map(eligiblePatterns.map((columns) => [stablePatternId(columns), 0]));

  for (let round = 0; round < maxRounds && unique.size < poolTarget; round++) {
    const roundPatterns = deterministicShuffle(eligiblePatterns, `${seed}:round-order:${round}`);
    for (const columns of roundPatterns) {
      const patternId = stablePatternId(columns);
      const candidate = generateStageCandidate(columns, `${seed}:round:${round}`, {
        maxAttempts: attemptsPerCall,
        maxGrowthNodes,
      });
      attemptsByPattern.set(patternId, attemptsByPattern.get(patternId) + attemptsPerCall);
      if (!candidate.stageId || unique.has(candidate.canonicalSignature)) continue;
      unique.set(candidate.canonicalSignature, {
        ...candidate,
        humanDifficulty: analyzeHumanDifficulty(candidate.regions),
      });
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
    attemptsByPattern: Object.fromEntries([...attemptsByPattern.entries()].sort()),
    candidates: [...unique.values()].sort((left, right) => left.stageId.localeCompare(right.stageId)),
  };
}

function buildPatternQuotas(patternIds, targetCount, seed) {
  const ordered = deterministicShuffle(patternIds.slice().sort(), `${seed}:quota-order`);
  const base = Math.floor(targetCount / ordered.length);
  const remainder = targetCount % ordered.length;
  return Object.fromEntries(
    ordered.map((patternId, index) => [patternId, base + (index < remainder ? 1 : 0)])
  );
}

function selectAtDistance(candidates, targetCount, threshold, seed) {
  const patternIds = [...new Set(candidates.map((candidate) => candidate.patternId))].sort();
  const quotas = buildPatternQuotas(patternIds, targetCount, seed);
  const queues = new Map(
    patternIds.map((patternId) => [
      patternId,
      deterministicShuffle(
        candidates.filter((candidate) => candidate.patternId === patternId),
        `${seed}:queue:${patternId}`
      ),
    ])
  );
  const selected = [];
  const counts = Object.fromEntries(patternIds.map((patternId) => [patternId, 0]));
  let progress = true;
  while (selected.length < targetCount && progress) {
    progress = false;
    for (const patternId of patternIds) {
      if (counts[patternId] >= quotas[patternId]) continue;
      const queue = queues.get(patternId);
      const candidateIndex = queue.findIndex((candidate) =>
        selected.every(
          (existing) => minimumSymmetricRegionDistance(candidate.regions, existing.regions) >= threshold
        )
      );
      if (candidateIndex < 0) continue;
      const [candidate] = queue.splice(candidateIndex, 1);
      selected.push(candidate);
      counts[patternId]++;
      progress = true;
      if (selected.length >= targetCount) break;
    }
  }
  return { selected, quotas, counts };
}

export function selectBalancedStageBank(
  pool,
  targetCount = DEFAULT_STAGE_BANK_TARGET,
  { seed = DEFAULT_STAGE_BANK_SEED, distanceThresholds = DEFAULT_NEAR_DISTANCE_THRESHOLDS } = {}
) {
  if (!Array.isArray(pool) || !pool.length) throw new TypeError("pool must be a non-empty array");
  if (!Number.isInteger(targetCount) || targetCount < 1) throw new TypeError("targetCount must be positive");
  let best = null;
  for (const threshold of distanceThresholds) {
    const result = selectAtDistance(pool, targetCount, threshold, seed);
    if (!best || result.selected.length > best.selected.length) best = { threshold, ...result };
    if (result.selected.length === targetCount) {
      best = { threshold, ...result };
      break;
    }
  }
  if (!best || best.selected.length !== targetCount) {
    throw new Error(`could not select ${targetCount} stages; selected=${best?.selected.length || 0}`);
  }

  const byDifficulty = best.selected
    .slice()
    .sort(
      (left, right) =>
        left.humanDifficulty.score - right.humanDifficulty.score ||
        left.stageId.localeCompare(right.stageId)
    );
  const difficultyById = new Map();
  for (let index = 0; index < byDifficulty.length; index++) {
    const difficulty = Math.min(3, Math.floor((index * 3) / byDifficulty.length) + 1);
    difficultyById.set(byDifficulty[index].stageId, difficulty);
  }
  const ordered = deterministicShuffle(best.selected, `${seed}:final-order`);
  const stages = ordered.map((candidate, index) => {
    const distances = ordered
      .filter((other) => other.stageId !== candidate.stageId)
      .map((other) => minimumSymmetricRegionDistance(candidate.regions, other.regions));
    return {
      ...candidate,
      order: index + 1,
      difficulty: difficultyById.get(candidate.stageId),
      nearestRegionDistance: distances.length ? Math.min(...distances) : BOARD_SIZE * BOARD_SIZE,
    };
  });
  return {
    threshold: best.threshold,
    quotas: best.quotas,
    counts: best.counts,
    stages,
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
    generatorVersion: STAGE_BANK_GENERATOR_VERSION,
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

export function validateStageBankManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object") return { valid: false, problems: ["manifest missing"] };
  if (!Array.isArray(manifest.stages)) problems.push("stages must be an array");
  if (manifest.runtimeEnabled !== false) problems.push("candidate bank must remain runtime disabled");
  if (manifest.rankingEligible !== false) problems.push("candidate bank must remain ranking ineligible");
  if (problems.length) return { valid: false, problems };

  const ids = new Set();
  const canonical = new Set();
  const difficulty = { 1: 0, 2: 0, 3: 0 };
  const patternCounts = {};
  for (const stage of manifest.stages) {
    const gridValidation = validateRegionGrid(stage.regions);
    if (!gridValidation.valid) problems.push(`${stage.stageId}: ${gridValidation.problems.join("; ")}`);
    const solved = solveRegionGrid(stage.regions);
    if (!solved.unique) problems.push(`${stage.stageId}: not unique`);
    if (solved.firstSolution?.join(",") !== stage.solution.map((cell) => cell[1]).join(",")) {
      problems.push(`${stage.stageId}: solution mismatch`);
    }
    if (stableStageId(stage.regions) !== stage.stageId) problems.push(`${stage.stageId}: unstable id`);
    if (canonicalizeRegionGrid(stage.regions) !== stage.canonicalSignature) {
      problems.push(`${stage.stageId}: canonical mismatch`);
    }
    if (ids.has(stage.stageId)) problems.push(`${stage.stageId}: duplicate id`);
    if (canonical.has(stage.canonicalSignature)) problems.push(`${stage.stageId}: duplicate canonical grid`);
    ids.add(stage.stageId);
    canonical.add(stage.canonicalSignature);
    if (![1, 2, 3].includes(stage.difficulty)) problems.push(`${stage.stageId}: invalid difficulty`);
    else difficulty[stage.difficulty]++;
    patternCounts[stage.patternId] = (patternCounts[stage.patternId] || 0) + 1;
  }
  if (manifest.stageCount !== manifest.stages.length) problems.push("stageCount mismatch");
  if (manifest.stageCount < DEFAULT_STAGE_BANK_TARGET) problems.push("stage bank contains fewer than 84 stages");
  const counts = Object.values(patternCounts);
  if (counts.length && Math.max(...counts) - Math.min(...counts) > 1) {
    problems.push("pattern distribution differs by more than one");
  }
  const difficultyCounts = Object.values(difficulty);
  if (difficultyCounts.length && Math.max(...difficultyCounts) - Math.min(...difficultyCounts) > 1) {
    problems.push("difficulty distribution differs by more than one");
  }
  const threshold = manifest.selection?.minimumRegionDistance ?? 0;
  for (let left = 0; left < manifest.stages.length; left++) {
    for (let right = left + 1; right < manifest.stages.length; right++) {
      if (
        minimumSymmetricRegionDistance(
          manifest.stages[left].regions,
          manifest.stages[right].regions
        ) < threshold
      ) {
        problems.push(
          `${manifest.stages[left].stageId}/${manifest.stages[right].stageId}: near-distance below threshold`
        );
        left = manifest.stages.length;
        break;
      }
    }
  }
  return { valid: problems.length === 0, problems };
}
