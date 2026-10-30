// Actual shipped startup + bundled iOS bridge. No server deployment or accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const native=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try {
  const origin='http://127.0.0.1:'+server.address().port,reports=[];
  for(const scenario of ['slow','empty','module-failure']) {
   const context=await browser.newContext({viewport:{width:466,height:678}});
   await context.addInitScript(({token,css,js})=>{
    Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:'ios-startup-fixture',__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
    sessionStorage.setItem('kindred-token',token);window.nativeStartup=[];
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:m=>nativeStartup.push(m)},kindredNavigation:{postMessage:()=>{}}}};
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js)},{once:true});
   },{token,css:fs.readFileSync(path.join(native,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(native,'MobileLayout.js'),'utf8')});
   const page=await context.newPage();
   let release;
   if(scenario==='slow') {
    const gate=new Promise(r=>release=r);
    await page.route('**/api/chats',async route=>{await gate;await route.continue()});
   }
   if(scenario==='empty')for(const url of ['**/api/chats','**/api/bots'])await page.route(url,route=>route.fulfill({json:[]}));
   if(scenario==='module-failure')await page.route('**/app.js',route=>route.abort());
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   if(scenario==='slow') {
    await page.waitForResponse(r=>r.url().endsWith('/api/bots'));
    assert.equal(await page.locator('#startup-status').evaluate(n=>n.hidden),false);
    assert.equal(await page.evaluate(()=>nativeStartup.filter(m=>m.action==='launch-ready').length),0,'Populated rows must not reveal the unfinished startup');
    release();
   }
   if(scenario==='module-failure') {
    await page.waitForFunction(()=>nativeStartup.some(m=>m.action==='startup-failed'));
    assert.equal(await page.evaluate(()=>nativeStartup.filter(m=>m.action==='startup-failed').length),1);
    assert.equal(await page.evaluate(()=>nativeStartup.filter(m=>m.action==='launch-ready').length),0);
   } else {
    await page.waitForFunction(()=>nativeStartup.some(m=>m.action==='launch-ready'));
    assert.equal(await page.locator('#startup-status').evaluate(n=>n.hidden),true);
    await page.setViewportSize({width:867,height:645});
    await page.evaluate(()=>{dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'))});
    assert.equal(await page.evaluate(()=>nativeStartup.filter(m=>m.action==='launch-ready').length),1,'Resume and resize do not replay startup');
   }
   reports.push({scenario,passed:true});await context.close();
  }
  console.log(JSON.stringify({passed:true,reports}));
 } finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
