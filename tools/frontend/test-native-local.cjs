// Real Windows WebView2/native IPC and filesystem checks in a disposable install.
const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<150;n++){const value=await fn();if(value)return value;await sleep(100);}throw Error('Native fixture timed out');}
(async()=>{
 const registry='HKCU\\Software\\Classes\\AppUserModelId\\dev.kindred.personal';
 const priorIcon=spawnSync('reg.exe',['query',registry,'/v','IconUri'],{encoding:'utf8',windowsHide:true}).stdout?.match(/REG_SZ\s+(.+)/)?.[1]?.trim();
 const artifacts=path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});const root=fs.mkdtempSync(path.join(artifacts,'native-local-')),version=path.join(root,'versions','fixture');fs.mkdirSync(version,{recursive:true});
 const source=process.env.KINDRED_NATIVE_EXE;assert(source,'Set KINDRED_NATIVE_EXE to the compiled native executable');fs.copyFileSync(source,path.join(version,'Kindred.exe'));const dll=path.join(path.dirname(source),'WebView2Loader.dll');if(fs.existsSync(dll))fs.copyFileSync(dll,path.join(version,'WebView2Loader.dll'));
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
  const off=queue('local_write',{path:'off.txt',text:'must not write'});assert.equal((await result(off)).failed,true);assert(!fs.existsSync(path.join(root,'workspace','off.txt')));
  await mode('workspace');const write=queue('local_write',{path:'hello.txt',text:'Native workspace verified'});assert.equal((await result(write)).failed,undefined);assert.equal(fs.readFileSync(path.join(root,'workspace','hello.txt'),'utf8'),'Native workspace verified');
  const outside=path.join(root,'outside.txt');const blocked=queue('local_write',{path:outside,text:'blocked'});assert.equal((await result(blocked)).failed,true);assert(!fs.existsSync(outside));
  const read=queue('local_read',{path:'hello.txt'});assert.equal((await result(read)).text,'Native workspace verified');
  await mode('ask');const denied=queue('local_write',{path:outside,text:'denied'});await dialog.locator('#request:not([hidden])').waitFor();await dialog.locator('#deny').click();assert.equal((await result(denied)).failed,true);assert(!fs.existsSync(outside));
  const approved=queue('local_write',{path:outside,text:'approved once'});await dialog.locator('#request:not([hidden])').waitFor();await dialog.screenshot({path:path.join(artifacts,'native-local-permission.png')});await dialog.locator('#allow').click();assert.equal((await result(approved)).failed,undefined);assert.equal(fs.readFileSync(outside,'utf8'),'approved once');
  const command=queue('local_exec',{path:'.',command:"Write-Output 'approved command'",action_scope:'routine_vm'});await dialog.locator('#request:not([hidden])').waitFor();await until(()=>registered?.progress?.phase==='awaiting_approval');await dialog.locator('#allow').click();assert((await result(command)).text.includes('approved command'));
  await mode('full');const full=queue('local_write',{path:outside,text:'full mode verified'});assert.equal((await result(full)).failed,undefined);assert.equal(fs.readFileSync(outside,'utf8'),'full mode verified');
  const multiline=queue('local_exec',{path:'.',command:"$items = @(\n  'hello λ'\n  'second'\n)\nforeach ($item in $items) {\n  Write-Output $item\n}",action_scope:'routine_vm'});const multiResult=await result(multiline);assert.equal(multiResult.failed,false);assert(multiResult.text.includes('hello λ')&&multiResult.text.includes('second'));
  const noOutput=queue('local_exec',{path:'.',command:'$x = 1',action_scope:'routine_vm'});assert.match((await result(noOutput)).text,/completed successfully with no output/);
  const failed=queue('local_exec',{path:'.',command:'exit 7',action_scope:'routine_vm'});const failure=await result(failed);assert.equal(failure.exit_code,7);assert.match(failure.text,/exited with code 7/);
  const timeout=queue('local_exec',{path:'.',command:'Start-Sleep -Seconds 10',timeout_seconds:2,action_scope:'routine_vm'});await until(()=>registered?.progress?.id===timeout&&registered.progress.phase==='running');const timed=await result(timeout);assert.equal(timed.timed_out,true);assert.equal(timed.stopped,true);assert.match(timed.text,/timed out after 2s/);assert(timed.elapsed_seconds>=2&&timed.elapsed_seconds<5);
  const savedId=JSON.parse(fs.readFileSync(path.join(root,'local-access.json'),'utf8')).id;assert.equal(savedId,registered.id);
  const cancelled=queue('local_exec',{path:'.',command:'Start-Sleep -Seconds 30',action_scope:'routine_vm'});await until(()=>registered.busy);active=null;assert.equal((await result(cancelled)).stopped,true);
  const disconnect=queue('local_exec',{path:'.',command:'Start-Sleep -Seconds 30',action_scope:'routine_vm'});await until(()=>registered.busy);offline=true;await sleep(1800);offline=false;assert.equal((await result(disconnect)).stopped,true);
  await mode('off');assert.equal((await main.evaluate(()=>window.__TAURI__.core.invoke('local_access_status'))).mode,'off');
  console.log(JSON.stringify({passed:true,realNativeIPC:true,remoteCannotGrant:true,defaultsOff:true,persistedInterruptedOperationNotReplayed:true,workspaceBound:true,askDenyAllow:true,fullAccess:true,multilineUtf8:true,commandOutcomeMetadata:true,permissionAndExecutionProgress:true,persistentDesktopId:true,cancel:true,disconnectStopsCommand:true,artifact:root}));
 }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});server.close();if(priorIcon)spawnSync('reg.exe',['add',registry,'/v','IconUri','/t','REG_SZ','/d',priorIcon,'/f'],{windowsHide:true,stdio:'ignore'});else spawnSync('reg.exe',['delete',registry,'/v','IconUri','/f'],{windowsHide:true,stdio:'ignore'});}
})().catch(e=>{console.error(e);process.exitCode=1;});
