const MANIFEST_URL = "../generated/variable-stage-candidate-pool-v2.json";
const STORAGE_KEY = "tomatooku.variableStageReview.v1";
const REVIEW_SCHEMA_VERSION = 1;
const BOARD_SIZE = 5;
const LABELS = ["A", "B", "C", "D", "E"];
const VALID_DECISIONS = new Set(["keep", "reject", "hold"]);
const DECISION_LABELS = {
  keep: "採用",
  reject: "除外",
  hold: "保留",
  unreviewed: "未判断",
};
const TRANSFORM_LABELS = {
  identity: "変換なし",
  rotate90: "90度回転",
  rotate180: "180度回転",
  rotate270: "270度回転",
  mirrorLeftRight: "左右反転",
  mirrorUpDown: "上下反転",
  mirrorMainDiagonal: "主対角線反転",
  mirrorAntiDiagonal: "反対角線反転",
};
const TRANSFORM_NAMES = Object.keys(TRANSFORM_LABELS);

const $ = (id) => document.getElementById(id);
const elements = {
  app: $("review-app"),
  loadState: $("load-state"),
  summaryTotal: $("summary-total"),
  summaryReviewed: $("summary-reviewed"),
  summaryKeep: $("summary-keep"),
  summaryReject: $("summary-reject"),
  summaryHold: $("summary-hold"),
  progress: $("review-progress"),
  filterStatus: $("filter-status"),
  filterDistance: $("filter-distance"),
  filterDifficulty: $("filter-difficulty"),
  filterClass: $("filter-class"),
  filterProfile: $("filter-profile"),
  filterSearch: $("filter-search"),
  sortOrder: $("sort-order"),
  resetFilters: $("reset-filters"),
  nextUnreviewed: $("next-unreviewed"),
  previousStage: $("previous-stage"),
  nextStage: $("next-stage"),
  positionLabel: $("position-label"),
  filteredLabel: $("filtered-label"),
  emptyState: $("empty-state"),
  comparison: $("comparison"),
  toggleSolution: $("toggle-solution"),
  currentTitle: $("current-stage-title"),
  neighborTitle: $("neighbor-stage-title"),
  currentDecision: $("current-decision"),
  distanceChip: $("distance-chip"),
  currentBoard: $("current-board"),
  neighborBoard: $("neighbor-board"),
  currentMetadata: $("current-metadata"),
  neighborMetadata: $("neighbor-metadata"),
  differenceSummary: $("difference-summary"),
  decisionReason: $("decision-reason"),
  decisionNote: $("decision-note"),
  clearDecision: $("clear-decision"),
  saveState: $("save-state"),
  exportReview: $("export-review"),
  importReview: $("import-review"),
  clearAllReviews: $("clear-all-reviews"),
  transferState: $("transfer-state"),
};

const state = {
  manifest: null,
  stages: [],
  stageById: new Map(),
  nearestById: new Map(),
  filteredStages: [],
  currentIndex: 0,
  reviews: loadReviews(),
};

function emptyReviewState() {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    manifestGeneratorVersion: null,
    updatedAt: null,
    decisions: {},
  };
}

function loadReviews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || parsed.schemaVersion !== REVIEW_SCHEMA_VERSION || typeof parsed.decisions !== "object") {
      return emptyReviewState();
    }
    return {
      ...emptyReviewState(),
      ...parsed,
      decisions: parsed.decisions || {},
    };
  } catch (error) {
    console.warn("review state could not be loaded", error);
    return emptyReviewState();
  }
}

function persistReviews(message = "端末内へ保存しました") {
  state.reviews.updatedAt = new Date().toISOString();
  state.reviews.manifestGeneratorVersion = state.manifest?.generatorVersion || null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reviews));
    elements.saveState.textContent = message;
  } catch (error) {
    elements.saveState.textContent = "保存できませんでした。ブラウザの保存設定を確認してください。";
    console.error(error);
  }
  renderSummary();
}

