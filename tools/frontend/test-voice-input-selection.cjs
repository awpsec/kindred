// Full application wiring: the saved/changed microphone must reach call capture.
// Audio and provider transport are synthetic; this is not hardware capture proof.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(engine==='webkit'?webkit:chromium).launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1320,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let starts=0;
    await page.route('**/identity/meta',r=>r.fulfill({json:{profiles:false}}));
    await page.route('**/api/voice/settings',r=>r.fulfill({json:{enabled:true,configured:true,voice:'quartz',pace:'normal',voices:[{id:'quartz',name:'Quartz'}]}}));
    await page.route('**/api/voice/start',r=>{starts++;return r.fulfill({json:{id:'input-selection-call',ticket:'a'.repeat(64)}})});
    if(process.env.KINDRED_TEST_VOICE_INPUT_BASELINE)await page.route('**/voice.js',r=>r.fulfill({body:require('node:child_process').execFileSync('git',['show','d271cc42bbd7522407640a93687a689d52f9bede:ui/voice.js'],{cwd:path.resolve(__dirname,'../..')}),contentType:'text/javascript'}));
    await page.addInitScript(token=>{
      sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'native',microphone:'hyperx-fixture'}));
      window.__KINDRED_DESKTOP={platform:'macos'};window.__KINDRED_NATIVE_DICTATION=true;window.__KINDRED_DICTATION_MODELS=true;
      window.__TAURI__={core:{invoke:async()=>({supported:true,enabled:false,phase:'off',models:[]})}};
      window.mediaRequests=[];window.missingInput=false;window.sends=[];window.stopped=0;
      const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}),node=()=>({connect(){return this},disconnect(){},gain:param()});
      window.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination={};this.audioWorklet={addModule:async()=>{}}}async resume(){}async close(){this.state='closed'}createGain(){return node()}createOscillator(){return {...node(),frequency:param(),start(){},stop(){}}}createMediaStreamSource(){return node()}createBuffer(c,n,r){return {duration:n/r,copyToChannel(){}}}createBufferSource(){return {...node(),start(){},stop(){}}}};
      window.AudioWorkletNode=class{constructor(){this.port={postMessage(){}};this.timer=setInterval(()=>this.port.onmessage?.({data:new Int16Array(960).buffer}),40)}connect(){return node()}disconnect(){clearInterval(this.timer)}};
      Object.defineProperty(navigator,'mediaDevices',{value:{enumerateDevices:async()=>[{kind:'audioinput',deviceId:'hyperx-fixture',label:'HyperX fixture'},{kind:'audioinput',deviceId:'builtin-fixture',label:'Built-in fixture'}],getUserMedia:async constraints=>{
        mediaRequests.push(structuredClone(constraints));if(missingInput)throw new DOMException('Input disconnected','OverconstrainedError');
        const track=window.inputTrack=Object.assign(new EventTarget(),{readyState:'live',muted:false,enabled:true,stop(){this.readyState='ended';stopped++}});return {getTracks:()=>[track],getAudioTracks:()=>[track]};
      }}});
      window.WebSocket=class{constructor(){this.readyState=0;this.bufferedAmount=0;setTimeout(()=>{this.readyState=1;this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'started',started_ms:Date.now()})})},0)}send(text){const v=JSON.parse(text);sends.push(v);if(v.type==='end')setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'ended',saved:true})}),0)}close(){this.readyState=3;this.onclose?.()}};
    },token);
    await page.goto(origin);await page.getByRole('button',{name:'Start voice call',exact:true}).waitFor();
    const start=async()=>{await page.getByRole('button',{name:'Start voice call',exact:true}).click();await page.getByRole('button',{name:'Mute microphone',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('button[aria-label="Mute microphone"]')?.disabled===false);};
    const end=async()=>{await page.getByRole('button',{name:'End call',exact:true}).click();await page.getByRole('button',{name:'Start voice call',exact:true}).waitFor();};
    await start();assert.deepEqual(await page.evaluate(()=>mediaRequests.at(-1).audio.deviceId),{exact:'hyperx-fixture'},'call must capture the saved explicit input, not system default');
    await page.waitForFunction(()=>sends.filter(m=>m.type==='audio').length>=3);assert(await page.getByRole('button',{name:'End call',exact:true}).isVisible(),'valid silent PCM must keep the call connected');await end();
    async function choose(value){await page.locator('#identity-button').click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Refresh microphones',exact:true}).click();await page.getByRole('combobox',{name:'Microphone',exact:true}).selectOption(value);await page.locator('#settings-close').click();}
    await choose('builtin-fixture');await start();assert.deepEqual(await page.evaluate(()=>mediaRequests.at(-1).audio.deviceId),{exact:'builtin-fixture'},'next call reads the live selection');await end();
    await choose('hyperx-fixture');const before=starts;await page.evaluate(()=>missingInput=true);await page.getByRole('button',{name:'Start voice call',exact:true}).click();
    await page.getByText('The selected microphone is unavailable. Choose another microphone or System Default in General settings.',{exact:true}).waitFor();
    assert.equal(starts,before,'missing input must not start a provider');assert.deepEqual(await page.evaluate(()=>mediaRequests.at(-1).audio.deviceId),{exact:'hyperx-fixture'});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kindred-dictation-v1')).microphone),'hyperx-fixture','missing input must retain the user selection');
    const requestCount=await page.evaluate(()=>mediaRequests.length);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>mediaRequests.length),requestCount,'no silent default-input retry');
    await page.evaluate(()=>missingInput=false);await choose('default');await start();assert.equal(await page.evaluate(()=>Object.hasOwn(mediaRequests.at(-1).audio,'deviceId')),false,'System Default follows the OS');await end();
    await choose('hyperx-fixture');await start();const connected=starts,requests=await page.evaluate(()=>mediaRequests.length);
    await page.evaluate(()=>{inputTrack.readyState='ended';inputTrack.dispatchEvent(new Event('ended'))});
    await page.getByText('Microphone access ended. Call again when it is available.',{exact:true}).waitFor();await page.getByRole('button',{name:'Start voice call',exact:true}).waitFor();
    assert.equal(starts,connected);assert.equal(await page.evaluate(()=>mediaRequests.length),requests,'disconnected input must not reopen a different microphone');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,savedInput:true,changedInput:true,missingInputBlocksProvider:true,noSilentFallback:true,disconnectedInputEndsCall:true,systemDefault:true,validSilence:true,paidProviderCalls:0}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
