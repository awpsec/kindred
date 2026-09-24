// An async startup continuation must not issue new fetches after pagehide.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];let messages=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname==='/api/chats/dm-piper')messages++;});
  await context.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);const digest=crypto.subtle.digest.bind(crypto.subtle);let first=true;
   crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(first){first=false;await new Promise(resolve=>{window.releaseStartupDigest=resolve;});}return result;};
  },token);
  await page.goto(origin);await page.waitForFunction(()=>!!window.releaseStartupDigest);
  assert.equal(messages,0);assert(await page.locator('#bot-details').isDisabled());
  await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.releaseStartupDigest();});
  await page.waitForTimeout(300);assert.equal(messages,0,'A suspended page must not start a new message fetch.');assert.deepEqual(errors,[]);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.locator('.screenshot-attachment').waitFor();assert(messages>0);assert(await page.locator('#bot-details').isEnabled());assert.deepEqual(errors,[]);
  await context.close();console.log(JSON.stringify({passed:true,engine,noFetchAfterPageHide:true,pageShowRefreshes:true,delayedStartup:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
