// Real WebKit input against the retained UI: haptics follow user selection,
// never restoration, refresh, synthetic clicks, or reselecting the same chat.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try {
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const dir=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
  await page.addInitScript(({token,profileID,css,layout})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
   window.nativeMessages=[];
   window.webkit={messageHandlers:Object.fromEntries(['kindredAccounts','kindredNavigation','kindredSession'].map(name=>[name,{postMessage:m=>nativeMessages.push(m)}]))};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(layout);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(dir,'MobileLayout.css'),'utf8'),layout:fs.readFileSync(path.join(dir,'MobileLayout.js'),'utf8')});
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/#kindred-chat=dm-piper');
  const row=id=>page.locator(`#bots .bot-link[data-sidebar-id="${id}"]`);
  const pulses=()=>page.evaluate(()=>nativeMessages.filter(m=>m.action==='haptic-selection'));
  await row('piper').filter({has:page.locator('.character')}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#bots [data-sidebar-id="piper"].active'));
  assert.equal((await pulses()).length,0,'restoring a conversation is silent');
  await row('piper').click();assert.equal((await pulses()).length,0,'same conversation is silent');
  await page.locator('#prompt').fill('Unsent draft survives feedback');
  await row('vivienne').evaluate(n=>n.click());
  await page.waitForFunction(()=>document.querySelector('#bots [data-sidebar-id="vivienne"].active'));
  assert.equal((await pulses()).length,0,'programmatic navigation is silent');
  await row('piper').click();
  await page.waitForFunction(()=>nativeMessages.filter(m=>m.action==='haptic-selection').length===1);
  assert.equal(await page.locator('#prompt').textContent(),'Unsent draft survives feedback');
  const first=(await pulses())[0];assert.equal(first.key,'bots:piper');
  assert(await page.evaluate(m=>__kindredHaptics.acceptsSelection(m.document,m.key),first));
  assert.equal(await page.evaluate(m=>__kindredHaptics.acceptsSelection('wrong-document',m.key),first),false);
  await row('piper').click();assert.equal((await pulses()).length,1);
  await row('vivienne').click();
  await page.waitForFunction(()=>nativeMessages.filter(m=>m.action==='haptic-selection').length===2);
  assert.equal(await page.evaluate(m=>__kindredHaptics.acceptsSelection(m.document,m.key),first),false,'late selection is no longer eligible');
  await page.setViewportSize({width:951,height:669});
  await page.locator('.conversation-history').evaluate(n=>n.scrollTop=0);
  await page.evaluate(()=>dispatchEvent(new Event('resize')));
  assert.equal((await pulses()).length,2,'scroll and display changes are silent');
  await page.reload();await row('piper').waitFor();assert.equal((await pulses()).length,0,'reload does not replay feedback');
  assert.equal(await page.evaluate(m=>__kindredHaptics.acceptsSelection(m.document,m.key),first),false,'old document cannot request feedback');
  assert.deepEqual(errors,[]);
  assert.equal((await (await fetch(base+'/fixture/state')).json()).messages['dm-piper'],72,'haptics never submit drafts');
  console.log(JSON.stringify({pass:true,trustedConversationSelection:true,sameConversationSilent:true,syntheticNavigationSilent:true,restorationSilent:true,resizeAndScrollSilent:true,staleDocumentAndContextRejected:true,draftPreserved:true,noSend:true}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
