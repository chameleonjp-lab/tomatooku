import {
  BOARD_SIZE,
  enumerateValidColumnPatterns,
  patternSignature,
  stablePatternId,
  stableSymmetryClassId,
} from "./core.js";
import {
  canonicalizeVariableStageRegions,
  expectedVariableStageId,
  validateVariableStage,
} from "../../src/variable-stage-contract.js";

export const VARIABLE_POOL_SCHEMA_VERSION = 1;
export const VARIABLE_POOL_GENERATOR_VERSION = "2.6.0-variable-pool.1";
export const DEFAULT_RAW_TARGET_PER_CLASS = 84;
export const DEFAULT_SELECTED_TARGET_TOTAL = 108;
export const DEFAULT_MINIMUM_SELECTED_PER_CLASS = 17;
export const DEFAULT_MAX_PARTITIONS_PER_CLASS = 1000000;
export const DEFAULT_MIN_REGION_SIZE = 4;
export const DEFAULT_MAX_REGION_SIZE = 6;

const REGION_LABELS = Object.freeze(["A", "B", "C", "D", "E"]);
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const FULL_MASK = (1 << CELL_COUNT) - 1;
const DIRS4 = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);
const TRANSFORM_NAMES = Object.freeze([
  "identity",
  "rotate90",
  "rotate180",
  "rotate270",
  "mirrorLeftRight",
  "mirrorUpDown",
  "mirrorMainDiagonal",
  "mirrorAntiDiagonal",
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

function candidateRegionMasks(seedIndex, otherSeedIndexes, minRegionSize, maxRegionSize) {
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
    for (let cursor = start; cursor <= allowed.length - remaining; cursor++) {
      selected.push(allowed[cursor]);
      choose(cursor + 1, targetAdditionalCells);
      selected.pop();
    }
  }

  for (let size = minRegionSize; size <= maxRegionSize; size++) {
    choose(0, size - 1);
  }
  return results;
}

function rowsFromMasks(masks) {
  const cells = new Array(CELL_COUNT);
  masks.forEach((mask, regionId) => {
    for (let index = 0; index < CELL_COUNT; index++) {
      if (mask & (1 << index)) cells[index] = REGION_LABELS[regionId];
    }
  });
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    cells.slice(row * BOARD_SIZE, (row + 1) * BOARD_SIZE).join("")
  );
}

function regionSizeProfile(regions) {
  const counts = new Map(REGION_LABELS.map((label) => [label, 0]));
  for (const row of regions) {
    for (const label of row) counts.set(label, counts.get(label) + 1);
  }
  return [...counts.values()].sort((left, right) => left - right);
}

function solveRegions(regions, solutionLimit = 2) {
  const regionIndex = new Map(REGION_LABELS.map((label, index) => [label, index]));
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
      const region = regionIndex.get(regions[row][col]);
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
    unique: solutions.length === 1,
    solutionCount: solutions.length,
    firstSolution: solutions[0] || null,
    nodes,
  };
}

function normalizeLabels(rows) {
  const mapping = new Map();
  let next = 0;
  return rows.map((row) =>
    [...row]
      .map((label) => {
        if (!mapping.has(label)) mapping.set(label, REGION_LABELS[next++]);
        return mapping.get(label);
      })
      .join("")
  );
}

function transformCell(row, col, transformName) {
  const last = BOARD_SIZE - 1;
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

function transformRegions(rows, transformName) {
  const cells = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE));
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const [nextRow, nextCol] = transformCell(row, col, transformName);
      cells[nextRow][nextCol] = rows[row][col];
    }
  }
  return cells.map((row) => row.join(""));
}

function signatureDistance(left, right) {
  const flatLeft = left.replaceAll("|", "");
  const flatRight = right.replaceAll("|", "");
  let distance = 0;
  for (let index = 0; index < flatLeft.length; index++) {
    if (flatLeft[index] !== flatRight[index]) distance++;
  }
  return distance;
}

