import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserName } from "./launch.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

assert.equal(resolveBrowserName(), "chromium");
assert.equal(resolveBrowserName(""), "chromium");
assert.equal(resolveBrowserName(" chromium "), "chromium");
assert.equal(resolveBrowserName("WEBKIT"), "webkit");
assert.throws(() => resolveBrowserName("firefox"), /Unsupported PW_BROWSER/);

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts["e2e:webkit"],
  "PW_BROWSER=webkit node scripts/e2e.test.js"
);
assert.equal(
  packageJson.scripts["e2e:practice-bank:webkit"],
  "PW_BROWSER=webkit node scripts/practice-stage-bank.e2e.js"
);

const workflow = read(".github/workflows/ci.yml");
assert.match(workflow, /playwright install --with-deps chromium webkit/);
assert.match(workflow, /Run iPhone SE WebKit E2E/);
assert.match(workflow, /Run practice final bank WebKit E2E/);

const plan = read("docs/IMPLEMENTATION_PLAN_v2.md");
const spec = read("docs/SPEC_v2.md");
const checklist = read("docs/RELEASE_DEVICE_CHECK_v2.md");
const readme = read("README.md");
assert.match(plan, /### 7-9\. WebKit自動回帰検証/);
assert.match(plan, /実機確認の代用にはしない/);
assert.match(spec, /Chromium・WebKitで同じ主要フロー/);
assert.doesNotMatch(spec, /必要に応じたWebKit自動検証の追加/);
assert.match(checklist, /Chromium \/ WebKit E2E/);
assert.match(checklist, /実機合格の代用にはしない/);
assert.ok(readme.includes("npm run e2e:webkit"));
assert.ok(readme.includes("npm run e2e:practice-bank:webkit"));

console.log("✓ Chromium既定とWebKit自動回帰検証の契約を保持");
