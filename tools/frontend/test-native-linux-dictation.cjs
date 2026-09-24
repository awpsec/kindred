// Real Linux Tauri/WebKitGTK + native IPC, with public fixture audio.
// Run as a normal user under Xvfb or a desktop session; never uses a live server.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {server,token}=require('./fixtures/desktop.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function canonicalWav(file){
 const input=fs.readFileSync(file);assert.equal(input.toString('ascii',0,4),'RIFF');assert.equal(input.toString('ascii',8,12),'WAVE');
 let format,pcm;
 for(let offset=12;offset+8<=input.length;){
  const name=input.toString('ascii',offset,offset+4),size=input.readUInt32LE(offset+4),start=offset+8;
  assert(start+size<=input.length,'Truncated sample WAV');
  if(name==='fmt ')format=input.subarray(start,start+size);if(name==='data')pcm=input.subarray(start,start+size);
  offset=start+size+(size%2);
 }
 assert(format&&format.length>=16&&pcm&&pcm.length<=1920000&&pcm.length%2===0);
 assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(2),1);assert.equal(format.readUInt32LE(4),16000);assert.equal(format.readUInt16LE(14),16);
 const out=Buffer.alloc(44+pcm.length);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);
 format.copy(out,20,0,16);out.write('data',36);out.writeUInt32LE(pcm.length,40);pcm.copy(out,44);return out.toString('base64');
}
(async()=>{
 assert.equal(process.platform,'linux');
 const binary=process.env.KINDRED_NATIVE_EXE,model=process.env.KINDRED_DICTATION_MODEL,wav=process.env.KINDRED_DICTATION_WAV;
 assert(binary&&model&&wav,'Set KINDRED_NATIVE_EXE, KINDRED_DICTATION_MODEL and KINDRED_DICTATION_WAV');
 const audio=canonicalWav(wav);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex'),'422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-linux-dictation-')),data=path.join(root,'data'),config=path.join(root,'config');
 const source=path.resolve(__dirname,'../..'),reports=[],errors=[];let child;
 const original=server.listeners('request')[0];server.removeAllListeners('request');
 const probe=`<script type="module">
 const call=(name,args={})=>window.__TAURI__.core.invoke(name,args),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(yes,message)=>{if(!yes)throw Error(message);};
 const report=body=>fetch('/fixture/dictation-report',{method:'POST',body:JSON.stringify(body)});
 const bounded=p=>Promise.race([p,sleep(12000).then(()=>{throw Error('Microphone operation timed out');})]);

 async function ready(){for(let n=0;n<1800;n++){const s=await call('dictation_status');if(s.phase==='ready')return s;if(s.phase==='error')throw Error(s.error);await sleep(100);}throw Error('Model loading timeout');}
 try{
  while(!document.querySelector('.message-row.assistant'))await sleep(100);
  let s=await call('dictation_status');check(s.supported,'Linux is still unsupported');
  check(s.models.length===5,'All model choices must remain available');
  document.querySelector('#settings-button').click();
  for(let n=0;n<200&&!document.querySelector('.dictation-settings input[type="checkbox"]');n++)await sleep(50);
  const toggle=document.querySelector('.dictation-settings input[type="checkbox"]');check(toggle&&!toggle.checked,'Expected dictation off initially');toggle.click();
  for(let n=0;n<200;n++){s=await call('dictation_status');if(s.enabled)break;await sleep(50);}
  check(s.enabled,'Settings toggle did not enable Linux dictation');
  check(!s.worker_pid&&!s.downloading,'Enabling must not load or download a model');
  document.querySelector('[aria-label="Dictation model"]').click();
  const load=document.querySelector('[aria-label="Load Base"]');check(load&&!load.disabled,'Downloaded Base is not selectable');load.click();s=await ready();
  check(s.backend==='CPU'&&!s.gpu,'Expected CPU inference');check(s.fallback_reason.includes('Linux'),'Explain the CPU-only Linux build');
  for(let n=0;n<50&&document.querySelector('.dictation-engine').hidden;n++)await sleep(100);
  check(!document.querySelector('.dictation-engine').hidden&&document.querySelector('.dictation-engine-label').textContent==='CPU','CPU indicator is missing');
  await report({phase:'ready',status:s});
  if(${process.env.KINDRED_TEST_MOCK_MICROPHONE==='1'}){
   await report({phase:'microphone-request'});
   const denied=navigator.mediaDevices.getUserMedia({audio:true,video:false}).then(s=>{s.getTracks().forEach(t=>t.stop());return false;},()=>true);
   for(let n=0;n<100&&!document.querySelector('.microphone-permission');n++)await sleep(50);
   check(document.querySelector('.microphone-permission'),'Missing themed microphone consent');
   document.querySelector('.microphone-permission .outline-button').click();check(await bounded(denied),'Deny must not capture');await report({phase:'denied',themedConsent:true});
   for(let n=0;n<100&&document.querySelector('.microphone-permission');n++)await sleep(50);
   const capture=navigator.mediaDevices.getUserMedia({audio:true,video:false});
   for(let n=0;n<100&&!document.querySelector('.microphone-permission');n++)await sleep(50);
   [...document.querySelectorAll('.microphone-permission button')].find(b=>b.textContent==='Allow this session').click();
   const stream=await bounded(capture);await report({phase:'allowed'});
   check(stream.getAudioTracks().length===1,'No microphone track');
   check(/mock/i.test(stream.getAudioTracks()[0].label),'Test must use a synthetic microphone');
   stream.getTracks().forEach(t=>t.stop());check(stream.getAudioTracks()[0].readyState==='ended','Microphone did not stop');
   const second=await navigator.mediaDevices.getUserMedia({audio:true,video:false});second.getTracks().forEach(t=>t.stop());
   const camera=await navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return true;},()=>false);
   check(!camera,'Microphone consent must not grant camera access');
   await report({phase:'microphone',captured:true,stopped:true,sessionConsent:true,cameraDenied:true});
   document.querySelector('#settings-close').click();
   const mic=document.querySelector('.dictation-button');mic.click();
   for(let n=0;n<200&&mic.getAttribute('aria-label')!=='Stop dictating';n++)await sleep(50);
   check(mic.getAttribute('aria-label')==='Stop dictating','The real Dictate action could not start recording');
   await sleep(2500);document.querySelector('.dictation-cancel').click();
   for(let n=0;n<200&&mic.getAttribute('aria-label')!=='Dictate';n++)await sleep(50);
   check(mic.getAttribute('aria-label')==='Dictate'&&!document.querySelector('#prompt').value,'Cancel did not restore the empty draft');
   s=await ready();await report({phase:'recording',started:true,cancelled:true,draftPreserved:true});
  }
  const started=performance.now(),answer=await call('transcribe_dictation',{audio:${JSON.stringify(audio)}});
  check(/ask not what your country/i.test(answer.text),'Unexpected transcript: '+answer.text);
  check((await call('dictation_status')).worker_pid===s.worker_pid,'Model did not remain resident');
  const elapsed=performance.now()-started;
  const pending=call('transcribe_dictation',{audio:${JSON.stringify(audio)}}).then(()=>({ok:true}),e=>({error:String(e)}));
  for(let n=0;n<100&&(await call('dictation_status')).phase!=='transcribing';n++)await sleep(10);
  check((await call('dictation_status')).phase==='transcribing','Cancellation did not overlap inference');
  await call('cancel_dictation');const cancelled=await pending;
  check(cancelled.error?.includes('cancelled'),'Cancelled audio returned a transcript');
  const reloaded=await ready();check(reloaded.worker_pid!==s.worker_pid,'Cancellation did not replace the worker');
  await report({phase:'cancelled',previous_pid:s.worker_pid,reloaded_pid:reloaded.worker_pid});
  s=await call('configure_dictation',{enabled:false,modelName:''});
  check(!s.enabled&&!s.worker_pid&&s.phase==='off','Disable did not unload the model');
  const p=document.querySelector('#prompt');check(!p.value,'IPC test unexpectedly changed or sent the draft');
  await report({phase:'complete',passed:true,transcript:answer.text,milliseconds:Math.round(elapsed),resident:true,cancellation:true,disabled:true});
 }catch(e){await report({phase:'failed',error:String(e)});try{await call('configure_dictation',{enabled:false,modelName:''});}catch{}}
 </script>`;
 server.on('request',async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const send=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(route==='/fixture/dictation-report'){
   let body='';for await(const c of req)body+=c;const report=JSON.parse(body);
   if(report.phase==='ready')report.worker_executable=fs.readlinkSync('/proc/'+report.status.worker_pid+'/exe');
   reports.push(report);console.error('Native dictation: '+report.phase);return send({ok:true});
  }
  if(route==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(source,'ui/index.html'),'utf8').replace('</body>',probe+'</body>'));}
  const extra={'/health':{status:'ok'},'/identity/meta':{profiles:false},'/api/inbox-monitors':{items:[],provider_sources:[]},'/api/lists':[],'/api/reminders':[]};
  if(route in extra)return send(extra[route]);return original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,scope=crypto.createHash('sha256').update(origin+'\nfixture').digest('hex');
 const modelRoot=path.join(data,'kindred','profiles',scope,'dictation');fs.mkdirSync(modelRoot,{recursive:true});
 fs.copyFileSync(model,path.join(modelRoot,'ggml-base-q5_1.bin'));
 try{
  child=spawn(binary,[origin],{env:{...process.env,XDG_DATA_HOME:data,XDG_CONFIG_HOME:config,KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:scope,KINDRED_LEGACY_LOCAL_ACCESS:'0'},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',chunk=>errors.push(chunk.toString()));
  child.on('error',error=>reports.push({phase:'failed',error:String(error)}));
  const deadline=Date.now()+600000;
  while(Date.now()<deadline&&!reports.some(r=>['complete','failed'].includes(r.phase))){
   assert(child.exitCode===null&&child.signalCode===null,'Native app exited: '+errors.join(''));
   await sleep(200);
  }
  assert(reports.some(r=>r.phase==='complete'&&r.passed),JSON.stringify({reports,errors}));
  const flags=new Set(fs.readFileSync('/proc/cpuinfo','utf8').split(/\s+/));
  const optimized=['avx2','fma','f16c','sse4_2','bmi2'].every(flag=>flags.has(flag));
  assert.equal(path.basename(reports.find(r=>r.phase==='ready').worker_executable),optimized?'whisper-cpu-avx2':'whisper-cpu');
  await sleep(300);
  for(const report of reports)for(const pid of [report.status?.worker_pid,report.reloaded_pid].filter(Boolean)){
   assert.throws(()=>process.kill(pid,0),/ESRCH/,'Disabled worker is still alive');
  }
  assert(!fs.readdirSync(modelRoot).some(name=>/audio|\.wav$/.test(name)),'Audio must not be saved');
  console.log(JSON.stringify({passed:true,nativeLinux:true,reports},null,2));
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
  await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
