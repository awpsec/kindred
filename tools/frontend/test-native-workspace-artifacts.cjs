process.env.KINDRED_TEST_SECURITY_HEADERS='1';
// Exercise real response policies and frame navigation in the native webview.
const {server,securityHeaders}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
(async()=>{
 assert(process.env.KINDRED_NATIVE_EXE,'Set KINDRED_NATIVE_EXE');const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-artifact-native-'));let report,child,stderr='';
 const sources=[{language:'html',source:'<!doctype html><html><head><title>Native report</title></head><body><main id="report"></main><script>kindredArtifact.ready.then(s=>{document.querySelector("#report").textContent="Ready: "+s.title;});</script></body></html>'},{language:'jsx',source:'export default function App(){return <h1>React report</h1>}'}];
 if(process.env.KINDRED_ARTIFACT_FIXTURE){const actual=JSON.parse(fs.readFileSync(process.env.KINDRED_ARTIFACT_FIXTURE));sources.push({language:actual.language,source:actual.source});}
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));try{
 await window.__TAURI__?.core.invoke('connection_ready');
 const {workspaceArtifactCard}=await import('/workspace-artifacts.js');const sources=await(await fetch('/fixture/sources')).json();const results=[];
 for(const [i,source]of sources.entries()){
 const v={...source,id:'fixture-'+i,title:'Native artifact',path:'/artifacts/fixture-'+i,revision:1,state:{title:'Shared data'},archived:false};
 const signal='kindredArtifact.ready.then(()=>setTimeout(()=>parent.postMessage({kind:"fixture-visible",length:document.body.innerText.trim().length,isolated:window.top!==window},"*"),400));';
 v.source+=v.language==='html'?'<script>'+signal+'<'+ '/script>':'\\n'+signal;
 let visible=null;const listener=e=>{if(e.data?.kind==='fixture-visible')visible={...e.data,origin:e.origin};};addEventListener('message',listener);
 const card=workspaceArtifactCard(v,{api:async()=>v,markdown:s=>document.createTextNode(s)});document.querySelector('#content').append(card);await card.openArtifact();
 for(let t=0;t<100&&!visible;t++)await sleep(100);results.push({language:v.language,visible,error:card.querySelector('.artifact-render-error')?.textContent||''});
 removeEventListener('message',listener);card.remove();
 }
 await sleep(13000); // A subframe must not trigger the main-window reconnect watchdog.
 await fetch('/fixture/report',{method:'POST',body:JSON.stringify({results})});
 }catch(e){await fetch('/fixture/report',{method:'POST',body:JSON.stringify({error:String(e)})});}</script>`;
 fs.writeFileSync(path.join(root,'probe.mjs'),probe.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));require('node:child_process').execFileSync(process.execPath,['--check',path.join(root,'probe.mjs')]);
 const original=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',async(req,res)=>{securityHeaders(req,res);const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/fixture/sources'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(sources));}
 if(route==='/fixture/probe.js'){res.setHeader('Content-Type','text/javascript');return res.end(probe.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));}
 if(route==='/fixture/report'){let data='';for await(const b of req)data+=b;report=JSON.parse(data);return res.end('ok');}
 if(route==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><main id="content"></main>'+'<script type="module" src="/fixture/probe.js"></script></body></html>');}
 if(route==='/identity/meta'||route==='/health'){res.setHeader('Content-Type','application/json');return res.end('{}');}original(req,res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{child=spawn(process.env.KINDRED_NATIVE_EXE,['http://127.0.0.1:'+server.address().port],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:'native-test-token-only',KINDRED_PROFILE_ID:'fixture',KINDRED_LEGACY_LOCAL_ACCESS:'0'},detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>stderr+=b);
 const deadline=Date.now()+65000;while(!report&&Date.now()<deadline&&child.exitCode===null&&!child.signalCode)await new Promise(r=>setTimeout(r,100));assert(report,stderr||'No native report');assert(!report.error,JSON.stringify(report));for(const result of report.results){assert(!result.error,result.error);assert(result.visible?.length>10&&result.visible.origin==='null',JSON.stringify(report));}const exec=require('node:child_process').execFileSync;let visibleNames=[];
 if(process.platform==='darwin'){
  assert(process.env.KINDRED_NATIVE_WINDOW_PROBE,'Set the native Mac window probe');
  const folder=path.join(root,'windows');exec(process.env.KINDRED_NATIVE_WINDOW_PROBE,[String(child.pid),folder]);
  visibleNames=JSON.parse(fs.readFileSync(path.join(folder,'windows.json'))).map(w=>w.title);
 }else{
  const pids=exec('pgrep',['-g',String(child.pid)],{encoding:'utf8'}).trim().split(/\s+/);
  for(const pid of pids){let ids;try{ids=exec('xdotool',['search','--onlyvisible','--pid',pid],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\s+/)}catch{continue}
   visibleNames.push(...ids.map(id=>exec('xdotool',['getwindowname',id],{encoding:'utf8'}).trim()));}
 }
 assert(visibleNames.includes('Kindred'),'Main window was hidden by frame navigation: '+visibleNames.join(', '));assert(!visibleNames.includes('Kindred · Accounts'),'Frame navigation opened account recovery');console.log(JSON.stringify({passed:true,nativePlatform:process.platform,mainWindowVisible:true,...report}));
 }finally{if(child&&child.exitCode===null&&!child.signalCode){if(process.platform==='win32')child.kill();else try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await new Promise(r=>child.once('exit',r));}server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
