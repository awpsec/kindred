const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();await page.clock.install();
  let releaseModule;const held=new Promise(resolve=>releaseModule=resolve);let moduleHeld=false;const calls=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.exposeFunction('lateInvoke',async(command)=>{calls.push(command);return command==='profile_home_state'?{entries:[],last:''}:null;});
  await context.addInitScript(token=>{sessionStorage.setItem('kindred-token',token);sessionStorage.setItem('late-draft','retained');window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_DESKTOP={platform:'linux'};window.__TAURI__={core:{invoke:(...args)=>window.lateInvoke(...args)}};},token);
  await context.route(origin+'/app.js',async route=>{moduleHeld=true;await held;await route.continue();});
  await context.route(origin+'/identity/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/identity/meta'?{profiles:true}:{active:'personal',account_id:'fixture',username:'Fixture',profiles:[{id:'personal',name:'Personal',active:true}],directory:[]}}));
  await page.goto(origin,{waitUntil:'commit'});
  await page.waitForFunction(()=>!!window.__KINDRED_STARTUP&&!!document.getElementById('startup-status'),null,{polling:100});
  await page.clock.fastForward(31000);const retry=page.locator('#startup-status').getByRole('button',{name:'Try again',exact:true});await retry.waitFor();assert(moduleHeld);
  releaseModule();await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(500);
  assert.equal(await retry.count(),1,'late module must preserve recovery');
  assert.deepEqual(calls,[],'expired startup must not begin native restoration after late module evaluation');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),token);assert.equal(await page.evaluate(()=>sessionStorage.getItem('late-draft')),'retained');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',lateModule:true,nativeCalls:calls,retained:true}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
