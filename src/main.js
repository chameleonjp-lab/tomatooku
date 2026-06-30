/**
 * トマトオク 画面制御 (UI)
 *
 * ホーム → ゲーム(3ステージ) → 結果 の3画面を切り替える。
 * 盤面操作・タイマー・スコア表示・ランキング送信をまとめる。
 */

import { GameSession, formatTime, computeScore, N } from "./game.js";
import {
  submitScore,
  fetchRanking,
  resetSubmission,
  isConfigured,
} from "./ranking.js";
import { playTutorial, stopTutorial } from "./tutorial.js";

const PLAYER_KEY = "tomatoku.playerName";
const AREA_LETTERS = ["A", "B", "C", "D", "E"];

// 結果シェアに必ず含めるゲームURL(クエリ等は除いた配信URL)
function gameUrl() {
  try {
    return location.origin + location.pathname;
  } catch (_) {
    return "https://chameleonjp-lab.github.io/tomatooku/";
  }
}

const $ = (sel) => document.querySelector(sel);

let session = null;
let rafId = null;
let cells = []; // cells[r][c] = element
let advancing = false; // クリア演出中の二重進行防止

// ---- 画面切り替え ---------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  window.scrollTo(0, 0);
}

// ---- localStorage(プレイヤー名のみ) -------------------------------------
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
    /* localStorage 不可でも続行 */
  }
}

// ---- ホーム ---------------------------------------------------------------
function initHome() {
  const input = $("#player-name");
  input.value = loadPlayerName();

  $("#start-btn").addEventListener("click", onStart);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onStart();
  });
  $("#home-share-btn").addEventListener("click", () =>
    shareText(`「トマトオク」5×5に🍅を置くパズル! ${gameUrl()}`)
  );

  // 遊び方 / チュートリアル
  $("#howto-btn").addEventListener("click", () => openModal("howto-modal"));
  $("#tutorial-btn").addEventListener("click", openTutorial);
  $("#howto-to-tutorial").addEventListener("click", () => {
    closeModal("howto-modal");
    openTutorial();
  });
  $("#tutorial-replay").addEventListener("click", playTutorial);

  initModals();

  loadRankingInto("#home-ranking");
}

// ---- モーダル -------------------------------------------------------------
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
  if (id === "tutorial-modal") stopTutorial();
}

function openTutorial() {
  openModal("tutorial-modal");
  playTutorial(); // 開くたびに最初から再生
}

/** data-close 属性を持つ要素・背景クリックで閉じる。Escでも閉じる。 */
function initModals() {
  document.querySelectorAll(".modal").forEach((m) => {
    m.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(m.id))
    );
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document
      .querySelectorAll(".modal.open")
      .forEach((m) => closeModal(m.id));
  });
}

function onStart() {
  const input = $("#player-name");
  const name = input.value.trim();
  const err = $("#name-error");
  if (!name) {
    err.textContent = "プレイヤー名を入力してください";
    input.focus();
    return;
  }
  err.textContent = "";
  savePlayerName(name);
  startGame(name);
}

// ---- ゲーム ---------------------------------------------------------------
function startGame(name) {
  resetSubmission(); // 新しいプレイの送信状態をリセット
  session = new GameSession(name);
  advancing = false;
  buildBoard();
  renderBoard();
  session.start();
  startTimer();
  updateHud();
  showScreen("screen-game");
}

function buildBoard() {
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
      const area = state.stage.regions[r][c]; // 'A'..'E'
      cell.className = `cell area-${area}`;
      cell.setAttribute("aria-label", `${r + 1}行${c + 1}列 エリア${area}`);
      const t = document.createElement("span");
      t.className = "tomato";
      t.textContent = "🍅";
      cell.appendChild(t);
      cell.addEventListener("click", () => onCellTap(r, c));
      board.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function renderBoard() {
  const state = session.current;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      cells[r][c].classList.toggle("filled", state.has(r, c));
    }
  }
}

