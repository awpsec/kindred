// Native WebKitGTK consent, restart persistence and Settings responsiveness.
// Debug builds only: synthetic WebKit input on a loopback fixture, no hardware.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {server,token}=require('./fixtures/desktop.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const binary=process.env.KINDRED_NATIVE_EXE;assert(binary,'Set KINDRED_NATIVE_EXE to a debug Linux build');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-microphone-')),original=server.listeners('request')[0];let round=1,result,child;const errors=[];
 const probe=()=>`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),call=(cmd,args={})=>window.__TAURI__.core.invoke(cmd,args),check=(ok,message)=>{if(!ok)throw Error(message);};
 const bounded=p=>Promise.race([p,sleep(8000).then(()=>{throw Error('Native microphone operation timed out');})]);
 async function prompt(label){for(let n=0;n<100;n++){const d=document.querySelector('.microphone-permission');if(d){const button=[...d.querySelectorAll('button')].find(b=>b.textContent===label);check(button,'Missing '+label);button.click();return;}await sleep(50);}throw Error('Microphone consent did not appear: '+label);}
 async function input(){const stream=await bounded(navigator.mediaDevices.getUserMedia({audio:true,video:false}));check(/mock/i.test(stream.getAudioTracks()[0]?.label),'Refusing non-synthetic microphone');stream.getTracks().forEach(t=>t.stop());}
 try{
  while(!document.querySelector('.message-row.assistant'))await sleep(100);await sleep(2000);
  check(window.__KINDRED_MICROPHONE_PERMISSION,'Native permission capability missing');
  if(${round}===1){
   await fetch('/fixture/phase',{method:'POST',body:'session'});const first=input();await prompt('Allow this session');await first;
   let s=await call('microphone_permission');check(s.session&&!s.persistent,'Session grant was incorrectly persisted');
   await call('microphone_permission',{forget:true});await sleep(100);
   await fetch('/fixture/phase',{method:'POST',body:'always'});const next=input();await prompt('Always allow');await next;
   s=await call('microphone_permission');check(s.session&&s.persistent,'Always allow did not persist');
  }else{
   const s=await call('microphone_permission');check(s.persistent,'Remembered consent did not survive restart');
   await fetch('/fixture/phase',{method:'POST',body:'restart'});await input();check(!document.querySelector('.microphone-permission'),'Restart requested consent again');
   await call('microphone_permission',{forget:true});await sleep(100);
   const denied=input().then(()=>false,()=>true);await prompt('Not now');check(await denied,'Denied capture succeeded');
   const camera=navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return true;},()=>false);check(!await bounded(camera),'Microphone permission granted a camera');
  }
  document.querySelector('#settings-button').click();
  for(let n=0;n<100&&!document.querySelector('.microphone-setting');n++)await sleep(50);
  check(document.querySelector('.microphone-setting'),'General settings did not render');
  document.querySelector('#settings-dialog').animate=()=>({cancel(){}});
  document.querySelector('#settings-close').click();check(!document.querySelector('#settings-dialog').open,'Settings waits on animation to close');
  await fetch('/fixture/microphone-result',{method:'POST',body:JSON.stringify({passed:true,round:${round}})});
 }catch(e){await fetch('/fixture/microphone-result',{method:'POST',body:JSON.stringify({passed:false,round:${round},error:String(e)})});}
 </script>`;
 server.removeAllListeners('request');server.on('request',async(req,res)=>{
  if(req.url==='/fixture/phase'){let data='';for await(const c of req)data+=c;console.log(data);res.end('{}');return;}
  if(req.url==='/fixture/microphone-result'){let data='';for await(const c of req)data+=c;result=JSON.parse(data);res.end('{}');return;}
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('</body>',probe()+'</body>'));return;}
  const extras={'/health':{status:'ok'},'/identity/meta':{profiles:false}};
  if(req.url in extras){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(extras[req.url]));return;}original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,scope=crypto.createHash('sha256').update(origin+'\nfixture').digest('hex');
 const stop=async()=>{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);child=null;}};
 try{
  for(round=1;round<=2;round++){
   result=null;child=spawn(binary,[origin],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_TEST_MOCK_MICROPHONE:'1',KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:scope},detached:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>errors.push(b.toString()));
   const deadline=Date.now()+45000;while(!result&&Date.now()<deadline){assert(child.exitCode===null,'App exited: '+errors.join(''));await sleep(100);}
   assert(result?.passed,JSON.stringify({result,errors:errors.join('').slice(-5000)}));console.log(JSON.stringify(result));await stop();
  }
 }finally{await stop();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
