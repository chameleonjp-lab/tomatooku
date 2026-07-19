export const ACTIVE_STAGE_BANK_ID = "legacy-v1";

export const STAGE_BANK_CATALOG = Object.freeze({
  "legacy-v1": Object.freeze({
    id: "legacy-v1",
    source: "src/stages.js",
    stageCount: 30,
    runtimeEnabled: true,
    rankingEligible: true,
    description: "現在の公式3問とランダム練習が利用する既存30問バンク",
  }),
  "candidate-v2": Object.freeze({
    id: "candidate-v2",
    source: "generated/stage-bank-v2.json",
    minimumStageCount: 84,
    runtimeEnabled: false,
    rankingEligible: false,
    requiresHumanReview: true,
    description: "生成器v2が作成する未採用の候補バンク",
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
    throw new Error("candidate-v2 must not be enabled before explicit human approval");
  }
  return true;
}
