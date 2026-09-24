const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const bots=[{id:'piper',name:'Piper',provider:'codex',profile:{shape:'cloud',color:'#2475ff'}},{id:'iz',name:'Izabella',provider:'codex',profile:{shape:'capsule',color:'#ff9638'}}];
  const chat={id:'team',name:'Team',members:['piper','iz'],archived:false},dm={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const now=Math.floor(Date.now()/1000),messages=[
   {seq:1,sender:'piper',created:now,text:'First message'},
   {seq:2,sender:'piper',created:now+1,text:'Second message in the same sequence'},
   {seq:3,sender:'user',created:now+2,text:'A user reply ends the sequence'},
   {seq:4,sender:'piper',created:now+3,text:'Reply after the user'},
   {seq:5,sender:'piper',created:now+2000,text:'Reply after a timestamp break'},
   {seq:6,sender:'iz',created:now+2001,text:'A different bot'},
   {seq:7,sender:'system',created:now+2002,text:'A system message'},
   {seq:8,sender:'iz',created:now+2003,text:'Before a handoff link'},
   {seq:9,sender:'iz',created:now+2004,text:'A separate handoff',kind:'collaboration',linked_chat_id:'team'},
   {seq:10,sender:'iz',created:now+2005,text:'After a handoff link'},
   {seq:11,sender:'piper',created:now+2006,text:'Start the final sequence'},
   {seq:12,sender:'piper',created:now+2007,text:'A longer final bubble with enough words to wrap across multiple lines on a narrow screen. '.repeat(3)},
  ].map(m=>({kind:'message',...m}));
  await context.route(origin+'/api/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send([dm,chat]);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/chats/team')return send({chat,messages});
   if(name==='/chats/dm-piper')return send({chat:dm,messages:messages.slice(0,2)});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#bots').getByRole('button',{name:'Team',exact:true}).click();await p.locator('[data-message="12"]').waitFor();
  const check=async(last=12)=>{
   const result=await p.locator('#content > [data-message]').evaluateAll(nodes=>nodes.map(n=>{const avatar=n.querySelector('.message-avatar'),bubble=n.querySelector('.message-bubble'),name=n.querySelector('.message-author'),a=avatar?.getBoundingClientRect(),b=bubble?.getBoundingClientRect(),h=name?.getBoundingClientRect();return {seq:Number(n.dataset.message),avatar:!!avatar,name:!!name,bottomAligned:!a||Math.abs(a.bottom-b.bottom)<1,left:!a||a.right<b.left,nameAbove:!h||h.bottom<=b.top+1};}));
   assert.deepEqual(result.filter(r=>r.avatar).map(r=>r.seq),[2,4,5,6,8,10,last]);
   assert.deepEqual(result.filter(r=>r.name).map(r=>r.seq),[1,4,5,6,7,8,10,11]);
   assert(result.every(r=>r.bottomAligned&&r.left&&r.nameAbove),JSON.stringify(result));
  };
  for(const width of [1320,390])for(const theme of ['light','dark']){await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(200);await check();}
  messages.push({seq:13,sender:'piper',created:now+2008,kind:'message',text:'A newly arriving reply moves the avatar here.'});await p.locator('[data-message="13"]').waitFor();await check(13);
  await p.setViewportSize({width:1320,height:900});await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Piper');assert.equal(await p.locator('#content .message-avatar').count(),0);assert.equal(await p.locator('#content .message-author').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,firstNameLastAvatar:true,senderUserTimeSystemAndHandoffBoundaries:true,newReplyMovesAvatar:true,desktopMobileBothThemes:true,directChatUnchanged:true,errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
