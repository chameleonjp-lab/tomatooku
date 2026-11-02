import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/main.js','utf8');
assert.match(source,/createResultOutbox/);
assert.match(source,/submitCompletedSession\(session\)/);
assert.match(source,/refreshRecovery/);
assert.match(fs.readFileSync('index.html','utf8'),/id="saved-results"/);
const { createRecoveryView }=await import('../src/result-recovery.js');
class Element {constructor(){this.children=[];this.textContent='';this.disabled=false;}replaceChildren(){this.children=[];}append(...xs){this.children.push(...xs);}}
const host=new Element();let rows=[{persisted:true,record:{id:'mock-id',state:'failed',snapshot:{completedAt:1000,display:{score:123,elapsedMs:1230,mistakes:0,hints:0}}}}];
let sends=0;const view=createRecoveryView({host,document:{createElement:()=>new Element()},t:(k,p)=>p?`${k}:${JSON.stringify(p)}`:k,formatTime:String,
 outbox:{list:async()=>({records:rows,quarantined:0}),attempt:async()=>{sends++;return {result:{status:'ok'},persisted:true};}},submit:async()=>{throw Error('unused');}});
await view.refresh();assert.equal(sends,0,'restoration never sends');const btn=host.children[0].children.at(-1);await btn.onclick();assert.equal(sends,1);
rows=[{...rows[0],record:{...rows[0].record,state:'accepted'}}];await view.refresh();assert.equal(typeof host.children[0].children.at(-1).onclick,'undefined');
console.log('Recovery view: explicit retry only and accepted has no resend control PASS');

const {default:vm}=await import('node:vm');
let transmitted=0;const versionContext={CLIENT_VERSION:'current-version',submitScore:()=>{transmitted++;return Promise.resolve({status:'ok'});},Promise};
vm.createContext(versionContext);
vm.runInContext(source.slice(source.indexOf('function sendSavedSnapshot('),source.indexOf('async function submitCompletedSession(')),versionContext);
assert.equal((await versionContext.sendSavedSnapshot({clientVersion:'old-version'})).status,'error');assert.equal(transmitted,0,'old contract is not silently upgraded');
await versionContext.sendSavedSnapshot({clientVersion:'current-version'});assert.equal(transmitted,1);
