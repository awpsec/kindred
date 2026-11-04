// Native click payload -> server-resolved destination -> the right bot/chat.
const assert=require('node:assert/strict');
const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 let browser;
 try {
  for(const platform of ['linux','macos']){
   browser=await({chromium,webkit}[engine]).launch();
   const p=await browser.newPage(),errors=[],resolved=[];p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(({token,platform})=>{
    sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};
    window.nativeListeners={};window.__TAURI__={core:{invoke:async()=>null},event:{listen:async(name,callback)=>{window.nativeListeners[name]=callback;return ()=>{};}}};
   },{token,platform});
   const bots=['piper','orion'].map(id=>({id,name:id==='orion'?'Orion':'Piper',provider:'codex',model:'test',profile:{shape:'round',color:'#2475ff',notifications:true}}));
   const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
   await p.route(origin+'/api/**',r=>{
    const name=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
    if(name==='/api/bots')return send(bots);if(name==='/api/chats')return send(chats);
    if(name==='/api/runs')return send([]);if(name==='/api/activity')return send({});
    if(name.startsWith('/api/chats/dm-'))return send({chat:chats.find(c=>'/api/chats/'+c.id===name),messages:[{seq:1,sender:name.endsWith('orion')?'orion':'piper',kind:'result',text:name.endsWith('orion')?'Orion destination reached':'Piper conversation',created:1}]});
    if(name.startsWith('/api/notification-target/')){resolved.push(name);assert.equal(r.request().headers().authorization,'Bearer '+token);return send(name.endsWith('/42')?{chat_id:'dm-orion',bot_id:'orion'}:{unavailable:true});}
    return r.continue();
   });
   await p.goto(origin);await p.getByText('Piper conversation',{exact:true}).waitFor();
   await p.locator('#prompt').fill('Keep my unsent draft');
   await p.waitForFunction(()=>!!nativeListeners['kindred-notification-open']);
   // An event id, rather than a potentially stale chat hint, is authoritative.
   await p.evaluate(()=>nativeListeners['kindred-notification-open']({payload:{id:42,chat_id:'dm-piper',bot_id:'piper'}}));
   await p.getByText('Orion destination reached',{exact:true}).waitFor();
   await p.evaluate(()=>nativeListeners['kindred-notification-open']({payload:{id:43,chat_id:'dm-piper',bot_id:'piper'}}));
   await p.getByText('This notification is no longer available in this profile.',{exact:true}).waitFor();
   assert(await p.getByText('Orion destination reached',{exact:true}).isVisible());
   // Older native clients without an event id remain compatible.
   await p.evaluate(()=>nativeListeners['kindred-notification-open']({payload:{chat_id:'dm-piper',bot_id:'piper'}}));
   await p.getByText('Piper conversation',{exact:true}).waitFor();
   assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my unsent draft');
   assert.deepEqual(resolved,['/api/notification-target/42','/api/notification-target/43']);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({engine,platform,correctBot:true,serverResolvedTarget:true,staleDestinationSafe:true,draftPreserved:true}));await browser.close();browser=null;
  }
 }finally{await browser?.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
