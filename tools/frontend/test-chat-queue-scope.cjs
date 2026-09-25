const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{if(location.protocol!=='about:')sessionStorage.setItem('kindred-token',t);},token);
  const chats=[{id:'dm-piper',name:'Piper',members:['piper']},{id:'team-test',name:'Project room',members:['piper']},{id:'bot-handoff',name:'Bot handoff',members:['piper'],bot_only:true}];
  let runs=[];
  await p.route(origin+'/api/chats',r=>r.fulfill({json:chats}));
  for(const chat of chats)await p.route(origin+'/api/chats/'+chat.id+'*',r=>r.fulfill({json:{chat,messages:[]}}));
  await p.route(origin+'/api/runs',r=>r.fulfill({json:runs}));
  await p.route(origin+'/api/runs/*',r=>r.fulfill({json:{run:runs.find(x=>r.request().url().endsWith('/'+x.id)),events:[],attachments:[],approvals:[]}}));
  const run=(id,chat_id,status,created)=>({id,chat_id,status,created,bot_id:'piper',prompt:'Task',output:'',error:'',depth:0});
  async function reload(){await p.goto('about:blank');await p.goto(origin);await p.locator('#composer').waitFor();}
  runs=[run('active','dm-piper','running',1),run('waiting','team-test','queued',2)];
  await reload();assert.equal(await p.locator('#queue-status').isVisible(),false,'Other chats must not add a DM queue count');
  await p.getByText('#project-room',{exact:true}).first().click();await p.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('1 message queued'));assert.equal(await p.locator('#queue-status').isVisible(),true,'Originating group shows its waiting request');
  runs=[run('active','team-test','running',1),run('waiting','dm-piper','queued',2)];
  await p.evaluate(()=>localStorage.clear());await reload();await p.getByRole('button',{name:'Piper',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('1 message queued'));assert.equal(await p.locator('#queue-status').isVisible(),true,'DM request waits even when the bot is busy elsewhere');
  runs=[run('starting','dm-piper','queued',1)];await reload();assert.equal(await p.locator('#queue-status').isVisible(),false,'Initial dispatch is not waiting behind another task');
  runs=[run('active','dm-piper','running',1),run('handoff','bot-handoff','queued',2)];await reload();assert.equal(await p.locator('#queue-status').isVisible(),false);
  await p.getByText('Bot conversations',{exact:true}).click();await p.getByRole('button',{name:'#bot-handoff',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('1 message queued'));assert.equal(await p.locator('#queue-status').isVisible(),true,'Bot-to-bot queue belongs in the bot conversation');
  assert.deepEqual(errors,[]);console.log('Chat queue scope passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