export function minimumVariableStageDistance(leftRegions, rightRegions) {
  const leftSignature = canonicalizeVariableStageRegions(leftRegions);
  let minimum = CELL_COUNT;
  for (const transformName of TRANSFORM_NAMES) {
    const transformed = normalizeLabels(transformRegions(rightRegions, transformName)).join("|");
    minimum = Math.min(minimum, signatureDistance(leftSignature, transformed));
  }
  return minimum;
}

function pairCompatible(regions, leftRow, leftCol, rightRow, rightCol) {
  if (leftCol === rightCol) return false;
  if (regions[leftRow][leftCol] === regions[rightRow][rightCol]) return false;
  if (Math.abs(leftRow - rightRow) === 1 && Math.abs(leftCol - rightCol) < 2) {
    return false;
  }
  return true;
}

function propagateDomains(regions, inputDomains) {
  const domains = inputDomains.map((domain) => domain.slice());
  let rounds = 0;
  let changed = true;

  while (changed) {
    changed = false;
    rounds++;
    for (let leftRow = 0; leftRow < BOARD_SIZE; leftRow++) {
      const filtered = domains[leftRow].filter((leftCol) => {
        for (let rightRow = 0; rightRow < BOARD_SIZE; rightRow++) {
          if (leftRow === rightRow) continue;
          if (
            !domains[rightRow].some((rightCol) =>
              pairCompatible(regions, leftRow, leftCol, rightRow, rightCol)
            )
          ) {
            return false;
          }
        }
        return true;
      });
      if (filtered.length !== domains[leftRow].length) {
        domains[leftRow] = filtered;
        changed = true;
      }
      if (!domains[leftRow].length) return { valid: false, domains, rounds };
    }

    for (let col = 0; col < BOARD_SIZE; col++) {
      const rows = [];
      for (let row = 0; row < BOARD_SIZE; row++) {
        if (domains[row].includes(col)) rows.push(row);
      }
      if (rows.length === 1 && domains[rows[0]].length !== 1) {
        domains[rows[0]] = [col];
        changed = true;
      }
    }

    for (const label of REGION_LABELS) {
      const cells = [];
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (const col of domains[row]) {
          if (regions[row][col] === label) cells.push([row, col]);
        }
      }
      if (cells.length === 1) {
        const [row, col] = cells[0];
        if (domains[row].length !== 1) {
          domains[row] = [col];
          changed = true;
        }
      }
    }
  }

  return { valid: true, domains, rounds };
}

export function analyzeVariableStageDifficulty(regions) {
  const initialDomains = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, (_, col) => col)
  );
  const initial = propagateDomains(regions, initialDomains);
  let branchNodes = 0;
  let maxGuessDepth = 0;
  let solutions = 0;

  function search(domains, depth) {
    if (solutions >= 2) return;
    const propagated = propagateDomains(regions, domains);
    if (!propagated.valid) return;
    const unresolved = propagated.domains
      .map((domain, row) => ({ row, domain }))
      .filter((item) => item.domain.length > 1)
      .sort(
        (left, right) =>
          left.domain.length - right.domain.length || left.row - right.row
      );
    if (!unresolved.length) {
      solutions++;
      return;
    }
    const chosen = unresolved[0];
    maxGuessDepth = Math.max(maxGuessDepth, depth + 1);
    for (const col of chosen.domain) {
      branchNodes++;
      const next = propagated.domains.map((domain) => domain.slice());
      next[chosen.row] = [col];
      search(next, depth + 1);
      if (solutions >= 2) return;
    }
  }

  search(initialDomains, 0);
  const forcedRows = initial.valid
    ? initial.domains.filter((domain) => domain.length === 1).length
    : 0;
  const unresolvedRows = BOARD_SIZE - forcedRows;
  const remainingCandidates = initial.valid
    ? initial.domains.reduce((sum, domain) => sum + domain.length, 0)
    : CELL_COUNT;
  const score =
    unresolvedRows * 40 +
    remainingCandidates * 4 +
    branchNodes * 8 +
    maxGuessDepth * 60 +
    Math.max(0, initial.rounds - 1) * 5;

  return {
    score,
    propagationRounds: initial.rounds,
    forcedRows,
    unresolvedRows,
    remainingCandidates,
    branchNodes,
    maxGuessDepth,
    solutionCount: solutions,
  };
}

