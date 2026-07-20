import json
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"{label} anchor not found in {path}")
    file.write_text(text.replace(old, new, 1))


# game.js: allow a runtime-provided practice bank while preserving official STAGES.
replace_once(
    "src/game.js",
    """export function buildPracticeStageSets(stageBank = STAGES) {
  const groups = stagesByDifficulty(stageBank);
""",
    """export function buildPracticeStageSets(stageBank = STAGES) {
  if (!Array.isArray(stageBank)) {
    throw new TypeError("練習ステージバンクは配列である必要があります");
  }
  const groups = stagesByDifficulty(stageBank);
""",
    "game practice bank type",
)
replace_once(
    "src/game.js",
    """const PRACTICE_STAGE_SETS = buildPracticeStageSets();

export function selectPracticeStages(rand = Math.random) {
  const value = Number(rand());
  const normalized = Number.isFinite(value)
    ? Math.min(0.999999999999, Math.max(0, value))
    : 0;
  return PRACTICE_STAGE_SETS[Math.floor(normalized * PRACTICE_STAGE_SETS.length)];
}

/** v1呼び出し名の互換。 */
export function pickStages(rand = Math.random) {
  return selectPracticeStages(rand);
}
""",
    """const LEGACY_PRACTICE_STAGE_SETS = buildPracticeStageSets();
const PRACTICE_STAGE_SET_CACHE = new WeakMap();

function practiceStageSetsFor(stageBank) {
  if (stageBank === STAGES) return LEGACY_PRACTICE_STAGE_SETS;
  if (!Array.isArray(stageBank)) {
    throw new TypeError("練習ステージバンクは配列である必要があります");
  }
  let sets = PRACTICE_STAGE_SET_CACHE.get(stageBank);
  if (!sets) {
    sets = buildPracticeStageSets(stageBank);
    PRACTICE_STAGE_SET_CACHE.set(stageBank, sets);
  }
  return sets;
}

export function selectPracticeStages(rand = Math.random, stageBank = STAGES) {
  const sets = practiceStageSetsFor(stageBank);
  const value = Number(rand());
  const normalized = Number.isFinite(value)
    ? Math.min(0.999999999999, Math.max(0, value))
    : 0;
  return sets[Math.floor(normalized * sets.length)];
}

/** v1呼び出し名の互換。 */
export function pickStages(rand = Math.random, stageBank = STAGES) {
  return selectPracticeStages(rand, stageBank);
}
""",
    "game practice set cache",
)
replace_once(
    "src/game.js",
    """    this.stages =
      this.mode === GAME_MODE.OFFICIAL
        ? selectOfficialStages(options.officialStageIds)
        : selectPracticeStages(rand);
""",
    """    this.practiceStageBank =
      this.mode === GAME_MODE.PRACTICE
        ? options.practiceStageBank || STAGES
        : null;
    this.stageBankId =
      this.mode === GAME_MODE.OFFICIAL
        ? "legacy-v1"
        : String(options.practiceStageBankId || "legacy-v1");
    this.stageBankFallback =
      this.mode === GAME_MODE.PRACTICE &&
      Boolean(options.practiceStageBankFallback);
    this.stages =
      this.mode === GAME_MODE.OFFICIAL
        ? selectOfficialStages(options.officialStageIds)
        : selectPracticeStages(rand, this.practiceStageBank);
""",
    "game session practice injection",
)

