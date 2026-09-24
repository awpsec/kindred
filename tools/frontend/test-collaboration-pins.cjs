const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:860}}),p=await context.newPage();p.setDefaultTimeout(12000);
  const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000);
  const bots=[{id:'iz',name:'Izabella',provider:'codex',model:'test',memory:'Prefers concise replies.',profile:{shape:'capsule',color:'#ff9638',label:'Inbox',pinned:false}},{id:'piper',name:'Piper',provider:'codex',model:'test',memory:'Izabella handles inbox work.',profile:{shape:'round',color:'#ffffff',label:'Assistant',pinned:false}}];
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false,pinned:false,last_message:null})),messages=new Map(chats.map(c=>[c.id,[]]));let runs=[];
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(req.method()!=='GET')writes.push({name,method:req.method(),body:req.postDataJSON()});
   if(name==='/bots')return send(bots);
   if(name==='/chats'){assert.equal(req.method(),'GET','A DM must not create a chat on send');return send(chats);}
   if(name==='/runs')return send(runs);
   if(name.startsWith('/runs/'))return send({run:runs.find(r=>r.id===name.slice(6)),events:[],approvals:[],attachments:[]});
   if(name==='/activity')return send(Object.fromEntries(bots.map(b=>[b.id,{status:'completed',shape:'idle',last_active_at:now}])));
   let match=name.match(/^\/(bots|chats)\/([^/]+)\/pin$/);
   if(match){const item=(match[1]==='bots'?bots:chats).find(x=>x.id===match[2]);const body=req.postDataJSON();assert.deepEqual(Object.keys(body),['pinned']);(match[1]==='bots'?item.profile:item).pinned=body.pinned;return send(item);}
   match=name.match(/^\/chats\/([^/]+)\/messages$/);
   if(match){assert.equal(match[1],'dm-iz');const body=req.postDataJSON();assert.deepEqual(body.mentions,[]);messages.get('dm-iz').push({seq:1,sender:'user',text:body.prompt,created:now,kind:'message'});runs=[{id:'ask',bot_id:'iz',chat_id:'dm-iz',prompt:body.prompt,output:'',error:'',status:'queued',created:now}];return send({runs:['ask']});}
   if(name.startsWith('/chats/')){const id=name.slice(7);return send({chat:chats.find(c=>c.id===id),messages:messages.get(id)});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();
  await p.locator('#prompt').fill('Can you ask @Piper for your role?');await p.locator('#send').click();
  await p.waitForFunction(()=>document.querySelector('#content').textContent.includes('Can you ask'));
  assert.equal(await p.locator('#heading').textContent(),'Izabella');assert.equal(chats.length,2);assert.equal(runs[0].bot_id,'iz');
  // Only a real backend handoff response introduces the group and its link.
  const group={id:'team-fixture',name:'Izabella, Piper',members:['iz','piper'],pinned:false,archived:false};chats.push(group);
  runs[0].status='completed';runs[0].output="I'll ask Piper.";
  messages.get('dm-iz').push({seq:2,sender:'iz',text:runs[0].output,kind:'result',run_id:'ask',created:now},{seq:3,sender:'iz',text:'Izabella started a chat with Piper.',kind:'collaboration',linked_chat_id:group.id,created:now});
  chats[0].last_message={sender:'iz',text:runs[0].output,created:now};
  messages.set(group.id,[{seq:4,sender:'iz',text:'@Piper What role did the user assign to me, Izabella?',kind:'handoff',created:now},{seq:5,sender:'piper',text:'Izabella will primarily handle inbox work.',kind:'result',created:now},{seq:6,sender:'iz',text:'Understood. I saved my inbox responsibilities to memory.',kind:'result',created:now}]);
  group.last_message=messages.get(group.id).at(-1);
  await p.locator('.collaboration-link').waitFor();assert.equal(await p.locator('#heading').textContent(),'Izabella');
  await p.locator('.collaboration-link').click();assert.equal(await p.locator('#heading').textContent(),'#izabella-piper');
  await p.locator('#content .message-author strong').first().waitFor();
  assert.equal(await p.locator('#content .message-author strong').allTextContents().then(a=>a.join(',')),'Izabella,Piper,Izabella');
  assert.equal(await p.locator('#content .message-row.user').count(),0);
  const logo=p.locator('#composer-hint .openai-logo:visible');assert.equal(await logo.count(),1);assert.equal(await logo.evaluate(n=>n.getBoundingClientRect().width),27);
  assert.equal(await p.locator('#composer-hint .mention-hint').count(),0);
  for(const name of ['Izabella',group.name]){const display=name===group.name?'#izabella-piper':name;const row=p.locator('#bots').getByRole('button',{name:display,exact:true});await row.hover();await row.locator('..').getByRole('button',{name:'Pin '+name,exact:true}).click();await p.locator('#pinned-bots').getByRole('button',{name:display,exact:true}).waitFor();}
  assert.equal(await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).count(),0);
  const tile=p.locator('#pinned-bots').getByRole('button',{name:'#izabella-piper',exact:true});await tile.hover();
  await p.getByRole('tooltip').waitFor();assert((await p.getByRole('tooltip').textContent()).includes('Izabella: Understood. I saved'));
  await p.screenshot({path:path.join(artifacts,`${engine}-pinned-conversation.png`)});
  // Preview comes from chat messages, including later teammate replies, not a different DM.
  group.last_message={sender:'piper',text:'Latest shared follow-up.',created:now+1};await p.waitForTimeout(1800);await tile.hover();
  await p.waitForFunction(()=>document.querySelector('[role=tooltip]')?.textContent.includes('Piper: Latest shared follow-up.'));
  await p.locator('#heading').hover();await tile.focus();await p.getByRole('tooltip').waitFor();await p.keyboard.press('Escape');assert.equal(await p.getByRole('tooltip').count(),0);
  await p.reload();await tile.waitFor();assert(bots[0].profile.pinned&&group.pinned);assert.equal(bots[0].memory,'Prefers concise replies.');
  const other=await context.newPage();await other.goto(origin);await other.locator('#pinned-bots').getByRole('button',{name:'#izabella-piper',exact:true}).waitFor();await other.close();
  await p.setViewportSize({width:390,height:844});await p.locator('#mobile-menu').click();await tile.focus();await p.getByRole('tooltip').waitFor();
  assert(await p.getByRole('tooltip').evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}));
  await p.screenshot({path:path.join(artifacts,`${engine}-pinned-mobile.png`)});
  await p.keyboard.press('Escape');await p.setViewportSize({width:1320,height:860});await tile.hover();await tile.locator('..').getByRole('button',{name:'Unpin '+group.name,exact:true}).click();
  await p.locator('#bots').getByRole('button',{name:'#izabella-piper',exact:true}).waitFor();assert(!group.pinned);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,dmRecipientPreserved:true,groupOnlyAfterHandoff:true,realConversationAuthors:true,providerIcon27px:true,pinsPersistAcrossClients:true,latestMessagePreview:true,keyboardAndMobile:true,errors}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
