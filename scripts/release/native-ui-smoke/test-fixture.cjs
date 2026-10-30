// Local fixture contract only. Browser capabilities/input are explicitly simulated.
// No native EXE, OS input helper, product service, provider or VM is executed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const subprocess=require('node:child_process');
const {binding,hook,withSharedArtifact}=require('./run-native.cjs');
const source=process.argv[2],engine=process.argv[3]||'chromium',output=process.argv[4];const parent=false;
assert(source&&output&&['chromium','webkit'].includes(engine));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const launcher=fs.readFileSync(path.join(__dirname,'run-native.cjs'),'utf8');const commit=subprocess.execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),version=JSON.parse(fs.readFileSync(path.join(source,'desktop/tauri.conf.json'),'utf8')).version;
 const manifest={fixtureNonce:crypto.randomBytes(24).toString('hex'),sourceCommit:commit,version,platform:engine==='chromium'?'windows':'macos',resources:binding(source,commit),rendererHookSha256:sha(Buffer.from(hook))};
 let browser,page;const localInputs=[];
 const localInput=async v=>{assert(page);assert(['click','drag'].includes(v.kind));if(v.kind==='click')await page.mouse.click(v.x,v.y);else{await page.mouse.move(v.x,v.y);await page.mouse.down();await page.mouse.move(v.tx,v.ty,{steps:12});await page.mouse.up();}localInputs.push(v);return {passed:true,browserInput:true,nativeInput:false};};
 const originalRead=fs.readFileSync;const localFs={...fs,readFileSync(n,...args){return originalRead(n,...args);}};
 const start=launcher.indexOf("  process.env.KINDRED_TEST_SECURITY_HEADERS='1';"),end=launcher.indexOf("  const data=path.join(root,'data')",start);assert(start>=0&&end>start);
 let code=launcher.slice(start,end);
 const invoke="const observed=JSON.parse(execFileSync(command[0],command[1],{timeout:20000,encoding:'utf8'}).trim());assert(observed.passed&&observed.nativeInput);";
 assert(code.includes(invoke));code=code.replace(invoke,"const observed=await localInput(value);assert(observed.passed&&observed.browserInput&&observed.nativeInput===false);");
 const context={attachComputerStream:require('./computer-stream.cjs').attachComputerStream,require:createRequire(path.join(__dirname,'run-native.cjs')),fs:localFs,path,crypto,assert,sha,source,proof:{},manifest,hook,withSharedArtifact,__dirname,process,Buffer,URL,execFileSync:()=>{throw Error('Native helper forbidden in local validation');},child:{exitCode:null,pid:process.pid},timeout:false,inputs:[],sessions:[],helperLog:[],report:null,stream:null,server:null,original:null,localInput};
 vm.createContext(context);const owned=await vm.runInContext('(async()=>{'+code+';return {origin,fixture,book,artifact,messages,requests:fixtureRequests};})()',context);
 const result={fixtureOnly:true,nativePass:false,nativeCapabilitiesSimulated:true,inputAdapter:'Playwright mouse only; no OS helper',engine,parentHttp:parent,resources:manifest.resources};
 try{
  const response=await fetch(owned.origin+'/api/workspace-artifacts/native-workbook/file/1');const bytes=Buffer.from(await response.arrayBuffer());
  result.versionedHTTP={status:response.status,bytes:bytes.length,sha256:sha(bytes),expectedBytes:owned.book.length,expectedSha256:sha(owned.book),matches:bytes.equals(owned.book)};
  if(parent){assert.equal(result.versionedHTTP.matches,false,'Retained original route must reproduce wrong payload');result.expectedNegative=true;return;}
  assert.equal(response.status,200);assert(bytes.equals(owned.book),'Versioned route must serve exact XLSX bytes');
  const wrong=await fetch(owned.origin+'/api/workspace-artifacts/native-workbook/file/2');assert.equal(wrong.status,500);result.foreignRevisionRefused=true;
  const playwright=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');browser=await playwright[engine].launch();
  page=await browser.newPage({viewport:{width:1320,height:1000},userAgent:engine==='chromium'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15'});
  await page.addInitScript(({token,platform,version})=>{if(window!==top)return;sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.__KINDRED_MAC_OVERLAY=platform==='macos';window.__KINDRED_FILE_DELIVERY=true;window.__KINDRED_ARTIFACT_FRAME=true;window.__TAURI__={core:{invoke:async name=>name==='profile_home_state'?{version}:null}};},{token:owned.fixture.token,platform:manifest.platform,version:manifest.version});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(owned.origin);
  const deadline=Date.now()+90000;while(!context.report&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  result.report=context.report;result.fixtureRequests=owned.requests;result.browserInputs=localInputs;result.guestInputs=context.stream.inputs;result.sessions=context.sessions;result.errors=errors;
  assert(context.report,'Missing local terminal report before optional capture');assert(context.report.passed,JSON.stringify(context.report));assert.deepEqual(errors,[]);
  assert(localInputs.length===3&&context.report.popout.trustedPointerDowns>=3);assert(context.stream.inputs.length===0);assert(context.sessions.some(s=>s.path==='/api/computer/observe-session'));assert(context.sessions.every(s=>s.control===false));assert(owned.requests.includes('chat-history')&&owned.requests.includes('workbook-file'));
  result.passed=true;result.capture={status:'disabled',reason:'Behavioral qualification; earlier supplied images remain separate'};
 }catch(e){result.passed=false;result.error=String(e);if(page){result.dom=await Promise.race([page.evaluate(()=>({title:document.title,errors:[...document.querySelectorAll('[role=alert],.document-error,.muted')].map(n=>n.textContent).filter(Boolean).slice(-15),popout:document.querySelector('.computer-popout')?.outerHTML?.slice(0,1500)})),new Promise(resolve=>setTimeout(()=>resolve({unresponsive:true}),3000))]).catch(()=>null);}throw e;}
 finally{fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');await Promise.race([browser?.close(),new Promise(resolve=>setTimeout(resolve,3000))]);context.stream?.close();context.server?.closeAllConnections();context.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
