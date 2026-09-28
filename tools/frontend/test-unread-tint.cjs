const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const bots=[['piper','Piper','#ff9638'],['mira','Mira','#2475ff'],['atlas','Atlas','#ffffff'],['fern','Fern','#2ec767']].map(([id,name,color],i)=>({id,name,provider:'codex',profile:{color,shape:i===1?'triangle':'round',pinned:i===3}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id]}));chats.push({id:'team',name:'Team',members:bots.map(b=>b.id),pinned:true});
  const attention={bots:{},chats:Object.fromEntries(chats.map(c=>[c.id,{cursor:2,read_cursor:0,latest_message_seq:2,unread:true}]))};
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);document.hasFocus=()=>false;},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.__unreadQA={refresh:()=>refresh(true),theme:v=>{state.general.theme=v;applyGeneral();}};'}));
  await p.route(origin+'/api/**',r=>{
   const url=new URL(r.request().url()),name=url.pathname.slice(4),send=json=>r.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/attention')return send(attention);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name.startsWith('/chats/'))return send({chat:chats.find(c=>c.id===name.split('/')[2]),messages:[]});
   return r.continue();
  });
  await p.goto(origin);await p.locator('#bots [aria-label="Piper"].has-unread').waitFor();
  for(const b of bots){const row=p.locator('.sidebar button[aria-label="'+b.name+'"]');assert.equal(await row.evaluate(n=>n.style.getPropertyValue('--unread-color')),b.profile.color==='#ffffff'?'var(--fg)':b.profile.color);assert.equal(await row.locator('.unread-dot').count(),1);}
  for(const theme of ['dark','light']){
   await p.evaluate(v=>__unreadQA.theme(v),theme);await p.waitForTimeout(250);
   const white=p.locator('.sidebar button[aria-label="Atlas"]');assert.notEqual(await white.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
   await p.locator('.sidebar').screenshot({path:path.join(artifacts,engine+'-unread-'+theme+'.png')});
  }
  await p.evaluate(()=>{__unreadQA.theme('dark');const shell=document.querySelector('.shell');shell.classList.add('sidebar-rail');shell.style.setProperty('--sidebar-width','76px');});await p.waitForTimeout(250);
  assert.equal(await p.locator('.sidebar .has-unread').count(),5);await p.locator('.sidebar').screenshot({path:path.join(artifacts,engine+'-unread-rail.png')});
  attention.chats['dm-piper'].read_cursor=2;attention.chats['dm-piper'].unread=false;await p.evaluate(()=>__unreadQA.refresh());
  assert.equal(await p.locator('.sidebar [aria-label="Piper"].has-unread').count(),0);assert.equal(await p.locator('.sidebar [aria-label="Piper"] .unread-dot').count(),0);assert.equal(await p.locator('.sidebar [aria-label="Mira"].has-unread').count(),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,coloredRows:true,pinnedBot:true,pinnedGroup:true,adaptiveMonochrome:true,compactRail:true,readClearsTint:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