function createStage(regions) {
  const canonicalSignature = canonicalizeVariableStageRegions(regions);
  const canonicalRegions = canonicalSignature.split("|");
  const solved = solveRegions(canonicalRegions);
  if (!solved.unique) return null;
  const stage = {
    schemaVersion: 2,
    id: expectedVariableStageId(canonicalRegions),
    regions: canonicalRegions,
    solution: solved.firstSolution.map((col, row) => [row, col]),
    generatorVersion: VARIABLE_POOL_GENERATOR_VERSION,
    canonicalSignature,
  };
  const validation = validateVariableStage(stage);
  if (!validation.valid) {
    throw new Error(`generated stage failed independent validation: ${validation.problems.join("; ")}`);
  }
  return stage;
}

function representativePatternsByClass() {
  const representatives = new Map();
  const patterns = enumerateValidColumnPatterns().sort((left, right) =>
    patternSignature(left).localeCompare(patternSignature(right))
  );
  for (const columns of patterns) {
    const symmetryClassId = stableSymmetryClassId(columns);
    if (!representatives.has(symmetryClassId)) representatives.set(symmetryClassId, columns);
  }
  return [...representatives.entries()]
    .map(([symmetryClassId, columns]) => ({
      symmetryClassId,
      columns,
      patternId: stablePatternId(columns),
      patternSignature: patternSignature(columns),
    }))
    .sort((left, right) => left.symmetryClassId.localeCompare(right.symmetryClassId));
}

