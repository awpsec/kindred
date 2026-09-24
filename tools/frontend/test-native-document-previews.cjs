process.env.KINDRED_TEST_SECURITY_HEADERS='1';
// Runs the real Linux desktop webview against local, synthetic documents.
const {server,securityHeaders}=require('./fixtures/desktop.cjs'),{createFiles}=require('./test-document-previews.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
(async()=>{
 assert(process.env.KINDRED_NATIVE_EXE,'Set KINDRED_NATIVE_EXE');const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-document-test-')),files=await createFiles();
 const original=server.listeners('request')[0];server.removeAllListeners('request');let report;
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{for(let i=0;i<300;i++){if(fn())return;await sleep(100);}throw Error('Native preview timed out');};
 const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 try{
 await until(()=>document.querySelector('.message-row.assistant'));
 const {fileCard}=await import('/artifacts.js');
 for(const name of ['review.docx','forecast.xlsx','review.pdf']){
  const card=fileCard({id:name,name,kind:'file'},{getBlob:async()=>await(await fetch('/fixture/file/'+name)).blob(),notice:m=>{throw Error(m);}});document.querySelector('#content').append(card);
  card.querySelector('.deliverable-more').click();await until(()=>card.querySelector('.deliverable-menu').matches(':popover-open'));
  [...card.querySelectorAll('button')].find(b=>b.textContent==='Preview').click();
  if(name.endsWith('docx'))await until(()=>card.querySelector('.document-word')?.shadowRoot?.textContent.includes('Quarterly review'));
  if(name.endsWith('xlsx'))await until(()=>card.querySelector('.document-grid')?.textContent.includes('48200'));
  if(name.endsWith('pdf'))await until(()=>card.querySelector('.document-pages')?.textContent.includes('Page 1 of 2'));
  const dialog=card.querySelector('dialog');if(!dialog.open)throw Error('Preview modal missing');dialog.close();await until(()=>!card.querySelector('dialog'));
 }
 if(errors.length)throw Error(errors.join('; '));await fetch('/fixture/report',{method:'POST',body:JSON.stringify({passed:true,nativeLinux:true,docx:true,xlsx:true,pdf:true,errors})});
 }catch(e){await fetch('/fixture/report',{method:'POST',body:JSON.stringify({passed:false,error:String(e),errors,text:document.querySelector('.document-body')?.innerText})});}
 </script>`;
 server.on('request',async(req,res)=>{securityHeaders(req,res);
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/fixture/probe.js'){res.setHeader('Content-Type','text/javascript');return res.end(probe.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));}
 if(route==='/fixture/report'){let body='';for await(const b of req)body+=b;report=JSON.parse(body);res.end('ok');return;}
 if(route.startsWith('/fixture/file/')){res.end(files[decodeURIComponent(route.split('/').pop())]);return;}
 if(route==='/'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('</body>','<script type="module" src="/fixture/probe.js"></script></body>'));return;}
 if(route==='/identity/meta'||route==='/health'){res.setHeader('Content-Type','application/json');res.end('{}');return;}original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let child;let stderr='';
 try{child=spawn(process.env.KINDRED_NATIVE_EXE,['http://127.0.0.1:'+server.address().port],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:'native-test-token-only',KINDRED_PROFILE_ID:'fixture',KINDRED_LEGACY_LOCAL_ACCESS:'0'},detached:process.platform!=='win32',stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>stderr+=b);
 const deadline=Date.now()+100000;while(!report&&Date.now()<deadline&&child.exitCode===null)await new Promise(r=>setTimeout(r,100));assert(report?.passed,JSON.stringify(report)||stderr);console.log(JSON.stringify(report));
 }finally{if(child&&child.exitCode===null){if(process.platform==='win32')child.kill();else try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await new Promise(r=>child.once('exit',r));}await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
