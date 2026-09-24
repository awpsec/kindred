// Exercise the actual Tauri command, ACL and UI click path on Linux. The OS
// opener is replaced only in this child process; no browser or account opens.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{server,token}=require('./fixtures/desktop.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 assert.equal(process.platform,'linux');const binary=process.env.KINDRED_NATIVE_EXE;assert(binary,'Set KINDRED_NATIVE_EXE');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-links-')),bin=path.join(root,'bin'),opened=path.join(root,'opened.jsonl');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'xdg-open'),'#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.KINDRED_TEST_OPENED_URLS,JSON.stringify(process.argv.slice(2))+"\\n");\n',{mode:0o700});
 const url='https://example.invalid/sign-in?state=fixture%2Bvalue&next=code';
 let result,child;const errors=[],original=server.listeners('request')[0];server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  if(req.url==='/fixture/link-result'){let body='';for await(const chunk of req)body+=chunk;result=JSON.parse(body);res.end('{}');return;}
  if(req.url==='/'){
   const probe=`<script type="module">
try {
 await import('/app.js');
 if(!window.__KINDRED_EXTERNAL_LINKS)throw Error('Native link capability missing');
 for(const url of ['file:///etc/passwd','javascript:alert(1)','https://user:password@example.invalid/']){
  let rejected=false;try{await window.__TAURI__.core.invoke('open_external_url',{url});}catch{rejected=true;}
  if(!rejected)throw Error('Non-web or credential URL accepted');
 }
 const link=document.createElement('a');link.href=${JSON.stringify(url)};link.target='_blank';link.textContent='Open sign-in';document.body.append(link);link.click();
 await fetch('/fixture/link-result',{method:'POST',body:JSON.stringify({passed:true,location:location.href})});
}catch(error){await fetch('/fixture/link-result',{method:'POST',body:JSON.stringify({passed:false,error:String(error)})});}
</script>`;
   res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('</body>',probe+'</body>'));return;
  }
  const extras={'/health':{ok:true},'/identity/meta':{profiles:false}};
  if(req.url in extras){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(extras[req.url]));return;}original(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  child=spawn(binary,[origin],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_TEST_OPENED_URLS:opened,KINDRED_ACCESS_TOKEN:token},detached:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',data=>errors.push(data.toString()));
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){assert(child.exitCode===null,'App exited: '+errors.join(''));if(result&&(!result.passed||fs.existsSync(opened)))break;await sleep(100);}
  assert(result?.passed,JSON.stringify({result,errors:errors.join('').slice(-3000)}));assert.equal(result.location,origin+'/');
  await sleep(200);assert.deepEqual(fs.readFileSync(opened,'utf8').trim().split('\n').map(line=>JSON.parse(line)),[[url]]);
  console.log(JSON.stringify({passed:true,realNativeIPC:true,normalClick:true,systemOpenerOnce:true,unsafeURLsRejected:true,appStayedConnected:true}));
 }finally{
  if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
