import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_PRACTICE_STAGE_BANK_ID,
  ACTIVE_STAGE_BANK_ID,
  PRACTICE_STAGE_BANK_FEATURE,
  assertPracticeStageBankRouting,
  getStageBankDescriptor,
} from "../src/stage-bank-config.js";
import {
  GAME_MODE,
  GameSession,
  OFFICIAL_STAGE_IDS,
  solutionSignature,
} from "../src/game.js";
import {
  loadPracticeStageBank,
  validatePracticeStageBankPayload,
} from "../src/practice-stage-bank.js";
import { STAGES } from "../src/stages.js";

const finalBank = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../generated/variable-stage-bank-v2.json", import.meta.url)
    ),
    "utf8"
  )
);

let pass = 0;
async function test(name, fn) {
  await fn();
  pass++;
  console.log(`✓ ${name}`);
}

function response(body, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return structuredClone(body);
    },
  };
}

await test("公式バンクと練習バンクのactive IDを分離", async () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "legacy-v1");
  assert.equal(
    ACTIVE_PRACTICE_STAGE_BANK_ID,
    "candidate-v2-variable-4-6-final"
  );
  assert.equal(PRACTICE_STAGE_BANK_FEATURE.enabled, true);
  assert.equal(PRACTICE_STAGE_BANK_FEATURE.fallbackBankId, "legacy-v1");
  assert.equal(assertPracticeStageBankRouting(), true);
});

await test("完成バンクpayloadは練習専用runtime契約へ合格", async () => {
  const validation = validatePracticeStageBankPayload(finalBank);
  assert.equal(validation.valid, true, validation.problems.join("; "));
  assert.equal(finalBank.runtimeEnabled, true);
  assert.equal(finalBank.rankingEligible, false);
  assert.equal(finalBank.status, "active-practice-only");
  assert.equal(finalBank.stageCount, 84);
});

await test("成功時は完成84問を返す", async () => {
  const result = await loadPracticeStageBank({
    fetchImpl: async () => response(finalBank),
  });
  assert.equal(result.bankId, ACTIVE_PRACTICE_STAGE_BANK_ID);
  assert.equal(result.fallback, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.stages.length, 84);
  assert.ok(result.stages.every((stage) => stage.id.startsWith("STG-")));
});

await test("feature gate無効時はfetchせず旧30問へ戻る", async () => {
  let fetchCount = 0;
  const result = await loadPracticeStageBank({
    feature: { ...PRACTICE_STAGE_BANK_FEATURE, enabled: false },
    fetchImpl: async () => {
      fetchCount++;
      return response(finalBank);
    },
  });
  assert.equal(fetchCount, 0);
  assert.equal(result.bankId, "legacy-v1");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "feature-disabled");
  assert.equal(result.stages, STAGES);
});

await test("HTTP失敗・不正bank・通信例外は旧30問へフォールバック", async () => {
  const cases = [
    [async () => response({}, { ok: false }), "http-error"],
    [async () => response({ ...finalBank, stageCount: 83 }), "invalid-bank"],
    [async () => { throw new Error("offline"); }, "network-error"],
  ];
  for (const [fetchImpl, reason] of cases) {
    const result = await loadPracticeStageBank({ fetchImpl });
    assert.equal(result.bankId, "legacy-v1");
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackReason, reason);
    assert.equal(result.stages, STAGES);
  }
});

await test("完成bankを注入した練習セッションは難易度1→2→3", async () => {
  const session = new GameSession("A", () => 0.42, {
    mode: GAME_MODE.PRACTICE,
    playId: "practice-final",
    practiceStageBank: finalBank.stages,
    practiceStageBankId: finalBank.id,
    practiceStageBankFallback: false,
  });
  assert.equal(session.stageBankId, finalBank.id);
  assert.equal(session.stageBankFallback, false);
  assert.deepEqual(session.stages.map((stage) => stage.difficulty), [1, 2, 3]);
  assert.ok(session.stages.every((stage) => stage.id.startsWith("STG-")));
  assert.equal(new Set(session.stages.map((stage) => stage.id)).size, 3);
  assert.equal(new Set(session.stages.map(solutionSignature)).size, 3);
});

await test("公式セッションは練習bankを渡しても固定3問", async () => {
  const session = new GameSession("A", () => 0.42, {
    mode: GAME_MODE.OFFICIAL,
    playId: "official-isolated",
    practiceStageBank: finalBank.stages,
    practiceStageBankId: finalBank.id,
  });
  assert.equal(session.stageBankId, "legacy-v1");
  assert.deepEqual(session.stages.map((stage) => stage.id), OFFICIAL_STAGE_IDS);
});

await test("完成bank descriptorは練習runtimeのみ有効", async () => {
  const descriptor = getStageBankDescriptor(ACTIVE_PRACTICE_STAGE_BANK_ID);
  assert.equal(descriptor.runtimeEnabled, true);
  assert.equal(descriptor.rankingEligible, false);
  assert.equal(descriptor.status, "active-practice-only");
  assert.equal(descriptor.stageCount, 84);
});

console.log(`\n==== PRACTICE STAGE BANK TEST: PASS=${pass} FAIL=0 ====`);
