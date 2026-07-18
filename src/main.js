/**
 * トマトオク 画面制御 (UI)
 *
 * home → countdown → playing → stageTransition → result を明示的に管理する。
 * 非同期処理は playId を照合し、古いプレイのコールバックを無効化する。
 */

import {
  GameSession,
  formatTime,
  computeScore,
  monotonicNow,
  N,
} from "./game.js";
import {
  submitScore,
  fetchRanking,
  resetSubmission,
  isConfigured,
} from "./ranking.js";
import { playTutorial, stopTutorial } from "./tutorial.js";

const PLAYER_KEY = "tomatoku.playerName";
const GAME_URL = "https://chameleonjp.codeberg.page/tomatooku/";
const COUNTDOWN_STEPS = [
  { label: "3", durationMs: 650 },
  { label: "2", durationMs: 650 },
  { label: "1", durationMs: 650 },
  { label: "スタート", durationMs: 420 },
];

const PHASE = Object.freeze({
  HOME: "home",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  STAGE_TRANSITION: "stageTransition",
  RESULT: "result",
  RETIRED: "retired",
});

const $ = (sel) => document.querySelector(sel);

let phase = PHASE.HOME;
let session = null;
let activePlayId = null;
let cells = [];

let timerRafId = null;
let countdownRafId = null;
let countdownTimerIds = [];
let transitionTimerId = null;
let toastTimerId = null;
let lastHudPaintAt = 0;

function gameUrl() {
  try {
    const current = location.origin + location.pathname;
    return current.startsWith("http") ? current : GAME_URL;
  } catch (_) {
    return GAME_URL;
  }
}

function phaseScreenId(nextPhase) {
  if (nextPhase === PHASE.HOME || nextPhase === PHASE.RETIRED) {
    return "screen-home";
  }
  if (nextPhase === PHASE.COUNTDOWN) return "screen-countdown";
  if (
    nextPhase === PHASE.PLAYING ||
    nextPhase === PHASE.STAGE_TRANSITION
  ) {
    return "screen-game";
  }
  if (nextPhase === PHASE.RESULT) return "screen-result";
  return "screen-home";
}

function setPhase(nextPhase) {
  phase = nextPhase;
  const activeId = phaseScreenId(nextPhase);
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === activeId);
  });

  const board = $("#board");
  if (board) {
    board.setAttribute(
      "aria-busy",
      nextPhase === PHASE.STAGE_TRANSITION ? "true" : "false"
    );
  }
  updateHintButton();
  window.scrollTo(0, 0);
}

function isActivePlay(playId) {
  return Boolean(
    playId &&
      session &&
      activePlayId === playId &&
      session.playId === playId
  );
}

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_KEY) || "";
  } catch (_) {
    return "";
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_KEY, name);
  } catch (_) {
    // 保存不可でもゲームは続行する。
  }
}

function initHome() {
  const input = $("#player-name");
  input.value = loadPlayerName();

  $("#start-btn").addEventListener("click", onStart);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) onStart();
  });

  $("#home-share-btn").addEventListener("click", () => {
    shareText(`「トマトオク」5×5に🍅を置くパズル!\n${gameUrl()}`);
  });

  $("#howto-btn").addEventListener("click", () => {
    openModal("howto-modal");
  });
  $("#tutorial-btn").addEventListener("click", openTutorial);
  $("#howto-to-tutorial").addEventListener("click", () => {
    closeModal("howto-modal");
    openTutorial();
  });
  $("#tutorial-replay").addEventListener("click", playTutorial);
  $("#countdown-cancel-btn").addEventListener("click", () => {
    cancelActivePlay({ goHome: true });
  });

  initModals();
  loadRankingInto("#home-ranking");
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  if (id === "tutorial-modal") stopTutorial();
}

function openTutorial() {
  openModal("tutorial-modal");
  playTutorial();
}

function initModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal(modal.id));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal.open").forEach((modal) => {
      closeModal(modal.id);
    });
  });
}

function onStart() {
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
  beginCountdown(name);
}

