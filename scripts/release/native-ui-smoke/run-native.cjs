// Release tool only. Never modifies the application checkout or uses owner state.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
function isolateWindows(binary,root){
 const folder=path.join(root,'app');fs.mkdirSync(folder);
 const files=[{source:binary,name:'kindred-desktop.exe'}];const dll=path.join(path.dirname(binary),'WebView2Loader.dll');
 if(fs.existsSync(dll))files.push({source:dll,name:'WebView2Loader.dll'});
 const entries=files.map(e=>{const st=fs.lstatSync(e.source);assert(st.isFile()&&!st.isSymbolicLink(),'Regular exact native input required');return {...e,size:st.size,sha256:sha(fs.readFileSync(e.source))};});
 const total=entries.reduce((n,e)=>n+e.size,0);assert(total>0&&total<=256*1024**2,'Isolated Windows binary copy cap');
 const v=fs.statfsSync(root),available=v.bavail*v.bsize;assert(available>=total+768*1024**2+1024**2,'Windows binary copy/cache/unknown capacity unavailable');
 for(const e of entries){fs.copyFileSync(e.source,path.join(folder,e.name),fs.constants.COPYFILE_EXCL);assert(sha(fs.readFileSync(path.join(folder,e.name)))===e.sha256&&sha(fs.readFileSync(e.source))===e.sha256,'Native copy/source SHA mismatch');}
 return {binary:path.join(folder,'kindred-desktop.exe'),root:folder,files:entries,bytes:total,availableBytes:available,additionalCacheBytes:512*1024**2,unknownBytes:256*1024**2};
}
const {attachComputerStream}=require('./computer-stream.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function args(argv){const a={};for(let i=0;i<argv.length;i+=2){assert(/^--[a-z-]+$/.test(argv[i])&&argv[i+1]);a[argv[i].slice(2)]=argv[i+1];}return a;}
const hook='\nglobalThis.__nativeReleaseReplay=async messages=>{const e=conversationHistory("dm-piper");e.messages=messages;state.chatKey="";await renderChat(true,"cached");};\n';
const names=['app.js','computer-popout.js','computer-popout.css','bot-center.css','progress.css','style.css','index.html','characters.js'];
function binding(source,commit){
 assert(/^[0-9a-f]{40}$/.test(commit));assert(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()===commit,'Source HEAD mismatch');
 const resources={};for(const n of names){const bytes=execFileSync('git',['-C',source,'show',commit+':ui/'+n],{maxBuffer:4*1024*1024});assert(fs.readFileSync(path.join(source,'ui',n)).equals(bytes),'Checkout resource differs from Git '+n);resources[n]={sha256:sha(bytes),bytes:bytes.length};}
 assert(resources['app.js'].sha256==='5d354f05e275d5dba54da4cca58af245cf3fd02bd74eaf114041b74cfdf96e1a','Unreviewed product app');
 assert(resources['computer-popout.js'].sha256==='6c6eb88795c7122216913c56eaf6bde7530aa4fa76b1b92c334fd70289376973','Unreviewed popout module');
 assert(resources['bot-center.css'].sha256==='00cb64fa7719a37b5d7f1fccaa363ccfb8971947e373c02d556916ed6a4c09b3','Unreviewed Library fix');return resources;
}
function withSharedArtifact(messages,artifact,run){
 assert(artifact.id&&artifact.chat_id===run.chat_id&&artifact.bot_id===run.bot_id,'Shared artifact ownership');
 return [...messages,{seq:Math.max(...messages.map(m=>m.seq))+1,sender:run.bot_id,kind:'artifact',text:'The workbook is ready.',workspace_artifact:artifact,run_id:run.id,created:artifact.created}];
}
async function run(a){
 assert(['win32','darwin'].includes(process.platform),'Requires actual native Windows/macOS');
 const source=path.resolve(a.source),binary=path.resolve(a.binary),out=path.resolve(a.output);assert(fs.statSync(binary).isFile());assert(a.version==='0.87.10');assert(!fs.existsSync(out),'Exclusive new output required');fs.mkdirSync(out,{recursive:true});
 const manifest={fixtureNonce:crypto.randomBytes(24).toString('hex'),sourceCommit:a['source-commit'],version:a.version,platform:process.platform==='win32'?'windows':'macos',resources:binding(source,a['source-commit']),rendererHookSha256:sha(Buffer.from(hook))};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-native-08710-')),binarySha=sha(fs.readFileSync(binary)),proof={schema:1,passed:false,sourceCommit:a['source-commit'],version:a.version,platform:manifest.platform,binarySha256:binarySha,manifest,fixtureTools:Object.fromEntries(['run-native.cjs','probe.js','computer-stream.cjs','loopback-ws.cjs','native-input.swift','native-input.ps1'].map(n=>[n,sha(fs.readFileSync(path.join(__dirname,n)))])),limits:['Synthetic loopback accounts, API data and RFB; no real owner VM/provider.','Actual embedded engine and OS pointer input; not physical human/device/GPU or general performance proof.','Served app has exact Git product prefix plus declared renderer-only test-hook suffix; not packaged embedded-resource launch proof.']};
 let child,report,stream,server,original,stderr='',timeout=false,launchBinary=binary;const inputs=[],sessions=[],helperLog=[];const started=Date.now();
 const nativeHelper=path.join(root,'native-input');
 try{
  if(process.platform==='win32'){proof.windowsIsolation=isolateWindows(binary,root);launchBinary=proof.windowsIsolation.binary;assert(sha(fs.readFileSync(launchBinary))===binarySha);}
  if(process.platform==='darwin')execFileSync('swiftc',[path.join(__dirname,'native-input.swift'),'-o',nativeHelper],{timeout:45000,stdio:'pipe'});
  process.env.KINDRED_TEST_SECURITY_HEADERS='1';const fixture=require(path.join(source,'tools/frontend/fixtures/desktop.cjs'));server=fixture.server;stream=attachComputerStream(server);original=server.listeners('request')[0];server.removeAllListeners('request');
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'native-review',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-600,progress_started:now-600,task_title:'Native release review',output:'Ready for review.',error:''};
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'native-project',work_qualified:true,presentation:{mode:'staged',promoted:true,stages:['Inspect','Verify'],current_stage:1},activity:{completed:24,recent:[{label:'Review files',created:now-10}]}};
  let messages=[{seq:1,sender:'user',kind:'message',created:now-605,text:'Review the project.'},{seq:2,sender:'piper',kind:'task_progress',created:now-600,run_id:run.id,text:'',progress},...Array.from({length:24},(_,i)=>({seq:i+3,sender:'piper',kind:'assistant',created:now-590+i*3,run_id:run.id,progress,text:`Update ${i+3}: Checking saved records.\n\nNext verify the source.`})),{seq:27,sender:'piper',kind:'result',run_id:run.id,created:now,text:run.output}];
  const bots=['piper','cersei'].map(id=>({id,name:id==='piper'?'Piper':'Cersei',provider:'codex',profile:{shape:'pebble',color:'#12b8c6'}}));
  const book=fs.readFileSync(path.join(source,'tools/frontend/fixtures/document-originals/styled-multi-sheet.xlsx'));proof.workbookSha256=sha(book);
  const artifact={id:'native-workbook',title:'Native workbook',kind:'sheet',language:'file',path:'/artifacts/native-workbook',chat_id:chat.id,created_by:'bot',bot_id:'piper',source:'',state:{},revision:1,created:now,updated:now,archived:false,file:{id:'native-book-file',name:'Findings.xlsx',extension:'xlsx',size:book.length,sha256:sha(book),run_id:run.id,bot_id:'piper'}};
  messages=withSharedArtifact(messages,artifact,run);const fixtureRequests=[];
  server.on('request',async(req,res)=>{const n=new URL(req.url,'http://127.0.0.1').pathname;fixture.securityHeaders(req,res);const send=(v,code=200)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
   try{
    if(['/fixture/report','/fixture/input'].includes(n)){
     assert(req.headers['x-kindred-fixture']===manifest.fixtureNonce,'Owned fixture nonce required');
     let body='';for await(const b of req){body+=b;if(body.length>128*1024)throw Error('Fixture body cap');}const value=JSON.parse(body);
     if(n==='/fixture/report'){assert(!report,'Duplicate terminal report');report=value;return send({ok:true});}
     assert(child&&child.exitCode===null&&!timeout,'Owned app not running');assert(inputs.length<8,'Native input request cap');
     assert(Object.keys(value).sort().join(',')==='kind,tx,ty,vh,vw,x,y');assert(['click','drag'].includes(value.kind));for(const k of ['x','y','tx','ty','vw','vh'])assert(Number.isFinite(value[k]));assert(value.vw>100&&value.vw<4000&&value.vh>100&&value.vh<3000);for(const [x,y]of [[value.x,value.y],[value.tx,value.ty]])assert(x>=0&&x<value.vw&&y>=0&&y<value.vh);
     const coords=[value.x,value.y,value.tx,value.ty,value.vw,value.vh].map(String);const command=process.platform==='darwin'?[nativeHelper,[String(child.pid),value.kind,...coords]]:['powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'native-input.ps1'),'-OwnedPid',String(child.pid),'-Kind',value.kind,'-X',coords[0],'-Y',coords[1],'-TX',coords[2],'-TY',coords[3],'-VW',coords[4],'-VH',coords[5]]];
     const observed=JSON.parse(execFileSync(command[0],command[1],{timeout:20000,encoding:'utf8'}).trim());assert(observed.passed&&observed.nativeInput);inputs.push(value);helperLog.push(observed);return send({ok:true});
    }
    if(n==='/fixture/manifest')return send(manifest);if(n==='/fixture/messages')return send(messages);
    if(n==='/fixture/probe.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(path.join(__dirname,'probe.js')));}
    if(n==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(source,'ui/index.html'),'utf8').replace('</body>','<script type="module" src="/fixture/probe.js"></script></body>'));}
    if(n==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(Buffer.concat([fs.readFileSync(path.join(source,'ui/app.js')),Buffer.from(hook)]));}
    if(n==='/identity/meta')return send({profiles:false});if(n==='/health')return send({status:'ok'});
    if(n==='/api/bots')return send(bots);if(n==='/api/chats')return send([chat,{id:'dm-cersei',name:'Cersei',members:['cersei']}]);
    if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});
    if(n==='/api/chats/dm-piper'){fixtureRequests.push('chat-history');return send({chat,messages,page:{has_before:false,has_after:false}});}
    if(n==='/api/chats/dm-cersei')return send({chat:{id:'dm-cersei',members:['cersei']},messages:[],page:{has_before:false,has_after:false}});
    if(n==='/api/activity')return send({});
    if(n==='/api/workspace-artifacts')return send([artifact]);
    if(n.startsWith('/api/workspace-artifacts/')){const parts=n.split('/').slice(3);assert(parts[0]===artifact.id,'Wrong artifact request');if(parts[1]==='file'){assert(parts.length===3&&parts[2]===String(artifact.revision),'Wrong workbook revision');fixtureRequests.push('workbook-file');res.writeHead(200,{'Content-Type':'application/octet-stream'});return res.end(book);}if(parts[1]==='preview')return send({error:'No page preview'},400);return send(artifact);}
    if(n==='/api/computer/screen-state')return send({state:'ready'});if(n==='/api/computer/resources')return send({uptime_seconds:60,cpu_percent:1,memory_total:100,memory_used:10});
    if(['/api/computer/session','/api/computer/observe-session'].includes(n)){
     let body='';for await(const b of req){body+=b;if(body.length>1024)throw Error('Session body cap');}const v=JSON.parse(body);assert(v.control===false&&bots.some(b=>b.id===v.bot_id));sessions.push({path:n,...v});return send({ticket:stream.ticket(v.bot_id)});
    }
    return original(req,res);
   }catch(e){if(!res.headersSent)send({error:String(e)},500);else res.destroy();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const data=path.join(root,'data'),config=path.join(root,'config');fs.mkdirSync(data);fs.mkdirSync(config);
  const env={...process.env,HOME:root,USERPROFILE:root,APPDATA:config,LOCALAPPDATA:data,XDG_DATA_HOME:data,XDG_CONFIG_HOME:config,KINDRED_CLIENT_ONLY:'1',KINDRED_ACCESS_TOKEN:fixture.token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:sha(Buffer.from(origin+'\nfixture')),KINDRED_LEGACY_LOCAL_ACCESS:'0',KINDRED_SERVER_URL:origin,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview2')};delete env.KINDRED_UPDATE_SESSION;
  child=spawn(launchBinary,[origin],{env,detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});child.on('error',e=>{report={passed:false,error:String(e)};});child.stderr.on('data',b=>{if(stderr.length<65536)stderr+=b.toString().slice(0,65536-stderr.length);});
  const deadline=Date.now()+180000;while(!report&&Date.now()<deadline&&child.exitCode===null&&!child.signalCode)await new Promise(r=>setTimeout(r,100));
  timeout=!report;assert(report,'No native engine terminal report');assert(report.passed,JSON.stringify(report));assert(report.platform===manifest.platform&&report.nativeVersion===a.version);assert(inputs.length===3&&report.popout.trustedPointerDowns>=3,'Missing native input sequence');assert(sessions.some(s=>s.path==='/api/computer/observe-session'));assert(sessions.every(s=>s.control===false));assert(stream.inputs.length===0,'Guest received native gestures');
  assert(fs.readFileSync(binary).length>0&&sha(fs.readFileSync(binary))===binarySha,'Executable changed');binding(source,a['source-commit']);assert(fixtureRequests.includes('chat-history')&&fixtureRequests.includes('workbook-file'),'Missing real Library history/file request');proof.fixtureRequests=fixtureRequests;proof.passed=true;proof.report=report;
 }catch(e){proof.error=String(e);throw e;}
 finally{
  proof.elapsedSeconds=(Date.now()-started)/1000;proof.sessions=sessions;proof.osInputs=inputs;proof.inputReceipts=helperLog;proof.guestInputs=stream?.inputs||[];
  if(child&&child.exitCode===null&&!child.signalCode){try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{timeout:10000,stdio:'pipe'});else process.kill(-child.pid,'SIGTERM');}catch(e){proof.cleanupError=String(e);proof.passed=false;}const end=Date.now()+4000;while(child.exitCode===null&&!child.signalCode&&Date.now()<end)await new Promise(r=>setTimeout(r,50));if(child.exitCode===null&&!child.signalCode){try{process.kill(-child.pid,'SIGKILL');}catch{}proof.passed=false;proof.cleanupError='Native process did not exit within bounded cleanup';}}
  stream?.close();server?.closeAllConnections();server?.close();
  if(!proof.passed)proof.disposableProfile=root;
  fs.writeFileSync(path.join(out,'native-stderr.log'),stderr);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(proof,null,2)+'\n');
  // Own disposable profile only, after owned app is terminal. Keep failures for inspection.
  if(proof.passed)fs.rmSync(root,{recursive:true,force:true});else proof.disposableProfile=root;
  if(!proof.passed)process.exitCode=1;
 }
}
if(require.main===module)run(args(process.argv.slice(2))).catch(e=>{console.error(String(e));process.exitCode=1;});
module.exports={args,binding,hook,isolateWindows,withSharedArtifact};
