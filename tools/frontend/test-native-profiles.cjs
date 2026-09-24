// Actual Windows native IPC, protected sessions, and cross-server profile isolation.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Native profiles timed out');}
(async()=>{
 const root=fs.mkdtempSync(path.resolve(__dirname,'../../test-results/native-profiles-')),version=path.join(root,'versions','fixture');fs.mkdirSync(version,{recursive:true});
 const source=process.env.KINDRED_NATIVE_EXE;assert(source);const exe=path.join(version,'Kindred-ProfileFixture.exe');fs.copyFileSync(source,exe);fs.copyFileSync(path.join(path.dirname(source),'WebView2Loader.dll'),path.join(version,'WebView2Loader.dll'));
 const ids=[crypto.randomUUID(),crypto.randomUUID()],tokens=['fixture-a-secret','fixture-b-secret'],requests=[],servers=[];let current=[tokens[0],tokens[1]];
 for(let i=0;i<2;i++){
  const server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const token=req.headers.authorization?.slice(7);requests.push({server:i,path:req.url,token});res.setHeader('Content-Type','application/json');
   if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Kindred profile fixture</title><form id="connect-form"></form><main id="app"></main><p>Native profile '+i+'</p>');return;}
   if(req.url==='/health'){res.end('{"status":"ok"}');return;}
   if(token!==current[i]){res.statusCode=401;res.end('{}');return;}
   if(req.url==='/identity/profiles'){res.end(JSON.stringify({active:ids[i],account_id:'account-'+i,profiles:[{id:ids[i],name:i?'Work':'Personal',active:true,unread:i?12:2}]}));return;}
   if(req.url==='/identity/switch'){assert.equal(JSON.parse(body).profile_id,ids[i]);current[i]+='-rotated';res.end(JSON.stringify({token:current[i],profile_id:ids[i]}));return;}
   if(req.url==='/api/local/poll'){assert.equal(JSON.parse(body).profile_id,ids[i]);res.end('{"active":null,"request":null}');return;}
   res.end('{"cursor":0,"items":[]}');
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);
 }
 const origins=servers.map(s=>'http://127.0.0.1:'+s.address().port),keys=origins.map((o,i)=>crypto.createHash('sha256').update(o+'\n'+ids[i]).digest('hex'));
 fs.writeFileSync(path.join(root,'profiles.json'),JSON.stringify({entries:ids.map((id,i)=>({key:keys[i],server:origins[i],profile_id:id,name:i?'Work':'Personal',account:'account-'+i,token:tokens[i],legacy:false})),last:keys[0],launch_on_startup:false}));
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));let browser;
 const env={...process.env,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port};for(const key of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS'])delete env[key];
 spawn(exe,[],{windowsHide:true,stdio:'ignore',env});
 async function attach(origin){await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return(await r.json()).some(p=>p.url.startsWith(origin));});browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const p=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));await p.waitForLoadState();return p;}
 try{
  let page=await attach(origins[0]);const call=(p,command,args={})=>{console.log('IPC '+command);return p.evaluate(({command,args})=>window.__TAURI__.core.invoke(command,args),{command,args});};
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),tokens[0]);
  await call(page,'remember_profile',{token:tokens[0],profileId:ids[0],name:'Personal',remember:true});
  const saved=fs.readFileSync(path.join(root,'profiles.json'),'utf8');assert(!saved.includes('fixture-a-secret'));assert(!saved.includes('fixture-b-secret'));assert(saved.includes('protected_token'));
  const directory=await call(page,'profile_home_state');assert.equal(directory.entries.length,2);assert(!JSON.stringify(directory).includes('token'));assert(directory.entries.every(e=>!Object.hasOwn(e,'account')&&/^[a-f0-9]{64}$/.test(e.account_key)));
  const activity=await call(page,'profile_activity');assert.equal(activity[keys[1]],12);
  const rejected=await call(page,'switch_native_profile',{key:'not-a-saved-profile'}).then(()=>false,()=>true);assert(rejected);
  await call(page,'open_profile_home');const home=await until(()=>browser.contexts()[0].pages().find(p=>p.url().includes('profile-home.html')));await home.locator('.saved-profile').first().waitFor();assert.equal(await home.locator('.count').last().textContent(),'9+');
  assert.equal(await home.locator('#error').textContent(),'');assert.equal(await home.locator('#startup').count(),0);assert.equal(await home.locator('.dialog-chrome').count(),1);
  await home.getByRole('button',{name:'Options for Work',exact:true}).click();await home.getByRole('dialog',{name:'Options for Work'}).getByRole('button',{name:'Forget on this computer',exact:true}).click();
  const confirm=home.getByRole('dialog',{name:'Forget Work on this computer?'});await confirm.waitFor();assert.equal(await home.evaluate(()=>document.activeElement.textContent),'Keep account');await confirm.getByRole('button',{name:'Keep account'}).click();assert.equal((await call(page,'profile_home_state')).entries.length,2);
  await home.screenshot({path:path.join(root,'profile-home.png')});
  void call(page,'switch_native_profile',{key:keys[1]}).catch(()=>{});await sleep(1500);page=await attach(origins[1]);assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),current[1]);
  await call(page,'remember_profile',{token:current[1],profileId:ids[1],name:'Work',remember:true});
  const persisted=JSON.parse(fs.readFileSync(path.join(root,'profiles.json'),'utf8'));assert.equal(persisted.last,keys[1]);assert(!JSON.stringify(persisted).includes('fixture-b-secret'));
  assert(requests.filter(r=>r.server===0&&r.token).every(r=>r.token===tokens[0]));assert(requests.filter(r=>r.server===1&&r.token).every(r=>r.token.startsWith(tokens[1])));
  const mode=await call(page,'local_access_status');assert.equal(mode.mode,'off');
  await page.evaluate(()=>sessionStorage.setItem('kindred-token','rotated-in-page'));await page.reload();assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),'rotated-in-page','Reload must not re-inject an expired startup token');
  console.log(JSON.stringify({passed:true,realNativeIPC:true,dpapiProtected:true,crossServerTokensIsolated:true,lastProfileRestored:true,badProfileRejected:true,otherProfileLocalAccessOff:true,root}));
 }finally{spawnSync('taskkill.exe',['/IM','Kindred-ProfileFixture.exe','/F','/T'],{windowsHide:true,stdio:'ignore'});if(browser)await Promise.race([browser.close().catch(()=>{}),sleep(1000)]);for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