function normalizeLabels(rows) {
  const mapping = new Map();
  let next = 0;
  return rows.map((row) =>
    [...row]
      .map((label) => {
        if (!mapping.has(label)) mapping.set(label, LABELS[next++]);
        return mapping.get(label);
      })
      .join("")
  );
}

function transformCell(row, col, transformName) {
  const last = BOARD_SIZE - 1;
  switch (transformName) {
    case "identity": return [row, col];
    case "rotate90": return [col, last - row];
    case "rotate180": return [last - row, last - col];
    case "rotate270": return [last - col, row];
    case "mirrorLeftRight": return [row, last - col];
    case "mirrorUpDown": return [last - row, col];
    case "mirrorMainDiagonal": return [col, row];
    case "mirrorAntiDiagonal": return [last - col, last - row];
    default: throw new RangeError(`unknown transform: ${transformName}`);
  }
}

function transformRegions(rows, transformName) {
  const output = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE));
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const [nextRow, nextCol] = transformCell(row, col, transformName);
      output[nextRow][nextCol] = rows[row][col];
    }
  }
  return output.map((row) => row.join(""));
}

function transformSolution(solution, transformName) {
  return solution
    .map(([row, col]) => transformCell(row, col, transformName))
    .sort((left, right) => left[0] - right[0]);
}

function signatureDistance(leftRows, rightRows) {
  const left = leftRows.join("");
  const right = rightRows.join("");
  let distance = 0;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) distance++;
  }
  return distance;
}

function alignNeighbor(currentStage, neighborStage) {
  const currentRows = currentStage.canonicalSignature.split("|");
  let best = null;
  for (const transformName of TRANSFORM_NAMES) {
    const rows = normalizeLabels(transformRegions(neighborStage.regions, transformName));
    const distance = signatureDistance(currentRows, rows);
    const signature = rows.join("|");
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && signature < best.signature)
    ) {
      best = {
        distance,
        transformName,
        signature,
        regions: rows,
        solution: transformSolution(neighborStage.solution, transformName),
      };
    }
  }
  return best;
}

function computeNearestStages() {
  const mismatches = [];
  for (const stage of state.stages) {
    let nearest = null;
    for (const other of state.stages) {
      if (other.id === stage.id) continue;
      const alignment = alignNeighbor(stage, other);
      if (
        !nearest ||
        alignment.distance < nearest.distance ||
        (alignment.distance === nearest.distance && other.id < nearest.stage.id)
      ) {
        nearest = { stage: other, ...alignment };
      }
    }
    state.nearestById.set(stage.id, nearest);
    const recorded = state.manifest.metadata?.[stage.id]?.nearestStructuralDistance;
    if (recorded !== nearest.distance) {
      mismatches.push(`${stage.id}: manifest=${recorded}, review=${nearest.distance}`);
    }
  }
  if (mismatches.length) {
    console.warn("nearest distance mismatch", mismatches);
  }
  return mismatches.length;
}

function reviewFor(id) {
  const value = state.reviews.decisions[id];
  return value && VALID_DECISIONS.has(value.status) ? value : null;
}

function reviewStatus(id) {
  return reviewFor(id)?.status || "unreviewed";
}

function metadataFor(stage) {
  return state.manifest.metadata?.[stage.id] || {};
}

function populateSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function populateFilters() {
  populateSelect(
    elements.filterClass,
    [...new Set(state.stages.map((stage) => metadataFor(stage).symmetryClassId))].sort()
  );
  populateSelect(
    elements.filterProfile,
    [...new Set(state.stages.map((stage) => metadataFor(stage).regionProfile))].sort()
  );
}

