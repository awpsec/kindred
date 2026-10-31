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
    page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message)});let starts=0,finished=false,review=false,takeover=false,failOptions=false;const engine=process.env.WEBKIT?'webkit':'chromium';
    await page.route('**/api/chats/**',async route=>{const response=await route.fetch();const value=await response.json();if(Array.isArray(value.messages)){value.messages=value.messages.slice(-4);value.page={has_before:false,has_after:false};if(finished)value.messages.push({seq:100000,sender:'user',text:'Call ended · 1:23',kind:'voice_call',run_id:'',created:1791302500},{seq:100001,sender:'piper',text:'From our call: use the [north entrance](https://example.com/route).',kind:'voice_recap',run_id:'private-call-run',created:1791302501})}return route.fulfill({response,json:value})});
    const voiceRun=status=>({id:'private-call-run',bot_id:'piper',chat_id:'dm-piper',status,created:1791302490,voice_session:true});
    await page.route('**/api/approvals',route=>route.fulfill({json:review?[{id:'call-review',run_id:'private-call-run',tool:'guest_exec',args:{command:'echo fixture'},status:'pending',created:1791302490,voice_run:voiceRun('awaiting_approval')}]:[]}));
    await page.route('**/api/user-tasks',route=>route.fulfill({json:takeover?[{id:'call-takeover',run_id:'private-call-run',bot_id:'piper',title:'Sign in for the call',instructions:'Enter your credentials on the website.',status:'pending',outcome:'',created:1791302490,voice_run:voiceRun('awaiting_user')}]:[]}));
    await page.emulateMedia({reducedMotion:'reduce'});
    const options={enabled:true,configured:true,voice:'willow',pace:'normal',voices:[{id:'willow',name:'Willow'},{id:'cedar',name:'Cedar'}]};
    await page.route('**/api/voice/settings',route=>{if(route.request().method()==='PUT'){if(failOptions)return route.fulfill({status:500,json:{error:'Could not save voice options'}});Object.assign(options,route.request().postDataJSON());}return route.fulfill({json:options});});
    await page.route('**/api/voice/start',route=>{starts++;return route.fulfill({json:{id:'6f9619ff-8b86-4d11-b42d-00cf4fc964aa',ticket:'b'.repeat(64)}})});
    const native=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
    await page.addInitScript(({token,profileID,layout,composer,css})=>{
      sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_NATIVE_GLASS:true});
      window.nativeMessages=[];window.voiceMessages=[];window.speechCommands=[];window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:true,recognizerAvailable:true,locale:'en-US',documentID:'00000000-0000-4000-8000-000000000001'};
      window.__KINDRED_IOS_VOICE={protocolVersion:1,documentID:'6f9619ff-8b86-4d11-b42d-00cf4fc964bb'};
      window.voiceEvent=value=>dispatchEvent(new CustomEvent('kindred-ios-voice',{detail:{documentID:__KINDRED_IOS_VOICE.documentID,id:'6f9619ff-8b86-4d11-b42d-00cf4fc964aa',...value}}));
      window.webkit={messageHandlers:{kindredVoice:{postMessage:m=>{voiceMessages.push(m);if(m.action==='start')queueMicrotask(()=>voiceEvent({type:'started',started_ms:Date.now()-83000}));if(m.action==='mute')queueMicrotask(()=>voiceEvent({type:'mute',muted:m.muted}));if(m.action==='end')queueMicrotask(()=>voiceEvent({type:'ended',saved:true}));}},kindredAccounts:{postMessage:m=>{nativeMessages.push(m);if(m.action==='glass-controls')queueMicrotask(()=>__kindredGlassControls.setActive(m.document,[...(window.webPreview?[]:m.controls.map(c=>c.id)),...(m.composer&&!window.webPreview?['composer']:[]),...(m.voice&&!window.webPreview?['voice']:[])],m.sequence));}},kindredDictation:{postMessage:m=>speechCommands.push(m)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
      window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
      window.__KINDRED_IOS_TOOLBAR={x:881,y:40,width:64,height:499};
      window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
      addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(composer);(0,eval)(layout);},{once:true});
    },{token,profileID,layout:fs.readFileSync(path.join(native,'MobileLayout.js'),'utf8'),composer:fs.readFileSync(path.join(native,'NativeComposer.js'),'utf8'),css:fs.readFileSync(path.join(native,'MobileLayout.css'),'utf8')});
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper',{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.__KINDRED_STARTUP?.failed||document.querySelector('#startup-status')?.hidden,{},{timeout:90000});assert.equal(await page.evaluate(()=>window.__KINDRED_STARTUP?.failed),false,'app startup must complete before calling');
    await page.waitForFunction(()=>nativeMessages.some(m=>m.composer?.items.some(i=>i.text==='Start voice call')));
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.items.some(i=>i.symbol==='mic'&&i.enabled));
    const staleMic=await page.evaluate(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.items.find(i=>i.symbol==='mic').id);
    const action=await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.composer).at(-1),item=m.composer.items.find(i=>i.text==='Start voice call');return {document:m.document,context:m.composer.context,revision:1,text:'',selection:[0,0],action:'action',id:item.id,primary:item.primary,symbol:item.symbol}});
    assert.equal(action.primary,true);assert.equal(action.symbol,'waveform');
    await page.evaluate(()=>{const content=document.querySelector('#content');content.scrollTo({top:content.scrollHeight,behavior:'instant'});});
    await page.evaluate(a=>__kindredNativeComposer.perform(a),action);
    await page.waitForFunction(()=>document.querySelector('.voice-call-state')?.textContent==='Piper is listening');
    await page.waitForFunction(()=>{const e=document.querySelector('#content');return e.scrollHeight-e.clientHeight-e.scrollTop<4});
    assert.equal(starts,1);await page.waitForFunction(()=>document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
    assert.equal(await page.locator('#composer').evaluate(e=>getComputedStyle(e).opacity),'0','UIKit remains the only visible composer');
    assert.equal(await page.locator('#composer .voice-call-tray').count(),0,'call controls live outside the native composer');
    assert(await page.locator('.dictation-button').isHidden());assert(await page.locator('.dictation-button').isDisabled());
    assert.equal(await page.evaluate(({action,staleMic})=>__kindredNativeComposer.perform({...action,id:staleMic}),{action,staleMic}),false,'stale native dictation action cannot steal call capture');
    assert.equal(await page.evaluate(()=>speechCommands.filter(m=>m.action==='start').length),0);
    assert(await page.evaluate(()=>!nativeMessages.filter(m=>m.composer).at(-1).composer.items.some(i=>i.symbol==='mic')));
    assert.equal(await page.getByRole('link',{name:'north entrance',exact:true}).count(),0,'no recap during the call');
    review=true;await page.locator('[data-approval="call-review"]').waitFor({state:'visible'});
    assert(await page.locator('.voice-call-tray').isVisible(),'review does not replace the call');
    review=false;await page.locator('[data-approval="call-review"]').waitFor({state:'hidden'});
    takeover=true;await page.locator('[data-user-task="call-takeover"]').waitFor({state:'visible'});
    assert(await page.locator('.voice-call-tray').isVisible(),'human participation remains available in the call');
    takeover=false;await page.locator('[data-user-task="call-takeover"]').waitFor({state:'hidden'});
    await page.evaluate(()=>{window.nativeRevision=1;window.nativeCommand=(action,text,extra={})=>{const m=nativeMessages.filter(m=>m.composer).at(-1);return __kindredNativeComposer.perform({document:m.document,context:m.composer.context,revision:++nativeRevision,text,selection:[text.length,0],action,...extra})};nativeCommand('edit','Draft while talking');nativeCommand('focus','Draft while talking',{focused:true});});
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.text==='Draft while talking');
    assert(await page.evaluate(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.items.some(i=>i.text==='Send message'&&i.enabled)),'native send stays enabled during a call');
    await page.evaluate(()=>{window.firstVoiceKey=nativeMessages.filter(m=>m.voice).at(-1).voice.key});
    const voiceAction=action=>page.evaluate(action=>{const m=nativeMessages.filter(m=>m.action==='glass-controls'&&m.voice).at(-1);return __kindredGlassControls.performVoice(action,m.voice.key,m.document);},action);
    await page.waitForFunction(()=>document.querySelector('.voice-call-tray').hasAttribute('data-ios-native-voice'));
    assert(await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.voice).at(-1);return !__kindredGlassControls.performVoice('end','stale-call',m.document)&&!__kindredGlassControls.performVoice('end',m.voice.key,'stale-document')}));
    const voiceMotion=()=>page.evaluate(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.reduceMotion);
    assert.equal(await voiceMotion(),true,'system reduced motion reaches native call foreground');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const setting of ['on','off','on']) {
      await page.evaluate(setting=>document.documentElement.dataset.motion=setting,setting);
      await page.waitForFunction(expected=>nativeMessages.filter(m=>m.voice).at(-1).voice.reduceMotion===expected,setting==='off');
      assert(await page.evaluate(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.key===firstVoiceKey),'live motion changes retain the native call identity');
      assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Draft while talking');
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.reduceMotion===true);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.reduceMotion===false);
    assert.equal(starts,1,'motion changes never restart the call');
    assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),0,'motion changes never end the call');
    const beforeBlur=await page.evaluate(()=>nativeMessages.filter(m=>m.action==='native-composer-focus'&&m.focused===false).length);
    await voiceAction('mute');await voiceAction('mute');
    assert.equal(await page.evaluate(()=>nativeMessages.filter(m=>m.action==='native-composer-focus'&&m.focused===false).length),beforeBlur,'mute leaves the keyboard focused');
    assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Draft while talking');
    await page.evaluate(()=>nativeCommand('send','Draft while talking'));await page.waitForFunction(()=>document.querySelector('#prompt').value==='');
    await page.getByText('Draft while talking',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),0,'text sends without ending the call');
    await page.evaluate(()=>nativeCommand('edit','Keep this call draft'));
    const payload=await page.evaluate(()=>voiceMessages.find(m=>m.action==='start'));assert.equal(payload.botName,'Piper');assert.equal(payload.chatID,'dm-piper');assert(payload.shape);assert.match(payload.color,/^#[0-9a-f]{6}$/i);
    await page.evaluate(()=>voiceEvent({type:'ended',id:'stale-call'}));assert(await page.locator('.voice-call-tray').isVisible());
    await page.evaluate(()=>voiceEvent({type:'ended',documentID:'stale-document'}));assert(await page.locator('.voice-call-tray').isVisible());
    await page.evaluate(()=>voiceEvent({type:'levels',input:.09,output:0}));await page.waitForFunction(()=>document.querySelector('.voice-call-tray').dataset.hearing==='true');assert.equal(await page.locator('.voice-call-tray').getAttribute('data-speaking'),'false');
    await page.evaluate(()=>voiceEvent({type:'levels',input:0,output:.12}));await page.waitForFunction(()=>document.querySelector('.voice-call-tray').dataset.speaking==='true');
    await page.evaluate(()=>voiceEvent({type:'levels',input:0,output:0}));await page.waitForFunction(()=>document.querySelector('.voice-call-tray').dataset.speaking==='false');
    await voiceAction('mute');assert.equal(await page.evaluate(()=>voiceMessages.at(-1).muted),true);await voiceAction('mute');assert.equal(await page.evaluate(()=>voiceMessages.at(-1).muted),false);
    await voiceAction('settings');await page.getByRole('dialog',{name:'Voice options'}).waitFor();assert(await page.getByRole('combobox',{name:'Voice',exact:true}).isEnabled());await page.getByRole('combobox',{name:'Voice',exact:true}).selectOption('cedar');await page.waitForFunction(()=>document.querySelector('.voice-call-options').dataset.saving==='false');assert.equal(options.voice,'cedar');await page.getByRole('combobox',{name:'Speaking pace',exact:true}).selectOption('faster');await page.waitForFunction(()=>document.querySelector('.voice-call-options').dataset.saving==='false');assert.equal(options.pace,'faster');
    await page.evaluate(()=>voiceEvent({type:'options_error',message:'Speaking pace could not be applied to this call.'}));
    await page.getByText('Speaking pace could not be applied to this call.',{exact:true}).waitFor();
    assert(await page.locator('.voice-call-tray').isVisible(),'rejected options do not end a call');
    failOptions=true;await page.getByRole('combobox',{name:'Speaking pace',exact:true}).selectOption('slower');
    await page.getByText('Could not save voice options',{exact:true}).waitFor();assert.equal(options.pace,'faster');
    assert.equal(await page.getByRole('combobox',{name:'Speaking pace',exact:true}).inputValue(),'faster');failOptions=false;
    await page.getByRole('combobox',{name:'Speaking pace',exact:true}).selectOption('normal');
    await page.waitForFunction(()=>document.querySelector('.voice-call-options').dataset.saving==='false');assert.equal(options.pace,'normal');
    assert.equal(starts,1,'voice preferences never reconnect the call');assert.equal(await page.getByRole('button',{name:'Enable voice calls'}).count(),0);await page.getByRole('button',{name:'Close voice options',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
    assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Keep this call draft');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const [width,height,inner] of [[466,678,false],[669,951,true],[951,669,true]]){
      await page.setViewportSize({width,height});await page.evaluate(({width,height,inner})=>{Object.assign(__KINDRED_IOS_TOOLBAR,{x:width-70,y:40,width:64,height:height-170});dispatchEvent(new CustomEvent('kindred-ios-toolbar',{detail:__KINDRED_IOS_TOOLBAR}));Object.assign(__KINDRED_NATIVE_GEOMETRY,{width,height,windowWidth:width,windowHeight:height,reservedRegions:inner?[]:[{kind:'occlusion',active:true,x:width-84,y:30,width:84,height:84}]});dispatchEvent(new CustomEvent('kindred-native-geometry',{detail:__KINDRED_NATIVE_GEOMETRY}));Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:inner,isPortrait:height>width,viewportHeight:height});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));},{width,height,inner});
      await page.waitForTimeout(350);
      await voiceAction('settings');await page.getByRole('dialog',{name:'Voice options'}).waitFor();
      await page.waitForFunction(()=>document.querySelector('.voice-call-options').hasAttribute('data-ios-sheet'));
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.voice-call-options')).opacity==='1');
      const settingsBox=await page.locator('.voice-call-options').boundingBox();
      assert(settingsBox.x>=0&&settingsBox.x+settingsBox.width<=width-70,'voice options stay clear of the Duo control rail');
      assert(await page.getByRole('button',{name:'Close voice options',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));
      if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-options-duo-'+width+'-'+engine+'.png')});
      await page.getByRole('button',{name:'Close voice options',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.voice-call-tray').hasAttribute('data-ios-native-voice'));
      const box=await page.locator('.voice-end').boundingBox(),pill=await page.locator('.voice-call-tray').boundingBox(),wave=await page.locator('.voice-wave').boundingBox();
      assert(box&&box.width>=44&&box.x>=0&&box.x+box.width<=width-70&&box.y<height/2,'End call floats at the top, clear of the measured Duo rail, with a 44pt target');
      assert(pill.x>=0&&pill.x+pill.width<=width-70&&wave.width>=90,'the full pill and usable waveform fit the safe chat width');
      if(!inner){assert(Math.abs(pill.x-12)<1);assert(Math.abs((width-84)-(pill.x+pill.width)-pill.x)<1,'front pill has equal gaps to the screen-left edge and actual camera boundary');}
      assert(await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.voice).at(-1);return m.voice.interactive&&m.voice.items.every(i=>i.rect[2]>=44&&i.rect[3]>=44)}),'native call controls retain their full touch targets');
      if(!inner)assert(pill.y>=12&&pill.y<28,'the cover call tray uses the upper lane rather than the hidden header height');
      assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),0,'folding must not end the call');
      assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Keep this call draft','folding preserves the draft');
      assert.equal(await page.locator('#composer').getAttribute('data-ios-native-composer'),'true');
      const maxNative=await page.evaluate(()=>{window.nativeProbe={scans:0,start:nativeMessages.length};const old=__kindredNativeComposer.snapshot;__kindredNativeComposer.snapshot=(...args)=>{nativeProbe.scans++;return old(...args)};window.restoreSnapshot=()=>{__kindredNativeComposer.snapshot=old};return nativeMessages.length;});
      await page.evaluate(()=>{let n=0;const input=[.008,.018,.04,.09,.13,.05,.02,0,.007,.06,.1,.015],output=[0,.03,.05,.14,.06,.016,0,.07,.1,.04];window.levelTimer=setInterval(()=>{voiceEvent({type:'levels',input:input[n%input.length],output:output[n%output.length]});n++},100)});
      await page.waitForTimeout(3800);assert(await page.evaluate(()=>[...document.querySelectorAll('.voice-wave-input i')].some(e=>Number(e.dataset.level)>.15)),'microphone bars must still update after mute/unmute');assert((await page.evaluate(()=>nativeProbe.scans))<35,'decorative waveform updates must not drive native geometry scans at animation frame rate');
      assert(await page.evaluate(()=>nativeMessages.slice(nativeProbe.start).some(m=>m.action==='voice-meter'&&m.input.some(n=>n>.15))),'actual waveform histories reach the native meter bridge');
      if(process.env.KINDRED_TEST_ARTIFACTS)for(const theme of ['dark','light']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(160);await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-floating-duo-'+width+'-'+theme+'-'+engine+'.png')});await page.evaluate(()=>{window.webPreview=true;const m=nativeMessages.filter(m=>m.action==='glass-controls').at(-1);__kindredGlassControls.setActive(m.document,[],m.sequence);});await page.waitForTimeout(80);await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-floating-duo-web-preview-'+width+'-'+theme+'-'+engine+'.png')});await page.evaluate(()=>{window.webPreview=false;const m=nativeMessages.filter(m=>m.action==='glass-controls').at(-1);__kindredGlassControls.setActive(m.document,[...m.controls.map(c=>c.id),...(m.composer?['composer']:[]),...(m.voice?['voice']:[])],m.sequence);});}
      await page.evaluate(()=>{restoreSnapshot();clearInterval(levelTimer);voiceEvent({type:'levels',input:0,output:0});document.documentElement.dataset.theme='dark'});
    }
    await page.evaluate(()=>{const content=document.querySelector('#content');content.scrollTo({top:content.scrollHeight,behavior:'instant'});});
    // End stops capture immediately; the optional visual exit has no audio ownership.
    await page.evaluate(()=>{window.exitProbe={};const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){const animation=original.call(this,frames,options);if(this.matches?.('.voice-call-tray')&&frames.at(-1)?.opacity===0){animation.pause();animation.currentTime=90;exitProbe.animation=animation;exitProbe.frames=frames;}return animation;};document.querySelector('.voice-end').click();});
    assert.equal(await page.evaluate(()=>voiceMessages.filter(m=>m.action==='end').length),1);
    assert(await page.evaluate(()=>document.querySelector('.voice-call-tray').inert));
    assert(await page.evaluate(()=>exitProbe.frames.at(-1).transform.includes('translateY(-18px)')));
    if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-floating-exit-'+engine+'.png')});
    await page.evaluate(()=>exitProbe.animation.finish());await page.locator('.voice-call-tray').waitFor({state:'hidden'});
    await page.waitForFunction(()=>{const e=document.querySelector('#content');return e.scrollHeight-e.clientHeight-e.scrollTop<4});
    await page.locator('.voice-start').waitFor({state:'hidden'}); // draft remains, so Send is primary
    assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'Keep this call draft');
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.items.some(i=>i.symbol==='mic'&&i.enabled));
    // Start once more to test a native system End intent and reduced motion.
    await page.evaluate(()=>nativeCommand('edit',''));await page.waitForFunction(()=>nativeMessages.filter(m=>m.composer).at(-1).composer.items.some(i=>i.text==='Start voice call'));
    await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.composer).at(-1),item=m.composer.items.find(i=>i.text==='Start voice call');nativeCommand('action','',{id:item.id});});
    await page.waitForFunction(()=>document.querySelector('.voice-call-state').textContent==='Piper is listening');await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.querySelector('.voice-call-tray').hasAttribute('data-ios-native-voice'));
    assert(await page.evaluate(()=>{const m=nativeMessages.filter(m=>m.voice).at(-1);return m.voice.key!==firstVoiceKey&&!__kindredGlassControls.performVoice('end',firstVoiceKey,m.document)}),'a retained HTML tray gets a fresh native action identity on the next call');
    // A native Live Activity End intent reports the same end event without a JS click.
    finished=true;await page.evaluate(()=>voiceEvent({type:'ended',saved:true}));await page.waitForFunction(()=>document.querySelector('#composer').hasAttribute('data-ios-native-composer'));
    assert.equal(await page.locator('#prompt').evaluate(e=>e.value),'');assert(await page.locator('.voice-call-tray').isHidden());
    await page.getByText('Call ended · 1:23',{exact:true}).waitFor();assert.equal(await page.locator('.voice-call-receipt').count(),1);assert.equal(await page.locator('.voice-call-receipt .message-bubble').count(),0);
    await page.getByRole('link',{name:'north entrance',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'north entrance',exact:true}).count(),1);
    assert.equal(await page.locator('[data-message="100001"] .task-cards,[data-message="100001"] .tool-timeline').count(),0,'recap has no duplicated work stream');
    if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'voice-recap-'+engine+'.png')});
    // A retained, idle tray isolates presentation mutations from the live call's
    // timer, incoming audio and incidental finite animation scans.
    await page.evaluate(()=>{document.documentElement.dataset.motion='off';const t=document.querySelector('.voice-call-tray');t.dataset.status='true';t.querySelector('.voice-call-state').textContent='Connecting…';t.querySelector('.voice-mute').setAttribute('aria-pressed','false');t.hidden=false;t.inert=false;});
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.showingStatus===true);
    await page.waitForTimeout(350);
    const retainedKey=await page.evaluate(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.key);
    await page.evaluate(()=>document.querySelector('.voice-call-tray').dataset.status='false');
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.showingStatus===false,{}, {timeout:1000});
    await page.evaluate(()=>document.querySelector('.voice-mute').setAttribute('aria-pressed','true'));
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.muted===true,{}, {timeout:1000});
    assert.equal(await page.evaluate(()=>nativeMessages.filter(m=>m.voice).at(-1).voice.key),retainedKey,'presentation-only state retains native call identity');
    assert.equal(starts,2,'presentation checks never open a provider call');
    await page.evaluate(()=>document.querySelector('.voice-call-tray').hidden=true);
    assert.deepEqual(errors,[]);console.log('Full iOS voice UI: stationary single-row meter, native typing/send/draft/keyboard ownership, settings, 3 Duo poses in light/dark, bounded native scans, immediate End, reduced-motion system End, call-owned approvals/takeover and a single post-call recap passed.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
