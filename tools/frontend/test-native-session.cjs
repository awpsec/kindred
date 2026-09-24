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
 const root=fs.mkdtempSync(path.join(repo,'test-results/native-session-')),id=crypto.randomUUID();let oldUI=false,browser=null,child=null;
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
  const env={...process.env,APPDATA:path.join(currentRoot,'fixture-appdata'),WEBVIEW2_USER_DATA_FOLDER:path.join(currentRoot,'webview-'+(++webview)),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port,...extra};
  for(const name of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS','KINDRED_UPDATE_SESSION'])if(!(name in extra))delete env[name];
  child=spawn(currentExe,[],{windowsHide:true,stdio:'ignore',env});
 }
 async function attach(){await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return(await r.json()).some(v=>v.url.startsWith(origin));});browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const page=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));page.setDefaultTimeout(20000);await page.waitForLoadState();return page;}
 const saved=()=>JSON.parse(fs.readFileSync(path.join(currentRoot,'profiles.json'),'utf8'));
 const call=(p,command,args={})=>p.evaluate(({command,args})=>window.__TAURI__.core.invoke(command,args),{command,args});
 try{
  if(process.env.KINDRED_BASELINE_EXE){
   oldUI=true;prepare('baseline',process.env.KINDRED_BASELINE_EXE);launch();let p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);
   await until(()=>saved().entries[0]&&!saved().entries[0].token&&!saved().entries[0].protected_token);
   assert.equal(await p.locator('#remember-device').isChecked(),false);await stop();oldUI=false;
   console.log(JSON.stringify({baselineReproduced:true,restoredSignInDiscardedWithEmptyBrowserStorage:true}));
  }
  const folder=prepare('fixed',source);launch();let p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);
  await until(()=>saved().entries[0]?.protected_token);assert.equal(await p.locator('#remember-device').isChecked(),true);
  assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-token')),null);assert(!JSON.stringify(saved()).includes(token));
  await stop();launch();p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);assert.equal(await p.locator('#remember-device').isChecked(),true);assert.equal(loginRequests,0);
  // Changing the device preference takes effect only in a newly started WebView.
  if(process.env.KINDRED_TEST_HARDWARE==='1'){
   const gpuDisabled=()=>ps(`$fixturePath=${quote(currentRoot)}; [bool](Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($fixturePath) -and $_.CommandLine.Contains('--disable-gpu')})`).trim()==='True';
   let hw=await call(p,'profile_home_state');assert(hw.hardware_acceleration_supported&&hw.hardware_acceleration_active&&hw.hardware_acceleration);assert(!gpuDisabled());
   assert.deepEqual(await call(p,'set_hardware_acceleration',{enabled:false}),{enabled:false,restart_required:true});assert.equal(saved().hardware_acceleration,false);assert((await call(p,'profile_home_state')).hardware_acceleration_active);assert(!gpuDisabled());
   await stop();launch();p=await attach();await p.locator('#app').waitFor({state:'visible'});hw=await call(p,'profile_home_state');assert.equal(hw.hardware_acceleration_active,false);assert.equal(hw.hardware_acceleration,false);assert(gpuDisabled());assert.equal(loginRequests,0);
   assert.deepEqual(await call(p,'set_hardware_acceleration',{enabled:true}),{enabled:true,restart_required:true});
   await stop();launch();p=await attach();await p.locator('#app').waitFor({state:'visible'});hw=await call(p,'profile_home_state');assert(hw.hardware_acceleration&&hw.hardware_acceleration_active);assert(!gpuDisabled());assert.equal(loginRequests,0);
  }
  // A transient server error must not erase a still-valid saved credential.
  switchStatus=503;const before=fs.readFileSync(path.join(currentRoot,'profiles.json'),'utf8');assert(await call(p,'switch_native_profile',{key}).then(()=>false,()=>true));assert.equal(fs.readFileSync(path.join(currentRoot,'profiles.json'),'utf8'),before);switchStatus=200;
  // The explicit add-account route must not silently reopen the previous account.
  await stop();launch({KINDRED_PROFILE_ID:'unassigned',KINDRED_SERVER_URL:origin});p=await attach();await p.getByRole('heading',{name:'Sign in to Kindred'}).waitFor();assert.equal(await p.locator('#app').isVisible(),false);assert.equal(await p.evaluate(()=>window.__KINDRED_INITIAL_PROFILE),null);await stop();
  launch();p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);
  await call(p,'remember_profile',{token,profileId:id,name:'Session fixture',remember:false});await call(p,'start_desktop',{token});
  assert(!saved().entries[0].protected_token&&!saved().entries[0].token);
  if(process.env.KINDRED_TEST_SIGNED_UPDATE==='1'){
   for(const file of fs.readdirSync(path.join(repo,'desktop/windows')))fs.copyFileSync(path.join(repo,'desktop/windows',file),path.join(folder,file));
   fs.copyFileSync(path.join(repo,'desktop/update-public-key.xml'),path.join(folder,'update-public-key.xml'));
   fs.writeFileSync(path.join(currentRoot,'current.json'),JSON.stringify({version:'0.48.8'}));
   fs.writeFileSync(path.join(currentRoot,'settings.json'),JSON.stringify({server:'',serverUrl:process.env.KINDRED_UPDATE_SERVER}));
   await p.evaluate(()=>{sessionStorage.removeItem('kindred-token');localStorage.removeItem('kindred-token');location.href='kindred-update://check';});
   const updater=await until(()=>browser.contexts()[0].pages().find(p=>p.url().includes('updater.html')));await updater.waitForLoadState();
   void call(updater,'begin_update').catch(()=>{});
   await until(()=>{const status=JSON.parse(fs.readFileSync(path.join(currentRoot,'update-status.json'),'utf8'));if(status.status==='error')throw Error(status.message);return status.status==='complete';},1200);
   browser=null;p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'notification_status')).enabled);assert.equal(await p.locator('#remember-device').isChecked(),false);
   assert.equal(await p.evaluate(()=>sessionStorage.getItem('kindred-token')),token);assert(!saved().entries[0].protected_token&&!saved().entries[0].token);
   assert.equal(JSON.parse(fs.readFileSync(path.join(currentRoot,'current.json'),'utf8').replace(/^\uFEFF/,'')).version,expectedVersion);assert.equal(loginRequests,0);
   assert(!fs.readFileSync(path.join(currentRoot,'update-status.json'),'utf8').includes(token));
   currentExe=path.join(currentRoot,'versions',expectedVersion,'Kindred.exe');
  }
  await stop();launch();p=await attach();await p.getByRole('heading',{name:'Choose an account'}).waitFor();assert.equal(await p.locator('#app').isVisible(),false);
  await p.screenshot({path:path.join(root,'native-account-chooser.png')});
  const result={passed:true,realNativeIPC:true,emptyBrowserStorageRestoresSavedSession:true,protectedSessionSurvivesTwoLaunches:true,transientFailurePreservesSession:true,anotherAccountDoesNotReopenOldAccount:true,temporarySessionStaysTemporary:true,actualSignedUpdate:process.env.KINDRED_TEST_SIGNED_UPDATE==='1',loginRequests,root};
  result.hardwareAccelerationPersistsAndRestarts=process.env.KINDRED_TEST_HARDWARE==='1';
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
  await stop();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