function matchesFilters(stage) {
  const metadata = metadataFor(stage);
  const nearest = state.nearestById.get(stage.id);
  const status = reviewStatus(stage.id);
  const search = elements.filterSearch.value.trim().toLowerCase();
  if (elements.filterStatus.value !== "all" && elements.filterStatus.value !== status) return false;
  if (elements.filterDifficulty.value !== "all" && String(stage.difficulty) !== elements.filterDifficulty.value) return false;
  if (elements.filterClass.value !== "all" && metadata.symmetryClassId !== elements.filterClass.value) return false;
  if (elements.filterProfile.value !== "all" && metadata.regionProfile !== elements.filterProfile.value) return false;
  if (elements.filterDistance.value === "1" && nearest.distance !== 1) return false;
  if (elements.filterDistance.value === "2" && nearest.distance !== 2) return false;
  if (elements.filterDistance.value === "3+" && nearest.distance < 3) return false;
  if (search && !stage.id.toLowerCase().includes(search)) return false;
  return true;
}

function sortFiltered(stages) {
  const order = elements.sortOrder.value;
  return stages.sort((left, right) => {
    if (order === "difficulty") {
      return left.difficulty - right.difficulty ||
        metadataFor(left).difficulty.score - metadataFor(right).difficulty.score ||
        left.id.localeCompare(right.id);
    }
    if (order === "id") return left.id.localeCompare(right.id);
    return state.nearestById.get(left.id).distance - state.nearestById.get(right.id).distance ||
      left.difficulty - right.difficulty || left.id.localeCompare(right.id);
  });
}

function applyFilters({ preserveId = true } = {}) {
  const previousId = preserveId ? state.filteredStages[state.currentIndex]?.id : null;
  state.filteredStages = sortFiltered(state.stages.filter(matchesFilters));
  const restoredIndex = previousId
    ? state.filteredStages.findIndex((stage) => stage.id === previousId)
    : -1;
  state.currentIndex = restoredIndex >= 0 ? restoredIndex : 0;
  renderCurrent();
}

function renderSummary() {
  const counts = { keep: 0, reject: 0, hold: 0 };
  for (const stage of state.stages) {
    const status = reviewStatus(stage.id);
    if (counts[status] !== undefined) counts[status]++;
  }
  const reviewed = counts.keep + counts.reject + counts.hold;
  elements.summaryTotal.textContent = String(state.stages.length);
  elements.summaryReviewed.textContent = String(reviewed);
  elements.summaryKeep.textContent = String(counts.keep);
  elements.summaryReject.textContent = String(counts.reject);
  elements.summaryHold.textContent = String(counts.hold);
  elements.progress.max = state.stages.length || 1;
  elements.progress.value = reviewed;
  elements.progress.textContent = `${reviewed} / ${state.stages.length}`;
}

function createMetadataList(entries) {
  const fragment = document.createDocumentFragment();
  for (const [term, description] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = String(description);
    fragment.append(dt, dd);
  }
  return fragment;
}

function solutionSet(solution) {
  return new Set(solution.map(([row, col]) => `${row},${col}`));
}

function renderBoard(container, regions, solution, changedIndexes, label) {
  container.replaceChildren();
  container.setAttribute("aria-label", label);
  const tomatoes = solutionSet(solution);
  const showSolution = elements.toggleSolution.checked;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const index = row * BOARD_SIZE + col;
      const cell = document.createElement("div");
      cell.className = "review-cell";
      if (changedIndexes.has(index)) cell.classList.add("changed");
      cell.dataset.region = regions[row][col];
      cell.setAttribute(
        "aria-label",
        `${row + 1}行${col + 1}列 エリア${regions[row][col]}${tomatoes.has(`${row},${col}`) ? " 正解" : ""}${changedIndexes.has(index) ? " 差分" : ""}`
      );
      const coordinate = document.createElement("span");
      coordinate.className = "coordinate";
      coordinate.textContent = `${row + 1},${col + 1}`;
      cell.append(coordinate);
      if (showSolution && tomatoes.has(`${row},${col}`)) {
        const tomato = document.createElement("span");
        tomato.className = "tomato";
        tomato.textContent = "🍅";
        tomato.setAttribute("aria-hidden", "true");
        cell.append(tomato);
      }
      container.append(cell);
    }
  }
}

