const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();this.canvas=document.createElement('canvas');this.canvas.width=800;this.canvas.height=600;host.append(this.canvas);window.fixtureRfb=this;window.fixtureGeneration=(window.fixtureGeneration||0)+1;
 setTimeout(()=>{if(window.fixtureReady)this.dispatchEvent(new Event('connect'));else{this.dispatchEvent(new Event('securityfailure'));this.dispatchEvent(new Event('disconnect'));}},10);}
 disconnect(){this.dispatchEvent(new Event('disconnect'));}
}`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,...(process.env.KINDRED_PLAYWRIGHT_CHANNEL?{channel:process.env.KINDRED_PLAYWRIGHT_CHANNEL}:{})});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(12000);
  const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});let sessions=0,failApi=true;
  await p.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await p.route(origin+'/api/computer/session',r=>{sessions++;return r.fulfill(failApi?{status:503,json:{error:'The bot computer cannot be reached.'}}:{json:{ticket:'fixture',control:false}});});
  await p.route(origin+'/api/computer/resources',r=>r.fulfill({json:{}}));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#show-computer').waitFor();await p.clock.install();await p.locator('#show-computer').click();
  await p.waitForFunction(()=>!document.querySelector('#desktop-error').hidden);
  assert((await p.locator('#desktop-error').innerText()).includes('cannot be reached'));
  for(let i=0;i<3;i++){await p.clock.runFor(8100);}
  assert.equal(sessions,4,'One initial attempt and three retries');
  assert.equal(await p.locator('#desktop-mode').innerText(),'Screen unavailable');
  assert((await p.locator('#desktop-error').innerText()).includes('cannot be reached'));
  await p.clock.fastForward(60000);assert.equal(sessions,4,'A failed viewer must stop retrying');
  failApi=false;await p.locator('#desktop-reconnect').click();await p.clock.runFor(100);
  assert((await p.locator('#desktop-error').innerText()).includes('rejected'));
  await p.clock.runFor(1100);assert.equal(sessions,6,'Security and disconnect events must schedule one retry');
  const prior=await p.evaluate(()=>{window.fixtureReady=true;return window.fixtureGeneration;});await p.locator('#desktop-reconnect').click();await p.waitForFunction(prior=>window.fixtureGeneration>prior,prior);await p.clock.runFor(100);
  assert(await p.locator('#desktop-error').isHidden());assert.equal(await p.locator('#desktop-mode').innerText(),'Watching live');
  await p.locator('#computer-close').click();const closed=sessions;await p.clock.fastForward(60000);assert.equal(sessions,closed);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':(process.env.KINDRED_PLAYWRIGHT_CHANNEL||'chromium'),errorsVisible:true,boundedRetries:true,duplicateFailureEvents:true,manualRecovery:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