function onCellTap(r, c) {
  if (advancing || !session) return;
  const state = session.current;
  const res = state.tap(r, c);
  const cell = cells[r][c];

  if (res.type === "mistake") {
    session.mistakeCount++;
    flashMistake(cell);
    updateHud();
    return;
  }

  // place / remove
  cells[r][c].classList.remove("hinted");
  renderBoard();
  updateHud();

  if (res.type === "place" && state.cleared) {
    onStageClear();
  }
}

function flashMistake(cell) {
  cell.classList.remove("mistake");
  // リフロー強制でアニメ再生
  void cell.offsetWidth;
  cell.classList.add("mistake");
  setTimeout(() => cell.classList.remove("mistake"), 360);
  vibrate(30);
}

function onHint() {
  if (advancing || !session) return;
  const state = session.current;
  if (!state.canHint()) return;
  const placed = state.applyHint();
  session.hintCount++;
  renderBoard();
  updateHud();
  if (placed) {
    const [r, c] = placed;
    cells[r][c].classList.add("hinted");
  }
  updateHintButton();
  if (state.cleared) onStageClear();
}

function updateHintButton() {
  const btn = $("#hint-btn");
  const can = session && session.current && session.current.canHint();
  btn.disabled = !can;
}

function onStageClear() {
  if (advancing) return;
  advancing = true;
  stopTimer();
  updateHud();
  $("#board").classList.add("cleared");
  vibrate([20, 40, 30]);

  const last = session.isLastStage();
  showToast(last ? "全ステージクリア!" : "ステージクリア!");

  setTimeout(() => {
    $("#board").classList.remove("cleared");
    const finished = session.advance();
    if (finished) {
      goToResult();
    } else {
      advancing = false;
      buildBoard();
      renderBoard();
      startTimer();
      updateHud();
      updateHintButton();
    }
  }, 850);
}

// ---- HUD / タイマー -------------------------------------------------------
function updateHud() {
  if (!session) return;
  $("#hud-stage").textContent = `${session.stageNumber}/${session.totalStages}`;
  $("#hud-time").textContent = formatTime(session.elapsedMs());
  $("#hud-score").textContent = session.score().toLocaleString();
  $("#hud-mistakes").textContent = String(session.mistakeCount);
  $("#hud-hints").textContent = String(session.hintCount);
  updateHintButton();
}

