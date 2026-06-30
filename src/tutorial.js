/**
 * トマトオク チュートリアル(4×4の自動アニメ)
 *
 * 本番は5×5だが、4×4の小さな盤面でルールと操作を順番に見せて覚えてもらう。
 * 依存ライブラリなし。CSS トランジション + JS のステップエンジンで動かす。
 *
 * ルール(本番と同じ):各行/各列/各エリアに🍅は1個・上下左右斜めで隣接禁止。
 */

const T = 4; // 4×4
const LETTERS = ["A", "B", "C", "D"];

// 4分割(クォーター)のエリア。色で見分けやすく、教材として分かりやすい。
const REGIONS = ["AABB", "AABB", "CCDD", "CCDD"];
// 解:各行/列/エリアに1個・斜め隣接なし
const SOLUTION = [
  [0, 1],
  [1, 3],
  [2, 0],
  [3, 2],
];

let cells = []; // cells[r][c] = element
let runId = 0; // 再生世代(モーダルを閉じる/再生し直すとキャンセル)
let built = false;

function el(sel) {
  return document.querySelector(sel);
}

/** 盤面 DOM を一度だけ構築 */
function buildBoard() {
  const board = el("#tutorial-board");
  board.innerHTML = "";
  cells = [];
  for (let r = 0; r < T; r++) {
    cells[r] = [];
    for (let c = 0; c < T; c++) {
      const cell = document.createElement("div");
      cell.className = `tcell area-${REGIONS[r][c]}`;
      const t = document.createElement("span");
      t.className = "tomato";
      t.textContent = "🍅";
      cell.appendChild(t);
      const mark = document.createElement("span");
      mark.className = "tmark";
      cell.appendChild(mark);
      board.appendChild(cell);
      cells[r][c] = cell;
    }
  }
  built = true;
}

function resetBoard() {
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      cells[r][c].classList.remove(
        "filled",
        "ghost-bad",
        "hl",
        "hl-soft",
        "adj",
        "mark-ok",
        "mark-bad"
      );
    }
  }
  el("#tutorial-board").classList.remove("tcleared");
}

// --- 小道具 ---------------------------------------------------------------
function setCaption(html) {
  el("#tutorial-caption").innerHTML = html;
}
function setProgress(p) {
  el("#tutorial-bar").style.width = `${Math.round(p * 100)}%`;
}

/** キャンセル可能な待機。世代が変わったら例外で抜ける。 */
function delay(ms, myRun) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (myRun !== runId) reject(new Error("cancelled"));
      else resolve();
    }, ms);
  });
}

function place(r, c, mark) {
  cells[r][c].classList.add("filled");
  if (mark === "ok") cells[r][c].classList.add("mark-ok");
}
function ghostBad(r, c) {
  cells[r][c].classList.add("ghost-bad", "mark-bad");
}
function clearGhost(r, c) {
  cells[r][c].classList.remove("ghost-bad", "mark-bad");
}
function highlightRow(r) {
  for (let c = 0; c < T; c++) cells[r][c].classList.add("hl-soft");
}
function highlightCol(c) {
  for (let r = 0; r < T; r++) cells[r][c].classList.add("hl-soft");
}
function highlightRegion(letter) {
  for (let r = 0; r < T; r++)
    for (let c = 0; c < T; c++)
      if (REGIONS[r][c] === letter) cells[r][c].classList.add("hl-soft");
}
function markAdjacency(r, c) {
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= T || nc < 0 || nc >= T) continue;
      cells[nr][nc].classList.add("adj");
    }
}
function clearHighlights() {
  for (let r = 0; r < T; r++)
    for (let c = 0; c < T; c++)
      cells[r][c].classList.remove("hl-soft", "adj");
}

// --- 本編シーケンス -------------------------------------------------------
async function sequence(myRun) {
  const total = 11; // ステップ数(進捗バー用)
  let step = 0;
  const tick = () => setProgress(++step / total);

  resetBoard();
  setProgress(0);

  setCaption("4×4で<b>あそびかた</b>を覚えよう!🍅をルール通りにならべるよ");
  await delay(2200, myRun);
  tick();

  setCaption("マスをタップすると🍅が<b>置ける</b>よ");
  place(0, 1);
  await delay(2000, myRun);
  tick();

  // ルール①: 行
  setCaption("ルール① <b>同じ行(よこ)</b>に🍅は1個だけ");
  highlightRow(0);
  await delay(1100, myRun);
  ghostBad(0, 3); // 同じ行に置こうとする → ダメ
  await delay(1600, myRun);
  clearGhost(0, 3);
  clearHighlights();
  tick();

  // ルール②: 列
  setCaption("ルール② <b>同じ列(たて)</b>にも1個だけ");
  highlightCol(1);
  await delay(1100, myRun);
  ghostBad(3, 1);
  await delay(1600, myRun);
  clearGhost(3, 1);
  clearHighlights();
  tick();

  // ルール③: エリア
  setCaption("ルール③ <b>同じ色のエリア</b>にも1個だけ");
  highlightRegion("A");
  await delay(1100, myRun);
  ghostBad(1, 0); // 左上エリアAに2個目 → ダメ
  await delay(1600, myRun);
  clearGhost(1, 0);
  clearHighlights();
  tick();

  // ルール④: 隣接(斜め含む)
  setCaption("ルール④ <b>ななめ・となり</b>は隣り合えない");
  markAdjacency(0, 1);
  await delay(1100, myRun);
  ghostBad(1, 0); // 斜め隣 → ダメ
  ghostBad(1, 2); // 斜め隣 → ダメ
  await delay(1700, myRun);
  clearGhost(1, 0);
  clearGhost(1, 2);
  clearHighlights();
  tick();

  // 解いていく
  setCaption("ルールを守って残りを置いていくよ…");
  await delay(900, myRun);
  place(1, 3, "ok");
  await delay(900, myRun);
  place(2, 0, "ok");
  await delay(900, myRun);
  place(3, 2, "ok");
  await delay(700, myRun);
  tick();

  // クリア
  setCaption("🎉 <b>クリア!</b> 全部のルールを満たせたよ");
  el("#tutorial-board").classList.add("tcleared");
  await delay(2200, myRun);
  tick();

  setCaption("本番は<b>5×5・3ステージ</b>。スピードが高スコアのカギ!");
  setProgress(1);
}

/**
 * チュートリアルを最初から再生。モーダルを開くたび・再生ボタンで呼ぶ。
 */
export function playTutorial() {
  if (!built) buildBoard();
  const myRun = ++runId; // 既存の再生をキャンセル
  sequence(myRun).catch(() => {
    /* cancelled: 何もしない */
  });
}

/** 再生を停止(モーダルを閉じたとき)。 */
export function stopTutorial() {
  runId++; // 進行中の delay を全てキャンセル
}
