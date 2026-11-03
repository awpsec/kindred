const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const ui=path.resolve(__dirname,'../../ui');
const server=http.createServer((req,res)=>{const name=req.url.slice(1);if(!['style.css','shell-polish.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(ui,name)));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await(process.env.WEBKIT?webkit:chromium).launch();const page=await browser.newPage({viewport:{width:800,height:500}});
 const origin='http://127.0.0.1:'+server.address().port;
 await page.setContent(`<link rel="stylesheet" href="${origin}/style.css"><link rel="stylesheet" href="${origin}/shell-polish.css"><div class="shell"><aside class="sidebar" style="width:240px;flex:none"><div class="sidebar-bottom"><div id="identity-row" class="identity-row"><button class="identity-button"><span class="user-avatar">Z</span><span id="identity-name">A long account name</span></button><button class="profile-switch-button" aria-label="Switch accounts">↔</button><span class="update-slot"><button class="client-update" aria-label="Update Kindred client"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Update</span></button></span></div></div></aside></div>`);
 await page.evaluate(()=>Promise.all([...document.querySelectorAll('link')].map(n=>n.sheet?Promise.resolve():new Promise(r=>n.onload=r))));
 const check=async(label)=>{
 const boxes=await page.evaluate(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};const row=document.querySelector('.identity-row');return {row:rect(row),buttons:[...row.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(rect)};});
 for(const [i,a] of boxes.buttons.entries()){
 assert(a.x>=boxes.row.x-1&&a.right<=boxes.row.right+1,`${label}: control fits footer ${JSON.stringify(boxes)}`);
 for(const b of boxes.buttons.slice(i+1))assert(a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y+.5||b.bottom<=a.y+.5,`${label}: controls overlap`);
 }
 };
 let cases=0;
 for(const theme of ['light','dark'])for(const width of [160,200,240,320])for(const scale of [1,1.5])for(const label of ['Update','Download update'])for(const switcher of [false,true]){
 await page.evaluate(({theme,width,scale,label,switcher})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';document.documentElement.style.setProperty('--text-scale',scale);document.querySelector('.sidebar').style.width=width+'px';document.querySelector('.client-update span').textContent=label;document.querySelector('.profile-switch-button').hidden=!switcher;},{theme,width,scale,label,switcher});
 await page.locator('.client-update').hover();await check(`${theme} ${width} ${scale} ${label} ${switcher}`);cases++;
 }
 await page.mouse.move(700,400);await page.evaluate(()=>{document.querySelector('.sidebar').style.width='240px';document.documentElement.style.setProperty('--text-scale','1');document.querySelector('.client-update span').textContent='Update';document.documentElement.dataset.motion='on';});
 await page.locator('.client-update').hover();for(let i=0;i<16;i++){await page.evaluate(()=>new Promise(requestAnimationFrame));await check('animated hover');}
 await page.mouse.move(700,400);await page.keyboard.press('Tab');await page.locator('.client-update').focus();await page.waitForTimeout(240);await check('keyboard focus');
 const out=process.env.KINDRED_TEST_ARTIFACTS;if(out){fs.mkdirSync(out,{recursive:true});await page.locator('.sidebar-bottom').screenshot({path:path.join(out,'sidebar-footer.png')});}
 await page.evaluate(()=>{document.querySelector('.shell').classList.add('sidebar-rail');document.querySelector('.sidebar').style.width='76px';});await page.locator('.client-update').hover();await page.waitForTimeout(240);await check('collapsed rail');
 console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',cases,animatedHover:true,keyboard:true,collapsedRail:true}));
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