function clearCountdownWork() {
  countdownTimerIds.forEach((id) => clearTimeout(id));
  countdownTimerIds = [];
  if (countdownRafId != null) {
    cancelAnimationFrame(countdownRafId);
    countdownRafId = null;
  }
}

function clearTransitionWork() {
  if (transitionTimerId != null) {
    clearTimeout(transitionTimerId);
    transitionTimerId = null;
  }
}

function stopTimer() {
  if (timerRafId != null) {
    cancelAnimationFrame(timerRafId);
    timerRafId = null;
  }
  lastHudPaintAt = 0;
}

function clearAsyncWork() {
  clearCountdownWork();
  clearTransitionWork();
  stopTimer();

  if (toastTimerId != null) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
  const toast = $("#toast");
  if (toast) toast.classList.remove("show");
}

function cancelActivePlay({ goHome = true } = {}) {
  clearAsyncWork();

  if (session) session.retire();

  activePlayId = null;
  session = null;
  cells = [];

  const board = $("#board");
  if (board) {
    board.className = "board";
    board.innerHTML = "";
  }

  if (goHome) {
    setPhase(PHASE.RETIRED);
    $("#player-name").value = loadPlayerName();
    setPhase(PHASE.HOME);
    loadRankingInto("#home-ranking");
  }
}

function beginCountdown(name) {
  cancelActivePlay({ goHome: false });
  resetSubmission();

  session = new GameSession(name);
  activePlayId = session.playId;
  const playId = activePlayId;

  setPhase(PHASE.COUNTDOWN);
  runCountdown(playId);
}

function runCountdown(playId) {
  clearCountdownWork();

  let index = 0;
  const value = $("#countdown-value");

  const showNext = () => {
    if (!isActivePlay(playId) || phase !== PHASE.COUNTDOWN) return;

    const step = COUNTDOWN_STEPS[index];
    if (!step) {
      prepareFirstStage(playId);
      return;
    }

    value.textContent = step.label;
    index++;

    const timerId = setTimeout(showNext, step.durationMs);
    countdownTimerIds.push(timerId);
  };

  showNext();
}

function prepareFirstStage(playId) {
  clearCountdownWork();
  if (!isActivePlay(playId) || phase !== PHASE.COUNTDOWN) return;

  buildBoard();
  renderBoard();
  updateHud(monotonicNow());
  setPhase(PHASE.STAGE_TRANSITION);

  countdownRafId = requestAnimationFrame(() => {
    countdownRafId = null;
    if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;

    session.startStage(monotonicNow());
    setPhase(PHASE.PLAYING);
    setBoardInputEnabled(true);
    startTimer(playId);
    updateHud(monotonicNow());
  });
}

