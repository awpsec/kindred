// Real Windows WebView2/native IPC and filesystem checks in a disposable install.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<150;n++){const value=await fn();if(value)return value;await sleep(100);}throw Error('Native fixture timed out');}
(async()=>{
 const registry='HKCU\\Software\\Classes\\AppUserModelId\\dev.kindred.personal';
 const priorIcon=spawnSync('reg.exe',['query',registry,'/v','IconUri'],{encoding:'utf8',windowsHide:true}).stdout?.match(/REG_SZ\s+(.+)/)?.[1]?.trim();
 const artifacts=path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});const root=fs.mkdtempSync(path.join(artifacts,'native-local-')),version=path.join(root,'versions','fixture');fs.mkdirSync(version,{recursive:true});
 const distro=process.env.KINDRED_TEST_WSL_DISTRO, scanRoot=process.env.KINDRED_TEST_WSL_ROOT; assert(distro&&scanRoot,'Set an explicit WSL distribution and its .claude path'); const source=process.env.KINDRED_NATIVE_EXE;assert(source,'Set KINDRED_NATIVE_EXE to the compiled native executable');fs.copyFileSync(source,path.join(version,'Kindred.exe'));const dll=path.join(path.dirname(source),'WebView2Loader.dll');if(fs.existsSync(dll))fs.copyFileSync(dll,path.join(version,'WebView2Loader.dll'));
 const interrupted=crypto.randomUUID();fs.writeFileSync(path.join(root,'local-operation.json'),JSON.stringify({id:interrupted,nonce:crypto.randomUUID(),result:null}));
 let registered=null,queued=null,active=interrupted,receipts=new Map(),offline=false,replayReceipt=false;
 const token='native-local-test-only';
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Native local fixture</title><form id="connect-form"></form><main id="app"></main><p>Kindred local access verification</p>');return;}
  if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end('{}');return;}
  let bytes='';for await(const c of req)bytes+=c;const body=JSON.parse(bytes||'{}');
  if(req.url==='/api/local/poll'){
   registered=body;if(offline){res.writeHead(503);res.end('{}');return;}
   if(body.receipt){receipts.set(body.receipt.id,body.receipt.result);if(!replayReceipt)active=null;}
   let request=null;if(queued&&!body.busy){request=queued;active=queued.id;queued=null;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({active,request}));return;
  }
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({cursor:0,items:[]}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin='http://127.0.0.1:'+server.address().port,child=spawn(path.join(version,'Kindred.exe'),[origin],{windowsHide:true,stdio:'ignore',env:{...process.env,KINDRED_ACCESS_TOKEN:token,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}});
 let browser;
 try{
  await until(async()=>{try{return(await fetch('http://127.0.0.1:'+port+'/json/version')).ok;}catch{return false;}});browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];const main=await until(()=>context.pages().find(p=>p.url().startsWith(origin)));await main.waitForLoadState();
  await main.evaluate(token=>window.__TAURI__.core.invoke('start_desktop',{token}),token);await until(()=>registered);
  const recovered=await until(()=>receipts.get(interrupted));assert.equal(recovered.failed,true);assert(recovered.text.includes('not replayed'));
  assert.equal(registered.mode,'off');assert(fs.existsSync(path.join(root,'workspace')));
  const remoteGrant=await main.evaluate(async()=>{try{await window.__TAURI__.core.invoke('set_local_access',{mode:'full'});return true;}catch{return false;}});assert.equal(remoteGrant,false,'Hosted content cannot grant local permission');
  await main.evaluate(()=>window.__TAURI__.core.invoke('open_local_access'));const dialog=await until(()=>context.pages().find(p=>p.url().includes('local-access.html')));await dialog.waitForLoadState();await dialog.locator('#mode').waitFor();
  async function mode(value){await dialog.locator('#mode').selectOption(value);await dialog.locator('#save').click();await until(()=>registered?.mode===value);}
  function queue(tool,args){assert(!queued);const id=crypto.randomUUID();queued={id,nonce:crypto.randomUUID(),bot:'Fixture bot',tool,args,deadline:Math.floor(Date.now()/1000)+30};return id;}
  async function result(id){return until(()=>receipts.get(id));}
  await mode('ask');
  const command=queue('local_exec',{path:'.',command:'wsl.exe --distribution '+("'"+distro.replaceAll("'","''")+"'")+' --exec /usr/bin/id -un',timeout_seconds:15,action_scope:'routine_vm'});
  await dialog.locator('#request:not([hidden])').waitFor();await dialog.locator('#allow').click();
  const outcome=await result(command);assert.equal(outcome.failed,false);assert.equal(outcome.exit_code,0);assert(outcome.text.trim());
  console.log(JSON.stringify({wslNativeCommandPassed:true,distribution:distro,linuxUser:outcome.text.trim(),elapsedSeconds:outcome.elapsed_seconds,approvalHonored:true}));
  // Reject arbitrary network and device paths before any network request or approval.
  for(const invalid of ["\\\\example.invalid\\share\\file", "\\\\wsl.localhost\\unregistered-kindred-test\\home", "\\\\?\\C:\\Windows"]){
   const denied=queue('local_skill_scan',{path:invalid});assert.equal((await result(denied)).failed,true);
  }
  await mode('workspace');const outside=queue('local_skill_scan',{path:scanRoot});assert.equal((await result(outside)).failed,true);
  await mode('ask');const scan=queue('local_skill_scan',{path:scanRoot});
  await dialog.locator('#request:not([hidden])').waitFor();await dialog.locator('#allow').click();
  const scanned=await result(scan);assert.notEqual(scanned.failed,true,scanned.text);
  const discovered=JSON.parse(scanned.text);assert(discovered.candidates.length>0);assert.equal(discovered.warnings.length,0);
  // Exercise the normal complete-package reader without saving/importing a skill.
  const entry=discovered.candidates.find(c=>c.kind==='command');assert(entry);
  const bundled=queue('local_skill_bundle',{path:entry.path});
  await dialog.locator('#request:not([hidden])').waitFor();await dialog.locator('#allow').click();
  const bundle=await result(bundled);assert.notEqual(bundle.failed,true,bundle.text);assert(bundle.source.includes(distro));assert(Object.keys(bundle.files).length>0);
  console.log(JSON.stringify({nativeWslWorkflowScanPassed:true,candidates:discovered.candidates.length,warnings:discovered.warnings.length,packageRead:true,generalNetworkPathsDenied:true,unregisteredDistributionsDenied:true,workspaceBoundaryPreserved:true}));
  await mode('off');assert.equal((await main.evaluate(()=>window.__TAURI__.core.invoke('local_access_status'))).mode,'off');
  console.log(JSON.stringify({passed:true,realNativeIPC:true,wslThroughKindred:true,distribution:distro,artifact:root}));
 }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});server.close();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});else spawnSync('reg.exe',['delete',registry,'/v','IconUri','/f'],{windowsHide:true,stdio:'ignore'});}
})().catch(e=>{console.error(e);process.exitCode=1;});
