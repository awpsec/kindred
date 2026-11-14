const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch(),checks=[];
 try {for(const width of [390,951,320]){
  const p=await browser.newPage({viewport:{width,height:850}}),errors=[],cancelled=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  const dir=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
  await p.addInitScript(({token,files,width})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_NATIVE_GLASS:true});
   window.nativeMessages=[];
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:m=>{nativeMessages.push(m);if(m.action==='glass-controls')queueMicrotask(()=>__kindredGlassControls.setActive(m.document,m.controls.map(c=>c.id),m.sequence));}},kindredSession:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:width>700?84:0,railSide:'right',isDuo:width>700,isDuoInner:width>700,usesNativeRail:width>700,isPortrait:width<700,viewportHeight:850};
   window.__KINDRED_NATIVE_GEOMETRY={width,height:850,windowWidth:width,windowHeight:850,reservedRegions:[]};
   (0,eval)(files['NativeCollaboration.js']);
   addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=files['MobileLayout.css'];document.head.append(s);(0,eval)(files['NativeComposer.js']);(0,eval)(files['MobileLayout.js']);},{once:true});
  },{token,width,files:Object.fromEntries(['NativeCollaboration.js','MobileLayout.css','NativeComposer.js','MobileLayout.js'].map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]))});
  let phase='incoming';const now=Date.now()/1000,chats=['piper','requester'].map(id=>({id:'dm-'+id,name:id==='piper'?'Piper':'Requester',members:[id]}));
  const run=()=>({id:'help',bot_id:'piper',chat_id:'dm-piper',status:phase==='queued'?'queued':phase==='completed'?'completed':'running',created:now-30,prompt:'Check the notes',output:'',error:'',delegation:{requester_bot_id:'requester',source_chat_id:'dm-requester'}});
  await p.route('**/api/**',async route=>{
   const n=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});
   if(n==='/api/bots'){const response=await route.fetch(),bots=await response.json();return send([{...bots[0],id:'piper',name:'Piper'},{...bots[0],id:'requester',name:'Requester'}]);}
   if(n==='/api/chats')return send(chats);
   const chat=chats.find(c=>n==='/api/chats/'+c.id);
   if(chat)return send({chat,messages:[],pending_waits:phase==='completed'?[]:[{bot_id:'piper',requester_bot_id:'requester',parent_run_id:'parent'}],page:{has_before:false,has_after:false}});
   if(n==='/api/runs')return send(phase==='incoming'?[]:[run()]);
   if(n==='/api/runs/help')return send({run:run(),events:[],approvals:[]});
   if(n==='/api/activity')return send({});
   if(n.endsWith('/cancel')){cancelled.push(n);phase='completed';return send({});}
   return route.continue();
  });
  await p.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
  const status=async label=>{
   await p.waitForFunction(label=>__kindredCollaboration.read()?.label===label,label);
   await p.waitForFunction(label=>nativeMessages.filter(m=>m.action==='glass-controls').at(-1)?.controls.find(c=>c.id==='identity')?.collaboration?.label===label,label);
   assert.equal(await p.locator('.nametag-shell').count(),0,'Desktop layout stays gated');
   assert(await p.locator('#bot-details').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'Native identity fits');
  };
  await status('Requester is waiting on you');const old=await p.evaluate(()=>__kindredCollaboration.read().key);
  // Use the retained page handler so this also covers a collapsed mobile list.
  await p.evaluate(()=>document.querySelector('.bot-link[data-sidebar-id="requester"]').click());
  await status('Waiting on Piper');assert.equal(await p.evaluate(key=>__kindredCollaboration.interrupt(key),old),false);
  await p.evaluate(()=>document.querySelector('.bot-link[data-sidebar-id="piper"]').click());await status('Requester is waiting on you');
  assert(await p.evaluate(()=>__kindredCollaboration.interrupt(__kindredCollaboration.read().key)));
  await p.waitForFunction(()=>__kindredCollaboration.read()===null);assert.deepEqual(cancelled,['/api/runs/parent/cancel']);
  phase='working';await p.evaluate(()=>dispatchEvent(new Event('online')));await status('Working for Requester');
  const work=await p.evaluate(()=>__kindredCollaboration.read().key);
  phase='queued';await p.evaluate(()=>dispatchEvent(new Event('online')));await status('Queued for Requester');
  assert.equal(await p.evaluate(key=>__kindredCollaboration.interrupt(key),work),false);
  await p.emulateMedia({reducedMotion:'reduce'});
  assert(await p.evaluate(()=>__kindredCollaboration.interrupt(__kindredCollaboration.read().key)));
  await p.waitForFunction(()=>__kindredCollaboration.read()===null&&!document.querySelector('.ios-collaboration-caption'));
  assert.equal(cancelled.at(-1),'/api/runs/help/cancel');assert.deepEqual(errors,[]);
  checks.push({width,incoming:true,requester:true,ownDmHelper:true,queued:true,parentAndHelperTargets:true,staleRejected:true,terminalCleared:true,reducedMotion:true});await p.close();
 }console.log(JSON.stringify({engine:'webkit',passed:checks.length,checks}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
