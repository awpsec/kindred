// Full shipped UI and native foreground adapter, with an isolated voice API.
// This checks the bridge and layout; it does not claim native audio/ActivityKit QA.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
(async()=>{
  if(process.env.KINDRED_TEST_ARTIFACTS)fs.mkdirSync(process.env.KINDRED_TEST_ARTIFACTS,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({timeout:90000});
  try{
    const page=await browser.newPage({viewport:{width:951,height:669}}),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message)});let starts=0,finished=false;
    await page.route('**/api/chats/**',async route=>{const response=await route.fetch();const value=await response.json();if(Array.isArray(value.messages)){value.messages=value.messages.slice(-4);value.page={has_before:false,has_after:false};if(finished)value.messages.push({seq:100000,sender:'user',text:'Call ended · 1:23',kind:'voice_call',run_id:'',created:1791302500})}return route.fulfill({response,json:value})});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/voice/settings',route=>route.fulfill({json:{enabled:true,configured:true,voice:'willow',voices:[{id:'willow',name:'Willow'}]}}));
    await page.route('**/api/voice/start',route=>{starts++;return route.fulfill({json:{id:'6f9619ff-8b86-4d11-b42d-00cf4fc964aa',ticket:'b'.repeat(64)}})});
    const native=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
    await page.addInitScript(({token,profileID,layout,composer,css})=>{
      sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_NATIVE_GLASS:true});
      window.nativeMessages=[];window.voiceMessages=[];
      window.__KINDRED_IOS_VOICE={protocolVersion:1,documentID:'6f9619ff-8b86-4d11-b42d-00cf4fc964bb'};
      window.voiceEvent=value=>dispatchEvent(new CustomEvent('kindred-ios-voice',{detail:{documentID:__KINDRED_IOS_VOICE.documentID,id:'6f9619ff-8b86-4d11-b42d-00cf4fc964aa',...value}}));
      window.webkit={messageHandlers:{kindredVoice:{postMessage:m=>{voiceMessages.push(m);if(m.action==='start')queueMicrotask(()=>voiceEvent({type:'started',started_ms:Date.now()-83000}));if(m.action==='mute')queueMicrotask(()=>voiceEvent({type:'mute',muted:m.muted}));if(m.action==='end')queueMicrotask(()=>voiceEvent({type:'ended',saved:true}));}},kindredAccounts:{postMessage:m=>{nativeMessages.push(m);if(m.action==='glass-controls')queueMicrotask(()=>__kindredGlassControls.setActive(m.document,[...m.controls.map(c=>c.id),...(m.composer?['composer']:[])],m.sequence));}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
      window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
      window.__KINDRED_IOS_TOOLBAR={x:881,y:40,width:64,height:499};
      window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
      addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(composer);(0,eval)(layout);},{once:true});
    },{token,profileID,layout:fs.readFileSync(path.join(native,'MobileLayout.js'),'utf8'),composer:fs.readFileSync(path.join(native,'NativeComposer.js'),'utf8'),css:fs.readFileSync(path.join(native,'MobileLayout.css'),'utf8')});
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper',{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.__KINDRED_STARTUP?.failed||document.querySelector('#startup-status')?.hidden,{},{timeout:90000});assert.equal(await page.evaluate(()=>window.__KINDRED_STARTUP?.failed),false,'app startup must complete before calling');
    await page.waitForFunction(()=>nativeMessages.some(m=>m.composer?.items.some(i=>i.text==='Start voice call')));
    const action=await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.composer).at(-1),item=m.composer.items.find(i=>i.text==='Start voice call');return {document:m.document,context:m.composer.context,revision:1,text:'',selection:[0,0],action:'action',id:item.id,primary:item.primary,symbol:item.symbol}});
    assert.equal(action.primary,true);assert.equal(action.symbol,'waveform');
    await page.evaluate(a=>__kindredNativeComposer.perform(a),action);
    await page.waitForFunction(()=>document.querySelector('.voice-call-state')?.textContent==='Piper is listening');
    assert.equal(starts,1);assert.equal(await page.locator('#composer').getAttribute('data-ios-native-composer'),null,'native editing surface yields to the call');
    assert.equal(await page.locator('#composer').evaluate(e=>getComputedStyle(e).opacity),'1');
    const payload=await page.evaluate(()=>voiceMessages.find(m=>m.action==='start'));assert.equal(payload.botName,'Piper');assert.equal(payload.chatID,'dm-piper');assert(payload.shape);assert.match(payload.color,/^#[0-9a-f]{6}$/i);
    await page.evaluate(()=>voiceEvent({type:'ended',id:'stale-call'}));assert(await page.locator('.voice-call-tray').isVisible());
    await page.evaluate(()=>voiceEvent({type:'ended',documentID:'stale-document'}));assert(await page.locator('.voice-call-tray').isVisible());
    await page.getByRole('button',{name:'Mute microphone',exact:true}).click();assert.equal(await page.evaluate(()=>voiceMessages.at(-1).muted),true);
    for(const [width,height,inner] of [[466,678,false],[669,951,true],[951,669,true]]){
      await page.setViewportSize({width,height});await page.evaluate(({width,height,inner})=>{Object.assign(__KINDRED_IOS_TOOLBAR,{x:width-70,y:40,width:64,height:height-170});dispatchEvent(new CustomEvent('kindred-ios-toolbar',{detail:__KINDRED_IOS_TOOLBAR}));Object.assign(__KINDRED_NATIVE_GEOMETRY,{width,height,windowWidth:width,windowHeight:height});dispatchEvent(new CustomEvent('kindred-native-geometry',{detail:__KINDRED_NATIVE_GEOMETRY}));Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:inner,isPortrait:height>width,viewportHeight:height});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));},{width,height,inner});
      await page.waitForTimeout(350);const box=await page.locator('.voice-end').boundingBox();if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-duo-'+width+'.png')});assert(box&&box.width>=44&&box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height&&box.y>=height-130,'End call remains in the bottom lane below the measured Duo toolbar with a 44pt target');
      assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),0,'folding must not end the call');
    }
    if(process.env.KINDRED_TEST_ARTIFACTS){fs.mkdirSync(process.env.KINDRED_TEST_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-duo-integration.png')});}
    // A native Live Activity End intent reports the same end event without a JS click.
    finished=true;await page.evaluate(()=>voiceEvent({type:'ended',saved:true}));await page.waitForFunction(()=>document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
    assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'');assert(await page.locator('.voice-call-tray').isHidden());
    await page.getByText('Call ended · 1:23',{exact:true}).waitFor();assert.equal(await page.locator('.voice-call-receipt').count(),1);assert.equal(await page.locator('.voice-call-receipt .message-bubble').count(),0);
    assert.deepEqual(errors,[]);console.log('Full iOS voice UI: native composer handoff, identity, stale-event rejection, mute, three Duo poses and native End event passed.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
