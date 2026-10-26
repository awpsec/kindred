// Exercise the real Take control error path without touching a real computer.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;
if(out)fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await({chromium,webkit}[engine]).launch({headless:true});
 try{
  for(const viewport of [{width:1280,height:1420},{width:1100,height:800},{width:390,height:844}]){
   const p=await browser.newPage({viewport});p.setDefaultTimeout(7000);const errors=[];let control=false,attempt=0,sessions=0;
   p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
   await p.route(origin+'/vendor.js',r=>r.fulfill({contentType:'text/javascript',body:`export * from './vendor.js?real';export class RFB extends EventTarget {constructor(host){super();const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;canvas.style.cssText='width:100%;height:100%;background:#20334a';host.append(canvas);this.host=host;setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}disconnect(){this.host.remove();}set scaleViewport(v){}set viewOnly(v){}set resizeSession(v){}set background(v){}}`}));
   await p.route(origin+'/vendor.js?real',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'))}));
   await p.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
   await p.route(origin+'/api/status*',r=>r.fulfill({json:{vm_enabled:true,screen_bot_id:'piper',takeover:control}}));
   await p.route(origin+'/api/computer/screen-state*',r=>r.fulfill({json:{state:'ready'}}));
   await p.route(origin+'/api/computer/session',r=>{sessions++;return r.fulfill({json:{ticket:'fixture',control}});});
   await p.route(origin+'/api/takeover',r=>{attempt++;if(attempt===1)return r.fulfill({status:409,json:{error:"Stop this bot's active task before taking control."}});if(attempt===2)return r.abort('failed');control=true;return r.fulfill({json:{enabled:true}});});
   await p.goto(origin);await p.locator('#prompt').waitFor();await p.locator('#bot-details').click();await p.getByRole('tab',{name:'Computer',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='Watching live');await p.waitForTimeout(400);
   const geometry=()=>p.locator('#computer-panel').evaluate(panel=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {panel:panel.getBoundingClientRect().toJSON(),preview:box('desktop'),error:box('computer-control-error'),toolbar:panel.querySelector('.desktop-toolbar').getBoundingClientRect().toJSON(),scroll:panel.scrollTop};});
   const before=await geometry(),originalSessions=sessions;
   if(out)await p.screenshot({path:path.join(out,`${engine}-${viewport.width}-${viewport.height}-before.png`)});
   for(const message of [/Stop this bot/,/Could not reach the server/]){
    await p.locator('#take-control').click();await p.locator('#computer-control-error').waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('#take-control').disabled);await p.waitForTimeout(150);
    assert.match(await p.locator('#computer-control-error').textContent(),message);const after=await geometry();
    if(out)await p.screenshot({path:path.join(out,`${engine}-${viewport.width}-${viewport.height}-error-${attempt}.png`)});
    assert(after.error.height<100,`feedback must fit its text: ${JSON.stringify(after)}`);
    assert(Math.abs(after.preview.top-before.preview.top-after.error.height-8)<3,'preview moves only by the error text and margin');
    assert.equal(sessions,originalSessions,'denied takeover keeps the passive connection');
    assert.equal(after.preview.height,before.preview.height,'preview keeps its size');
    assert(after.preview.bottom<=after.panel.bottom,'preview remains within the visible pane');
   }
   await p.locator('#take-control').click();await p.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='You have control');
   assert(await p.locator('#computer-control-error').isHidden(),'successful retry clears inline feedback');
   assert(Math.abs((await geometry()).preview.top-before.preview.top)<3,'successful retry restores normal layout');
   assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,viewport,conflict:true,networkFailure:true,retry:true,passiveConnectionPreserved:true}));await p.close();
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
