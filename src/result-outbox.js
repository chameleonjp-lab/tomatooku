// Completed-result storage only. No game/session restoration and no automatic retry.
const DB_NAME = 'tomatooku.completed-results.v1';
const STORE = 'results';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const serializable = value => { try { JSON.stringify(value); return true; } catch { return false; } };
const integer = n => Number.isSafeInteger(n) && n >= 0;
function validBreakdown(d) {
  if(!d)return false;
  const keys=['stageTimesMs','stageMistakeCounts','stageHintCounts'];
  if(keys.every(k=>d[k]===undefined))return true;
  return keys.every(k=>Array.isArray(d[k])&&d[k].length===3&&d[k].every(n=>Number.isFinite(n)&&n>=0&&(k==='stageTimesMs'||Number.isInteger(n))));
}
function validSnapshot(s) {
  return s && serializable(s) && typeof s.playId === 'string' && s.playId.length > 0 && s.mode === 'official' &&
    typeof s.runToken === 'string' && s.runToken.length > 0 && typeof s.clientVersion === 'string' && s.clientVersion.length > 0 &&
    integer(s.elapsedMs) && integer(s.completedAt) && Array.isArray(s.transcript) && s.transcript.length >= 15 && s.transcript.length <= 300 &&
    s.transcript.every(a => a && ['tap','hint'].includes(a.type) && integer(a.stageIndex) && a.stageIndex < 3 && integer(a.atMs) &&
      (a.type === 'hint' || (integer(a.row) && a.row < 5 && integer(a.col) && a.col < 5))) &&
    s.display && ['score','elapsedMs','mistakes','hints'].every(k => integer(s.display[k])) && s.display.elapsedMs === s.elapsedMs && validBreakdown(s.display) &&
    s.display.score === Math.floor(s.elapsedMs/10)+s.display.mistakes*300+s.display.hints*3000;
}
function validReceipt(r,s) {
  const int4=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
  return r?.status === 'ok' && r.accepted === true && r.score === s.display.score && int4(r.score) &&
    typeof r.underReview === 'boolean' && typeof r.isFirstPlay === 'boolean' && typeof r.isNewBest === 'boolean' &&
    (r.underReview ? r.firstScore === null && r.bestScore === null && r.playCount === null && !r.isFirstPlay && !r.isNewBest :
      int4(r.firstScore) && int4(r.bestScore) && r.bestScore <= r.score && int4(r.playCount) && r.playCount >= 1);
}
function validRecord(r) {
  return serializable(r) && r?.schema === 1 && r.id === r.snapshot?.playId && validSnapshot(r.snapshot) &&
    ['pending','failed','accepted','sending'].includes(r.state) && integer(r.leaseUntil) &&
    (r.state !== 'accepted' || validReceipt(r.receipt,r.snapshot));
}
const fail = code => Object.assign(new Error(code),{code});

export function createIndexedResultStorage(indexedDB) {
  if(arguments.length===0){try{indexedDB=globalThis.indexedDB;}catch{/* unavailable storage is a supported state */}}
  async function database() {
    if (!indexedDB) throw fail('storage');
    return new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{settled=true;reject(fail('storage'));},1500);
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
      request.onerror=request.onblocked=()=>{clearTimeout(timer);settled=true;reject(fail('storage'));};
      request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;resolve(request.result);};
    });
  }
  async function transaction(mode,operation) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      let value, failure;
      const tx=db.transaction(STORE,mode);
      const timer=setTimeout(()=>{failure=fail('storage');try{tx.abort();}catch{db.close();reject(failure);}},1500);
      tx.oncomplete=()=>{clearTimeout(timer);db.close();resolve(value);};
      tx.onerror=()=>{failure ||= fail('storage');};
      tx.onabort=()=>{clearTimeout(timer);db.close();reject(failure||fail('storage'));};
      try { operation(tx.objectStore(STORE), v=>{value=v;}, e=>{failure=e;tx.abort();}); }
      catch(e){failure=e;tx.abort();}
    });
  }
  return {
    all:()=>transaction('readonly',(store,set)=>{const r=store.getAll();r.onsuccess=()=>set(r.result);}),
    mutate:(id,fn)=>transaction('readwrite',(store,set,abort)=>{
      const r=store.get(id);r.onsuccess=()=>{try{const next=fn(r.result);if(next)store.put(next);set(next||r.result);}catch(e){abort(e);}};
    }),
  };
}

