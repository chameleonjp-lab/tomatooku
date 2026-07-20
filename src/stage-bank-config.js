export const ACTIVE_STAGE_BANK_ID = "legacy-v1";

export const PRACTICE_STAGE_BANK_FEATURE = Object.freeze({
  enabled: true,
  primaryBankId: "candidate-v2-variable-4-6-final",
  fallbackBankId: "legacy-v1",
});

export const ACTIVE_PRACTICE_STAGE_BANK_ID = PRACTICE_STAGE_BANK_FEATURE.enabled
  ? PRACTICE_STAGE_BANK_FEATURE.primaryBankId
  : PRACTICE_STAGE_BANK_FEATURE.fallbackBankId;

export const STAGE_BANK_CATALOG = Object.freeze({
  "legacy-v1": Object.freeze({
    id: "legacy-v1",
    source: "src/stages.js",
    stageCount: 30,
    runtimeEnabled: true,
    rankingEligible: true,
    status: "active",
    description: "現在の公式3問と練習fallbackが利用する既存30問バンク",
  }),
  "candidate-v2": Object.freeze({
    id: "candidate-v2",
    source: "generated/stage-bank-feasibility-v2.json",
    requiredCanonicalStageCount: 84,
    auditedMaximumCanonicalStageCount: 5,
    runtimeEnabled: false,
    rankingEligible: false,
    status: "blocked-by-constraints",
    requiresHumanDecision: true,
    description: "各エリア5マス固定では84問を構築できない生成器v2候補",
  }),
  "candidate-v2-variable-4-6": Object.freeze({
    id: "candidate-v2-variable-4-6",
    source: "generated/stage-bank-variable-feasibility-v2.json",
    contract: "docs/VARIABLE_REGION_STAGE_CONTRACT.md",
    stageSchemaVersion: 2,
    bankSchemaVersion: 1,
    requiredCanonicalStageCount: 84,
    witnessedCanonicalStageCount: 84,
    minRegionSize: 4,
    maxRegionSize: 6,
    runtimeEnabled: false,
    rankingEligible: false,
    status: "contract-proposed-pending-approval",
    requiresHumanDecision: true,
    description: "エリアサイズ4〜6マスの独立schema契約を提案済みの候補",
  }),
  "candidate-v2-variable-4-6-pool": Object.freeze({
    id: "candidate-v2-variable-4-6-pool",
    source: "generated/variable-stage-candidate-pool-v2.json",
    contract: "docs/VARIABLE_REGION_STAGE_CONTRACT.md",
    stageSchemaVersion: 2,
    bankSchemaVersion: 1,
    rawStageCount: 185,
    stageCount: 108,
    minRegionSize: 4,
    maxRegionSize: 6,
    runtimeEnabled: false,
    rankingEligible: false,
    status: "candidate-pool-ready-for-review",
    requiresHumanDecision: true,
    description: "難易度・構造距離・対称クラス分布を付与したレビュー用108問候補プール",
  }),
  "candidate-v2-variable-4-6-final": Object.freeze({
    id: "candidate-v2-variable-4-6-final",
    source: "generated/variable-stage-bank-v2.json",
    reviewSource: "review/decisions/variable-stage-review-round1.json",
    contract: "docs/VARIABLE_REGION_STAGE_CONTRACT.md",
    stageSchemaVersion: 2,
    bankSchemaVersion: 1,
    stageCount: 84,
    minRegionSize: 4,
    maxRegionSize: 6,
    symmetryClassDistribution: Object.freeze({
      "SC-95390462": 34,
      "SC-be359992": 33,
      "SC-3a178cba": 17,
    }),
    difficultyDistribution: Object.freeze({ 1: 28, 2: 28, 3: 28 }),
    runtimeEnabled: true,
    rankingEligible: false,
    status: "active-practice-only",
    requiresHumanDecision: false,
    description: "承認済み84問をランダム練習だけで利用する完成バンク",
  }),
});

export function getStageBankDescriptor(bankId = ACTIVE_STAGE_BANK_ID) {
  const descriptor = STAGE_BANK_CATALOG[bankId];
  if (!descriptor) throw new RangeError(`unknown stage bank: ${bankId}`);
  return descriptor;
}

export function assertCandidateBankRemainsInactive() {
  const fixed = getStageBankDescriptor("candidate-v2");
  const variable = getStageBankDescriptor("candidate-v2-variable-4-6");
  const pool = getStageBankDescriptor("candidate-v2-variable-4-6-pool");
  for (const candidate of [fixed, variable, pool]) {
    if (candidate.runtimeEnabled || candidate.rankingEligible) {
      throw new Error(`${candidate.id} must remain inactive before explicit approval`);
    }
  }
  if (fixed.status !== "blocked-by-constraints") {
    throw new Error("candidate-v2 must remain blocked under the fixed-size contract");
  }
  if (variable.status !== "contract-proposed-pending-approval") {
    throw new Error("variable-region contract candidate must remain pending approval");
  }
  if (pool.status !== "candidate-pool-ready-for-review") {
    throw new Error("variable-region candidate pool must remain review-only");
  }
  return true;
}

export function assertPracticeStageBankRouting() {
  const primary = getStageBankDescriptor(
    PRACTICE_STAGE_BANK_FEATURE.primaryBankId
  );
  const fallback = getStageBankDescriptor(
    PRACTICE_STAGE_BANK_FEATURE.fallbackBankId
  );
  if (ACTIVE_STAGE_BANK_ID !== "legacy-v1") {
    throw new Error("official active bank must remain legacy-v1");
  }
  if (ACTIVE_PRACTICE_STAGE_BANK_ID !== primary.id) {
    throw new Error("practice active bank must follow the enabled feature gate");
  }
  if (!primary.runtimeEnabled || primary.rankingEligible) {
    throw new Error("practice final bank must be runtime enabled and ranking ineligible");
  }
  if (primary.status !== "active-practice-only") {
    throw new Error("practice final bank status must be active-practice-only");
  }
  if (!fallback.runtimeEnabled || fallback.id !== "legacy-v1") {
    throw new Error("practice fallback must be legacy-v1");
  }
  return true;
}
