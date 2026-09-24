const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try{const context=await browser.newContext({viewport:{width:1320,height:940}}),p=await context.newPage(),errors=[],transcriptions=[];p.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(t=>{
 sessionStorage.setItem('kindred-token',t);window.__KINDRED_LOCAL_DICTATION=true;window.__KINDRED_DICTATION_MODELS=true;
 const models=[['base','Base',59707625],['small','Small',190085487],['medium','Medium',539212467],['large-v3-turbo','Large v3 Turbo',574041195],['large-v3','Large v3',1081140203]].map(([id,name,bytes])=>({id,name,bytes,downloaded:false,loaded:false}));
 window.nativeDictation={supported:true,enabled:false,phase:'off',model:'',models};window.nativeCalls=[];
 window.__TAURI__={core:{invoke:async(command,args={})=>{
  window.nativeCalls.push({command,args:command==='transcribe_dictation'?{audioLength:args.audio.length}:args});const state=window.nativeDictation;
  if(command==='configure_dictation'){state.enabled=args.enabled;state.model=args.modelName;const m=models.find(m=>m.id===args.modelName&&m.downloaded);state.phase=!args.enabled?'off':m?'ready':'idle';models.forEach(v=>v.loaded=args.enabled&&v===m);return state;}
  if(command==='download_dictation_model'){models.find(m=>m.id===args.modelName).downloaded=true;return state;}
  if(command==='dictation_status')return state;
  if(command==='transcribe_dictation'){window.lastAudio=args.audio;if(window.delayTranscript)return new Promise((resolve,reject)=>{window.rejectTranscript=reject;});return {text:'A dictated draft.'};}
  return {};
 }}};
},token);
await context.route(origin+'/app.js',r=>r.fulfill({body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,renderControlNotice,scheduledRoutineCard,leftControlPanes,pausedScreens,screenBotId};',contentType:'text/javascript'}));
let holding=false;await context.route(origin+'/api/status**',r=>r.fulfill({json:{version:'0.48.24',screen_bot_id:'piper',takeover:holding,control_pauses:holding?[{bot_id:'piper',name:'Piper',control_id:'held',reason:'manual',queued:0}]:[],vm_enabled:true}}));
let cloudSpeechRequests=0;await context.route(origin+'/api/dictation/**',r=>{cloudSpeechRequests++;return r.abort();});
await p.goto(origin);await p.locator('#app').waitFor();await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Piper');await p.waitForTimeout(200);assert(await p.getByRole('button',{name:'Dictate',exact:true}).isHidden());await p.locator('#settings-button').click();const toggle=p.getByRole('switch',{name:'Enable dictation'});assert(!await toggle.isChecked());assert(await p.getByRole('button',{name:'Dictation model',exact:true}).isHidden());await toggle.check();
const models=p.getByRole('button',{name:'Dictation model',exact:true});await models.click();
assert.equal(await p.locator('.whisper-model-entry').count(),5);assert.equal(await p.locator('.whisper-load:disabled').count(),5);
assert.equal(await p.evaluate(()=>window.nativeCalls.filter(c=>c.command==='download_dictation_model').length),0);
await p.getByRole('button',{name:'Download Base',exact:true}).click();
assert(await p.getByRole('button',{name:'Load Base',exact:true}).isEnabled());assert.equal(await p.evaluate(()=>window.nativeDictation.phase),'idle');
await p.getByRole('button',{name:'Load Base',exact:true}).click();await p.locator('.dictation-engine-label').filter({hasText:'CPU'}).waitFor();
await p.locator('.dictation-engine summary').click();await p.getByText('No compatible GPU runtime/GPU identified on this device.',{exact:true}).waitFor();
const engineFont=await p.locator('.dictation-engine').evaluate(n=>parseFloat(getComputedStyle(n).fontSize));assert(Math.abs(engineFont-9*await p.evaluate(()=>KindredReadingSize.get()/100))<.01,'Engine detail follows the device text size');
await p.evaluate(()=>Object.assign(window.nativeDictation,{gpu:true,backend:'Vulkan',device:'Fixture GPU'}));await p.locator('.dictation-engine-label').filter({hasText:'GPU'}).waitFor();
await p.locator('#settings-close').click();await p.locator('#settings-button').click();
await models.click();assert.equal(await p.getByRole('button',{name:'Load Base',exact:true}).getAttribute('aria-pressed'),'true');
await p.getByRole('button',{name:'Download Large v3 Turbo',exact:true}).click();await p.getByRole('button',{name:'Load Large v3 Turbo',exact:true}).click();
assert.equal(await p.evaluate(()=>window.nativeDictation.model),'large-v3-turbo');await models.click();await p.getByRole('button',{name:'Load Base',exact:true}).click();
assert((await p.locator('#settings-dialog').boundingBox()).height>=800);
fs.mkdirSync(path.resolve(__dirname,'../../test-results/dictation'),{recursive:true});await p.waitForTimeout(220);await p.screenshot({path:path.resolve(__dirname,'../../test-results/dictation/'+(process.env.WEBKIT?'webkit':'chromium')+'-settings.png')});await p.locator('#settings-close').click();const mic=p.getByRole('button',{name:'Dictate',exact:true});await mic.waitFor();assert(await p.locator('#send').isHidden());assert(await mic.evaluate(n=>n.classList.contains('is-primary')));await p.locator('#prompt').click();await p.locator('#prompt').pressSequentially('Hello',{delay:40});assert(await p.locator('#send').isVisible());assert(!await mic.evaluate(n=>n.classList.contains('is-primary')));assert.equal(await mic.evaluate(n=>n.nextElementSibling.id),'send');await p.screenshot({path:path.resolve(__dirname,'../../test-results/dictation/'+(process.env.WEBKIT?'webkit':'chromium')+'-composer.png')});
// Button alignment must survive editor growth, including long unbroken input.
async function bottomRow(selectors){
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const bounds=await p.evaluate(selectors=>selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {selector:s,bottom:r.bottom,x:r.x,right:r.right};}),selectors);
 assert(Math.max(...bounds.map(r=>r.bottom))-Math.min(...bounds.map(r=>r.bottom))<=1,JSON.stringify(bounds));
 assert(bounds.every(r=>r.x>=0&&r.right<=p.viewportSize().width),JSON.stringify(bounds));
}
for(const viewport of [{width:1320,height:860},{width:390,height:844}]){
 await p.setViewportSize(viewport);
 for(const draft of ['Hello','First line\nSecond line\nThird line\nFourth line\nFifth line','s'.repeat(1200)]){
  await p.locator('#prompt').evaluate((n,text)=>{n.textContent=text;n.dispatchEvent(new Event('input',{bubbles:true}));},draft);
  await bottomRow(['#composer-actions','.dictation-button','#send']);
 }
 await p.screenshot({path:path.resolve(__dirname,'../../test-results/dictation/'+(process.env.WEBKIT?'webkit':'chromium')+'-multiline-'+viewport.width+'.png')});
}
await p.setViewportSize({width:1320,height:940});await p.locator('#prompt').evaluate(n=>{n.textContent='Hello';n.dispatchEvent(new Event('input',{bubbles:true}));});
await p.locator('#prompt').click();await p.locator('#prompt').press('Control+End');
// A ready Metal/Whisper worker is separate from WebKit microphone capture.
// Missing capture must report a desktop problem, keep the draft/model, and
// return to idle so the user can retry after updating the native app.
await p.evaluate(()=>{
 window.originalMediaDevices=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');
 window.__KINDRED_DESKTOP={platform:'macos'};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});
});
await mic.click();await p.getByText('This desktop build cannot access the microphone. Update Kindred to a build with microphone capture support. Your downloaded Whisper models will be kept.',{exact:true}).waitFor();
assert(await mic.isEnabled());assert.equal(await p.locator('#prompt').textContent(),'Hello');
assert.equal(await p.evaluate(()=>window.nativeDictation.phase),'ready');
assert.equal(await p.evaluate(()=>window.nativeCalls.filter(c=>c.command==='transcribe_dictation').length),0);
await p.evaluate(()=>{
 if(window.originalMediaDevices)Object.defineProperty(navigator,'mediaDevices',window.originalMediaDevices);else delete navigator.mediaDevices;
 delete window.__KINDRED_DESKTOP;
 document.querySelector('#notice').hidden=true;
});
if(!process.env.WEBKIT){await mic.click();await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();await bottomRow(['#composer-actions','.dictation-button','.dictation-cancel']);await p.waitForFunction(()=>document.querySelector('#prompt').value==='Hello A dictated draft.');assert(await p.getByRole('button',{name:'Stop dictating',exact:true}).isVisible());await p.getByRole('button',{name:'Stop dictating',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='Hello A dictated draft.');const wav=Buffer.from(await p.evaluate(()=>window.lastAudio),'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),16000);assert(wav.length>6444);await mic.click();await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();assert.equal(await p.locator('#prompt').textContent(),'Hello A dictated draft.');
await p.locator('#prompt').evaluate(n=>{n.innerHTML='<div><br></div>';n.dispatchEvent(new Event('input',{bubbles:true}));});
await mic.click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='A dictated draft.');await p.getByRole('button',{name:'Stop dictating',exact:true}).click();await mic.waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.innerText),'A dictated draft.');
await p.locator('#prompt').evaluate(n=>{n.textContent='Hello A dictated draft.';n.dispatchEvent(new Event('input',{bubbles:true}));});
await p.evaluate(()=>window.delayTranscript=true);await mic.click();await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();await p.waitForFunction(()=>!!window.rejectTranscript);await p.getByRole('button',{name:'Stop dictating',exact:true}).click();assert.equal(await p.locator('.dictation-status').textContent(),'Finishing transcription…');await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();assert(await mic.isEnabled());assert(await p.locator('#send').isEnabled());await p.evaluate(()=>window.rejectTranscript(new Error('Cancelled fixture request')));await p.waitForTimeout(100);assert.equal(await p.locator('#notice.error:not([hidden])').count(),0);assert.equal(await p.locator('#prompt').textContent(),'Hello A dictated draft.');}
await p.locator('#settings-button').click();await p.getByRole('switch',{name:'Enable dictation'}).uncheck();await p.locator('#settings-close').click();assert(await mic.isHidden());assert(await p.evaluate(()=>window.nativeDictation.enabled===false));
holding=true;await p.evaluate(async()=>{const m=await import('./app.js');m.state.status.control_pauses=[{bot_id:'piper',name:'Piper',control_id:'held',reason:'manual',queued:0}];m.renderControlNotice();document.querySelector('#computer-panel').hidden=false;});assert(await p.locator('#control-notice').isHidden());await p.locator('#computer-panel').dispatchEvent('pointerdown');assert(await p.locator('#control-notice').isHidden());await p.locator('#prompt').dispatchEvent('pointerdown');await p.locator('#control-notice').waitFor();await p.locator('#computer-panel').dispatchEvent('pointerdown');assert(await p.locator('#control-notice').isHidden());await p.locator('#computer-close').click();await p.locator('#control-notice').waitFor();
await p.evaluate(async()=>{const m=await import('./app.js');const row=m.scheduledRoutineCard({id:'disabled',bot_id:'piper',name:'Paused fixture',enabled:false,interval_seconds:3600});document.querySelector('#content').append(row);});assert.equal(await p.locator('.routine-card.is-disabled').count(),1);assert.equal(cloudSpeechRequests,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',explicitDownload:true,residentModelSelection:true,engineIndicator:true,liveTranscript:!process.env.WEBKIT,noBlankLine:!process.env.WEBKIT,noCloudSpeech:true,dictationOptIn:true,composerTransition:true,multilineButtonsPinned:true,settingsHeight:true,realBrowserMicrophone:!process.env.WEBKIT,localIPCFixture:true,cancellation:true,controlToastOnLeavingOnly:true,pausedRoutine:true}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
