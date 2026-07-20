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
    description: "各エリア5マス固定では84問を構築できない生成器v2候補",
  }),
  "candidate-v2-variable-4-6": Object.freeze({
    id: "candidate-v2-variable-4-6",
    source: "generated/stage-bank-variable-feasibility-v2.json",
    requiredCanonicalStageCount: 84,
    witnessedCanonicalStageCount: 84,
    minRegionSize: 4,
    maxRegionSize: 6,
    runtimeEnabled: false,
    rankingEligible: false,
    status: "feasible-pending-contract-approval",
    requiresHumanDecision: true,
    description: "エリアサイズ4〜6マスで84問の存在を確認した未承認候補",
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
  for (const candidate of [fixed, variable]) {
    if (candidate.runtimeEnabled || candidate.rankingEligible) {
      throw new Error(`${candidate.id} must remain inactive before explicit approval`);
    }
  }
  if (fixed.status !== "blocked-by-constraints") {
    throw new Error("candidate-v2 must remain blocked under the fixed-size contract");
  }
  if (variable.status !== "feasible-pending-contract-approval") {
    throw new Error("variable-region candidate must remain pending contract approval");
  }
  return true;
}