function decisionLabel(status) {
  return DECISION_LABELS[status] || DECISION_LABELS.unreviewed;
}

function renderDecision(stage) {
  const review = reviewFor(stage.id);
  const status = review?.status || "unreviewed";
  elements.currentDecision.textContent = decisionLabel(status);
  elements.currentDecision.dataset.status = status;
  elements.decisionReason.value = review?.reason || "";
  elements.decisionNote.value = review?.note || "";
  elements.clearDecision.disabled = !review;
  for (const button of document.querySelectorAll("[data-decision]")) {
    button.classList.toggle("active", button.dataset.decision === status);
    button.setAttribute("aria-pressed", String(button.dataset.decision === status));
  }
}

function setQueryStage(id) {
  const url = new URL(location.href);
  url.searchParams.set("stage", id);
  history.replaceState(null, "", url);
}

function renderCurrent() {
  const count = state.filteredStages.length;
  elements.filteredLabel.textContent = `表示対象 ${count}問`;
  elements.positionLabel.textContent = count ? `${state.currentIndex + 1} / ${count}` : "0 / 0";
  elements.previousStage.disabled = count <= 1;
  elements.nextStage.disabled = count <= 1;
  elements.emptyState.hidden = count > 0;
  elements.comparison.hidden = count === 0;
  if (!count) return;

  const stage = state.filteredStages[state.currentIndex];
  const nearest = state.nearestById.get(stage.id);
  const currentRows = stage.canonicalSignature.split("|");
  const changed = new Set();
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index++) {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    if (currentRows[row][col] !== nearest.regions[row][col]) changed.add(index);
  }

  elements.currentTitle.textContent = stage.id;
  elements.neighborTitle.textContent = nearest.stage.id;
  elements.distanceChip.textContent = `距離 ${nearest.distance}`;
  renderBoard(
    elements.currentBoard,
    currentRows,
    stage.solution,
    changed,
    `${stage.id}。最近傍との差分${nearest.distance}セル。`
  );
  renderBoard(
    elements.neighborBoard,
    nearest.regions,
    nearest.solution,
    changed,
    `${nearest.stage.id}を${TRANSFORM_LABELS[nearest.transformName]}で整列した盤面。差分${nearest.distance}セル。`
  );

  const currentMeta = metadataFor(stage);
  const neighborMeta = metadataFor(nearest.stage);
  elements.currentMetadata.replaceChildren(
    createMetadataList([
      ["難易度", `${stage.difficulty}（score ${currentMeta.difficulty.score}）`],
      ["対称クラス", currentMeta.symmetryClassId],
      ["サイズ", currentMeta.regionProfile],
      ["分岐", `${currentMeta.difficulty.branchNodes} / 深さ${currentMeta.difficulty.maxGuessDepth}`],
      ["最近傍距離", nearest.distance],
    ])
  );
  elements.neighborMetadata.replaceChildren(
    createMetadataList([
      ["難易度", `${nearest.stage.difficulty}（score ${neighborMeta.difficulty.score}）`],
      ["対称クラス", neighborMeta.symmetryClassId],
      ["サイズ", neighborMeta.regionProfile],
      ["変換", TRANSFORM_LABELS[nearest.transformName]],
      ["判断", decisionLabel(reviewStatus(nearest.stage.id))],
    ])
  );
  elements.differenceSummary.textContent =
    `D4整列後、25セル中${nearest.distance}セルが異なります。比較側には「${TRANSFORM_LABELS[nearest.transformName]}」を適用しています。`;
  renderDecision(stage);
  setQueryStage(stage.id);
}

