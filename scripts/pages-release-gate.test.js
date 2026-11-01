import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const workflow = fs.readFileSync('.github/workflows/deploy-github-pages.yml','utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml','utf8');
assert.match(ci,/workflow_call:/, 'full CI must be reusable by publication');
assert.doesNotMatch(ci,/^  push:/m, 'main must not run duplicate independent verification');
assert.match(workflow,/verify:\s*\n\s+if:.*refs\/heads\/main[\s\S]*uses: \.\/\.github\/workflows\/ci.yml/);
assert.match(workflow,/build:\s*\n\s+needs: verify/);
assert.match(workflow,/deploy:[\s\S]*needs: build/);
assert.doesNotMatch(workflow,/always\(\)|continue-on-error|secrets: inherit|pull_request_target/);
assert.match(workflow,/cancel-in-progress: true/);
assert.match(workflow,/actions\/configure-pages@v5\s*\n\s+with:\s*\n\s+enablement: false/);
assert.match(workflow,/ref: \$\{\{ github.sha \}\}/);
assert.equal((workflow.match(/require\('.\/scripts\/pages-release-gate.cjs'\)/g)||[]).length,2,'check before packaging and immediately before deploy');
const gate = require('./pages-release-gate.cjs');
let reads=[];
const context={repo:{owner:'owner',repo:'repo'},ref:'refs/heads/main',eventName:'push',sha:'a'.repeat(40)};
const github = { rest: {
 repos: { getPages: async () => { reads.push('pages'); return {data: {build_type: 'workflow'}}; } },
 git: { getRef: async () => { reads.push('head'); return {data: {object: {sha: context.sha}}}; } }
} };
await gate({github,context});
assert.deepEqual(reads,['pages','head']);
for(const override of [{eventName:'pull_request'},{eventName:'workflow_run'},{ref:'refs/heads/other'}]){
 reads=[];await assert.rejects(gate({github,context:{...context,...override}}),/main.*push.*workflow_dispatch/);assert.deepEqual(reads,[]);
}
await gate({github,context:{...context,eventName:'workflow_dispatch'}});
for(const type of ['legacy',undefined,''])await assert.rejects(gate({context,github:{rest:{...github.rest,repos:{getPages:async()=>({data:{build_type:type}})}}}}),/Source.*GitHub Actions/);
await assert.rejects(gate({context,github:{rest:{...github.rest,git:{getRef:async()=>({data:{object:{sha:'b'.repeat(40)}}})}}}}),/current main/);
await assert.rejects(gate({context,github:{rest:{...github.rest,repos:{getPages:async()=>{throw Error('403 denied')}}}}}),/403 denied/);
for(const file of ['docs/COMMON_SPEC_20261031.md','docs/COMMON_SPEC_PLAN_20261031.md','docs/GITHUB_PAGES_DEPLOY.md']){
 const doc=fs.readFileSync(file,'utf8');assert.doesNotMatch(doc,/マージ前には変更しない|マージ後、Settings/);assert.match(doc,/マージ前/);
}
console.log('✓ Pages gate: reused full CI, fail-closed Source/SHA/event, no PR deploy, safe setup order');
