export const ACTIVE_STAGE_BANK_ID = "legacy-v1";

export const STAGE_BANK_CATALOG = Object.freeze({
  "legacy-v1": Object.freeze({
    id: "legacy-v1",
    source: "src/stages.js",
    stageCount: 30,
    runtimeEnabled: true,
    rankingEligible: true,
    status: "active",
    description: "現在の公式3問とランダム練習が利用する既存30問バンク",
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
    description: "現仕様では84問を構築できないため有効化禁止の生成器v2候補",
  }),
});

export function getStageBankDescriptor(bankId = ACTIVE_STAGE_BANK_ID) {
  const descriptor = STAGE_BANK_CATALOG[bankId];
  if (!descriptor) throw new RangeError(`unknown stage bank: ${bankId}`);
  return descriptor;
}

export function assertCandidateBankRemainsInactive() {
  const candidate = getStageBankDescriptor("candidate-v2");
  if (candidate.runtimeEnabled || candidate.rankingEligible) {
    throw new Error("candidate-v2 must remain inactive while feasibility is blocked");
  }
  if (candidate.status !== "blocked-by-constraints") {
    throw new Error("candidate-v2 status must remain blocked until a new contract is approved");
  }
  return true;
}
