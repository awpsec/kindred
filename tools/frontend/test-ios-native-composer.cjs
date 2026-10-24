// Exercise the production native foreground bridge against real draft/send handlers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{
  const page=await browser.newPage({viewport:{width:951,height:669}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const dir=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
  await page.addInitScript(({token,profileID,css,native,layout})=>{
   sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_NATIVE_GLASS:true});
   window.nativeMessages=[];
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:m=>{nativeMessages.push(m);if(m.action==='glass-controls')queueMicrotask(()=>__kindredGlassControls.setActive(m.document,[...m.controls.map(c=>c.id),...(m.composer?['composer']:[])],m.sequence));}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
   window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(native);(0,eval)(layout);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(dir,'MobileLayout.css'),'utf8'),native:fs.readFileSync(path.join(dir,'NativeComposer.js'),'utf8'),layout:fs.readFileSync(path.join(dir,'MobileLayout.js'),'utf8')});
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/#kindred-chat=dm-piper');
  await page.waitForFunction(()=>document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
  const model=()=>page.evaluate(()=>nativeMessages.filter(m=>m.composer).at(-1));
  let state=await model();assert.equal(state.composer.context,'bots:piper|message');
  assert(await page.locator('#composer').evaluate(n=>getComputedStyle(n).backdropFilter==='none'&&getComputedStyle(n).opacity==='0'));
  assert.equal(await page.locator('#prompt').getAttribute('contenteditable'),'false');
  const call=async(action,extra={})=>{const m=await model();return page.evaluate(c=>__kindredNativeComposer.perform(c),{document:m.document,context:m.composer.context,revision:1,text:'Native 🦋 draft',selection:[15,0],action,...extra});};
  assert(await call('edit'));await page.waitForFunction(()=>document.querySelector('#prompt').value==='Native 🦋 draft');
  assert(await call('focus',{focused:true}));assert.equal(await page.evaluate(()=>__KINDRED_NATIVE_COMPOSER_FOCUSED),true);
  assert.equal(await call('edit',{context:'bots:wrong|message',text:'Must not leak'}),false);
  assert.equal(await call('edit',{revision:0,text:'Stale edit'}),false);
  assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Native 🦋 draft');
  assert(await call('edit',{revision:2,text:'@',selection:[1,0]}));
  await page.waitForFunction(()=>__kindredNativeComposer.snapshot(false)?.items.some(i=>i.kind==='suggestion'));
  assert((await model()).composer.popup.height>0,'native suggestions keep their real scroll area');
  assert(await call('key',{key:'Enter',revision:2,text:'@',selection:[1,0]}));
  await page.waitForFunction(()=>document.querySelector('#prompt [data-mention]'));
  assert.equal((await (await fetch(base+'/fixture/state')).json()).messages['dm-piper'],72,'Return chooses the suggestion without sending');
  assert(await call('edit',{revision:3,text:'Native 🦋 draft',selection:[15,0]}));
  const top=await page.locator('#composer').boundingBox();await page.setViewportSize({width:466,height:678});
  await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:false,isPortrait:true,viewportHeight:678});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
  await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing);
  assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Native 🦋 draft');assert((await page.locator('#composer').boundingBox()).width<top.width);
  assert(await call('send',{revision:3}));await page.waitForFunction(()=>document.querySelector('#prompt').value==='');
  const response=await fetch(base+'/fixture/state'),receipt=await response.json();assert.equal(receipt.messages['dm-piper'],74,'one real fixture send adds one user and one bot message');
  assert.equal(await page.locator('.ios-reading-indicator').count(),0);
  await page.evaluate(()=>document.querySelector('#settings-button').click());await page.locator('#settings-dialog[open]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
  assert.equal(await page.locator('#prompt').getAttribute('contenteditable'),'true');
  assert.equal(await page.evaluate(()=>__KINDRED_NATIVE_COMPOSER_FOCUSED),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,nativeModelBridge:true,unicodeDraft:true,staleContextRejected:true,staleRevisionRejected:true,retainedResize:true,oneSend:true,modalRevocation:true,noSyntheticScrollbar:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
