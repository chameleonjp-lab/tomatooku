/**
 * トマトオク ブラウザ E2E テスト (Playwright)
 * iPhone SE相当で、カウントダウン・タイマー開始・キャンセル競合を含む
 * ホームから結果までのフローを確認する。
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser } from "./launch.js";

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
      let pathname = decodeURIComponent(req.url.split("?")[0]);
      if (pathname === "/") pathname = "/index.html";

      const file = path.join(ROOT, pathname);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "text/plain",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function solveBoard(regionStrings) {
  const region = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      region[r * N + c] = regionStrings[r].charCodeAt(c) - 65;
    }
  }

  const colUsed = Array(N).fill(false);
  const regUsed = Array(N).fill(false);
  const placed = [];
  const solutions = [];

  function rec(row) {
    if (row === N) {
      solutions.push(placed.slice());
      return;
    }

    for (let c = 0; c < N; c++) {
      if (colUsed[c]) continue;
      const regionId = region[row * N + c];
      if (regUsed[regionId]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - c) < 2) continue;

      colUsed[c] = true;
      regUsed[regionId] = true;
      placed[row] = c;
      rec(row + 1);
      colUsed[c] = false;
      regUsed[regionId] = false;
    }
  }

  rec(0);
  return solutions;
}

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ FAIL:", message);
  }
}

async function getRegions(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#board .cell")];
    const rows = [];

    for (let r = 0; r < 5; r++) {
      let row = "";
      for (let c = 0; c < 5; c++) {
        const match = cells[r * 5 + c].className.match(/area-([A-E])/);
        row += match ? match[1] : "?";
      }
      rows.push(row);
    }
    return rows;
  });
}

async function clickCell(page, r, c) {
  await page.evaluate(
    ([row, col]) => {
      document.querySelectorAll("#board .cell")[row * 5 + col].click();
    },
    [r, c]
  );
}

async function solveCurrentStage(page) {
  const regions = await getRegions(page);
  const solutions = solveBoard(regions);
  ok(solutions.length === 1, `表示中の盤面が一意解 (got ${solutions.length})`);

  const solution = solutions[0];
  for (let r = 0; r < N; r++) {
    await clickCell(page, r, solution[r]);
  }
}

async function startFromHome(page, name = "テスター") {
  await page.fill("#player-name", name);
  await page.click("#start-btn");
  await page.waitForSelector("#screen-countdown.active");
}

async function waitForPlaying(page) {
  await page.waitForSelector("#screen-game.active", { timeout: 6000 });
  await page.waitForFunction(() => {
    const board = document.querySelector("#board");
    return (
      board &&
      board.getAttribute("aria-busy") === "false" &&
      document.querySelectorAll("#board .cell").length === 25 &&
      !document.querySelector("#hint-btn").disabled
    );
  });
}

async function main() {
  const server = await startServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

  console.log("# ホーム表示");
  ok(await page.isVisible("#screen-home"), "ホーム画面が表示");
  ok(
    (await page.textContent("#screen-home .brand h1")).includes("トマトオク"),
    "タイトル表示"
  );
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    "横スクロールなし"
  );

  console.log("# 名前必須");
  await page.click("#start-btn");
  ok((await page.textContent("#name-error")).length > 0, "名前未入力で開始しない");
  ok(await page.isVisible("#screen-home"), "ホームのまま");

  console.log("# カウントダウン");
  await startFromHome(page);
  ok((await page.textContent("#countdown-value")).trim() === "3", "3から開始");
  ok((await page.locator("#board .cell").count()) === 0, "カウントダウン中は盤面を表示しない");

  console.log("# カウントダウンキャンセル競合");
  await page.click("#countdown-cancel-btn");
  await page.waitForSelector("#screen-home.active");
  await page.waitForTimeout(3000);
  ok(await page.isVisible("#screen-home"), "キャンセル後もホームを維持");
  ok(!(await page.isVisible("#screen-game.active")), "古いカウントダウンがゲームを開始しない");

  console.log("# ゲーム開始と計測");
  await startFromHome(page);
  await waitForPlaying(page);
  ok((await page.locator("#board .cell").count()) === 25, "盤面25マス");
  const initialTime = (await page.textContent("#hud-time")).trim();
  ok(/^0:0[0-1]\.\d$/.test(initialTime), `描画後にほぼ0から計測開始 (${initialTime})`);

  console.log("# 誤タップ");
  const regions = await getRegions(page);
  const solution = solveBoard(regions)[0];
  await clickCell(page, 0, solution[0]);
  const anotherCol = solution[0] === 0 ? 2 : 0;
  await clickCell(page, 0, anotherCol);
  ok(Number(await page.textContent("#hud-mistakes")) >= 1, "誤タップを計上");
  await clickCell(page, 0, solution[0]);

  console.log("# ステージ遷移中のリタイア競合");
  await solveCurrentStage(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#quit-btn");
  await page.waitForSelector("#screen-home.active");
  await page.waitForTimeout(1200);
  ok(await page.isVisible("#screen-home"), "遷移中リタイア後もホームを維持");
  ok(!(await page.isVisible("#screen-result.active")), "古い遷移が結果へ進まない");
  ok((await page.locator("#board .cell").count()) === 0, "旧盤面を破棄");

  console.log("# 3ステージクリア");
  await startFromHome(page);
  await waitForPlaying(page);

  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    const currentLabel = (await page.textContent("#hud-stage")).trim();
    await solveCurrentStage(page);

    if (stageIndex < 2) {
      await page.waitForFunction(
        (previous) => {
          const label = document.querySelector("#hud-stage")?.textContent?.trim();
          const board = document.querySelector("#board");
          return (
            label &&
            label !== previous &&
            board?.getAttribute("aria-busy") === "false" &&
            !document.querySelector("#hint-btn").disabled
          );
        },
        currentLabel,
        { timeout: 5000 }
      );
    }
  }

  await page.waitForSelector("#screen-result.active", { timeout: 5000 });
  ok(await page.isVisible("#screen-result"), "結果画面へ遷移");

  const finalScore = (await page.textContent("#result-score")).replace(/,/g, "");
  ok(Number(finalScore) > 0, `最終スコア表示 (${finalScore})`);
  ok(/\d:\d\d/.test(await page.textContent("#result-time")), "クリアタイム表示");
  ok(
    (await page.textContent("#submit-state")).includes("ランキング送信を停止"),
    "現行ランダムプレイはランキング送信停止"
  );

  console.log("# 結果シェア");
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
    shareCaptured && shareCaptured.text && shareCaptured.text.includes("http"),
    "シェア本文に正式URL"
  );

  console.log("# もう一度遊ぶ");
  await page.click("#again-btn");
  await page.waitForSelector("#screen-countdown.active");
  ok(await page.isVisible("#screen-countdown"), "再プレイもカウントダウンから開始");
  await page.click("#countdown-cancel-btn");

  console.log("# エラーチェック");
  ok(pageErrors.length === 0, `未捕捉エラーなし (${pageErrors.join("; ")})`);
  if (consoleErrors.length) console.log("  console.error:", consoleErrors);

  await browser.close();
  server.close();

  console.log(`\n==== E2E RESULT: PASS=${pass} FAIL=${fail} ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