function enumerateRawClassCandidates(
  representative,
  {
    rawTarget,
    maxPartitions,
    minRegionSize,
    maxRegionSize,
  }
) {
  const seedIndexes = representative.columns.map((col, row) => indexOf(row, col));
  const candidates = seedIndexes.map((seedIndex) =>
    candidateRegionMasks(
      seedIndex,
      seedIndexes.filter((other) => other !== seedIndex),
      minRegionSize,
      maxRegionSize
    )
  );
  const masks = new Array(BOARD_SIZE).fill(0);
  const rawStages = new Map();
  let connectedPartitionsVisited = 0;
  let uniqueSolutionsVisited = 0;
  let partitionLimitReached = false;

  function visit(unassignedRegionIds, usedMask) {
    if (rawStages.size >= rawTarget) return true;
    if (connectedPartitionsVisited >= maxPartitions) {
      partitionLimitReached = true;
      return true;
    }
    if (!unassignedRegionIds.length) {
      if (usedMask !== FULL_MASK) return false;
      connectedPartitionsVisited++;
      const regions = rowsFromMasks(masks);
      const solved = solveRegions(regions);
      if (
        !solved.unique ||
        solved.firstSolution.join(",") !== representative.columns.join(",")
      ) {
        return false;
      }
      uniqueSolutionsVisited++;
      const stage = createStage(regions);
      if (stage && !rawStages.has(stage.canonicalSignature)) {
        rawStages.set(stage.canonicalSignature, stage);
      }
      return rawStages.size >= rawTarget;
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
    const remaining = unassignedRegionIds.filter(
      (regionId) => regionId !== chosenRegionId
    );
    for (const mask of compatibleMasks) {
      masks[chosenRegionId] = mask;
      if (visit(remaining, usedMask | mask)) return true;
    }
    masks[chosenRegionId] = 0;
    return false;
  }

  visit(Array.from({ length: BOARD_SIZE }, (_, index) => index), 0);
  return {
    representative,
    candidateRegionCounts: candidates.map((items) => items.length),
    connectedPartitionsVisited,
    uniqueSolutionsVisited,
    partitionLimitReached,
    rawTargetReached: rawStages.size >= rawTarget,
    stages: [...rawStages.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function profileKey(stage) {
  return regionSizeProfile(stage.regions).join("-");
}

function createDistanceCache() {
  const cache = new Map();
  return (left, right) => {
    const key = left.id < right.id ? `${left.id}|${right.id}` : `${right.id}|${left.id}`;
    if (!cache.has(key)) {
      cache.set(key, minimumVariableStageDistance(left.regions, right.regions));
    }
    return cache.get(key);
  };
}

function chooseFirstCandidate(candidates, distance) {
  let best = null;
  let bestTotal = -1;
  for (const candidate of candidates) {
    let total = 0;
    for (const other of candidates) {
      if (candidate.id !== other.id) total += distance(candidate, other);
    }
    if (total > bestTotal || (total === bestTotal && candidate.id < best.id)) {
      best = candidate;
      bestTotal = total;
    }
  }
  return best;
}

function selectDiverseClassStages(stages, target) {
  if (stages.length < target) {
    throw new Error(`raw class pool too small: ${stages.length} < ${target}`);
  }
  const distance = createDistanceCache();
  const profiles = [...new Set(stages.map(profileKey))].sort();
  const quotas = Object.fromEntries(
    profiles.map((profile, index) => [
      profile,
      Math.floor(target / profiles.length) + (index < target % profiles.length ? 1 : 0),
    ])
  );
  const counts = Object.fromEntries(profiles.map((profile) => [profile, 0]));
  const selected = [];
  const remaining = new Map(stages.map((stage) => [stage.id, stage]));

  while (selected.length < target) {
    let eligible = [...remaining.values()].filter(
      (stage) => counts[profileKey(stage)] < quotas[profileKey(stage)]
    );
    if (!eligible.length) eligible = [...remaining.values()];

    let chosen;
    if (!selected.length) {
      chosen = chooseFirstCandidate(eligible, distance);
    } else {
      let bestDistance = -1;
      for (const candidate of eligible) {
        const nearest = Math.min(
          ...selected.map((stage) => distance(candidate, stage))
        );
        if (
          nearest > bestDistance ||
          (nearest === bestDistance && candidate.id < chosen.id)
        ) {
          chosen = candidate;
          bestDistance = nearest;
        }
      }
    }
    selected.push(chosen);
    remaining.delete(chosen.id);
    counts[profileKey(chosen)]++;
  }

  return { selected, quotas, counts };
}

function assignDifficulty(stages, metadata) {
  const ordered = stages
    .slice()
    .sort(
      (left, right) =>
        metadata[left.id].difficulty.score - metadata[right.id].difficulty.score ||
        left.id.localeCompare(right.id)
    );
  const difficultyById = new Map();
  for (let index = 0; index < ordered.length; index++) {
    difficultyById.set(
      ordered[index].id,
      Math.min(3, Math.floor((index * 3) / ordered.length) + 1)
    );
  }
  return stages.map((stage) => ({
    ...stage,
    difficulty: difficultyById.get(stage.id),
  }));
}

function distribution(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return result;
}

function allocateClassSelectionTargets(
  classAudits,
  selectedTargetTotal,
  minimumSelectedPerClass
) {
  if (minimumSelectedPerClass * classAudits.length > selectedTargetTotal) {
    throw new RangeError(
      "minimumSelectedPerClass cannot fit within selectedTargetTotal"
    );
  }
  const totalCapacity = classAudits.reduce(
    (sum, audit) => sum + audit.stages.length,
    0
  );
  if (selectedTargetTotal > totalCapacity) {
    throw new RangeError(
      `selectedTargetTotal exceeds raw capacity: ${selectedTargetTotal} > ${totalCapacity}`
    );
  }

  const targets = Object.fromEntries(
    classAudits.map((audit) => [
      audit.representative.symmetryClassId,
      Math.min(minimumSelectedPerClass, audit.stages.length),
    ])
  );
  for (const audit of classAudits) {
    if (audit.stages.length < minimumSelectedPerClass) {
      throw new Error(
        `minimum class representation not reached for ` +
          `${audit.representative.symmetryClassId}: ` +
          `${audit.stages.length}/${minimumSelectedPerClass}`
      );
    }
  }

  let assigned = Object.values(targets).reduce((sum, value) => sum + value, 0);
  while (assigned < selectedTargetTotal) {
    const candidates = classAudits
      .filter(
        (audit) =>
          targets[audit.representative.symmetryClassId] < audit.stages.length
      )
      .sort((left, right) => {
        const leftRemaining =
          left.stages.length - targets[left.representative.symmetryClassId];
        const rightRemaining =
          right.stages.length - targets[right.representative.symmetryClassId];
        return (
          rightRemaining - leftRemaining ||
          left.representative.symmetryClassId.localeCompare(
            right.representative.symmetryClassId
          )
        );
      });
    if (!candidates.length) {
      throw new Error("could not allocate selected target across classes");
    }
    targets[candidates[0].representative.symmetryClassId]++;
    assigned++;
  }
  return targets;
}

function allocateClassSelectionTargets(
  classAudits,
  selectedTargetTotal,
  minimumSelectedPerClass
) {
  if (minimumSelectedPerClass * classAudits.length > selectedTargetTotal) {
    throw new RangeError(
      "minimumSelectedPerClass cannot fit within selectedTargetTotal"
    );
  }
  const totalCapacity = classAudits.reduce(
    (sum, audit) => sum + audit.stages.length,
    0
  );
  if (selectedTargetTotal > totalCapacity) {
    throw new RangeError(
      `selectedTargetTotal exceeds raw capacity: ${selectedTargetTotal} > ${totalCapacity}`
    );
  }

  const targets = Object.fromEntries(
    classAudits.map((audit) => [
      audit.representative.symmetryClassId,
      Math.min(minimumSelectedPerClass, audit.stages.length),
    ])
  );
  for (const audit of classAudits) {
    if (audit.stages.length < minimumSelectedPerClass) {
      throw new Error(
        `minimum class representation not reached for ` +
          `${audit.representative.symmetryClassId}: ` +
          `${audit.stages.length}/${minimumSelectedPerClass}`
      );
    }
  }

  let assigned = Object.values(targets).reduce((sum, value) => sum + value, 0);
  while (assigned < selectedTargetTotal) {
    const candidates = classAudits
      .filter(
        (audit) =>
          targets[audit.representative.symmetryClassId] < audit.stages.length
      )
      .sort((left, right) => {
        const leftRemaining =
          left.stages.length - targets[left.representative.symmetryClassId];
        const rightRemaining =
          right.stages.length - targets[right.representative.symmetryClassId];
        return (
          rightRemaining - leftRemaining ||
          left.representative.symmetryClassId.localeCompare(
            right.representative.symmetryClassId
          )
        );
      });
    if (!candidates.length) {
      throw new Error("could not allocate selected target across classes");
    }
    targets[candidates[0].representative.symmetryClassId]++;
    assigned++;
  }
  return targets;
}

export function buildVariableStageCandidatePool({
  rawTargetPerClass = DEFAULT_RAW_TARGET_PER_CLASS,
  selectedTargetTotal = DEFAULT_SELECTED_TARGET_TOTAL,
  minimumSelectedPerClass = DEFAULT_MINIMUM_SELECTED_PER_CLASS,
  maxPartitionsPerClass = DEFAULT_MAX_PARTITIONS_PER_CLASS,
  minRegionSize = DEFAULT_MIN_REGION_SIZE,
  maxRegionSize = DEFAULT_MAX_REGION_SIZE,
} = {}) {
  for (const [name, value] of Object.entries({
    rawTargetPerClass,
    selectedTargetTotal,
    minimumSelectedPerClass,
    maxPartitionsPerClass,
  })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  const rawClassAudits = representativePatternsByClass().map((representative) =>
    enumerateRawClassCandidates(representative, {
      rawTarget: rawTargetPerClass,
      maxPartitions: maxPartitionsPerClass,
      minRegionSize,
      maxRegionSize,
    })
  );
  const selectionTargets = allocateClassSelectionTargets(
    rawClassAudits,
    selectedTargetTotal,
    minimumSelectedPerClass
  );

  const classAudits = [];
  const selectedStages = [];
  const metadata = {};
  for (const audit of rawClassAudits) {
    const representative = audit.representative;
    const selectedTarget = selectionTargets[representative.symmetryClassId];
    const selection = selectDiverseClassStages(audit.stages, selectedTarget);
    for (const stage of selection.selected) {
      selectedStages.push(stage);
      metadata[stage.id] = {
        symmetryClassId: representative.symmetryClassId,
        sourcePatternId: representative.patternId,
        sourcePatternSignature: representative.patternSignature,
        regionProfile: profileKey(stage),
        difficulty: analyzeVariableStageDifficulty(stage.regions),
      };
    }
    classAudits.push({
      symmetryClassId: representative.symmetryClassId,
      representativePatternId: representative.patternId,
      representativePatternSignature: representative.patternSignature,
      candidateRegionCounts: audit.candidateRegionCounts,
      connectedPartitionsVisited: audit.connectedPartitionsVisited,
      uniqueSolutionsVisited: audit.uniqueSolutionsVisited,
      partitionLimitReached: audit.partitionLimitReached,
      rawTarget: rawTargetPerClass,
      rawTargetReached: audit.rawTargetReached,
      rawCount: audit.stages.length,
      selectedTarget,
      selectedCount: selection.selected.length,
      profileQuotas: selection.quotas,
      profileCounts: selection.counts,
    });
  }

  const withDifficulty = assignDifficulty(selectedStages, metadata).sort(
    (left, right) => left.id.localeCompare(right.id)
  );
  for (const stage of withDifficulty) {
    metadata[stage.id].difficultyLevel = stage.difficulty;
  }

  let minimumPairDistance = CELL_COUNT;
  const nearestDistanceDistribution = {};
  for (const stage of withDifficulty) {
    let nearest = CELL_COUNT;
    for (const other of withDifficulty) {
      if (stage.id === other.id) continue;
      nearest = Math.min(
        nearest,
        minimumVariableStageDistance(stage.regions, other.regions)
      );
    }
    metadata[stage.id].nearestStructuralDistance = nearest;
    minimumPairDistance = Math.min(minimumPairDistance, nearest);
    nearestDistanceDistribution[nearest] =
      (nearestDistanceDistribution[nearest] || 0) + 1;
  }

  return {
    schemaVersion: VARIABLE_POOL_SCHEMA_VERSION,
    generatorVersion: VARIABLE_POOL_GENERATOR_VERSION,
    status: "candidate-pool-not-runtime",
    runtimeEnabled: false,
    rankingEligible: false,
    boardSize: BOARD_SIZE,
    constraints: {
      regionCount: BOARD_SIZE,
      minRegionSize,
      maxRegionSize,
      regionsMustBeFourNeighborConnected: true,
      uniqueSolutionRequired: true,
      deduplication:
        "D4 transforms plus first-seen region-label normalization",
    },
    rawTargetPerClass,
    selectedTargetTotal,
    minimumSelectedPerClass,
    symmetryClassCount: classAudits.length,
    rawStageCount: classAudits.reduce(
      (sum, audit) => sum + audit.rawCount,
      0
    ),
    stageCount: withDifficulty.length,
    minimumParrPairDistance,
    allocationStrategy:
      "retain the minimum from every class, then fill by remaining raw capacity",
    capacityLimitedClasses: classAudits
      .filter((audit) => !audit.rawTargetReached)
      .map((audit) => audit.symmetryClassId),
    symmetryClassDistribution: distribution(
      withDifficulty.map((stage) => metadata[stage.id].symmetryClassId)
    ),
    profileDistribution: distribution(
      withDifficulty.map((stage) => metadata[stage.id].regionProfile)
    ),
    difficultyDistribution: distribution(
      withDifficulty.map((stage) => stage.difficulty)
    ),
    nearestDistanceDistribution,
    classAudits,
    stages: withDifficulty,
    metadata,
  };
}
