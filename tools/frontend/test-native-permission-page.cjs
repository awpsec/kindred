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
 const root=fs.mkdtempSync(path.join(repo,'test-results/native-permission-page-')),id=crypto.randomUUID();let oldUI=false,browser=null,child=null;
 const registry='HKCU\\Software\\Classes\\AppUserModelId\\dev.kindred.personal';
 const priorIcon=execFileSync('reg.exe',['query',registry,'/v','IconUri'],{encoding:'utf8',windowsHide:true}).match(/REG_SZ\s+(.+)/)?.[1]?.trim();
 const defaultHandler=server.listeners('request')[0];server.removeAllListeners('request');let loginRequests=0,switchStatus=200;
 const oldAssets=new Map();
 if(process.env.KINDRED_BASELINE_EXE)for(const name of ['app.js','profiles.js'])oldAssets.set('/'+name,execFileSync('git',['-C',repo,'show','e6fcb85eb6fd9dffbeb72733f086b1364d5da458:ui/'+name]));
 server.on('request',async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(oldUI&&oldAssets.has(pathname)){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(oldAssets.get(pathname));}
  if(pathname==='/api/local/poll'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"active":null,"request":null}');}
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
  prepare('permissions',source);launch();const p=await attach();await p.locator('#app').waitFor({state:'visible'});await until(async()=>(await call(p,'local_access_status')).device_id);
  await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Computer',exact:true}).click();
  await p.getByRole('button',{name:'Desktop permissions',exact:true}).click();
  const child=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/local-access.html')));
  await child.locator('#mode').waitFor();assert(child.url().includes('embedded=1'));assert(await child.locator('.dialog-chrome').count()===0);
  await p.getByRole('button',{name:'Back to Computer',exact:true}).waitFor();
  const bounds=await p.locator('#settings-content').boundingBox(),viewport=await child.evaluate(()=>({width:innerWidth,height:innerHeight}));
  assert(Math.abs(viewport.width-bounds.width)<3,JSON.stringify({bounds,viewport}));assert(Math.abs(viewport.height-(bounds.height-12))<3);
  // Hosted UI retains read-only status but never acquires permission-write authority.
  await assert.rejects(()=>call(p,'set_local_access',{mode:'full'}));
  await assert.rejects(()=>call(p,'local_access_state'));
  await assert.rejects(()=>call(child,'decide_local_access',{id:'fixture',allow:true}));
  await assert.rejects(()=>call(child,'set_hardware_acceleration',{enabled:false}));
  await child.locator('#mode').click();await child.getByRole('listbox').waitFor();await child.getByRole('listbox').getByRole('option',{name:'Kindred workspace only · files',exact:true}).click();
  await child.locator('#save').click();await child.getByText('Desktop permission saved.',{exact:true}).waitFor();assert.equal((await call(p,'local_access_status')).mode,'workspace');
  assert.equal((await call(p,'notification_status')).enabled,true);await call(p,'window_action',{action:'state'});
  await child.screenshot({path:path.join(root,'permissions-page.png')});await p.screenshot({path:path.join(root,'settings-shell.png')});
  await child.evaluate(url=>location.assign(url),origin+'/fixture/site');await sleep(200);assert(child.url().includes('/local-access.html'),'Privileged view cannot navigate to hosted content');
  await p.getByRole('button',{name:'Back to Computer',exact:true}).click();await p.getByRole('button',{name:'Desktop permissions',exact:true}).waitFor();await until(()=>child.isClosed());
  await p.getByRole('button',{name:'Desktop permissions',exact:true}).click();const second=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/local-access.html')));await second.locator('#mode').waitFor();assert.equal(await second.locator('#mode').inputValue(),'workspace');
  await p.locator('#settings-close').click();await until(()=>second.isClosed());assert(await p.locator('#settings-dialog').isHidden());
  const report={passed:true,embeddedNativeSettings:true,backAndCloseRemoveView:true,permissionSaved:true,hostedCannotGrant:true,childCannotApproveOperations:true,navigationRestricted:true,parentIPCWhileChildOpen:true,root};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  await stop();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