function move(delta) {
  if (!state.filteredStages.length) return;
  state.currentIndex = (state.currentIndex + delta + state.filteredStages.length) % state.filteredStages.length;
  renderCurrent();
  document.getElementById("comparison-title").focus?.({ preventScroll: true });
}

function recordDecision(status) {
  if (!VALID_DECISIONS.has(status) || !state.filteredStages.length) return;
  const stage = state.filteredStages[state.currentIndex];
  state.reviews.decisions[stage.id] = {
    status,
    reason: elements.decisionReason.value,
    note: elements.decisionNote.value.trim(),
    reviewedAt: new Date().toISOString(),
  };
  persistReviews(`${stage.id}を「${decisionLabel(status)}」として保存しました`);
  renderDecision(stage);
}

function updateDecisionDetail() {
  if (!state.filteredStages.length) return;
  const stage = state.filteredStages[state.currentIndex];
  const review = reviewFor(stage.id);
  if (!review) return;
  review.reason = elements.decisionReason.value;
  review.note = elements.decisionNote.value.trim();
  review.reviewedAt = new Date().toISOString();
  persistReviews("理由・メモを更新しました");
}

function clearCurrentDecision() {
  if (!state.filteredStages.length) return;
  const stage = state.filteredStages[state.currentIndex];
  delete state.reviews.decisions[stage.id];
  persistReviews(`${stage.id}を未判断へ戻しました`);
  renderDecision(stage);
}

function goToNextUnreviewed() {
  if (!state.filteredStages.length) return;
  for (let offset = 1; offset <= state.filteredStages.length; offset++) {
    const index = (state.currentIndex + offset) % state.filteredStages.length;
    if (reviewStatus(state.filteredStages[index].id) === "unreviewed") {
      state.currentIndex = index;
      renderCurrent();
      return;
    }
  }
  elements.saveState.textContent = "現在の表示対象はすべて判断済みです";
}

function resetFilters() {
  elements.filterStatus.value = "all";
  elements.filterDistance.value = "all";
  elements.filterDifficulty.value = "all";
  elements.filterClass.value = "all";
  elements.filterProfile.value = "all";
  elements.filterSearch.value = "";
  elements.sortOrder.value = "distance";
  applyFilters({ preserveId: false });
}

