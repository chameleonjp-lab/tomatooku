const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const {assets,solve}=require('./share-capture.cjs');
const {inspectShareTarget}=require('./share-visibility.cjs');
const origin='https://tomato-fixture.invalid',backend='https://tomato-backend.invalid',canonical='https://chameleonjp-lab.github.io/tomatooku/';
async function run(){
 const {SUPPORTED_LANGUAGES,createI18n}=await import('../src/i18n.js');const {TRANSLATIONS}=await import('../src/translations.js');
 const files=assets(),output=resolve(process.env.TOMATO_SHARE_OUTPUT||'test-artifacts/tomato-share-'+Date.now());mkdirSync(output,{recursive:true});
 const receipts=[];
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{for(const {id:language} of SUPPORTED_LANGUAGES){
  const t=createI18n({storage:{getItem:()=>language,setItem(){}},navigatorObject:{language},catalogs:TRANSLATIONS}).t;
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,serviceWorkers:'block'});let unknown=0,errors=0,rankingReads=0;const intents=[];
  try{
   await context.routeWebSocket('**/*',socket=>{unknown++;socket.close();});
   await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
    if(req.method()==='GET'&&u.origin==='https://x.com'&&u.pathname==='/intent/post'&&!u.username&&!u.password&&[...u.searchParams.keys()].every(k=>k==='text')){intents.push(u.searchParams.get('text'));return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Local intent fixture</title>'});}
    if(req.method()==='POST'&&u.origin===backend&&u.pathname==='/rest/v1/rpc/get_best_score_ranking'&&!u.search){const body=req.postDataJSON();if(body.p_game_slug==='tomatoku_competition_v1'&&Number.isInteger(body.p_limit)){rankingReads++;return route.fulfill({status:200,contentType:'application/json',body:'[]'});}}
    const file=files.get(u.pathname);if(req.method()==='GET'&&u.origin===origin&&!u.username&&!u.password&&!u.search&&file)return route.fulfill({status:200,contentType:({'.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'text/html',body:readFileSync(file)});
    unknown++;return route.abort('blockedbyclient');
   });
   await context.addInitScript(({language,backend})=>{localStorage.setItem('tomatoku.language.v1',language);window.TOMATOKU_CONFIG={supabaseUrl:backend,supabasePublishableKey:'sb_publishable_local_fixture_not_a_key',rankingsEnabled:true,submissionsEnabled:false,bestRankingRpc:'get_best_score_ranking'};let seed=19;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('local clipboard unavailable')}}});},{language,backend});
   const page=await context.newPage();page.on('pageerror',()=>errors++);await page.goto(origin+'/');
   async function visible(selector){const target=page.locator(selector);await target.scrollIntoViewIfNeeded();const g=await target.evaluate(inspectShareTarget);assert(g.visible&&g.viewport&&g.unclipped&&g.hit&&g.fits&&g.width>=44&&g.height>=44,`${engineName}/${language}/${selector}: ${JSON.stringify(g)}`);return target;}
   async function snapshot(){return page.evaluate(()=>['result-score','result-time','result-stages','result-mistakes','result-hints','submit-state'].map(id=>document.getElementById(id)?.textContent||''));}
   async function screen(state){const selector=state==='home'?'#home-share-btn':'#result-share-btn';const expected=state==='home'?t('「トマトオク」5×5に🍅を置くパズル!\n{url}',{url:canonical}):t('トマトオク {mode}で補正タイム{time}秒！\n誤タップ{mistakes} / ヒント{hints}\n{url}',{mode:t('ランダム練習'),time:await page.locator('#result-score').textContent(),mistakes:await page.locator('#result-mistakes').textContent(),hints:await page.locator('#result-hints').textContent(),url:canonical});
    for(const [orientation,viewport] of [['portrait',{width:393,height:852}],['landscape',{width:852,height:393}]]){
     await page.setViewportSize(viewport);const target=await visible(selector);assert.equal((await target.innerText()).trim(),t('Xでシェア'));assert.equal(await page.locator('button').filter({hasText:/共有文をコピー|Copy share text/}).count(),0);
     const colors=await target.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.deepEqual(colors,{background:'rgb(0, 0, 0)',color:'rgb(255, 255, 255)'});
     const before=await snapshot(),beforeIntents=intents.length;const popupPromise=context.waitForEvent('page');await target.tap();const popup=await popupPromise;await popup.waitForURL('https://x.com/intent/post?*');await popup.waitForLoadState();assert.equal(intents.length,beforeIntents+1);assert.equal(intents.at(-1),expected+'\n#トマトオク #ゲーム制作');assert(!intents.at(-1).includes('素材確認'));await popup.close();assert.deepEqual(await snapshot(),before);
     await visible(selector);await page.screenshot({path:resolve(output,`${engineName}-${language}-${orientation}-${state}.png`),fullPage:true});
     await visible(state==='home'?'#detail-ranking-link':'#result-detail-ranking-link');if(state==='result')await visible('#again-btn');
     assert.equal(unknown,0);assert.equal(errors,0);receipts.push({engine:engineName,language,orientation,state,visible:true,touchHit:true,intent:true,externalRequests:unknown,pageErrors:errors});
    }
   }
   await screen('home');await page.setViewportSize({width:393,height:852});await page.locator('#player-name').fill('素材確認');await page.locator('#start-practice-btn').click();await page.waitForSelector('#screen-game.active #board .cell');await page.waitForFunction(()=>!document.querySelector('#board .cell').disabled);
   for(let stage=0;stage<3;stage++){const areas=await page.locator('#board .cell').evaluateAll(cells=>cells.map(cell=>cell.className.match(/area-([A-E])/)[1]));const answer=solve(areas);for(let row=0;row<5;row++)await page.locator('#board .cell').nth(row*5+answer[row]).tap();if(stage<2)await page.waitForFunction(next=>document.querySelector('#hud-stage')?.textContent===next+'/3'&&document.querySelector('#screen-game')?.classList.contains('active')&&!document.querySelector('#board .cell').disabled,stage+2,{timeout:6000});}
   await page.waitForSelector('#screen-result.active');await screen('result');
   const before=await snapshot();await page.evaluate(()=>{window.open=()=>null;});await (await visible('#result-share-btn')).tap();await page.waitForSelector('#share-fallback');assert((await page.locator('#share-fallback').inputValue()).endsWith('#トマトオク #ゲーム制作'));assert.deepEqual(await snapshot(),before);assert.equal(unknown,0);assert.equal(errors,0);assert(rankingReads>0);
  }finally{await context.close();}
 }}finally{await browser.close();}
 }
 assert.equal(receipts.length,120);writeFileSync(resolve(output,'acceptance.json'),JSON.stringify({cases:receipts.length,receipts,scoreWrites:0,mode:'normal practice only; no official start or score submission'},null,2)+'\n');console.log(JSON.stringify({cases:receipts.length,externalRequests:0,scoreWrites:0}));
}
if(require.main===module)run().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'isolated-share-acceptance-failed');process.exitCode=1;});
