const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict');
// Live dictation utterance segmentation with mocked native Whisper decoding.
// Audio is fed at 16 kHz; pad is 0.3 s (4800 samples) and a pause is 0.8 s.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(token=>{
sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:base'}));
window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_DICTATION_MODELS=true;window.jobs=[];
// Each decode records how many 16 kHz samples it was given.
window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='transcribe_dictation')return new Promise(resolve=>jobs.push({samples:(atob(args.audio).length-44)/2,resolve:text=>resolve({text})}));return {supported:true,phase:'ready',model:'base',models:[{id:'base',name:'Base',downloaded:true,loaded:true}]};}}};
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

// Multiple utterances: once a pause is confirmed the utterance is committed and
// later decodes contain only audio after the boundary inside the silence.
await begin();await p.evaluate(()=>feed(.1));assert.equal(await job(1),16000);await resolve(0,'Hello there.');await shows('Hello there.');
await p.evaluate(()=>feed(0));assert.equal(await job(2),20800,'A confirmed pause re-decodes once with the trailing pad');await resolve(1,'Hello there.');
await p.waitForTimeout(900);await p.evaluate(()=>feed(0));await p.waitForTimeout(900);assert.equal(await p.evaluate(()=>jobs.length),2,'Silence after a committed utterance is not decoded');
await p.evaluate(()=>feed(.1));assert.equal(await job(3),16000*4-20800,'The second utterance excludes the first');await resolve(2,'How are you?');await shows('Hello there. How are you?');
await p.evaluate(()=>feed(0));assert.equal(await job(4),68800-20800,'Repad of utterance two only');await resolve(3,'How are you?');
await p.evaluate(()=>feed(.1));assert.equal(await job(5),96000-68800,'The third utterance starts after utterance two');await resolve(4,'Fine.');await shows('Hello there. How are you? Fine.');
await stop.click();await idle();assert.equal(await p.evaluate(()=>jobs.length),5,'Stop with no new speech does not re-decode');assert.equal(await prompt(),'Hello there. How are you? Fine.');

// Late result: a decode that already carried the pad commits when it returns,
// even though the next utterance was spoken meanwhile.
await begin();await p.evaluate(()=>{feed(.1);feed(0,.5);});assert.equal(await job(1),20800);
await p.evaluate(()=>{feed(0,.5);feed(.1);});await p.waitForTimeout(900);assert.equal(await p.evaluate(()=>jobs.length),1,'One decode at a time');
await resolve(0,'One.');assert.equal(await job(2),48000-20800,'After the late commit only utterance two is decoded');await resolve(1,'Two.');await shows('One. Two.');
await stop.click();await idle();assert.equal(await prompt(),'One. Two.');

// Stop while a decode is in flight: the final snapshot is taken after that
// result commits, so it covers only speech after the boundary.
await begin();await p.evaluate(()=>{feed(.1);feed(0,.5);});assert.equal(await job(1),20800);
await p.evaluate(()=>{feed(0,.5);feed(.1);});await stop.click();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>jobs.length),1);
await resolve(0,'Before the pause.');assert.equal(await job(2),48000-20800,'The final drain excludes the committed utterance');await resolve(1,'After the pause.');
await idle();assert.equal(await prompt(),'Before the pause. After the pause.');

// Continuous speech and short pauses never split: each decode starts at sample 0.
await begin();await p.evaluate(()=>feed(.1));assert.equal(await job(1),16000);await resolve(0,'Keep');await shows('Keep');
await p.evaluate(()=>feed(.1));assert.equal(await job(2),32000);await resolve(1,'Keep talking');
await p.evaluate(()=>{feed(0,.5);feed(.1);});assert.equal(await job(3),56000,'A 0.5 s pause is not a boundary');await resolve(2,'Keep talking without a real pause');
await stop.click();await idle();assert.equal(await prompt(),'Keep talking without a real pause');

// An empty result is never committed: the words stay in the next decode.
await begin();await p.evaluate(()=>{feed(.1);feed(0,.5);});assert.equal(await job(1),20800);await resolve(0,'');
await p.evaluate(()=>{feed(0,.5);feed(.1);});assert.equal(await job(2),48000,'Unrecognised speech is re-decoded with the next utterance');await resolve(1,'Quiet start. Then more.');await shows('Quiet start. Then more.');
// Cancel after segments removes the whole transcript and ignores late results.
await p.evaluate(()=>{feed(0);feed(.1);});const pending=await p.evaluate(()=>jobs.length);await p.getByRole('button',{name:'Cancel dictation',exact:true}).click();
if(pending>2)await resolve(pending-1,'Do not insert');await p.waitForTimeout(100);assert.equal(await prompt(),'');
// A stop click must survive native status polling while the pointer is held.
await begin();await p.evaluate(()=>feed(.1));await job(1);await resolve(0,'Ready to stop.');await shows('Ready to stop.');
const box=await stop.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
await p.waitForTimeout(900);await p.mouse.up();await idle();assert.equal(await prompt(),'Ready to stop.');
assert.deepEqual(errors,[]);
console.log('Dictation segments: multiple utterances, late results, stop drain, continuous speech and cancellation passed');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
