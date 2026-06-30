/**
 * トマトオク ブラウザ E2E テスト (Playwright)
 * iPhone SE 相当(320x568)で実際にプレイし、白画面/横スクロール/
 * フロー破綻が無いかを確認する。
 *
 * 盤面の解は「見えているエリア色」だけから一意解ソルバで求める
 * (隠し solution は使わない)。
 */
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 8099;
const N = 5;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

// 一意解ソルバ(エリア文字列から)
function solveBoard(regionStrings) {
  const region = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      region[r * N + c] = regionStrings[r].charCodeAt(c) - 65;
  const colUsed = Array(N).fill(false);
  const regUsed = Array(N).fill(false);
  const placed = [];
  const sols = [];
  function rec(row) {
    if (row === N) {
      sols.push(placed.slice());
      return;
    }
    for (let c = 0; c < N; c++) {
      if (colUsed[c]) continue;
      const rg = region[row * N + c];
      if (regUsed[rg]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - c) < 2) continue;
      colUsed[c] = true;
      regUsed[rg] = true;
      placed[row] = c;
      rec(row + 1);
      colUsed[c] = false;
      regUsed[rg] = false;
    }
  }
  rec(0);
  return sols;
}

let pass = 0,
  fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗ FAIL:", msg);
  }
}

async function getRegions(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#board .cell")];
    const rows = [];
    for (let r = 0; r < 5; r++) {
      let s = "";
      for (let c = 0; c < 5; c++) {
        const cls = cells[r * 5 + c].className;
        const m = cls.match(/area-([A-E])/);
        s += m ? m[1] : "?";
      }
      rows.push(s);
    }
    return rows;
  });
}

async function clickCell(page, r, c) {
  await page.evaluate(
    ([r, c]) => {
      document.querySelectorAll("#board .cell")[r * 5 + c].click();
    },
    [r, c]
  );
}

async function solveCurrentStage(page) {
  const regions = await getRegions(page);
  const sols = solveBoard(regions);
  ok(sols.length === 1, `表示中の盤面が一意解 (got ${sols.length})`);
  const sol = sols[0]; // sol[row] = col
  for (let r = 0; r < N; r++) {
    await clickCell(page, r, sol[r]);
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 }, // iPhone SE 相当
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

  // 1. 白画面でない: ブランドが見える
  console.log("# ホーム表示");
  ok(await page.isVisible("#screen-home"), "ホーム画面が表示される");
  ok((await page.textContent(".brand h1")).includes("トマトオク"), "タイトル表示");

  // 横スクロールが無い
  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  ok(noHScroll, "横スクロールが発生しない(320px)");

  // 2. 名前未入力でスタート → エラー
  console.log("# 名前必須");
  await page.click("#start-btn");
  ok(
    (await page.textContent("#name-error")).length > 0,
    "名前未入力でエラー表示・開始しない"
  );
  ok(await page.isVisible("#screen-home"), "まだホームのまま");

  // 3. 名前入力して開始
  console.log("# ゲーム開始");
  await page.fill("#player-name", "テスター");
  await page.click("#start-btn");
  await page.waitForSelector("#screen-game.active");
  ok(await page.isVisible("#screen-game"), "ゲーム画面に遷移");
  const cellCount = await page.evaluate(
    () => document.querySelectorAll("#board .cell").length
  );
  ok(cellCount === 25, `盤面に25マス (got ${cellCount})`);

  // 4. 誤タップ検証: 同じ行に2個置く
  console.log("# 誤タップ");
  const regions0 = await getRegions(page);
  const sol0 = solveBoard(regions0)[0];
  // row0 の正解列に置く
  await clickCell(page, 0, sol0[0]);
  // row0 の別の列(正解でない)に置く → 誤タップ(row)
  const otherCol = sol0[0] === 0 ? 2 : 0;
  await clickCell(page, 0, otherCol);
  const mistakesAfter = await page.textContent("#hud-mistakes");
  ok(Number(mistakesAfter) >= 1, `誤タップが計上される (${mistakesAfter})`);
  // 取り除いてリセット
  await clickCell(page, 0, sol0[0]);

  // 5. 3ステージを解いて結果へ
  console.log("# 3ステージクリア");
  for (let s = 0; s < 3; s++) {
    await solveCurrentStage(page);
    // クリア演出(850ms)待ち
    await page.waitForTimeout(1000);
  }
  await page.waitForSelector("#screen-result.active", { timeout: 5000 });
  ok(await page.isVisible("#screen-result"), "結果画面に遷移");

  const finalScore = await page.textContent("#result-score");
  ok(Number(finalScore.replace(/,/g, "")) > 0, `最終スコア表示 (${finalScore})`);
  ok(
    (await page.textContent("#result-time")).match(/\d:\d\d/),
    "クリアタイム表示"
  );
  ok((await page.textContent("#result-mistakes")) !== "", "誤タップ数表示");
  ok((await page.textContent("#result-hints")) !== "", "ヒント回数表示");
  // ランキング未設定 → skipped 表示(白画面/例外でなく)
  const submitState = await page.textContent("#submit-state");
  ok(submitState.length > 0, `送信状態が表示される: "${submitState}"`);

  // 6. シェア文にURLが含まれるか(navigator.share をスタブして捕捉)
  console.log("# 結果シェアURL");
  const shareCaptured = await page.evaluate(() => {
    return new Promise((resolve) => {
      navigator.share = (data) => {
        resolve(data);
        return Promise.resolve();
      };
      document.querySelector("#result-share-btn").click();
      setTimeout(() => resolve(null), 500);
    });
  });
  ok(
    shareCaptured &&
      ((shareCaptured.text && shareCaptured.text.includes("http")) ||
        (shareCaptured.url && shareCaptured.url.includes("http"))),
    "結果シェアにゲームURLが含まれる"
  );

  // 7. もう一度遊ぶ
  console.log("# もう一度遊ぶ");
  await page.click("#again-btn");
  await page.waitForSelector("#screen-game.active");
  ok(await page.isVisible("#screen-game"), "再プレイでゲーム画面へ");

  // 8. エラーが出ていないこと
  console.log("# エラーチェック");
  ok(pageErrors.length === 0, `未捕捉エラーなし (${pageErrors.join("; ")})`);
  // console.error はランキング失敗等で出る可能性があるが未設定時は出ない想定
  if (consoleErrors.length) console.log("  console.error:", consoleErrors);

  await browser.close();
  server.close();

  console.log(`\n==== E2E RESULT: PASS=${pass} FAIL=${fail} ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
