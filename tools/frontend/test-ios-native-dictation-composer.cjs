const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try {
  const page=await browser.newPage({viewport:{width:951,height:669}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const dir=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
  await page.addInitScript(({token,profileID,css,native,layout})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_NATIVE_GLASS:true});
   window.nativeMessages=[];window.speechCommands=[];
   window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:true,recognizerAvailable:true,locale:'en-US',documentID:'00000000-0000-4000-8000-000000000001'};
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:m=>{nativeMessages.push(m);if(m.action==='glass-controls')queueMicrotask(()=>__kindredGlassControls.setActive(m.document,[...m.controls.map(c=>c.id),...(m.composer?['composer']:[])],m.sequence));}},kindredDictation:{postMessage:m=>speechCommands.push(m)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
   window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(native);(0,eval)(layout);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(dir,'MobileLayout.css'),'utf8'),native:fs.readFileSync(path.join(dir,'NativeComposer.js'),'utf8'),layout:fs.readFileSync(path.join(dir,'MobileLayout.js'),'utf8')});
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/#kindred-chat=dm-piper');
  await page.waitForFunction(()=>nativeMessages.filter(m=>m.composer).at(-1)?.composer.items.some(i=>i.symbol==='mic'));
  const model=()=>page.evaluate(()=>nativeMessages.filter(m=>m.composer).at(-1));
  let revision=0;
  const perform=async(action,extra={})=>{const m=await model();return page.evaluate(c=>__kindredNativeComposer.perform(c),{document:m.document,context:m.composer.context,revision,text:m.composer.text,selection:[m.composer.text.length,0],action,...extra});};
  const emit=(op,sequence,phase,text)=>page.evaluate(detail=>dispatchEvent(new CustomEvent('kindred-ios-dictation',{detail})),{documentID:op.documentID,operationID:op.operationID,chatID:op.chatID,sequence,phase,...(text===undefined?{}:{text})});
  for(const draft of ['', 'Before after']) {
   revision++;assert(await perform('edit',{revision,text:draft,selection:[draft?6:0,0]}));
   await page.waitForFunction(text=>nativeMessages.filter(m=>m.composer).at(-1)?.composer.text===text,draft);
   const mic=(await model()).composer.items.find(i=>i.symbol==='mic');assert(mic);
   assert(await perform('action',{id:mic.id,selection:[draft?6:0,0]}));
   const op=await page.evaluate(()=>speechCommands.filter(c=>c.action==='start').at(-1));assert(op);
   await emit(op,1,'recording');await emit(op,2,'partial','spoken words');
   const expected=draft?'Before spoken words after':'spoken words';
   await page.waitForFunction(text=>nativeMessages.filter(m=>m.composer).at(-1)?.composer.text===text,expected);
   for(let i=0;i<4;i++)assert(await perform('selection'));
   assert.equal((await page.locator('.dictation-transcript').textContent()).trim(),'spoken words');
   const stop=(await model()).composer.items.find(i=>i.symbol==='stop.fill');assert(stop);
   assert(await perform('action',{id:stop.id}));
   await emit(op,3,'final','spoken words');await emit(op,4,'stopped','spoken words');
   await page.waitForFunction(text=>!document.querySelector('.dictation-transcript')&&nativeMessages.filter(m=>m.composer).at(-1)?.composer.text===text,expected);
   assert.equal(await page.locator('#prompt').textContent(),expected);
  }
  assert.equal((await (await fetch(base+'/fixture/state')).json()).messages['dm-piper'],72);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,nativeMicrophoneAction:true,livePartialsReachNativeModel:true,emptyAndPopulatedDrafts:true,repeatedSelectionRetainsTranscript:true,stopCommitsOnce:true,noSend:true,actualSpeechRecognition:false}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