# main.js: lazy-load only for practice and expose bank routing on the board.
replace_once(
    "src/main.js",
    """import { playTutorial, stopTutorial } from "./tutorial.js";
""",
    """import { playTutorial, stopTutorial } from "./tutorial.js";
import { loadPracticeStageBank } from "./practice-stage-bank.js";
""",
    "main loader import",
)
replace_once(
    "src/main.js",
    """let lastHudPaintAt = 0;
""",
    """let lastHudPaintAt = 0;
let practiceStageBankPromise = null;
let startInFlight = false;
""",
    "main loader state",
)
replace_once(
    "src/main.js",
    """  $("#start-official-btn").addEventListener("click", () => {
    onStart(GAME_MODE.OFFICIAL);
  });
  $("#start-practice-btn").addEventListener("click", () => {
    onStart(GAME_MODE.PRACTICE);
  });
""",
    """  $("#start-official-btn").addEventListener("click", () => {
    void onStart(GAME_MODE.OFFICIAL);
  });
  $("#start-practice-btn").addEventListener("click", () => {
    void onStart(GAME_MODE.PRACTICE);
  });
""",
    "main start listeners",
)
replace_once(
    "src/main.js",
    """      onStart(GAME_MODE.OFFICIAL);
""",
    """      void onStart(GAME_MODE.OFFICIAL);
""",
    "main enter listener",
)
replace_once(
    "src/main.js",
    """function onStart(mode) {
  const input = $("#player-name");
  const name = input.value.trim();
  const error = $("#name-error");

  if (!name) {
    error.textContent = "プレイヤー名を入力してください";
    input.focus();
    return;
  }

  error.textContent = "";
  savePlayerName(name);
  beginCountdown(name, mode);
}
""",
    """function setStartButtonsDisabled(disabled) {
  const official = $("#start-official-btn");
  const practice = $("#start-practice-btn");
  if (official) official.disabled = disabled;
  if (practice) practice.disabled = disabled;
}

function ensurePracticeStageBank() {
  if (!practiceStageBankPromise) {
    practiceStageBankPromise = loadPracticeStageBank();
  }
  return practiceStageBankPromise;
}

async function startNamedGame(name, mode) {
  if (startInFlight) return;
  startInFlight = true;
  setStartButtonsDisabled(true);
  const error = $("#name-error");

  try {
    let practiceBank = null;
    if (mode === GAME_MODE.PRACTICE) {
      if (error) error.textContent = "練習問題を準備中…";
      practiceBank = await ensurePracticeStageBank();
    }
    if (error) error.textContent = "";
    beginCountdown(name, mode, practiceBank);
    if (practiceBank?.fallback) {
      setTimeout(() => showToast("従来の練習問題で開始します"), 0);
    }
  } finally {
    startInFlight = false;
    setStartButtonsDisabled(false);
  }
}

async function onStart(mode) {
  const input = $("#player-name");
  const name = input.value.trim();
  const error = $("#name-error");

  if (!name) {
    error.textContent = "プレイヤー名を入力してください";
    input.focus();
    return;
  }

  error.textContent = "";
  savePlayerName(name);
  await startNamedGame(name, mode);
}
""",
    "main async start",
)
replace_once(
    "src/main.js",
    """function beginCountdown(name, mode) {
  cancelActivePlay({ goHome: false });
  resetSubmission();

  session = new GameSession(name, Math.random, { mode });
""",
    """function beginCountdown(name, mode, practiceBank = null) {
  cancelActivePlay({ goHome: false });
  resetSubmission();

  session = new GameSession(name, Math.random, {
    mode,
    practiceStageBank: practiceBank?.stages,
    practiceStageBankId: practiceBank?.bankId,
    practiceStageBankFallback: practiceBank?.fallback,
  });
""",
    "main countdown injection",
)
replace_once(
    "src/main.js",
    """    delete board.dataset.mode;
""",
    """    delete board.dataset.mode;
    delete board.dataset.stageBankId;
    delete board.dataset.stageBankFallback;
""",
    "main clear bank dataset",
)
replace_once(
    "src/main.js",
    """  board.dataset.mode = session.mode;
  cells = [];
""",
    """  board.dataset.mode = session.mode;
  board.dataset.stageBankId = session.stageBankId;
  board.dataset.stageBankFallback = String(session.stageBankFallback);
  cells = [];
""",
    "main board bank dataset",
)
replace_once(
    "src/main.js",
    """    beginCountdown(name, mode);
""",
    """    void startNamedGame(name, mode);
""",
    "main replay loader",
)

# Update final bank test for practice-only activation.
replace_once(
    "scripts/variable-stage-final-bank.test.js",
    """import {
  ACTIVE_STAGE_BANK_ID,
  assertCandidateBankRemainsInactive,
  getStageBankDescriptor,
} from "../src/stage-bank-config.js";
""",
    """import {
  ACTIVE_PRACTICE_STAGE_BANK_ID,
  ACTIVE_STAGE_BANK_ID,
  assertCandidateBankRemainsInactive,
  assertPracticeStageBankRouting,
  getStageBankDescriptor,
} from "../src/stage-bank-config.js";
""",
    "final test imports",
)
replace_once(
    "scripts/variable-stage-final-bank.test.js",
    """  assert.equal(committed.runtimeEnabled, false);
""",
    """  assert.equal(committed.runtimeEnabled, true);
""",
    "final test runtime",
)
replace_once(
    "scripts/variable-stage-final-bank.test.js",
    """test("bank catalogは完成バンクを非稼働で登録", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "legacy-v1");
  const descriptor = getStageBankDescriptor(VARIABLE_FINAL_BANK_ID);
  assert.equal(descriptor.source, "generated/variable-stage-bank-v2.json");
  assert.equal(descriptor.stageCount, 84);
  assert.equal(descriptor.status, VARIABLE_FINAL_BANK_STATUS);
  assert.equal(descriptor.runtimeEnabled, false);
  assert.equal(descriptor.rankingEligible, false);
  assert.equal(assertCandidateBankRemainsInactive(), true);
});
""",
    """test("bank catalogは完成バンクを練習専用runtimeとして登録", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "legacy-v1");
  assert.equal(ACTIVE_PRACTICE_STAGE_BANK_ID, VARIABLE_FINAL_BANK_ID);
  const descriptor = getStageBankDescriptor(VARIABLE_FINAL_BANK_ID);
  assert.equal(descriptor.source, "generated/variable-stage-bank-v2.json");
  assert.equal(descriptor.stageCount, 84);
  assert.equal(descriptor.status, VARIABLE_FINAL_BANK_STATUS);
  assert.equal(descriptor.runtimeEnabled, true);
  assert.equal(descriptor.rankingEligible, false);
  assert.equal(assertCandidateBankRemainsInactive(), true);
  assert.equal(assertPracticeStageBankRouting(), true);
});
""",
    "final test catalog",
)

# package.json scripts.
package_path = Path("package.json")
package = json.loads(package_path.read_text())
scripts = package["scripts"]
scripts["test"] = scripts["test"].replace(
    "node scripts/variable-stage-final-bank.test.js &&",
    "node scripts/variable-stage-final-bank.test.js && node scripts/practice-stage-bank.test.js &&",
)
scripts["test:practice-stage-bank"] = "node scripts/practice-stage-bank.test.js"
scripts["e2e:practice-bank"] = "node scripts/practice-stage-bank.e2e.js"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

# CI: add the practice connection E2E after the existing review tool E2E.
replace_once(
    ".github/workflows/ci.yml",
    """      - name: Run review tool iPhone SE E2E
        run: npm run e2e:review
""",
    """      - name: Run review tool iPhone SE E2E
        run: npm run e2e:review

      - name: Run practice final bank iPhone SE E2E
        run: npm run e2e:practice-bank
""",
    "CI practice E2E",
)
