// Real WebView2: refused connection, non-Kindred page, and recovery after restart.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<250;i++){try{const value=await fn();if(value)return value;}catch{}await sleep(100);}throw Error('Native connection fixture timed out');}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
(async()=>{
 const root=fs.mkdtempSync(path.resolve(__dirname,'../../test-results/native-connection-')),source=process.env.KINDRED_NATIVE_EXE;assert(source);
 const exe=path.join(root,'Kindred-ConnectionFixture.exe');fs.copyFileSync(source,exe);fs.copyFileSync(path.join(path.dirname(source),'WebView2Loader.dll'),path.join(root,'WebView2Loader.dll'));
 const port=await freePort(),debug=await freePort(),origin='http://127.0.0.1:'+port;
 const env={...process.env,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+debug};for(const key of ['KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS'])delete env[key];
 let browser,server,kindred=false;
 const attach=async()=>{await until(async()=>{const r=await fetch('http://127.0.0.1:'+debug+'/json/list');return(await r.json()).length;});browser=await chromium.connectOverCDP('http://127.0.0.1:'+debug);};
 const home=async()=>until(()=>browser.contexts()[0].pages().find(p=>p.url().includes('profile-home.html')));
 try{
  spawn(exe,[origin],{windowsHide:true,stdio:'ignore',env});await attach();let page=await home();
  await page.getByText('Couldn’t open your workspace',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('#connection-address').textContent(),origin);
  await until(()=>!browser.contexts()[0].pages().some(p=>p.url().startsWith(origin)||p.url().startsWith('chrome-error:')));
  await page.locator('#connection-retry').click();await page.getByText('Could not reach this server. Check its address and HTTPS certificate.',{exact:true}).waitFor();
  assert(await page.locator('#connection-retry').isEnabled());
  await page.screenshot({path:path.join(root,'connection-refused.png')});
  server=http.createServer((req,res)=>{if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return;}res.setHeader('Content-Type','text/html');res.end(kindred?'<!doctype html><title>Kindred</title><div id="account-connect"></div><main id="app">Restored workspace</main>':'<!doctype html><title>Proxy error</title><p>Upstream unavailable</p>');});await new Promise(r=>server.listen(port,'127.0.0.1',r));
  await page.locator('#connection-retry').click().catch(()=>{});await sleep(1500);await attach();page=await home();
  await page.getByText('Couldn’t open your workspace',{exact:true}).waitFor({timeout:20000});
  await until(()=>!browser.contexts()[0].pages().some(p=>p.url().startsWith(origin)));
  kindred=true;await page.locator('#connection-retry').click().catch(()=>{});await sleep(1500);await attach();
  page=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));await page.getByText('Restored workspace',{exact:true}).waitFor();
  await until(()=>!browser.contexts()[0].pages().some(p=>p.url().includes('profile-home.html')));
  await page.screenshot({path:path.join(root,'connection-restored.png')});
  kindred=false;void page.reload().catch(()=>{});page=await home();await page.getByText('Couldn’t open your workspace',{exact:true}).waitFor({timeout:20000});
  await until(()=>!browser.contexts()[0].pages().some(p=>p.url().startsWith(origin)));
  kindred=true;await page.locator('#connection-retry').click().catch(()=>{});await sleep(1500);await attach();page=await until(()=>browser.contexts()[0].pages().find(p=>p.url().startsWith(origin)));await page.getByText('Restored workspace',{exact:true}).waitFor();
  await page.evaluate(()=>window.__TAURI__.core.invoke('window_action',{action:'close'})).catch(()=>{});await sleep(500);
  kindred=false;const closing=spawn(exe,[origin],{windowsHide:true,stdio:'ignore',env});await sleep(500);await attach();page=await home();
  await page.getByText('Opening your workspace…',{exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click().catch(()=>{});
  await until(()=>closing.exitCode!==null);
  console.log(JSON.stringify({passed:true,refusedConnectionRecovery:true,retryRemainsUsable:true,proxyPageHidden:true,reconnected:true,reloadRecovery:true,closeDuringStartup:true,root}));
 }catch(error){
  for(const page of browser?.contexts()[0]?.pages()||[]){try{console.error(JSON.stringify(await Promise.race([page.evaluate(()=>({url:location.href,title:document.title,connection:document.querySelector('#connection-title')?.textContent,error:document.querySelector('#error')?.textContent})),sleep(2000).then(()=>({diagnostic:'Page did not respond'}))])));if(page.url().includes('profile-home'))console.error(JSON.stringify(await Promise.race([page.evaluate(async()=>(await window.__TAURI__.core.invoke('profile_home_state')).intent),sleep(2000).then(()=>({diagnostic:'Native state did not respond'}))])));}catch{}}
  throw error;
 }finally{spawnSync('taskkill.exe',['/IM','Kindred-ConnectionFixture.exe','/F','/T'],{windowsHide:true,stdio:'ignore'});if(browser)await Promise.race([browser.close().catch(()=>{}),sleep(1000)]);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
