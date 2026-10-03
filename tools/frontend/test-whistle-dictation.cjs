const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict');
// Live dictation windows and backpressure with mocked native Whistle decoding.
// Audio is fed at 16 kHz; pad is 0.3 s (4800 samples) and a pause is 0.8 s.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(token=>{
sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:whistle'}));
window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_DICTATION_MODELS=true;window.jobs=[];
// Each decode records how many 16 kHz samples it was given.
window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='transcribe_dictation')return new Promise((resolve,reject)=>jobs.push({reject,samples:(atob(args.audio).length-44)/2,resolve:value=>resolve(typeof value==='string'?{text:value}:value)}));return {supported:true,phase:'ready',model:'whistle',models:[{id:'whistle',name:'Whistle',downloaded:true,loaded:true}]};}}};
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
const node=()=>({connect(){},disconnect(){},gain:{value:0}});window.AudioContext=class{constructor(){this.sampleRate=16000;this.state='running';}async resume(){}async close(){}createMediaStreamSource(){return node();}createGain(){return node();}createScriptProcessor(){window.capture=node();return capture;}};
window.feed=(amplitude,seconds=1)=>capture.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(Math.round(16000*seconds)).fill(amplitude)}});
},token);
await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Piper');
const mic=p.getByRole('button',{name:'Dictate',exact:true}),stop=p.getByRole('button',{name:'Stop dictating',exact:true});
const prompt=()=>p.locator('#prompt').textContent();
const job=n=>p.waitForFunction(n=>jobs.length===n,n,{timeout:5000}).then(()=>p.evaluate(n=>jobs[n-1].samples,n));
const resolve=(n,text)=>p.evaluate(([n,text])=>jobs[n].resolve(text),[n,text]);
const shows=text=>p.waitForFunction(text=>document.querySelector('#prompt').textContent===text,text,{timeout:5000});
const idle=()=>p.waitForFunction(()=>!document.querySelector('.dictation-button').disabled&&document.querySelector('.dictation-status').hidden,null,{timeout:25000});
const begin=async()=>{await p.evaluate(()=>{const e=document.querySelector('#prompt');e.replaceChildren();e.dispatchEvent(new Event('input',{bubbles:true}));jobs.length=0;});await mic.click();await stop.waitFor({timeout:5000});};

// More than 30 seconds without pauses must drain in word-aligned windows.
await begin();await p.evaluate(()=>feed(.1,55));assert.equal(await job(1),28*16000);
await stop.click();
await resolve(0,{text:'First section plus lookahead',words:[{word:'First',start:0,end:10},{word:'section',start:10,end:24},{word:'lookahead',start:25,end:27}]});
assert.equal(await job(2),28*16000);
await resolve(1,{text:'Second section plus lookahead',words:[{word:'Second',start:0,end:10},{word:'section',start:10,end:24},{word:'lookahead',start:25,end:27}]});
assert.equal(await job(3),7*16000);await resolve(2,'Last section.');await idle();
assert.equal(await prompt(),'First section Second section Last section.');
// A slow decode gives the CPU breathing room instead of immediately repeating.
await begin();await p.evaluate(()=>feed(.1));await job(1);await p.waitForTimeout(2200);
await p.evaluate(()=>feed(.1));await resolve(0,'Still speaking');await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>jobs.length),1,'Slow inference must not immediately restart');
await job(2);await resolve(1,'Still speaking clearly.');await stop.click();await idle();
assert.equal(await prompt(),'Still speaking clearly.');assert.deepEqual(errors,[]);
console.log('Whistle scheduling: bounded word-aligned drain and adaptive cadence passed');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
