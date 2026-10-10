const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/ios-dictation');fs.mkdirSync(out,{recursive:true});
 try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],sent=[];p.on('pageerror',e=>errors.push(e.message));
 const bootstrapFile=process.env.KINDRED_IOS_BOOTSTRAP_FILE;
 const bootstrap=process.env.KINDRED_TEST_PRIVATE_HTTP&&bootstrapFile?JSON.parse(fs.readFileSync(bootstrapFile,'utf8')).bootstrap:null;
 if(process.env.KINDRED_TEST_PRIVATE_HTTP)assert(bootstrap,'Private HTTP proof requires the actual emitted native bootstrap');
 await p.addInitScript(({t,bootstrap})=>{
  if(bootstrap){Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});(0,eval)(bootstrap);if(typeof crypto.randomUUID!=='function')throw new Error('Native bootstrap did not supply private HTTP UUID support');}
  sessionStorage.setItem('kindred-token',t);window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';
  window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:true,locale:'en-US',documentID:'00000000-0000-4000-8000-000000000001'};
  window.commands=[];window.webkit={messageHandlers:{kindredDictation:{postMessage:value=>commands.push(value)}}};
 },{t:token,bootstrap});
 const origin=process.env.KINDRED_TEST_PRIVATE_HTTP?'http://192.168.1.20:9444':'http://127.0.0.1:'+server.address().port;
 if(process.env.KINDRED_TEST_PRIVATE_HTTP)await p.context().route(origin+'/**',async r=>{const url=new URL(r.request().url());const response=await r.fetch({url:'http://127.0.0.1:'+server.address().port+url.pathname+url.search});await r.fulfill({response});});
 await p.route('**/api/chats/dm-piper/messages',r=>{sent.push(r.request().postDataJSON());return r.fulfill({json:{runs:[]}});});
 if(process.env.KINDRED_TEST_IOS_BASELINE){const old=require('node:child_process').execFileSync('git',['show','06f43ceb6db0a19605d9c238ee666051349715cb:ui/dictation.js']);await p.route('**/dictation.js',r=>r.fulfill({body:old,contentType:'text/javascript'}));}
 await p.goto(origin);if(process.env.KINDRED_TEST_PRIVATE_HTTP)assert.equal(await p.evaluate(()=>isSecureContext),false);await p.locator('#prompt').waitFor();await p.locator('.dictation-button').waitFor({state:'attached'});assert.equal(await p.locator('.dictation-button').isVisible(),true,'Supported iOS capability must expose the microphone');
 const draft=()=>p.locator('#prompt').textContent(),mic=p.locator('.dictation-button');
 const set=async text=>p.evaluate(text=>{const e=document.querySelector('#prompt');e.value=text;e.dispatchEvent(new Event('input',{bubbles:true}));const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);},text);
 const start=async()=>{await mic.click();return p.evaluate(()=>commands.filter(c=>c.action==='start').at(-1));};
 const emit=(op,sequence,phase,text,extra={})=>p.evaluate(v=>window.dispatchEvent(new CustomEvent('kindred-ios-dictation',{detail:v})),{operationID:op.operationID,chatID:op.chatID,documentID:op.documentID,sequence,phase,text,...extra});
 const idle=()=>p.waitForFunction(()=>!document.querySelector('#composer').classList.contains('is-dictating'));
 // Caret insertion, surrounding draft, full cumulative partials and exactly-once final.
 await set('Before after');await p.evaluate(()=>{const e=document.querySelector('#prompt'),r=document.createRange();r.setStart(e.firstChild,6);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});
 let op=await start();assert(op.operationID);await emit(op,1,'recording');await emit(op,2,'partial','hello');assert.equal(await draft(),'Before hello after');
 await emit(op,2,'partial','duplicate');await emit({...op,documentID:'foreign'},3,'partial','foreign');await emit({...op,operationID:'foreign'},4,'final','foreign');assert.equal(await draft(),'Before hello after');
 await emit(op,3,'final','hello world');await emit(op,4,'stopped','hello world');await idle();assert.equal(await draft(),'Before hello world after');assert.equal(await p.locator('.dictation-transcript').count(),0);assert.equal(sent.length,0);
 // Cancellation and errors preserve visible words; a late final cannot alter them.
 await set('Prefix');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','kept');await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();await idle();await emit(op,3,'final','late');assert.equal(await draft(),'Prefix');
 op=await start();await emit(op,1,'recording');await emit(op,2,'partial','also kept');await emit(op,3,'error','also kept',{errorCode:'microphone-denied'});await idle();assert.match(await draft(),/also kept$/);assert.equal(sent.length,0);
 // Stop sends one request; stopped preview commits even without a final callback.
 await set('');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','preview');await mic.click();assert.equal(await mic.locator('path').getAttribute('d'),'M7 7h10v10H7z');assert(await mic.isDisabled());assert.equal(await p.evaluate(id=>commands.filter(c=>c.action==='stop'&&c.operationID===id).length,op.operationID),1);await emit(op,3,'stopped','last preview');await idle();assert.equal(await draft(),'last preview');
 // Replacing a draft invalidates the transcript, never restoring old text.
 op=await start();await emit(op,1,'recording');await emit(op,2,'partial','old');await set('Manual replacement');await emit(op,3,'final','late replacement');await idle();assert.equal(await draft(),'Manual replacement');
 // Editing surrounding text is safe and the span remains bound to its location.
 await set('Tail');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','words');await p.evaluate(()=>{const e=document.querySelector('#prompt');e.prepend(document.createTextNode('New '));e.dispatchEvent(new Event('input',{bubbles:true}));});await emit(op,3,'final','updated');await idle();assert.equal(await draft(),'New Tail updated');
 // Capability loss cancels and the next explicit attempt remains unavailable.
 await set('');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','saved');await p.evaluate(()=>{window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:false,locale:'xx',documentID:'00000000-0000-4000-8000-000000000001'};window.dispatchEvent(new CustomEvent('kindred-ios-dictation-capability'));});await idle();await emit(op,3,'final','wrong document');assert.equal(await draft(),'saved');assert.equal(await mic.isVisible(),false);
 await p.evaluate(()=>{window.__KINDRED_IOS_DICTATION={supported:true,protocolVersion:1,engine:'apple-on-device',onDeviceOnly:true,onDeviceAvailable:true,locale:'en-US',documentID:'00000000-0000-4000-8000-000000000002'};window.dispatchEvent(new CustomEvent('kindred-ios-dictation-capability'));});
 // Native background interruption keeps preview; explicit context cancellation discards it.
 await set('Original');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','preview');await emit(op,3,'cancelled','preview',{reason:'background'});await idle();assert.equal(await draft(),'Original preview');
 op=await start();await emit(op,1,'recording');await emit(op,2,'partial','discarded');await emit(op,3,'cancelled','discarded',{reason:'context-changed'});await idle();assert.equal(await draft(),'Original preview');
 await set('Background');op=await start();await emit(op,1,'recording');await emit(op,2,'partial','shown');await p.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});await idle();assert.equal(await draft(),'Background shown');assert.match(await p.locator('#notice').textContent(),/words so far were kept/);
 // Permission failure offers system Settings and never requests a second recording.
 await set('');op=await start();await emit(op,1,'error','',{errorCode:'speech-denied'});await idle();await p.evaluate(()=>{window.settingsEvents=[];for(const kind of ['pointerdown','pointerup','click'])document.addEventListener(kind,e=>settingsEvents.push({kind,target:e.target.outerHTML?.slice(0,200),x:e.clientX,y:e.clientY}),true);});assert((await p.getByRole('button',{name:'Open Settings',exact:true}).boundingBox()).height>=44);await p.getByRole('button',{name:'Open Settings',exact:true}).click();try{await p.waitForFunction(()=>commands.some(c=>c.action==='settings'),null,{timeout:3000});}catch(error){console.log(JSON.stringify(await p.evaluate(()=>({events:settingsEvents,notice:document.querySelector('#notice').outerHTML,commands})),null,2));await p.screenshot({path:path.join(out,'settings-action-failure.png')});throw error;}assert.equal(await p.evaluate(()=>commands.filter(c=>c.action==='settings').length),1);
 // Over-limit UTF8 and fractional sequence callbacks are rejected, without advancing the sequence.
 op=await start();await emit(op,1,'recording');await emit(op,2,'partial','é'.repeat(8193));await emit(op,2.5,'partial','invalid');assert.equal(await draft(),'');await emit(op,2,'final','Valid');await idle();assert.equal(await draft(),'Valid');
 // No focus acquisition when dictation starts with the keyboard closed.
 await set('');await p.locator('#prompt').evaluate(e=>e.blur());op=await start();await emit(op,1,'recording');await emit(op,2,'final','No keyboard');assert.equal(await p.locator('#prompt').evaluate(e=>document.activeElement===e),false);
 await set('');await p.locator('#prompt').focus();op=await start();await emit(op,1,'recording');await emit(op,2,'final','With keyboard');assert.equal(await p.locator('#prompt').evaluate(e=>document.activeElement===e),true);
 // Status never asks for permissions; settings omit the desktop engine/microphone selectors.
 await p.getByRole('button',{name:'Toggle sidebar',exact:true}).click();await p.locator('#settings-button').click();assert.equal(await p.locator('.dictation-model-row').isVisible(),false);assert.equal(await p.locator('.microphone-setting').count(),0);await p.locator('#settings-close').click();await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
 // Real theme/keyboard-size/text-scale layout: 44 target, 36 painted circle,20 icon.
 for(const theme of ['light','dark'])for(const populated of [false,true])for(const height of [844,550])for(const width of [320,390]){
  await p.setViewportSize({width,height});await set(populated?'Draft':'');await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--text-scale','1.5');document.documentElement.dataset.motion='off';},theme);
  const geometry=await mic.evaluate(m=>{const s=document.querySelector('#send'),r=m.getBoundingClientRect(),paint=getComputedStyle(m,'::before'),svg=m.querySelector('svg').getBoundingClientRect();return {width:r.width,height:r.height,inset:parseFloat(paint.left),paintWidth:parseFloat(paint.width),border:parseFloat(getComputedStyle(m).borderLeftWidth),svg:svg.width,sendHidden:s.hidden,primary:m.classList.contains('is-primary'),hit:document.elementFromPoint(r.x+42,r.y+22)?.closest('button')===m};});
  assert.equal(geometry.width,44);assert.equal(geometry.height,44);assert.equal(geometry.inset,4);assert.equal(geometry.paintWidth,36);assert.equal(geometry.border,0);assert.equal(geometry.svg,20);assert.equal(geometry.sendHidden,!populated);assert.equal(geometry.primary,!populated);assert(geometry.hit);
  const before=await mic.boundingBox();op=await start();await emit(op,1,'recording');
  const during=await mic.boundingBox();assert(Math.abs(before.x-during.x)<1,'Stop must remain in the mic cell');
  assert.equal(await p.locator('#send').isVisible(),populated);if(populated)assert(await p.locator('#send').isDisabled());const timer=await p.locator('.dictation-status > [aria-hidden]').boundingBox(),statusBox=await p.locator('.dictation-status').boundingBox();assert(timer.width>0&&timer.x+timer.width<=statusBox.x+statusBox.width+1,'Timer must remain visible when the label truncates');assert(await p.locator('.dictation-status').evaluate(e=>parseFloat(getComputedStyle(e).columnGap)>0),'Status label and timer need explicit spacing');
  const controls=await p.locator('#composer .dictation-cancel').evaluate(c=>{const r=c.getBoundingClientRect(),svg=c.querySelector('svg').getBoundingClientRect();return {w:r.width,h:r.height,paint:parseFloat(getComputedStyle(c,'::before').left),paintWidth:parseFloat(getComputedStyle(c,'::before').width),border:parseFloat(getComputedStyle(c).borderLeftWidth),svg:svg.width};});assert.deepEqual(controls,{w:44,h:44,paint:4,paintWidth:36,border:0,svg:20});
  await p.locator('#composer-area').screenshot({path:path.join(out,`${process.env.WEBKIT?'webkit':'chromium'}-${theme}-${populated?'draft':'empty'}-${width}-${height}.png`)});await emit(op,2,'final',populated?'dictated':'');await idle();
 }
 // Temporary recognizer unavailability retains the control but does not start a new operation.
 await p.evaluate(()=>{window.__KINDRED_IOS_DICTATION.recognizerAvailable=false;window.dispatchEvent(new CustomEvent('kindred-ios-dictation-capability'));});
 const starts=await p.evaluate(()=>commands.filter(c=>c.action==='start').length);await mic.click();assert.match(await p.locator('#notice').textContent(),/temporarily unavailable/);assert.equal(await p.evaluate(()=>commands.filter(c=>c.action==='start').length),starts);
 await p.evaluate(()=>{window.__KINDRED_IOS_DICTATION.recognizerAvailable=true;window.dispatchEvent(new CustomEvent('kindred-ios-dictation-capability'));});
 // Controlled browser time proves finite guards; no microphone/audio is mocked as actual recognition.
 await p.clock.install();await set('Deadline');op=await start();await p.clock.fastForward(30001);await idle();await emit(op,1,'recording');assert.equal(await draft(),'Deadline');
 op=await start();await emit(op,1,'recording');await emit(op,2,'partial','kept');await p.clock.fastForward(60001);assert.equal(await p.evaluate(id=>commands.filter(c=>c.action==='stop'&&c.operationID===id).length,op.operationID),1);await p.clock.fastForward(10001);await idle();assert.equal(await draft(),'Deadline kept');await emit(op,3,'final','late');assert.equal(await draft(),'Deadline kept');
 assert(await p.evaluate(()=>commands.every(c=>(c.operationID===undefined||c.operationID.length>0)&&(c.chatID===undefined||c.chatID.length>0))));
 assert.deepEqual(errors,[]);assert.equal(sent.length,0);console.log(JSON.stringify({pass:true,scenarios:19,layouts:16,errors,sent:sent.length,commands:await p.evaluate(()=>commands.map(({action})=>action))}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
