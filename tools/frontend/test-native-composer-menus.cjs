// Actual Linux AppImage WebKitGTK with source UI, isolated profiles and OS key events.
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.equal(process.platform,'linux');assert(process.env.KINDRED_NATIVE_EXE,'Set KINDRED_NATIVE_EXE');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-menu-test-')),source=path.resolve(__dirname,'../..');
 const original=server.listeners('request')[0];server.removeAllListeners('request');let result,child;const stderr=[];
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const post=(name,value)=>fetch('/fixture/'+name,{method:'POST',body:JSON.stringify(value)});
 async function wait(test,label){const end=Date.now()+15000;while(!test()){if(Date.now()>end)throw Error(label);await sleep(50);}}
 try{
  await wait(()=>document.querySelector('#bots .bot-link'),'Bot row');
  const row=document.querySelector('#bots .bot-link');row.focus();await post('key','shift+F10');
  await wait(()=>document.querySelector('[role=menu][aria-label="Bot actions"]'),'Native bot actions');
  check(document.querySelector('.chat-context-menu').textContent.includes('Archive bot'),'Archive missing');
  await post('key','Escape');await wait(()=>!document.querySelector('.chat-context-menu'),'Menu dismissal');
  check(document.activeElement===row,'Keyboard focus lost');
  const editor=document.querySelector('#prompt');editor.focus();await post('type','/');
  await wait(()=>document.querySelector('#command-options [role=option]'),'Slash suggestions');
  const option=document.querySelector('#command-options [role=option]'),bounds=option.getBoundingClientRect();
  check(bounds.height>0&&bounds.top>=0&&bounds.bottom<editor.getBoundingClientRect().top,'Suggestions not above composer');
  check(option.contains(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)),'Suggestions are covered');
  await post('key','Escape');await post('key','ctrl+a');await post('type','Please explain /rev');
  await wait(()=>editor.value==='Please explain /rev'&&!document.querySelector('#command-options').hidden&&document.querySelector('#command-options [role=option]')?.textContent.includes('/review'),'Inline suggestions: '+JSON.stringify(editor.value));
  await post('key','Tab');await wait(()=>editor.value==='Please explain /review ','Inline insertion lost text: '+JSON.stringify(editor.value));
  check(!editor.hasAttribute('data-command-params'),'Inline reference gained invocation hints');
  await post('key','ctrl+a');await post('key','BackSpace');
  await post('resize',null);KindredReadingSize.set(150);await sleep(100);
  const form=document.querySelector('#composer'),resets=[];
  const observer=new MutationObserver(records=>{for(const r of records)if(editor.scrollHeight>editor.clientHeight+1&&!r.oldValue.split(' ').includes('is-multiline'))resets.push(r.oldValue);});
  observer.observe(form,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
  const chunk='Ordinary typed words with narrow iii and wide WWW. ';for(let i=0;i<16;i++){await post('type-fast',chunk);await wait(()=>editor.value.length>=(i+1)*chunk.length,'Native typing chunk '+i+' did not drain');}await sleep(100);
  observer.disconnect();const css=getComputedStyle(editor);
  check(editor.scrollHeight>editor.clientHeight,'Typed draft did not reach overflow: '+JSON.stringify({length:editor.value.length,scroll:editor.scrollHeight,client:editor.clientHeight,width:editor.clientWidth,focus:document.activeElement?.id,text:editor.value.slice(-80)}));
  check(css.fontWeight==='400'&&parseFloat(css.lineHeight)>parseFloat(css.fontSize)*1.4,'Overflow changed typography');
  check(!editor.querySelector('b,strong')&&resets.length===0,'Overflow typing introduced bold or layout resets');
  const caret=getSelection().getRangeAt(0).getBoundingClientRect(),box=editor.getBoundingClientRect();check(caret.bottom<=box.bottom+2&&caret.top>=box.top-2,'Typed caret left scrolling composer');
  await post('result',{passed:true,typedOverflow:true,stableTypography:true,nativeLinux:true,keyboardBotActions:true,typedSlashVisible:true,inlineCommandReference:true,userAgent:navigator.userAgent});
 }catch(e){await post('result',{passed:false,error:e.message+'\\n'+e.stack});}
 </script>`;
 server.on('request',async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname,send=json=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(json));};
  if(route.startsWith('/fixture/')){
   let input='';for await(const chunk of req)input+=chunk;const value=JSON.parse(input||'null');
   try{
    if(route==='/fixture/result')result=value;
    else{const win=execFileSync('xdotool',['search','--onlyvisible','--name','^Kindred$'],{encoding:'utf8'}).trim().split('\n')[0];execFileSync('xdotool',['windowfocus','--sync',win]);execFileSync('xdotool',route==='/fixture/resize'?['windowsize',win,'720','600']:route.startsWith('/fixture/type')?['type','--clearmodifiers','--delay',route.endsWith('-fast')?'3':'35',value]:['key','--clearmodifiers',value]);}
    return send({ok:true});
   }catch(e){result={passed:false,error:String(e)};return send(result);}
  }
  if(route==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(source,'ui/index.html'),'utf8').replace('</body>',probe+'</body>'));}
  if(route==='/api/commands')return send([{name:'review',description:'Review a project',parameters:[{name:'project',required:true}],source:'skill',action:'run',usage:'/review <project>'}]);
  if(route==='/identity/meta')return send({profiles:false});if(route==='/health')return send({status:'ok'});
  return original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  child=spawn(process.env.KINDRED_NATIVE_EXE,[origin],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:crypto.createHash('sha256').update(origin+'\nfixture').digest('hex'),KINDRED_LEGACY_LOCAL_ACCESS:'0'},detached:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>stderr.push(String(b)));
  const end=Date.now()+120000;while(!result&&Date.now()<end){assert(child.exitCode===null,'App exited: '+stderr.join(''));await sleep(100);}
  assert(result?.passed,result?.error||'Native menus timed out: '+stderr.join(''));console.log(JSON.stringify(result));
 }finally{if(child&&child.exitCode===null){process.kill(-child.pid,'SIGTERM');await new Promise(r=>child.once('exit',r));}server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
