/**
 * Playwrightブラウザ起動ヘルパー。
 * 既定はChromium。`PW_BROWSER=webkit`のときはPlaywright WebKitを使う。
 * Chromiumだけは、開発環境にプリインストール済みの実行ファイルがあれば優先する。
 */
import { chromium, webkit } from "playwright";
import fs from "fs";

const BROWSER_TYPES = { chromium, webkit };
const CHROMIUM_CANDIDATES = [
  process.env.PW_CHROMIUM,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
];

export function resolveBrowserName(value) {
  const normalized = String(value ?? "").trim().toLowerCase() || "chromium";
  if (!Object.hasOwn(BROWSER_TYPES, normalized)) {
    throw new Error(
      `Unsupported PW_BROWSER: ${value}. Use "chromium" or "webkit".`
    );
  }
  return normalized;
}

export async function launchBrowser(opts = {}) {
  const browserName = resolveBrowserName(process.env.PW_BROWSER);
  if (browserName === "chromium") {
    const found = CHROMIUM_CANDIDATES.find((candidate) =>
      candidate && fs.existsSync(candidate)
    );
    if (found) {
      return chromium.launch({ executablePath: found, ...opts });
    }
  }
  return BROWSER_TYPES[browserName].launch(opts);
}