export function createResultOutbox({storage=createIndexedResultStorage(),now=Date.now}={}) {
  const memory=new Map(), active=new Map();
  async function write(id,change) {
    const result=await storage.mutate(id,change);
    // transaction completion alone isn't claimed as a verified saved snapshot.
    const reread=(await storage.all()).find(r=>r?.id===id);
    if(!same(result,reread))throw fail('storage');
    return result;
  }
  async function save(snapshot) {
    if(!validSnapshot(snapshot))return {error:'invalid',persisted:false};
    const frozen=clone(snapshot), id=frozen.playId;
    const previous=memory.get(id);
    if(previous&&!same(previous.record.snapshot,frozen))return {error:'conflict',persisted:false};
    if(previous?.record.state==='accepted')return clone(previous);
    const make=old=>{
      if(old && (!validRecord(old)||!same(old.snapshot,frozen)))throw fail('conflict');
      return old||{schema:1,id,snapshot:frozen,state:'pending',leaseUntil:0,receipt:null};
    };
    try{const record=await write(id,make);memory.set(id,{record,persisted:true});return {record:clone(record),persisted:true};}
    catch(e){if(e.code==='conflict')return {error:'conflict',persisted:false};
      const entry=previous||{record:make(),persisted:false};entry.persisted=false;memory.set(id,entry);return clone(entry);}
  }
  async function list() {
    let quarantined=0, unavailable=false;
    try {const rows=await storage.all();for(const entry of memory.values())entry.persisted=false;for(const r of rows){
      if(!validRecord(r)){quarantined++;continue;}
      const old=memory.get(r.id);
      // Never downgrade a receipt known to this tab if its disk write failed.
      if(!old || same(old.record,r) || (old.record.state!=='accepted' && same(old.record.snapshot,r.snapshot)))memory.set(r.id,{record:r,persisted:true});
    }} catch{unavailable=true;for(const entry of memory.values())entry.persisted=false;}
    return {records:[...memory.values()].map(clone),quarantined,unavailable};
  }
  function attempt(id,submit) {
    if(active.has(id))return active.get(id);
    const work=(async()=>{
      await list();let entry=memory.get(id);
      if(!entry)return {result:{status:'error'},persisted:false,error:'invalid'};
      if(entry.record.state==='accepted')return {result:clone(entry.record.receipt),persisted:entry.persisted};
      const snapshot=clone(entry.record.snapshot);
      try {
        const record=await write(id,old=>{
          if(old&&(!validRecord(old)||!same(old.snapshot,snapshot)))throw fail('conflict');
          if(old?.state==='accepted')return old;
          if(old?.state==='sending'&&old.leaseUntil>now())throw fail('busy');
          return {...(old||entry.record),state:'sending',leaseUntil:now()+30000};
        });
        entry={record,persisted:true};memory.set(id,entry);
        if(record.state==='accepted')return {result:clone(record.receipt),persisted:true};
      } catch(e) {
        if(['busy','conflict'].includes(e.code))return {result:{status:e.code},persisted:entry.persisted,error:e.code};
        // Original frozen result remains available when durable storage is unavailable.
        entry.persisted=false;
      }
      let result;
      try{result=await submit(clone(snapshot));}catch{result={status:'error',accepted:false};}
      if(!result || typeof result.status!=='string')result={status:'error',accepted:false};
      if(result?.status==='ok'&&!validReceipt(result,snapshot))result={status:'error',accepted:false};
      const record={...entry.record,state:validReceipt(result,snapshot)?'accepted':'failed',leaseUntil:0,
        receipt:validReceipt(result,snapshot)?clone(result):null};
      memory.set(id,{record,persisted:false});
      try {const saved=await write(id,old=>{
        if(old&&(!validRecord(old)||!same(old.snapshot,snapshot)))throw fail('conflict');
        if(old?.state==='accepted')return old;
        return record;
      });memory.set(id,{record:saved,persisted:true});return {result:saved.receipt||result,persisted:true};}
      catch{return {result,persisted:false};}
    })();
    active.set(id,work);work.finally(()=>{if(active.get(id)===work)active.delete(id);});return work;
  }
  return {save,list,attempt};
}
