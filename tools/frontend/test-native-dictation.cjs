// Real WebView2 + native IPC. Fixtures own their accounts, processes and storage.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,limit=250){for(let i=0;i<limit;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Native session fixture timed out');}
const ps=s=>execFileSync('powershell.exe',['-NoProfile','-Command',s],{encoding:'utf8',windowsHide:true});
const quote=s=>"'"+s.replaceAll("'","''")+"'";
(async()=>{
 const source=process.env.KINDRED_NATIVE_EXE;assert(source);const expectedVersion=process.env.KINDRED_EXPECTED_VERSION||'0.48.9';const repo=path.resolve(__dirname,'../..');
 const root=fs.mkdtempSync(path.join(repo,'test-results/native-dictation-')),id=crypto.randomUUID();let oldUI=false,browser=null,child=null;
 const registry='HKCU\\Software\\Classes\\AppUserModelId\\dev.kindred.personal';
 const priorIcon=execFileSync('reg.exe',['query',registry,'/v','IconUri'],{encoding:'utf8',windowsHide:true}).match(/REG_SZ\s+(.+)/)?.[1]?.trim();
 const defaultHandler=server.listeners('request')[0];server.removeAllListeners('request');let loginRequests=0,switchStatus=200;
 const oldAssets=new Map();
 if(process.env.KINDRED_BASELINE_EXE)for(const name of ['app.js','profiles.js'])oldAssets.set('/'+name,execFileSync('git',['-C',repo,'show','e6fcb85eb6fd9dffbeb72733f086b1364d5da458:ui/'+name]));
 server.on('request',async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(oldUI&&oldAssets.has(pathname)){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(oldAssets.get(pathname));}
  if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"status":"ok"}');}
  if(pathname.startsWith('/identity/')){
   let body='';for await(const c of req)body+=c;const send=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
   if(pathname==='/identity/meta')return send({profiles:true,registration:true,first_user:false});
   if(pathname==='/identity/login'){loginRequests++;return send({error:'This test must never sign in again'},401);}
   if(req.headers.authorization!=='Bearer '+token)return send({error:'Sign in again'},401);
   if(pathname==='/identity/profiles')return send({active:id,account_id:'fixture-owner',username:'fixture-user',legacy:false,profiles:[{id,name:'Session fixture',active:true,unread:0}],directory:[]});
   if(pathname==='/identity/switch')return switchStatus===200?send({token,profile_id:id}):send({error:'Fixture server unavailable'},switchStatus);
   return send({});
  }
  return defaultHandler(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,key=crypto.createHash('sha256').update(origin+'\n'+id).digest('hex');
 const base={entries:[{key,server:origin,profile_id:id,name:'Session fixture',account:'fixture-owner',token,legacy:false}],last:key};
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 let currentRoot=root,currentExe,webview=0;
 async function stop(){
  if(browser){await Promise.race([browser.close().catch(()=>{}),sleep(800)]);browser=null;}
  // Resolve every matched executable and constrain termination to this fixture.
  ps(`$fixtureRoot=[IO.Path]::GetFullPath(${quote(root)})+'\\'; Get-Process -Name Kindred -ErrorAction SilentlyContinue | Where-Object {$_.Path -and [IO.Path]::GetFullPath($_.Path).StartsWith($fixtureRoot,[StringComparison]::OrdinalIgnoreCase)} | ForEach-Object {Stop-Process -Id $_.Id -Force}`);
  child=null;await sleep(350);
 }
 function prepare(label,binary){currentRoot=path.join(root,label);const folder=path.join(currentRoot,'versions','0.48.8');fs.mkdirSync(folder,{recursive:true});currentExe=path.join(folder,'Kindred.exe');fs.copyFileSync(binary,currentExe);fs.copyFileSync(path.join(repo,'dist/WebView2Loader.dll'),path.join(folder,'WebView2Loader.dll'));fs.writeFileSync(path.join(currentRoot,'profiles.json'),JSON.stringify(base));return folder;}
 function launch(extra={}){
  const env={...process.env,APPDATA:path.join(currentRoot,'fixture-appdata'),WEBVIEW2_USER_DATA_FOLDER:path.join(currentRoot,'webview-'+(++webview)),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port+' --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture='+process.env.KINDRED_DICTATION_WAV,...extra};
  for(const name of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS','KINDRED_UPDATE_SESSION'])if(!(name in extra))delete env[name];
  child=spawn(currentExe,[],{windowsHide:true,stdio:'ignore',env});
 }
 async function attach(){await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return(await r.json()).some(v=>v.url.startsWith(origin));});browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const page=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));page.setDefaultTimeout(20000);await page.waitForLoadState();return page;}
 const saved=()=>JSON.parse(fs.readFileSync(path.join(currentRoot,'profiles.json'),'utf8'));
 const call=(p,command,args={})=>p.evaluate(({command,args})=>window.__TAURI__.core.invoke(command,args),{command,args});
 try{
  prepare('dictation',source);launch();const p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);
  assert.equal(await p.evaluate(()=>window.__KINDRED_DICTATION_MODELS),true);
  assert.equal((await call(p,'dictation_status')).enabled,false);
  await assert.rejects(()=>call(p,'configure_dictation',{enabled:true,modelName:'../outside'}));
  await p.locator('#settings-button').click();await p.getByRole('switch',{name:'Enable dictation'}).check();
  let status=await call(p,'dictation_status');assert.equal(status.phase,'idle');assert(status.models.every(m=>!m.downloaded));
  const modelRoot=path.join(currentRoot,'profiles',key,'dictation');assert(!fs.existsSync(modelRoot));
  const picker=p.getByRole('button',{name:'Dictation model',exact:true});await picker.click();
  await p.screenshot({path:path.join(root,'models-before-download.png')});
  await p.getByRole('button',{name:'Download Base',exact:true}).click();
  await until(async()=>{const s=await call(p,'dictation_status');return !s.downloading&&s.models.find(m=>m.id==='base').downloaded;},1800);
  assert.equal((await call(p,'dictation_status')).phase,'idle');assert.equal(fs.statSync(path.join(modelRoot,'ggml-base-q5_1.bin')).size,59707625);
  await p.getByRole('button',{name:'Load Base',exact:true}).click();
  await until(async()=>(await call(p,'dictation_status')).phase==='ready',1800);status=await call(p,'dictation_status');
  if(process.env.KINDRED_EXPECT_GPU)assert.equal(status.gpu,true);
  if(process.env.KINDRED_EXPECT_CPU)assert.equal(status.gpu,false);
  const acceleration={gpu:status.gpu,backend:status.backend,device:status.device};
  const originalPid=status.worker_pid;assert(originalPid);const recording=fs.readFileSync(process.env.KINDRED_DICTATION_WAV);
  const start=Date.now();const result=await call(p,'transcribe_dictation',{audio:recording.toString('base64')});
  assert.match(result.text.toLowerCase(),/ask not what your country/);assert(Date.now()-start<120000);
  assert.equal((await call(p,'dictation_status')).worker_pid,originalPid,'Model must remain loaded between requests');
  await p.locator('.dictation-engine').waitFor();await p.screenshot({path:path.join(root,'gpu-indicator.png')});
  assert(!fs.readdirSync(modelRoot).some(n=>n.startsWith('audio-')));
  console.log('Base model stayed resident; native microphone check begins.');
  await p.locator('#settings-close').click();await p.getByRole('button',{name:'Dictate',exact:true}).click();
  await p.getByRole('button',{name:'Stop dictating',exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('#prompt').value.trim().length>0,{},{timeout:25000});
  assert(await p.getByRole('button',{name:'Stop dictating',exact:true}).isVisible());await p.screenshot({path:path.join(root,'native-live-dictation.png')});
  await p.getByRole('button',{name:'Stop dictating',exact:true}).click();await p.getByRole('button',{name:'Dictate',exact:true}).waitFor();assert(!(await p.locator('#prompt').evaluate(n=>n.innerText)).startsWith('\n'));
  await p.locator('#settings-button').click();
  console.log('Live native transcript appeared before Stop; model switching begins.');
  const modelChecks=[];
  if(process.env.KINDRED_LARGE_MODEL_DIR){
    for(const [id,name,file] of [['large-v3-turbo','Large v3 Turbo','ggml-large-v3-turbo-q5_0.bin'],['large-v3','Large v3','ggml-large-v3-q5_0.bin']]){
      fs.copyFileSync(path.join(process.env.KINDRED_LARGE_MODEL_DIR,file),path.join(modelRoot,file));
      await picker.click();const choose=p.getByRole('button',{name:'Load '+name,exact:true});await until(async()=>await choose.count()&&await choose.isEnabled());await choose.click();
      await until(async()=>{const s=await call(p,'dictation_status');return s.phase==='ready'&&s.model===id;},1800);
      const before=await call(p,'dictation_status');assert.notEqual(before.worker_pid,originalPid);if(process.env.KINDRED_EXPECT_GPU)assert(before.gpu);
      console.log('Loaded '+id+' on '+before.backend+'.');
      const start=Date.now(),answer=await call(p,'transcribe_dictation',{audio:recording.toString('base64')});assert.match(answer.text.toLowerCase(),/ask not what your country/);
      modelChecks.push({model:id,gpu:before.gpu,device:before.device,milliseconds:Date.now()-start,transcript:answer.text});
    }
  }
  await picker.click();await p.screenshot({path:path.join(root,'downloaded-models.png')});await p.getByRole('button',{name:'Load Base',exact:true}).click();await until(async()=>(await call(p,'dictation_status')).phase==='ready',1800);
  await assert.rejects(()=>call(p,'transcribe_dictation',{audio:Buffer.from('not audio').toString('base64')}));
  const long=Buffer.alloc(1920044);recording.copy(long,0,0,44);long.writeUInt32LE(long.length-8,4);long.writeUInt32LE(long.length-44,40);for(let i=44;i<long.length;i+=recording.length-44)recording.copy(long,i,44,Math.min(recording.length,44+long.length-i));
  const pending=call(p,'transcribe_dictation',{audio:long.toString('base64')}).then(()=>false,()=>true);await until(async()=>(await call(p,'dictation_status')).phase==='transcribing');await call(p,'cancel_dictation');assert(await pending);await until(async()=>(await call(p,'dictation_status')).phase==='ready',1800);
  await p.getByRole('switch',{name:'Enable dictation'}).uncheck();status=await call(p,'dictation_status');assert.equal(status.phase,'off');assert.equal(status.worker_pid,null);
  assert(!fs.readdirSync(modelRoot).some(n=>n.startsWith('audio-')));
  // Explicit download cancellation cannot publish after it was cancelled.
  await p.getByRole('switch',{name:'Enable dictation'}).check();await until(async()=>(await call(p,'dictation_status')).phase==='ready',1800);
  await call(p,'download_dictation_model',{modelName:'small'});await call(p,'cancel_dictation_download');await sleep(350);
  status=await call(p,'dictation_status');assert.equal(status.downloading,'');assert(!status.models.find(m=>m.id==='small').downloaded);
  const workerPid=status.worker_pid;await stop();
  const processes=ps(`Get-CimInstance Win32_Process -Filter "Name='whisper-cpu.exe' OR Name='whisper-vulkan.exe'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`);assert(!processes.includes(root),'Closing the app must kill its Whisper worker');
  const report={passed:true,realNativeIPC:true,realWhisperBase:true,residentWorker:true,liveMicrophoneTranscript:true,...acceleration,memoryOnlyAudio:true,modelChecks,explicitDownloadOnly:true,downloadCancel:true,downloadBytes:59707625,transcript:result.text,cancelStopsInference:true,disableUnloads:true,closeKillsWorker:true,invalidInputRejected:true,root};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  await stop();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
