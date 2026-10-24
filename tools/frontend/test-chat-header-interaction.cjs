const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{for(const platform of ['macos','windows','linux']){
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  await page.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.calls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='window_action')calls.push(args.action);return null;}}};},{token,platform});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#bot-details:not([disabled])').waitFor();
  const chip=page.locator('#bot-details');
  for(const name of ['Piper','A very long bot name for the whole client operations team '.repeat(3)]){
   await page.locator('#heading').evaluate((n,name)=>n.textContent=name,name);await page.mouse.move(0,0);await page.waitForTimeout(240);
   const before=await chip.boundingBox();
   const sample=()=>page.evaluate(async()=>{const n=document.querySelector('#bot-details'),frames=[],start=performance.now();while(performance.now()-start<280){const r=n.getBoundingClientRect();frames.push({x:r.x,width:r.width,hover:n.matches(':hover')});await new Promise(requestAnimationFrame);}return frames;});
   // The left edge and avatar must remain stationary while the right extends.
   await page.mouse.move(before.x+3,before.y+before.height/2);
   let frames=await sample();assert(frames.every(r=>r.hover),'Hover must not drop when pointing near the leading edge');
   assert(Math.max(...frames.map(r=>Math.abs(r.x-before.x)))<.75,'Hover entrance must not rubberband: '+JSON.stringify({platform,name,before,frames}));
   const open=await chip.boundingBox();assert(open.width>before.width+18,'Chevron makes room on the right');
   await page.mouse.move(0,0);frames=await sample();assert(Math.max(...frames.map(r=>Math.abs(r.x-before.x)))<.75,'Hover exit must stay anchored: '+JSON.stringify({platform,name,before,frames}));
   for(let i=0;i<4;i++){await page.mouse.move(before.x+3,before.y+before.height/2);await page.waitForTimeout(35);await page.mouse.move(0,0);await page.waitForTimeout(35);}
   await page.waitForTimeout(240);assert(Math.abs((await chip.boundingBox()).x-before.x)<.75,'Rapid reversals settle at the original edge');
  }
  await page.locator('#heading').evaluate(n=>n.textContent='Piper');await page.waitForTimeout(240);
  const header=await page.locator('.conversation-header').boundingBox(),tag=await chip.boundingBox();
  await page.evaluate(()=>calls.length=0);
  for(const x of [header.x+12,tag.x-20,tag.x+tag.width+30,header.x+header.width-12])await page.mouse.click(x,header.y+22);
  assert.deepEqual(await page.evaluate(()=>calls),['drag','drag','drag','drag'],'Both sides of the floating tag drag the '+platform+' window');
  await page.evaluate(()=>calls.length=0);await chip.click();await page.locator('#details-panel').waitFor();
  assert(!(await page.evaluate(()=>calls)).includes('drag'),'Nametag click opens details without dragging');
  await page.waitForTimeout(250);const moved=await chip.boundingBox(),h=await page.locator('.conversation-header').boundingBox();
  await page.evaluate(()=>calls.length=0);await page.mouse.click(Math.min(moved.x+moved.width+35,h.x+h.width-10),h.y+22);
  assert.deepEqual(await page.evaluate(()=>calls),['drag'],'Open detail pane retains remaining header drag area');
  await page.evaluate(()=>calls.length=0);await page.mouse.dblclick(h.x+h.width-12,h.y+22);
  assert((await page.evaluate(()=>calls)).includes('maximize'),'Header double click uses native maximize');
  await page.emulateMedia({reducedMotion:'reduce'});assert(await chip.evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)===0)));
  await page.close();console.log(JSON.stringify({platform,engine:process.env.WEBKIT?'webkit':'chromium',passed:true}));
 }}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
