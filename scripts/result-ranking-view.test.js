import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRankingClient} from '../src/ranking.js';
import {formatCentiseconds,formatTime} from '../src/game.js';
import {createI18n} from '../src/i18n.js';
import {TRANSLATIONS} from '../src/translations.js';
const source=fs.readFileSync('src/main.js','utf8');
const code=source.slice(source.indexOf('function goToResult('),source.indexOf('async function shareText('));
const elements=new Map();
function get(selector) {
 if(!elements.has(selector)) elements.set(selector,{textContent:'',className:'',children:[],_html:'',set innerHTML(v){this._html=v;this.children=[]},get innerHTML(){return this._html},append(child){this.children.push(child)}});
 return elements.get(selector);
}
let response=async()=>({ok:true,json:async()=>[]});
const requests=[];
const client=createRankingClient({
 supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz',
 gameSlug:'tomatoku_competition_v1',clientVersion:'test',rankingsEnabled:true,submissionsEnabled:true,
 bestRankingRpc:'get_best_score_ranking',timeoutMs:1000
},{fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return response();}});
const session={mode:'practice',totalStages:3,runToken:null,transcript:()=>[],resultBreakdown:()=>({elapsedMs:1000,adjustedTimeCentiseconds:100,mistakeCount:0,hintCount:0,mistakePenaltyCentiseconds:0,hintPenaltyCentiseconds:0})};
const context={
 $:get,session,phase:'playing',PHASE:{RESULT:'result'},GAME_MODE:{OFFICIAL:'official',PRACTICE:'practice'},
 isActivePlay:()=>true,clearAsyncWork(){},monotonicNow:()=>1000,formatCentiseconds,formatTime,
 renderStageTimes(){},setPhase(value){context.phase=value},isSubmissionEnabled:()=>true,isRankingEnabled:()=>true,isConfigured:()=>true,
 officialSubmissionPromise:null,submitScore:client.submitScore,fetchBestRanking:client.fetchBestRanking,
 rankingRequestIds:new Map(),t:createI18n({storage:null,navigatorObject:{language:'ja'},catalogs:TRANSLATIONS}).t,
 modeLabel:()=> 'practice',gameUrl:()=> 'https://example.invalid/game',shareText(){},
 document:{createElement:()=>({})}
};
vm.createContext(context);vm.runInContext(code,context);
context.goToResult('practice-play');
await new Promise(resolve=>setImmediate(resolve));
assert.match(get('#submit-state').textContent,/ランキング対象外/);
assert.equal(requests.length,1,'practice result loads the existing official ranking');
assert.match(requests[0].url,/\/rest\/v1\/rpc\/get_best_score_ranking$/);
assert.deepEqual(requests[0].body,{p_game_slug:'tomatoku_competition_v1',p_limit:30},'read request contains no name or score');
assert.match(get('#result-ranking').innerHTML,/まだランキングがありません/);
assert.equal(requests.some(r=>r.url.includes('/functions/')),false,'practice never sends prepare/finish');
const box=get('#result-ranking');
let release;
response=()=>new Promise(resolve=>{release=resolve});
const pending=context.loadRankingInto('#result-ranking');
assert.match(box.innerHTML,/読み込み中/,'loading is visible while a read is pending');
release({ok:false,status:503});await pending;
assert.match(box.innerHTML,/読み込めませんでした/);assert.equal(box.children[0].textContent,'再試行');
response=async()=>({ok:true,json:async()=>[]});
await box.children[0].onclick();assert.match(box.innerHTML,/まだランキングがありません/,'retry succeeds without a play submission');
response=async()=>({ok:true,json:async()=>[{rank_no:1,display_name:'<img onerror=alert(1)>',best_score:123,first_score:234}]});
await context.loadRankingInto('#result-ranking');
assert.match(box.innerHTML,/&lt;img onerror=alert\(1\)&gt;/,'player display name is escaped text');
assert.match(box.innerHTML,/1.23/);
assert.equal(requests.every(r=>r.body.p_limit===30 && r.body.p_game_slug==='tomatoku_competition_v1'),true);
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/id="result-detail-ranking-link"[\s\S]*?ranking\.html\?game=tomatoku_competition_v1/);
console.log('✓ Actual practice result handler: read-only top30, exact slug, loading/empty/failure/retry and escaped names');
// A successful manual finish retry must refresh top30, not leave the failed attempt's list.
context.session={...session,playId:'official-test',mode:'official'};
context.officialSubmissionPromise=Promise.resolve({status:'error',accepted:false,persisted:true});
context.resultOutbox={attempt:async()=>({result:{status:'ok',accepted:true,score:100},persisted:true})};
context.sendSavedSnapshot=()=>{};context.refreshRecovery=()=>{};
context.goToResult('official-test');await new Promise(resolve=>setImmediate(resolve));
const beforeRetry=requests.length;
const retryButton=get('#submit-state').children.findLast(child=>typeof child.onclick==='function');
assert.ok(retryButton,'failed official result exposes retry');
await retryButton.onclick();await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,beforeRetry+1,'successful finish retry reloads latest top30');
