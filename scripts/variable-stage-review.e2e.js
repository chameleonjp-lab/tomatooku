import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8102;
const STORAGE_KEY = "tomatooku.variableStageReview.v1";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function startServer() {
  return new Promise((resolveServer) => {
    const server = http.createServer((request, response) => {
      let requested = decodeURIComponent(request.url.split("?")[0]);
      if (requested === "/") requested = "/index.html";
      const file = path.join(ROOT, requested);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, () => resolveServer(server));
  });
}

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${message}`);
  } else {
    fail++;
    console.log(`  ✗ ${message}`);
  }
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__variableReviewReady === true, null, {
    timeout: 15000,
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
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/review/variable-stage-review.html`);
    await waitReady(page);

    ok((await page.textContent("#load-state")) === "108問を読み込みました", "108問を警告なしで読み込む");
    ok((await page.textContent("#summary-total")) === "108", "対象件数108を表示");
    ok((await page.locator("#current-board .review-cell").count()) === 25, "対象盤面は25セル");
    ok((await page.locator("#neighbor-board .review-cell").count()) === 25, "最近傍盤面は25セル");

    const currentId = await page.textContent("#current-stage-title");
    const neighborId = await page.textContent("#neighbor-stage-title");
    ok(/^STG-[0-9a-f]{8}$/.test(currentId), "対象stage IDを表示");
    ok(/^STG-[0-9a-f]{8}$/.test(neighborId) && neighborId !== currentId, "別の最近傍stageを表示");
    ok((await page.textContent("#distance-chip")) === "距離 1", "既定順では距離1を先頭表示");
    ok((await page.locator("#current-board .changed").count()) === 1, "対象盤面の差分セル数が距離と一致");
    ok((await page.locator("#neighbor-board .changed").count()) === 1, "最近傍盤面の差分セル数が距離と一致");

    await page.check("#toggle-solution");
    ok((await page.locator("#current-board .tomato").count()) === 5, "対象盤面の正解5個を表示");
    ok((await page.locator("#neighbor-board .tomato").count()) === 5, "最近傍盤面の正解5個を表示");

    await page.click('[data-decision="keep"]');
    ok((await page.textContent("#summary-keep")) === "1", "採用数を更新");
    ok((await page.textContent("#current-decision")) === "採用", "対象stageを採用表示");
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    ok(stored.decisions[currentId].status === "keep", "採用判断をlocalStorageへ保存");

    await page.reload();
    await waitReady(page);
    ok((await page.textContent("#current-stage-title")) === currentId, "URL指定で同じstageへ復帰");
    ok((await page.textContent("#current-decision")) === "採用", "再読み込み後も判断を復元");

    await page.selectOption("#filter-status", "keep");
    ok((await page.textContent("#filtered-label")) === "表示対象 1問", "採用フィルターで1問へ絞り込む");
    await page.click("#reset-filters");
    ok((await page.textContent("#filtered-label")) === "表示対象 108問", "フィルターを108問へ戻す");

    const firstId = await page.textContent("#current-stage-title");
    await page.click("#next-stage");
    const secondId = await page.textContent("#current-stage-title");
    ok(secondId !== firstId, "次の候補へ移動");
    ok(new URL(page.url()).searchParams.get("stage") === secondId, "URLへ現在stageを反映");

    await page.selectOption("#decision-reason", "near-duplicate");
    await page.fill("#decision-note", "iPhone SEで境界を比較");
    await page.click('[data-decision="hold"]');
    ok((await page.textContent("#current-decision")) === "保留", "保留判断を保存");

    await page.click(".transfer-panel > summary");
    ok(await page.locator(".transfer-panel").getAttribute("open") !== null, "レビュー結果の入出力を開く");
    await page.evaluate(() => {
      const capture = {
        blob: null,
        clicked: false,
        filename: "",
      };
      window.__reviewExportCapture = capture;
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        capture.blob = blob;
        return createObjectURL(blob);
      };
      HTMLAnchorElement.prototype.click = function captureAnchorClick() {
        capture.clicked = true;
        capture.filename = this.download;
      };
    });
    await page.click("#export-review");
    const exportCapture = await page.evaluate(async () => ({
      clicked: window.__reviewExportCapture.clicked,
      filename: window.__reviewExportCapture.filename,
      body: await window.__reviewExportCapture.blob.text(),
    }));
    ok(exportCapture.clicked, "レビューJSONのダウンロード操作を実行");
    ok(exportCapture.filename.startsWith("tomatooku-variable-review-"), "レビューJSONのファイル名を設定");
    const exported = JSON.parse(exportCapture.body);
    ok(exported.decisions[currentId].status === "keep", "書き出しJSONへ採用判断を含む");
    ok(exported.decisions[secondId].status === "hold", "書き出しJSONへ保留判断を含む");

    const importBody = JSON.stringify({
      schemaVersion: 1,
      decisions: {
        [currentId]: {
          status: "reject",
          reason: "near-duplicate",
          note: "imported",
          reviewedAt: new Date().toISOString(),
        },
      },
    });
    await page.setInputFiles("#import-review", {
      name: "review.json",
      mimeType: "application/json",
      buffer: Buffer.from(importBody),
    });
    await page.waitForFunction(() => document.querySelector("#transfer-state").textContent.includes("1件を統合"));
    await page.fill("#filter-search", currentId);
    ok((await page.textContent("#current-stage-title")) === currentId, "ID検索で読み込み対象へ移動");
    ok((await page.textContent("#current-decision")) === "除外", "読み込んだ除外判断を反映");

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    ok(dimensions.scrollWidth <= dimensions.clientWidth, "320px幅で横スクロールなし");

    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#clear-all-reviews");
    ok((await page.textContent("#summary-reviewed")) === "0", "全判断を消去");
    ok((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)) === null, "保存領域も消去");
    ok(consoleErrors.length === 0, `console errorなし (${consoleErrors.join(" | ")})`);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  console.log(`\n==== VARIABLE STAGE REVIEW E2E: PASS=${pass} FAIL=${fail} ====`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
