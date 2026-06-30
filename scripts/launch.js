/**
 * Chromium 起動ヘルパー。
 * Claude Code 環境にプリインストールされた Chromium があればそれを使い、
 * 無ければ Playwright 既定の解決(通常の chromium.launch())にフォールバックする。
 * これにより固定パスが存在しない別環境でもテストが動く。
 */
import { chromium } from "playwright";
import fs from "fs";

const CANDIDATES = [
  process.env.PW_CHROMIUM, // 明示指定があれば最優先
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
];

export async function launchBrowser(opts = {}) {
  const found = CANDIDATES.find((p) => p && fs.existsSync(p));
  if (found) {
    return chromium.launch({ executablePath: found, ...opts });
  }
  // 固定パスが無い環境: Playwright に解決を任せる
  return chromium.launch(opts);
}
