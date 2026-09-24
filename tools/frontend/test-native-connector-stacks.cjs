// Exercise the actual desktop webview against disposable connector receipts.
const {server}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
(async()=>{
 assert(process.env.KINDRED_NATIVE_EXE,'Set KINDRED_NATIVE_EXE');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-native-connectors-'));
 const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
 let count=2,report,child,stderr='';
 const messages=()=>[{seq:1,sender:'user',kind:'message',text:'Check connected sources.',created:now},...Array.from({length:count},(_,i)=>({seq:i+2,sender:'piper',kind:'connector_artifact',text:'Read connected source',created:now+i,connector_artifact:{id:'native-'+i,bot_id:'piper',source:'Kindred',connection:i%2?'Slack':'Gmail',kind:'task',tool:'search',status:'completed',revision:1,input:{},records:[]}}))];
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{for(let i=0;i<300;i++){if(fn())return;await sleep(100);}throw Error('Native connector test timed out');};
 const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const check=(value,label)=>{if(!value)throw Error(label);};
 try{
  await until(()=>document.querySelectorAll('.connector-message').length===2);
  const {refresh}=await import('/app.js');
  const update=async n=>{await fetch('/fixture/count/'+n,{method:'POST'});for(let i=0;i<20;i++){await refresh(true);if(document.querySelectorAll('.connector-message').length===n)return;await sleep(50);}throw Error('Receipt refresh failed');};
  await update(3);
  const group=document.querySelector('.connector-stack-group');check(group,'Third call was not grouped');
  for(let n=4;n<=24;n++){await update(n);check(document.querySelector('.connector-stack-group')===group,'Group remounted');check(group.querySelectorAll('.connector-collapse-ghosts').length<=1,'Animation layers accumulated');}
  await sleep(600);check(!document.querySelector('.connector-collapse-ghosts,.is-advancing,.is-forming'),'Animation did not clean up');
  check(group.querySelector('.connector-stack-current .connector-message').dataset.message==='25','Newest receipt not current');
  check(group.querySelector('.connector-stack-summary').textContent.includes('24 tool calls'),'Summary count incorrect');
  group.querySelector('.connector-stack-summary').click();await sleep(400);check(group.querySelector('.connector-stack').open,'Disclosure did not open');
  await update(25);check(group.querySelector('.connector-stack').open,'Incoming receipt closed disclosure');
  for(const theme of ['dark','light']){document.documentElement.dataset.theme=theme;check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow in '+theme);}
  check(!errors.length,errors.join('; '));await fetch('/fixture/report',{method:'POST',body:JSON.stringify({passed:true,calls:25,burst:true,stableGroup:true,disclosure:true,themes:true,errors})});
 }catch(e){await fetch('/fixture/report',{method:'POST',body:JSON.stringify({passed:false,error:String(e),errors})});}
 </script>`;
 const original=server.listeners('request')[0];server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(route==='/fixture/report'){let body='';for await(const b of req)body+=b;report=JSON.parse(body);res.end('ok');return;}
  if(route.startsWith('/fixture/count/')){count=Number(route.split('/').pop());res.end('ok');return;}
  if(route==='/api/chats/dm-piper'){json({chat,messages:messages(),page:{has_before:false,has_after:false}});return;}
  if(route==='/api/runs'){json([]);return;}
  if(route==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh};');return;}
  if(route==='/'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('</body>',probe+'</body>'));return;}
  if(route==='/identity/meta'||route==='/health'){json({});return;}original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  child=spawn(process.env.KINDRED_NATIVE_EXE,['http://127.0.0.1:'+server.address().port],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:'native-test-token-only',KINDRED_PROFILE_ID:'fixture',KINDRED_LEGACY_LOCAL_ACCESS:'0'},detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>stderr+=b);
  const deadline=Date.now()+100000;while(!report&&Date.now()<deadline&&child.exitCode===null&&child.signalCode===null)await new Promise(r=>setTimeout(r,100));
  assert(report?.passed,JSON.stringify(report)||stderr);console.log(JSON.stringify({...report,platform:process.platform}));
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){if(process.platform==='win32')child.kill();else try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await new Promise(r=>child.once('exit',r));}
  server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
