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
 const root=fs.mkdtempSync(path.join(repo,'test-results/native-account-manager-')),id=crypto.randomUUID();let oldUI=false,browser=null,child=null;
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
  prepare('accounts',source);launch();const p=await attach();await p.locator('#app').waitFor({state:'visible'});
  const pages=()=>browser.contexts().flatMap(c=>c.pages());
  const open=async()=>{await p.locator('#switch-profiles').click();await p.getByRole('button',{name:'Manage accounts',exact:true}).click();const c=await until(()=>pages().find(p=>p.url().includes('/profile-home.html')));await c.locator('.saved-profile').waitFor();return c;};
  const countWindows=()=>Number(ps(`(Get-Process -Id ${child.pid}).MainWindowHandle`));
  const handle=countWindows();assert(handle);await p.locator('#settings-button').click();await p.locator('#settings-dialog').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));const settings=await p.locator('#settings-dialog').boundingBox();await p.locator('#settings-close').click();
  const c=await open();assert(c.url().includes('embedded=1'));assert.equal(await c.locator('.dialog-chrome').count(),0);assert.equal(countWindows(),handle);
  assert.equal(ps(`$w = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);' -Name Parent -Namespace Fixture -PassThru; [Fixture.Parent]::GetParent([IntPtr]${handle}).ToInt64()`).trim(),'0');
  const manager=p.locator('#account-manager-dialog');const actual=await manager.boundingBox();for(const dim of ['width','height','x','y'])assert(Math.abs(actual[dim]-settings[dim])<2,JSON.stringify({dim,settings,actual}));
  const bounds=await p.locator('.account-manager-content').boundingBox(),viewport=await c.evaluate(()=>({width:innerWidth,height:innerHeight}));assert(Math.abs(viewport.width-bounds.width)<3);assert(Math.abs(viewport.height-bounds.height)<3);
  for(let i=0;i<2;i++){const previous=await p.evaluate(()=>innerWidth);await call(p,'window_action',{action:'maximize'});await p.waitForFunction(w=>innerWidth!==w,previous);await until(async()=>{const b=await p.locator('.account-manager-content').boundingBox(),v=await c.evaluate(()=>({width:innerWidth,height:innerHeight}));return Math.abs(v.width-b.width)<3&&Math.abs(v.height-b.height)<3;});}
  await assert.rejects(()=>call(p,'forget_profile',{key}));await assert.rejects(()=>call(p,'start_standalone'));await assert.rejects(()=>call(p,'close_profile_home'));
  await assert.rejects(()=>call(c,'set_hardware_acceleration',{enabled:false}));await assert.rejects(()=>call(c,'window_action',{action:'close'}));await assert.rejects(()=>call(c,'set_local_access',{mode:'full'}));
  await assert.rejects(()=>call(p,'position_profile_home',{bounds:{x:-1,y:0,width:400,height:400}}));await assert.rejects(()=>call(p,'position_profile_home',{bounds:{x:0,y:0,width:400,height:400},section:'<script>'}));
  assert.equal(await manager.getByRole('button',{name:'Standalone',exact:true}).count(),0);assert(await c.locator('.standalone').isHidden());
  await c.getByRole('button',{name:'Options for Session fixture'}).click();await c.getByRole('dialog').getByRole('button',{name:'Forget on this computer'}).click();await c.getByRole('dialog',{name:'Forget Session fixture on this computer?'}).waitFor();await c.keyboard.press('Escape');assert(await manager.isVisible());assert.equal(saved().entries.length,1);
  await c.getByRole('button',{name:'Add account',exact:false}).click();await c.locator('#address').waitFor({state:'visible'});assert.equal(await c.locator('#address').inputValue(),origin);
  await c.screenshot({path:path.join(root,'accounts-content-dark.png')});await p.screenshot({path:path.join(root,'accounts-shell-dark.png')});
  await c.evaluate(url=>location.assign(url),origin+'/profile-home.html');await sleep(200);assert(c.url().includes('tauri.localhost'),'Privileged view cannot navigate to hosted content');
  await c.keyboard.press('Escape');await until(()=>c.isClosed());await manager.waitFor({state:'detached'});assert.equal(countWindows(),handle);
  await p.evaluate(()=>document.documentElement.dataset.theme='light');const second=await open();assert.equal(await second.locator('html').getAttribute('data-theme'),'light');assert.equal(await second.locator('html').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
  await second.getByRole('button',{name:'Options for Session fixture'}).click();await second.getByRole('dialog').getByRole('button',{name:'Forget on this computer'}).click();await second.getByRole('dialog',{name:'Forget Session fixture on this computer?'}).getByRole('button',{name:'Forget on this computer',exact:true}).click();await until(()=>saved().entries.length===0);assert.equal(await call(p,'notification_status').then(v=>v.enabled),true);
  await p.getByRole('button',{name:'Close manage accounts'}).click();await until(()=>second.isClosed());await p.locator('#account-manager-dialog').waitFor({state:'detached'});
  await call(p,'position_profile_home',{bounds:{x:100,y:100,width:400,height:400}});await sleep(150);assert(!pages().some(p=>p.url().includes('/profile-home.html')),'Resize cannot recreate a closed view');
  const report={passed:true,embeddedNativeAccounts:true,sameMainWindow:true,settingsGeometry:true,accountsOnly:true,forgetConfirmation:true,hostedCannotForgetOrSetup:true,childCannotChangeOtherNativeSettings:true,navigationRestricted:true,escapeClosesChildDialogsFirst:true,closeAndReopen:true,lightTheme:true,root};fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

 }finally{
  await stop();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});
  server.closeAllConnections();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
