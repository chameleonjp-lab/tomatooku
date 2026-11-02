import assert from 'node:assert/strict';
globalThis.fetch = () => { throw new Error('network forbidden'); };
const { createResultOutbox } = await import('../src/result-outbox.js');
const snapshot = () => ({ playId:'test-play', mode:'official', runToken:'mock-only-token', clientVersion:'test-v1',
  transcript:Array.from({length:15},(_,i)=>({type:'tap',stageIndex:0,row:i%5,col:0,atMs:i*100})),elapsedMs:6000,
  completedAt:1000, display:{score:600,elapsedMs:6000,mistakes:0,hints:0} });
const accepted = {status:'ok',accepted:true,score:600,firstScore:600,bestScore:600,playCount:1,isFirstPlay:true,isNewBest:true,underReview:false};
function adapter() { const rows=new Map(); let tail=Promise.resolve(); return {rows,
  async all(){return structuredClone([...rows.values()]);},
  mutate(id,fn){const work=tail.then(()=>{const next=fn(structuredClone(rows.get(id)));if(next)rows.set(id,structuredClone(next));return structuredClone(next||rows.get(id));});tail=work.catch(()=>{});return work;}
}; }
const db=adapter();const q=createResultOutbox({storage:db, now:()=>1000});
const saved=await q.save(snapshot());assert.equal(saved.persisted,true);
const reopened=createResultOutbox({storage:db,now:()=>1000});assert.equal((await reopened.list()).records.length,1);
let calls=0, release;const submit=async body=>{calls++;assert.equal(body.runToken,snapshot().runToken);await new Promise(r=>release=r);return accepted;};
const a=q.attempt(snapshot().playId,submit);await new Promise(r=>setImmediate(r));
assert.equal((await reopened.attempt(snapshot().playId,submit)).result.status,'busy');assert.equal(calls,1);
release();assert.equal((await a).result.status,'ok');assert.equal((await reopened.attempt(snapshot().playId,submit)).result.status,'ok');assert.equal(calls,1);
assert.equal((await q.save({...snapshot(),runToken:'different-mock'})).error,'conflict');assert.equal(db.rows.get('test-play').snapshot.runToken,'mock-only-token');
const bad={id:'bad',schema:99,secret:'not-a-real-token'};db.rows.set('bad',bad);const listed=await q.list();assert.equal(listed.quarantined,1);assert.deepEqual(db.rows.get('bad'),bad);
const failDb={all:async()=>{throw Error('quota')},mutate:async()=>{throw Error('quota')}};const mem=createResultOutbox({storage:failDb});assert.equal((await mem.save(snapshot())).persisted,false);
assert.equal((await mem.attempt('test-play',async()=>accepted)).result.status,'ok');assert.equal((await mem.list()).records[0].persisted,false);
const retryDb=adapter();const retry=createResultOutbox({storage:retryDb});await retry.save(snapshot());let bodies=[];
const send=async body=>{bodies.push(JSON.stringify(body));return bodies.length===1?{status:'error',accepted:false}:accepted;};
assert.equal((await retry.attempt('test-play',send)).result.status,'error');assert.equal((await retry.attempt('test-play',send)).result.status,'ok');assert.equal(bodies[0],bodies[1]);
// A successful server receipt cannot be forgotten just because its disk update fails.
const receiptDb=adapter();const receiptQ=createResultOutbox({storage:receiptDb});await receiptQ.save(snapshot());const mutate=receiptDb.mutate;let writes=0;receiptDb.mutate=(...args)=>{writes++;return writes===2?Promise.reject(Error('disk full')):mutate(...args)};
let acceptedCalls=0;const sendAccepted=async()=>{acceptedCalls++;return accepted;};const receipt=await receiptQ.attempt('test-play',sendAccepted);assert.equal(receipt.persisted,false);assert.equal(receipt.result.status,'ok');assert.equal((await receiptQ.attempt('test-play',sendAccepted)).result.status,'ok');assert.equal(acceptedCalls,1);
await receiptQ.save(snapshot());
assert.equal((await receiptQ.attempt('test-play',sendAccepted)).result.status,'ok');assert.equal(acceptedCalls,1,'saving same snapshot cannot forget memory accepted receipt');
console.log('Result outbox: persistence/reopen, conflict, quarantine, two-tab lease, fallback, retry and receipt-write failure PASS');
// Access-denied IndexedDB getters must not prevent game/module initialization.
Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){throw Error('blocked')}});
const blocked=createResultOutbox();assert.equal((await blocked.save(snapshot())).persisted,false);
const corruptDisplay=adapter();corruptDisplay.rows.set('test-play',{schema:1,id:'test-play',snapshot:{...snapshot(),display:{...snapshot().display,stageTimesMs:['bad']}},state:'pending',leaseUntil:0,receipt:null});
assert.equal((await createResultOutbox({storage:corruptDisplay}).list()).quarantined,1,'invalid display breakdown is quarantined');
const nonJson=adapter();nonJson.rows.set('test-play',{schema:1,id:'test-play',snapshot:snapshot(),state:'pending',leaseUntil:0,receipt:null,extra:1n});
assert.equal((await createResultOutbox({storage:nonJson}).list()).quarantined,1,'non-JSON corrupt record is isolated without crashing results');
