import { STAGES } from "./stages.js";
import {
  PRACTICE_STAGE_BANK_FEATURE,
  getStageBankDescriptor,
} from "./stage-bank-config.js";
import {
  VARIABLE_STAGE_BANK_STATUS,
  validateVariableStageBank,
} from "./variable-stage-contract.js";

export const PRACTICE_STAGE_BANK_URL = new URL(
  "../generated/variable-stage-bank-v2.json",
  import.meta.url
).href;

function fallbackResult(reason) {
  const descriptor = getStageBankDescriptor(
    PRACTICE_STAGE_BANK_FEATURE.fallbackBankId
  );
  return {
    bankId: descriptor.id,
    stages: STAGES,
    fallback: true,
    fallbackReason: reason,
  };
}

export function validatePracticeStageBankPayload(bank) {
  const descriptor = getStageBankDescriptor(
    PRACTICE_STAGE_BANK_FEATURE.primaryBankId
  );
  const problems = [];

  if (!bank || typeof bank !== "object" || Array.isArray(bank)) {
    return { valid: false, problems: ["practice bank must be an object"] };
  }
  if (bank.id !== descriptor.id) {
    problems.push(`practice bank id must be ${descriptor.id}`);
  }
  if (bank.status !== descriptor.status) {
    problems.push(`practice bank status must be ${descriptor.status}`);
  }
  if (bank.runtimeEnabled !== true) {
    problems.push("practice bank runtimeEnabled must be true");
  }
  if (bank.rankingEligible !== false) {
    problems.push("practice bank rankingEligible must be false");
  }
  if (bank.stageCount !== descriptor.stageCount) {
    problems.push(`practice bank stageCount must be ${descriptor.stageCount}`);
  }
  if (!Array.isArray(bank.stages) || bank.stages.length !== descriptor.stageCount) {
    problems.push("practice bank stages must match stageCount");
  }

  if (Array.isArray(bank.stages)) {
    const validation = validateVariableStageBank(
      {
        ...bank,
        status: VARIABLE_STAGE_BANK_STATUS,
        runtimeEnabled: false,
        rankingEligible: false,
      },
      { minimumStageCount: descriptor.stageCount }
    );
    problems.push(...validation.problems);
  }

  return { valid: problems.length === 0, problems };
}

export async function loadPracticeStageBank({
  fetchImpl = globalThis.fetch,
  feature = PRACTICE_STAGE_BANK_FEATURE,
  url = PRACTICE_STAGE_BANK_URL,
} = {}) {
  if (!feature.enabled) return fallbackResult("feature-disabled");
  if (typeof fetchImpl !== "function") return fallbackResult("fetch-unavailable");

  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response || !response.ok) return fallbackResult("http-error");

    const bank = await response.json();
    const validation = validatePracticeStageBankPayload(bank);
    if (!validation.valid) return fallbackResult("invalid-bank");

    return {
      bankId: bank.id,
      stages: bank.stages,
      fallback: false,
      fallbackReason: null,
    };
  } catch (_) {
    return fallbackResult("network-error");
  }
}