function exportReviewData() {
  const orderedDecisions = Object.fromEntries(
    Object.entries(state.reviews.decisions).sort(([left], [right]) => left.localeCompare(right))
  );
  const body = JSON.stringify(
    {
      schemaVersion: REVIEW_SCHEMA_VERSION,
      manifestGeneratorVersion: state.manifest.generatorVersion,
      exportedAt: new Date().toISOString(),
      stageCount: state.stages.length,
      decisions: orderedDecisions,
    },
    null,
    2
  );
  const blob = new Blob([`${body}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tomatooku-variable-review-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  elements.transferState.textContent = "レビュー結果を書き出しました";
}

function validateImportedReview(parsed) {
  if (!parsed || parsed.schemaVersion !== REVIEW_SCHEMA_VERSION || typeof parsed.decisions !== "object") {
    throw new TypeError("対応していないレビューJSONです");
  }
  const result = {};
  for (const [id, decision] of Object.entries(parsed.decisions)) {
    if (!state.stageById.has(id)) continue;
    if (!decision || !VALID_DECISIONS.has(decision.status)) continue;
    result[id] = {
      status: decision.status,
      reason: typeof decision.reason === "string" ? decision.reason : "",
      note: typeof decision.note === "string" ? decision.note.slice(0, 500) : "",
      reviewedAt: typeof decision.reviewedAt === "string" ? decision.reviewedAt : new Date().toISOString(),
    };
  }
  return result;
}

async function importReviewData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const imported = validateImportedReview(parsed);
    state.reviews.decisions = { ...state.reviews.decisions, ...imported };
    persistReviews(`${Object.keys(imported).length}件の判断を読み込みました`);
    elements.transferState.textContent = `${Object.keys(imported).length}件を統合しました`;
    applyFilters();
  } catch (error) {
    elements.transferState.textContent = `読み込みに失敗しました: ${error.message}`;
  } finally {
    elements.importReview.value = "";
  }
}

function clearAllReviews() {
  if (!confirm("この端末に保存した全レビュー判断を削除しますか？")) return;
  state.reviews = emptyReviewState();
  localStorage.removeItem(STORAGE_KEY);
  elements.transferState.textContent = "全判断を削除しました";
  elements.saveState.textContent = "";
  applyFilters();
  renderSummary();
}

function bindEvents() {
  for (const control of [
    elements.filterStatus,
    elements.filterDistance,
    elements.filterDifficulty,
    elements.filterClass,
    elements.filterProfile,
    elements.sortOrder,
  ]) {
    control.addEventListener("change", () => applyFilters());
  }
  elements.filterSearch.addEventListener("input", () => applyFilters());
  elements.resetFilters.addEventListener("click", resetFilters);
  elements.nextUnreviewed.addEventListener("click", goToNextUnreviewed);
  elements.previousStage.addEventListener("click", () => move(-1));
  elements.nextStage.addEventListener("click", () => move(1));
  elements.toggleSolution.addEventListener("change", renderCurrent);
  for (const button of document.querySelectorAll("[data-decision]")) {
    button.addEventListener("click", () => recordDecision(button.dataset.decision));
  }
  elements.clearDecision.addEventListener("click", clearCurrentDecision);
  elements.decisionReason.addEventListener("change", updateDecisionDetail);
  elements.decisionNote.addEventListener("change", updateDecisionDetail);
  elements.exportReview.addEventListener("click", exportReviewData);
  elements.importReview.addEventListener("change", () => {
    const [file] = elements.importReview.files;
    if (file) importReviewData(file);
  });
  elements.clearAllReviews.addEventListener("click", clearAllReviews);

  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key.toLowerCase() === "k") recordDecision("keep");
    if (event.key.toLowerCase() === "r") recordDecision("reject");
    if (event.key.toLowerCase() === "h") recordDecision("hold");
    if (event.key.toLowerCase() === "u") clearCurrentDecision();
  });
}

function selectInitialStage() {
  const requested = new URL(location.href).searchParams.get("stage");
  if (!requested) return;
  const index = state.filteredStages.findIndex((stage) => stage.id === requested);
  if (index >= 0) state.currentIndex = index;
}

async function initialize() {
  bindEvents();
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`候補manifestを取得できませんでした（${response.status}）`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.stages) || manifest.stages.length !== 108 || !manifest.metadata) {
      throw new Error("候補manifestの形式または件数が不正です");
    }
    if (manifest.runtimeEnabled !== false || manifest.rankingEligible !== false) {
      throw new Error("レビュー対象候補が安全な無効状態ではありません");
    }
    state.manifest = manifest;
    state.stages = manifest.stages.slice();
    state.stageById = new Map(state.stages.map((stage) => [stage.id, stage]));
    populateFilters();
    const mismatches = computeNearestStages();
    state.filteredStages = sortFiltered(state.stages.slice());
    selectInitialStage();
    renderSummary();
    renderCurrent();
    elements.app.setAttribute("aria-busy", "false");
    elements.loadState.textContent = mismatches
      ? `108問を読み込みました（距離警告 ${mismatches}件）`
      : "108問を読み込みました";
    window.__variableReviewReady = true;
  } catch (error) {
    elements.app.setAttribute("aria-busy", "false");
    elements.loadState.textContent = `読み込み失敗: ${error.message}`;
    elements.emptyState.hidden = false;
    elements.emptyState.querySelector("h2").textContent = "レビュー画面を開始できませんでした";
    elements.emptyState.querySelector("p").textContent = error.message;
    console.error(error);
  }
}

initialize();