function startTimer() {
  stopTimer();
  const tick = () => {
    if (!session) return;
    $("#hud-time").textContent = formatTime(session.elapsedMs());
    $("#hud-score").textContent = session.score().toLocaleString();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
function stopTimer() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---- 結果 -----------------------------------------------------------------
function goToResult() {
  stopTimer();
  advancing = false;
  const elapsedMs = session.elapsedMs();
  const finalScore = computeScore({
    elapsedMs,
    mistakeCount: session.mistakeCount,
    hintCount: session.hintCount,
  });

  $("#result-score").textContent = finalScore.toLocaleString();
  $("#result-time").textContent = formatTime(elapsedMs);
  $("#result-mistakes").textContent = String(session.mistakeCount);
  $("#result-hints").textContent = String(session.hintCount);
  $("#result-stages").textContent = `${session.totalStages}/${session.totalStages}`;

  showScreen("screen-result");

  // ランキング送信は1プレイ1回だけ(ranking.js 側でも二重送信防止)
  const stateEl = $("#submit-state");
  if (!isConfigured()) {
    stateEl.className = "submit-state skipped";
    stateEl.textContent = "ランキング未設定のためローカル表示のみ";
  } else {
    stateEl.className = "submit-state pending";
    stateEl.textContent = "ランキングに送信中…";
  }

  submitScore({ playerName: session.playerName, score: finalScore }).then(
    (result) => {
      applySubmitResult(stateEl, result, finalScore);
      loadRankingInto("#result-ranking");
    }
  );

  // 結果シェア文(必ずゲームURLを含む)
  const shareMsg =
    `トマトオクで ${finalScore.toLocaleString()}pt!` +
    ` ⏱${formatTime(elapsedMs)} / 誤タップ${session.mistakeCount} / ヒント${session.hintCount}\n` +
    gameUrl();
  $("#result-share-btn").onclick = () => shareText(shareMsg);
}

function applySubmitResult(stateEl, result, finalScore) {
  if (result.status === "ok") {
    stateEl.className = "submit-state ok";
    const parts = [result.message];
    if (result.bestScore != null) {
      parts.push(`最高スコア ${Number(result.bestScore).toLocaleString()}pt`);
    }
    if (result.firstScore != null) {
      parts.push(`初回スコア ${Number(result.firstScore).toLocaleString()}pt`);
    }
    if (result.rank != null) parts.push(`現在 ${result.rank}位`);
    stateEl.textContent = parts.join(" / ");
  } else if (result.status === "error") {
    stateEl.className = "submit-state error";
    stateEl.textContent = result.message;
  } else {
    stateEl.className = "submit-state skipped";
    stateEl.textContent = result.message;
  }
}

// ---- ランキング表示 -------------------------------------------------------
async function loadRankingInto(sel) {
  const box = $(sel);
  if (!box) return;
  if (!isConfigured()) {
    box.innerHTML = `<div class="rank-empty">ランキングは未設定です(docs/SUPABASE_SETUP.md 参照)</div>`;
    return;
  }
  box.innerHTML = `<div class="rank-empty">読み込み中…</div>`;
  const rows = await fetchRanking(10);
  if (!rows.length) {
    box.innerHTML = `<div class="rank-empty">まだランキングがありません</div>`;
    return;
  }
  box.innerHTML = rows
    .map(
      (r) => `
      <div class="rank-row">
        <span class="pos">${r.rank}</span>
        <span class="name">${escapeHtml(r.playerName)}</span>
        <span class="sc">${Number(r.bestScore).toLocaleString()}pt</span>
      </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- 共有 -----------------------------------------------------------------
async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text, url: gameUrl(), title: "トマトオク" });
      return;
    }
  } catch (_) {
    /* キャンセル等は無視 */
  }
  // フォールバック: クリップボードへコピー
  try {
    await navigator.clipboard.writeText(text);
    showToast("シェア文をコピーしました");
  } catch (_) {
    // 最終フォールバック: Twitter インテント
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  }
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1200);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {
    /* 非対応端末は無視 */
  }
}

// ---- ゲーム中ボタン -------------------------------------------------------
function initGameControls() {
  $("#hint-btn").addEventListener("click", onHint);
  $("#quit-btn").addEventListener("click", () => {
    if (confirm("ホームに戻りますか?(現在のプレイは記録されません)")) {
      stopTimer();
      session = null;
      showScreen("screen-home");
      loadRankingInto("#home-ranking");
    }
  });
}

function initResultControls() {
  $("#again-btn").addEventListener("click", () => {
    const name = (session && session.playerName) || loadPlayerName();
    startGame(name);
  });
  $("#home-btn").addEventListener("click", () => {
    session = null;
    showScreen("screen-home");
    $("#player-name").value = loadPlayerName();
    loadRankingInto("#home-ranking");
  });
}

// ---- 起動 -----------------------------------------------------------------
function boot() {
  try {
    initHome();
    initGameControls();
    initResultControls();
    showScreen("screen-home");
  } catch (err) {
    // 白画面を避け、最低限のエラー表示を出す
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.textContent =
      "初期化に失敗しました。ページを再読み込みしてください。";
    document.body.prepend(banner);
    // コンソールには詳細を出す
    console.error(err);
  }
}

// ズーム抑制(ダブルタップ): touchend の間隔を見て preventDefault
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);
// 長押しコンテキストメニュー抑制(盤面)
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".board")) e.preventDefault();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
