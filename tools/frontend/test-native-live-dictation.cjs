// Linux WebKitGTK, real WebAudio PCM callbacks, native IPC and resident Base.
// Only a public fixture WAV feeds the synthetic MediaStream; no hardware input.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');const {server,token}=require('./fixtures/desktop.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const binary=process.env.KINDRED_NATIVE_EXE,model=process.env.KINDRED_DICTATION_MODEL,wav=process.env.KINDRED_DICTATION_WAV;
 assert(process.platform==='linux'&&binary&&model&&wav,'Set KINDRED_NATIVE_EXE, KINDRED_DICTATION_MODEL and KINDRED_DICTATION_WAV on Linux');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex'),'422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-live-')),original=server.listeners('request')[0],reports=[],errors=[];let child,ready=false,triggered=false,result;
 const setup=`<script>window.addEventListener('error',e=>fetch('/fixture/live-report',{method:'POST',body:JSON.stringify({phase:'failed',error:e.message})}));window.addEventListener('unhandledrejection',e=>fetch('/fixture/live-report',{method:'POST',body:JSON.stringify({phase:'failed',error:String(e.reason)})}));localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:base'}));</script>`;
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,message)=>{if(!ok)throw Error(message);},report=value=>fetch('/fixture/live-report',{method:'POST',body:JSON.stringify(value)});
 const stopPending=${process.env.KINDRED_TEST_STOP_PENDING==='1'};
 const original=window.__TAURI__.core.invoke,requests=[];let started=0,playing,clip,feeder,firstText=0,updates=0;
 window.liveInvoke=async(command,args)=>{
  if(command!=='transcribe_dictation')return original(command,args);
  const row={started:Math.round(performance.now()-started),audioSeconds:(atob(args.audio).length-44)/32000};requests.push(row);await report({phase:'decode-start',...row});
  try{const value=await original(command,args);row.finished=Math.round(performance.now()-started);row.text=value.text;await report({phase:'decode-end',...row});return value;}catch(e){row.error=String(e);throw e;}
 };
 async function waitFor(test,message,timeout=120000){const deadline=performance.now()+timeout;while(!test()){if(performance.now()>deadline)throw Error(message);await sleep(50);}}
 async function run(){
  try{
   const editor=document.querySelector('#prompt'),mic=document.querySelector('.dictation-button');
   feeder=new AudioContext();await feeder.resume();clip=await feeder.decodeAudioData(await (await fetch('/fixture/voice.wav')).arrayBuffer());
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
    const destination=feeder.createMediaStreamDestination();playing=feeder.createBufferSource();playing.buffer=clip;playing.connect(destination);playing.start();return destination.stream;
   }}});
   editor.addEventListener('input',()=>{if(editor.querySelector('.dictation-transcript')?.textContent.trim()){updates++;if(!firstText){firstText=performance.now()-started;void report({phase:'first-visible',milliseconds:Math.round(firstText),text:editor.value,recording:mic.getAttribute('aria-pressed')==='true'});}}});
   started=performance.now();mic.click();await waitFor(()=>mic.getAttribute('aria-pressed')==='true','Recording did not start',15000);
   // Assert the whole fixture is visible; Whisper may recognize 'ask' as 'as'.
   // This is a live-display test, not an exact speech-recognition benchmark.
   if(stopPending)await waitFor(()=>firstText&&requests.length>=2&&!requests.at(-1).finished&&!requests.at(-1).error,'No active decode after the first live preview',55000);
   else await waitFor(()=>(/what your country can do for you/i.test(editor.value)&&/what you can do for your country/i.test(editor.value)),'Full spoken text did not become visible while recording',55000);
   check(mic.getAttribute('aria-pressed')==='true','Transcript arrived only after recording stopped');
   const span=editor.querySelector('.dictation-transcript'),bounds=span.getBoundingClientRect(),pane=editor.getBoundingClientRect();
   check(bounds.height>0&&bounds.right>pane.left&&bounds.top<pane.bottom,'Live transcript is not visible inside the composer');
   if(!stopPending)await sleep(2500);const liveText=editor.value,stopAt=performance.now(),before=requests.length;mic.click();
   await waitFor(()=>mic.getAttribute('aria-label')==='Dictate'&&!document.querySelector('#send').disabled&&!document.querySelector('#send').hidden,'Final transcript did not finish',22000);
   const stopMilliseconds=Math.round(performance.now()-stopAt),text=editor.value;
   check(requests.length>=2,'Expected successive real native decodes');
   check(text.trim().length>0,'Stopping lost the live transcript');
   check(!document.querySelector('.dictation-status').textContent,'Transcribing status remained after finishing');
   check(requests.slice(0,before).every(r=>r.finished||r.error),'A live decode remained pending after finishing');
   const completed=requests.filter(r=>r.finished&&r.text?.trim());
   check(completed.length>0&&text.includes(completed.at(-1).text.trim()),'Final native result was not committed to the composer');
   await sleep(500);check(editor.value===text,'A late decode changed the committed text');
   await original('configure_dictation',{enabled:false,modelName:''});
   await report({phase:'complete',passed:true,firstTextMilliseconds:Math.round(firstText),stopMilliseconds,stopPending,sendEnabledAfterFinalTranscript:true,updates,requests,text});
  }catch(e){await report({phase:'failed',error:String(e),requests});}finally{playing?.disconnect();if(feeder)await feeder.close();}
 }
 while(!document.querySelector('.message-row.assistant'))await sleep(100);
 let loaded=false;for(let n=0;n<1200;n++){const state=await original('dictation_status');if(state.phase==='ready'){loaded=true;break;}if(state.phase==='error')throw Error(state.error);await sleep(100);}check(loaded,'Model loading timed out');
 let running=false;document.addEventListener('keydown',e=>{if(e.key==='F9'&&!running){running=true;e.preventDefault();void run();}});await report({phase:'ready'});
 </script>`;
 server.removeAllListeners('request');server.on('request',async(req,res)=>{
  if(req.url==='/fixture/live-report'){let body='';for await(const c of req)body+=c;const value=JSON.parse(body);reports.push(value);console.log(JSON.stringify(value));if(value.phase==='ready')ready=true;if(['failed','complete'].includes(value.phase))result=value;res.end('{}');return;}
  if(req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8').replace('window.__TAURI__.core.invoke(command,args)', '(window.liveInvoke||window.__TAURI__.core.invoke)(command,args)'));return;}
  if(req.url==='/fixture/voice.wav'){res.writeHead(200,{'Content-Type':'audio/wav'});res.end(fs.readFileSync(wav));return;}
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('<head>','<head>'+setup).replace('</body>',probe+'</body>'));return;}
  const extras={'/health':{status:'ok'},'/identity/meta':{profiles:false}};if(req.url in extras){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(extras[req.url]));return;}original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,scope=crypto.createHash('sha256').update(origin+'\nfixture').digest('hex');
 const modelRoot=path.join(root,'data/kindred/profiles',scope,'dictation');fs.mkdirSync(modelRoot,{recursive:true});fs.copyFileSync(model,path.join(modelRoot,'ggml-base-q5_1.bin'));
 try{
  child=spawn(binary,[origin],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:scope},detached:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>errors.push(b.toString()));
  const deadline=Date.now()+180000;while(!result&&Date.now()<deadline){assert(child.exitCode===null&&child.signalCode===null,'App exited: '+errors.join(''));if(ready&&!triggered){try{const id=execFileSync('xdotool',['search','--onlyvisible','--name','^Kindred$'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n')[0];if(id){execFileSync('xdotool',['windowfocus','--sync',id,'key','--clearmodifiers','F9']);triggered=true;}}catch{}}await sleep(100);}
  assert(result?.passed,JSON.stringify({reports,errors:errors.join('').slice(-5000)}));
 }finally{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);}server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