function buildBoard() {
  if (!session) return;

  const board = $("#board");
  board.className = "board";
  board.innerHTML = "";
  cells = [];

  const state = session.current;
  for (let r = 0; r < N; r++) {
    cells[r] = [];
    for (let c = 0; c < N; c++) {
      const cell = document.createElement("button");
      cell.type = "button";

      const area = state.stage.regions[r][c];
      const regions = state.stage.regions;
      cell.className = `cell area-${area}`;

      if (r === 0 || regions[r - 1][c] !== area) cell.classList.add("edge-top");
      if (r === N - 1 || regions[r + 1][c] !== area) cell.classList.add("edge-bottom");
      if (c === 0 || regions[r][c - 1] !== area) cell.classList.add("edge-left");
      if (c === N - 1 || regions[r][c + 1] !== area) cell.classList.add("edge-right");

      cell.setAttribute("aria-label", `${r + 1}行${c + 1}列 エリア${area}`);

      const tomato = document.createElement("span");
      tomato.className = "tomato";
      tomato.textContent = "🍅";
      tomato.setAttribute("aria-hidden", "true");
      cell.appendChild(tomato);

      cell.addEventListener("click", () => onCellTap(r, c));
      board.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function renderBoard() {
  if (!session) return;
  const state = session.current;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const filled = state.has(r, c);
      cells[r][c].classList.toggle("filled", filled);
      cells[r][c].setAttribute("aria-pressed", String(filled));
      cells[r][c].disabled = phase !== PHASE.PLAYING;
    }
  }
}

function setBoardInputEnabled(enabled) {
  cells.flat().forEach((cell) => {
    if (cell) cell.disabled = !enabled;
  });
}

function onCellTap(r, c) {
  if (phase !== PHASE.PLAYING || !session) return;

  const state = session.current;
  const result = state.tap(r, c);
  const cell = cells[r][c];

  if (result.type === "mistake") {
    session.mistakeCount++;
    flashMistake(cell);
    updateHud(monotonicNow());
    return;
  }

  cell.classList.remove("hinted");
  renderBoard();
  updateHud(monotonicNow());

  if (result.type === "place" && state.cleared) onStageClear();
}

function flashMistake(cell) {
  cell.classList.remove("mistake");
  void cell.offsetWidth;
  cell.classList.add("mistake");
  setTimeout(() => cell.classList.remove("mistake"), 360);
  vibrate(30);
}

function onHint() {
  if (phase !== PHASE.PLAYING || !session) return;

  const state = session.current;
  if (!state.canHint()) return;

  const placed = state.applyHint();
  session.hintCount++;
  renderBoard();
  updateHud(monotonicNow());

  if (placed) {
    const [r, c] = placed;
    cells[r][c].classList.add("hinted");
  }

  updateHintButton();
  if (state.cleared) onStageClear();
}

function updateHintButton() {
  const button = $("#hint-btn");
  if (!button) return;

  const canUse =
    phase === PHASE.PLAYING &&
    session &&
    session.current &&
    session.current.canHint();

  button.disabled = !canUse;
}

function onStageClear() {
  if (phase !== PHASE.PLAYING || !session) return;

  const playId = session.playId;
  session.finishStage(monotonicNow());
  setPhase(PHASE.STAGE_TRANSITION);
  setBoardInputEnabled(false);
  stopTimer();
  updateHud(monotonicNow());

  $("#board").classList.add("cleared");
  vibrate([20, 40, 30]);

  const lastStage = session.isLastStage();
  showToast(lastStage ? "全ステージクリア!" : "ステージクリア!");

  clearTransitionWork();
  transitionTimerId = setTimeout(() => {
    transitionTimerId = null;
    if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;

    $("#board").classList.remove("cleared");
    const finished = session.advance(monotonicNow());

    if (finished) {
      goToResult(playId);
      return;
    }

    buildBoard();
    renderBoard();
    updateHud(monotonicNow());

    countdownRafId = requestAnimationFrame(() => {
      countdownRafId = null;
      if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;

      session.startStage(monotonicNow());
      setPhase(PHASE.PLAYING);
      setBoardInputEnabled(true);
      startTimer(playId);
      updateHud(monotonicNow());
    });
  }, 850);
}

function updateHud(now = monotonicNow()) {
  if (!session) return;

  $("#hud-stage").textContent = `${session.stageNumber}/${session.totalStages}`;
  $("#hud-time").textContent = formatTime(session.elapsedMs(now));
  $("#hud-score").textContent = session.score(now).toLocaleString();
  $("#hud-mistakes").textContent = String(session.mistakeCount);
  $("#hud-hints").textContent = String(session.hintCount);
  updateHintButton();
}

function startTimer(playId) {
  stopTimer();

  const tick = (frameTime) => {
    if (!isActivePlay(playId) || phase !== PHASE.PLAYING || !session) {
      timerRafId = null;
      return;
    }

    if (frameTime - lastHudPaintAt >= 80) {
      lastHudPaintAt = frameTime;
      updateHud(monotonicNow());
    }

    timerRafId = requestAnimationFrame(tick);
  };

  timerRafId = requestAnimationFrame(tick);
}

function goToResult(playId) {
  if (!isActivePlay(playId) || !session) return;

  clearAsyncWork();
  const completedSession = session;
  const elapsedMs = completedSession.elapsedMs(monotonicNow());
  const finalScore = computeScore({
    elapsedMs,
    mistakeCount: completedSession.mistakeCount,
    hintCount: completedSession.hintCount,
  });

  $("#result-score").textContent = finalScore.toLocaleString();
  $("#result-time").textContent = formatTime(elapsedMs);
  $("#result-mistakes").textContent = String(completedSession.mistakeCount);
  $("#result-hints").textContent = String(completedSession.hintCount);
  $("#result-stages").textContent = `${completedSession.totalStages}/${completedSession.totalStages}`;

  setPhase(PHASE.RESULT);

  const stateElement = $("#submit-state");
  stateElement.className = "submit-state skipped";
  stateElement.textContent = "公式3問の実装までランキング送信を停止しています";

  submitScore({
    playId,
    mode: completedSession.mode,
    playerName: completedSession.playerName,
    score: finalScore,
  }).then((result) => {
    if (
      !isActivePlay(playId) ||
      session !== completedSession ||
      phase !== PHASE.RESULT
    ) {
      return;
    }

    applySubmitResult(stateElement, result);
    loadRankingInto("#result-ranking");
  });

  const shareMessage =
    `トマトオクで ${finalScore.toLocaleString()}pt!` +
    ` ⏱${formatTime(elapsedMs)}` +
    ` / 誤タップ${completedSession.mistakeCount}` +
    ` / ヒント${completedSession.hintCount}\n` +
    gameUrl();

  $("#result-share-btn").onclick = () => shareText(shareMessage);
}

function applySubmitResult(stateElement, result) {
  if (result.status === "ok") {
    stateElement.className = "submit-state ok";
    const parts = [result.message];

    if (result.bestScore != null) parts.push(`ベスト ${Number(result.bestScore).toLocaleString()}`);
    if (result.firstScore != null) parts.push(`初回 ${Number(result.firstScore).toLocaleString()}`);

    stateElement.textContent = parts.join(" / ");
    return;
  }

  stateElement.className =
    result.status === "error" ? "submit-state error" : "submit-state skipped";
  stateElement.textContent = result.message;
}

async function loadRankingInto(selector) {
  const box = $(selector);
  if (!box) return;

  if (!isConfigured()) {
    box.innerHTML = `<div class="rank-empty">ランキングは未設定です</div>`;
    return;
  }

  box.innerHTML = `<div class="rank-empty">読み込み中…</div>`;
  const rows = await fetchRanking(10);

  if (!rows.length) {
    box.innerHTML = `<div class="rank-empty">まだランキングがありません</div>`;
    return;
  }

  box.innerHTML = rows
    .map((row) => {
      const first =
        row.firstScore != null
          ? `<span class="first">初回 ${Number(row.firstScore).toLocaleString()}</span>`
          : "";

      return `
        <div class="rank-row">
          <span class="pos">${escapeHtml(row.rank)}</span>
          <span class="name">${escapeHtml(row.playerName)}${first}</span>
          <span class="sc">${Number(row.bestScore).toLocaleString()}pt</span>
        </div>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text, title: "トマトオク" });
      return;
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("シェア文をコピーしました");
  } catch (_) {
    showToast("シェア文をコピーできませんでした");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimerId != null) clearTimeout(toastTimerId);
  toastTimerId = setTimeout(() => {
    toast.classList.remove("show");
    toastTimerId = null;
  }, 1200);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {
    // 非対応端末は無視する。
  }
}

function initGameControls() {
  $("#hint-btn").addEventListener("click", onHint);
  $("#quit-btn").addEventListener("click", () => {
    if (confirm("ホームに戻りますか?(現在のプレイは記録されません)")) {
      cancelActivePlay({ goHome: true });
    }
  });
}

function initResultControls() {
  $("#again-btn").addEventListener("click", () => {
    const name = (session && session.playerName) || loadPlayerName();
    beginCountdown(name);
  });

  $("#home-btn").addEventListener("click", () => {
    cancelActivePlay({ goHome: true });
  });
}

function boot() {
  try {
    initHome();
    initGameControls();
    initResultControls();
    setPhase(PHASE.HOME);
  } catch (error) {
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.textContent = "初期化に失敗しました。ページを再読み込みしてください。";
    document.body.prepend(banner);
    console.error(error);
  }
}

let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".board")) event.preventDefault();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
