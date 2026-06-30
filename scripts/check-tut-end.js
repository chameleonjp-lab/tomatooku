import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); const PORT = 8093;
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css" };
const server = http.createServer((req,res)=>{let p=req.url.split("?")[0]; if(p==="/")p="/index.html"; const f=path.join(ROOT,p); if(!fs.existsSync(f)){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"text/plain"}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(PORT,r));
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle"});
await page.click("#tutorial-btn");
await page.waitForSelector("#tutorial-modal.open");
// wait for cleared board (full sequence ~20s)
await page.waitForSelector(".tboard.tcleared", { timeout: 25000 });
await page.waitForTimeout(2500);
const filled = await page.evaluate(()=>document.querySelectorAll("#tutorial-board .tcell.filled").length);
const okMarks = await page.evaluate(()=>document.querySelectorAll("#tutorial-board .tcell.mark-ok").length);
const cap = (await page.textContent("#tutorial-caption")).replace(/\s+/g,' ').trim();
const bar = await page.evaluate(()=>document.querySelector("#tutorial-bar").style.width);
console.log("filled:", filled, "| mark-ok:", okMarks, "| bar:", bar);
console.log("final caption:", cap);
// replay resets
await page.click("#tutorial-replay");
await page.waitForTimeout(800);
const filledAfter = await page.evaluate(()=>document.querySelectorAll("#tutorial-board .tcell.filled").length);
console.log("after replay (should be small, reset):", filledAfter);
// close stops animation (no errors)
await page.click("#tutorial-modal .modal-close");
console.log("closed ok:", !(await page.isVisible("#tutorial-modal.open")));
await b.close(); server.close();
