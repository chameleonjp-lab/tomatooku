const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync,readdirSync}=require('node:fs');
const {resolve,extname}=require('node:path');
const {chromium,webkit}=require('playwright');
const root=resolve(__dirname,'..'),origin='https://tomato-fixture.invalid';
function assets(){const files=new Map([['/',resolve(root,'index.html')]]);for(const dir of ['src','generated']){const walk=relative=>{for(const item of readdirSync(resolve(root,relative),{withFileTypes:true})){const path=relative+'/'+item.name;if(item.isDirectory())walk(path);else if(['.js','.css','.json'].includes(extname(path)))files.set('/'+path,resolve(root,path));}};walk(dir);}return files;}
function solve(areas){const solutions=[],columns=new Set(),regions=new Set(),placed=[];function visit(row){if(row===5){solutions.push([...placed]);return;}for(let col=0;col<5;col++){const area=areas[row*5+col];if(columns.has(col)||regions.has(area)||(row&&Math.abs(placed[row-1]-col)<2))continue;columns.add(col);regions.add(area);placed[row]=col;visit(row+1);columns.delete(col);regions.delete(area);}}visit(0);assert.equal(solutions.length,1);return solutions[0];}
async function run(){
 const files=assets();const output=resolve(process.env.TOMATO_SHARE_OUTPUT||'test-artifacts/tomato-share-'+Date.now());mkdirSync(output,{recursive:true});
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});const context=await browser.newContext({viewport:{width:760,height:1000},locale:'ja-JP',serviceWorkers:'block'});let unknown=0;let pageErrors=0;
  try{
   await context.routeWebSocket('**/*',socket=>{unknown++;socket.close();});
   await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());const file=files.get(u.pathname);if(request.method()!=='GET'||u.origin!==origin||u.username||u.password||u.search||!file){unknown++;return route.abort('blockedbyclient');}return route.fulfill({status:200,contentType:({'.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(file)]||'text/html',body:readFileSync(file)});});
   await context.addInitScript(()=>{let seed=19;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);});
   const page=await context.newPage();page.on('pageerror',()=>pageErrors++);await page.goto(origin+'/');
   // Synthetic local-only fixture label; it is not part of the board image or receipt.
   await page.locator('#player-name').fill('素材確認');await page.locator('#start-practice-btn').click();
   await page.waitForSelector('#screen-game.active #board .cell',{timeout:15000});
   await page.waitForFunction(()=>!document.querySelector('#board .cell').disabled);
   assert.equal(await page.locator('#board').getAttribute('data-mode'),'practice');
   const areas=await page.locator('#board .cell').evaluateAll(cells=>cells.map(cell=>cell.className.match(/area-([A-E])/)[1]));const solution=solve(areas);
   for(let row=0;row<2;row++)await page.locator('#board .cell').nth(row*5+solution[row]).click();
   await page.locator('#board').screenshot({path:resolve(output,`${engineName}-real-board.png`)});
   const receipt=await page.locator('#board').evaluate(board=>({mode:board.dataset.mode,stageId:board.dataset.stageId,cells:board.querySelectorAll('.cell').length,placed:board.querySelectorAll('.cell.filled').length,width:board.getBoundingClientRect().width,height:board.getBoundingClientRect().height}));
   assert.equal(unknown,0);assert.equal(pageErrors,0);assert.equal(receipt.cells,25);assert.equal(receipt.placed,2);
   writeFileSync(resolve(output,`${engineName}-capture.json`),JSON.stringify({engine:engineName,...receipt,externalRequests:unknown,pageErrors,source:'normal local practice mode; first two legal clicks on actual DOM board; no game/renderer override'},null,2)+'\n');
   console.log(JSON.stringify({engine:engineName,cells:receipt.cells,externalRequests:unknown,pageErrors}));
  }finally{await context.close();await browser.close();}
 }
}
if(require.main===module)run().catch(()=>{console.error('isolated-capture-failed');process.exitCode=1;});
module.exports={assets,solve};
