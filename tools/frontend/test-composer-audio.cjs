const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch({headless:true});
 const out=path.resolve(__dirname,'../../test-results/composer-audio');fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(token=>{
   sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:base',microphone:'saved-input'}));
   window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_DICTATION_MODELS=true;window.calls=[];window.tracks=[];window.contexts=[];window.failAudio=true;window.captureCount=0;
   const native={supported:true,enabled:true,phase:'ready',model:'base',models:[{id:'base',name:'Base',downloaded:true,loaded:true}]};
   window.statusWaiters=[];window.__TAURI__={core:{invoke:async(command,args)=>{window.calls.push({command,args});if(command==='microphone_permission'){if(args?.forget)window.permanentMic=false;return {persistent:!!window.permanentMic,session:!!window.permanentMic};}if(command==='decide_microphone_permission'&&args?.remember&&args?.allowed)window.permanentMic=true;if(command==='dictation_status'&&window.deferStatus)await new Promise(r=>statusWaiters.push(r));return native;}}};
   const capture=()=>{const track={readyState:'live',stop(){this.readyState='ended';}};window.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};};
   Object.defineProperty(navigator,'mediaDevices',{value:{enumerateDevices:async()=>{window.enumerations=(window.enumerations||0)+1;return new Promise(()=>{});},getUserMedia:async constraints=>{window.captureCount++;window.constraints=constraints;if(window.deferCapture)return new Promise(r=>{window.resolveCapture=()=>r(capture());});return capture();}}});
   const node=()=>({connect(){},disconnect(){},gain:{value:1}});
   window.AudioContext=class{constructor(){this.state='suspended';this.sampleRate=48000;this.destination={};window.contexts.push(this);}async resume(){if(window.failAudio){this.failed=true;throw new DOMException('Failed to start the audio device','InvalidStateError');}this.state='running';}async close(){this.closeCalled=true;if(window.stallClose)return new Promise(()=>{});this.state='closed';}createMediaStreamSource(){return node();}createScriptProcessor(){return node();}createGain(){return node();}};
  },token);
  await p.addInitScript({path:path.resolve(__dirname,'../../ui/microphone-permission.js')});
  await p.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,renderHeader};'}));
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.waitForFunction(async()=>!!(await import('./app.js')).state.bot);
  let logos=0;
  for(const theme of ['dark','light'])for(const provider of ['codex','claude-code','openrouter','kimi-code','custom-test']){
   await p.evaluate(async({theme,provider})=>{document.documentElement.dataset.theme=theme;const m=await import('./app.js'),bot={...m.state.bot,provider};await fetch('/api/bots/piper',{method:'PUT',body:JSON.stringify(bot)});m.state.bot=bot;m.renderHeader();},{theme,provider});
   const mark=p.locator('.provider-mark');assert(await mark.getAttribute('aria-label'));
   if(['claude-code','openrouter','kimi-code'].includes(provider)){
    await p.waitForFunction(provider=>document.querySelector('.provider-mark .provider-symbol')?.dataset.provider===provider,provider);
    const symbol=mark.locator('.provider-symbol');assert.equal(await symbol.getAttribute('data-provider'),provider);
    const mask=await symbol.evaluate(n=>getComputedStyle(n).maskImage||getComputedStyle(n).webkitMaskImage);const url=mask.match(/url\(["']?(.*?)["']?\)/)[1];const response=await p.request.get(url);assert.equal(response.status(),200);assert(response.headers()['content-type'].includes('image/svg+xml'));assert((await response.text()).includes('<path'));
   }else if(provider==='codex')assert.equal(await mark.locator('.openai-logo').count(),2);else assert.equal(await mark.locator('svg').count(),1);
   await mark.screenshot({path:path.join(out,engine+'-'+provider+'-'+theme+'.png')});logos++;
  }
  const mic=p.getByRole('button',{name:'Dictate',exact:true});await mic.click();await p.getByText('Microphone access was allowed, but the audio engine could not start.',{exact:false}).waitFor();
  assert(await p.evaluate(()=>tracks.every(t=>t.readyState==='ended')&&contexts.some(c=>c.failed)&&contexts.filter(c=>c.failed).every(c=>c.state==='closed')),'Failed startup must release both input and audio context');assert(await mic.isEnabled());
  assert.equal(await p.evaluate(()=>constraints.audio.deviceId.exact),'saved-input','Keep the selected microphone');
  await p.evaluate(()=>{window.failAudio=false;});await mic.click();await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();assert(await p.evaluate(()=>tracks.every(t=>t.readyState==='ended')));
  await p.evaluate(()=>{window.deferStatus=true;});const beforeStatus=await p.evaluate(()=>captureCount);await mic.click();await p.waitForFunction(()=>statusWaiters.length);assert(await mic.isDisabled());await p.evaluate(()=>document.querySelector('.dictation-button').onclick());assert.equal(await p.evaluate(()=>captureCount),beforeStatus,'Worker checks must lock startup before opening a microphone');
  await p.evaluate(()=>{window.deferStatus=false;statusWaiters.splice(0).forEach(r=>r());});await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();assert.equal(await p.evaluate(()=>captureCount),beforeStatus+1);await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();
  await p.evaluate(()=>{window.deferCapture=true;});await mic.click();await p.waitForFunction(()=>!!window.resolveCapture);const captures=await p.evaluate(()=>captureCount);
  await p.evaluate(()=>document.querySelector('.dictation-button').onclick());assert.equal(await p.evaluate(()=>captureCount),captures,'Repeated start must not acquire a second stream');
  await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();await p.evaluate(()=>resolveCapture());await p.waitForFunction(()=>tracks.every(t=>t.readyState==='ended'));assert(await mic.isEnabled());
  for(const [i,allowed] of [false,true].entries()){
   await p.setViewportSize({width:i?390:1100,height:850});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;},i?'light':'dark');
   await p.evaluate(id=>window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{detail:{id,origin:location.origin}})),String(i));
   const dialog=p.getByRole('dialog',{name:'Allow microphone access?',exact:true});await dialog.waitFor();
   const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=(i?390:1100));await dialog.screenshot({path:path.join(out,engine+'-microphone-permission-'+(i?'light':'dark')+'.png')});
   await dialog.getByRole('button',{name:allowed?'Allow this session':'Not now',exact:true}).click();await dialog.waitFor({state:'detached'});
   assert(await p.evaluate(({id,allowed})=>calls.some(c=>c.command==='decide_microphone_permission'&&c.args.requestId===id&&c.args.allowed===allowed),{id:String(i),allowed}));
  }
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{detail:{id:'escape',origin:location.origin}})));await p.getByRole('dialog',{name:'Allow microphone access?',exact:true}).waitFor();await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('.microphone-permission'));assert(await p.evaluate(()=>calls.some(c=>c.command==='decide_microphone_permission'&&c.args.requestId==='escape'&&c.args.allowed===false)));
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{detail:{id:'foreign',origin:'https://unrelated.invalid'}})));assert.equal(await p.locator('.microphone-permission').count(),0);
  await p.setViewportSize({width:1100,height:850});
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{detail:{id:'permanent',origin:location.origin}})));
  await p.getByRole('button',{name:'Always allow',exact:true}).click();
  assert(await p.evaluate(()=>calls.some(c=>c.command==='decide_microphone_permission'&&c.args.requestId==='permanent'&&c.args.remember===true)));
  const enumerationCount=await p.evaluate(()=>window.enumerations||0);
  await p.locator('#settings-button').click();await p.getByText('Microphone access: always allowed for this account.',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>window.enumerations||0),enumerationCount,'Opening Settings must not enumerate devices');
  await p.getByRole('button',{name:'Ask again next time',exact:true}).click();await p.getByText('Microphone access: ask when recording starts.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Refresh microphones',exact:true}).click();
  await p.locator('#settings-dialog').evaluate(d=>{d.animate=()=>({cancel(){}});});await p.locator('#settings-close').click();await p.locator('#settings-dialog').waitFor({state:'hidden'});assert.equal(await p.locator('#settings-dialog').isVisible(),false,'Stalled enumeration must not trap Settings');
  await p.evaluate(()=>{window.deferCapture=false;window.failAudio=true;window.stallClose=true;});
  const failedBefore=await p.evaluate(()=>contexts.filter(c=>c.failed).length);await mic.click();
  await p.waitForFunction(n=>contexts.filter(c=>c.failed).length>n,failedBefore);await p.waitForFunction(()=>document.querySelector('.dictation-button').disabled===false);
  assert(await p.evaluate(()=>tracks.every(t=>t.readyState==='ended')),'Stalled audio close must still release the microphone');
  await p.locator('#settings-button').click();await p.locator('#settings-dialog').evaluate(d=>{d.animate=()=>({cancel(){}});});await p.locator('#settings-close').click();await p.locator('#settings-dialog').waitFor({state:'hidden'});assert.equal(await p.locator('#settings-dialog').isVisible(),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,logos,audioFailureCleanup:true,retry:true,lateCaptureStopped:true,duplicateStartPrevented:true,selectedDevicePreserved:true,themedConsent:true,persistentConsent:true,revokeConsent:true,settingsWithoutEnumeration:true,stalledCleanup:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
