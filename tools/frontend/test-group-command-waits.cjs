const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),origin='http://127.0.0.1:'+server.address().port,errors=[],writes=[];
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  const bots=['Requester','Helper'].map((name,i)=>({id:'bot'+i,name,provider:'codex',profile:{shape:'round',color:'#2475ff'}}));
  const chat={id:'team',name:'Report team',members:bots.map(b=>b.id),archived:false},now=Math.floor(Date.now()/1000);
  let elapsed=3700,waitChat='team';
  const helperChat={...chat,id:'helper-room',name:'Helper conversation'};
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(path==='/bots')return send(bots);if(path==='/chats')return send([chat,helperChat]);
   if(path==='/chats/helper-room')return send({chat:helperChat,messages:[]});if(path==='/runs')return send([]);if(path==='/activity')return send({});
   if(path==='/chats/team')return send({chat,messages:[{seq:1,sender:'user',kind:'message',text:'Please check the report together',created:now}],commands:[{id:'cmd',bot_id:'bot1',run_id:'child',title:'Build the quarterly report with a deliberately long descriptive title',seen:Math.floor(Date.now()/1000),status:'running',progress:{elapsed_seconds:elapsed}}],pending_waits:[{parent_run_id:'parent',requester_bot_id:'bot0',bot_id:'bot1',run_id:'child',chat_id:waitChat,name:'Helper',status:'completed'}]});
   if(path==='/commands/cmd/stop'||path==='/runs/parent/cancel'){writes.push(path);return send({ok:true});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);
  await page.locator('#bots').getByRole('button',{name:'Report team',exact:true}).click();
  const progress=page.locator('.command-progress'),summary=progress.locator('summary'),wait=page.locator('.collaboration-wait');
  await summary.waitFor();assert.match(await summary.textContent(),/^Helper · Waiting for Build/);
  assert.match(await wait.textContent(),/Requester is waiting on Helper/);
  assert.equal(await wait.getByRole('button',{name:'Open chat'}).count(),0);
  for(const width of [2560,1100,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:850});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const composer=await page.locator('#composer').boundingBox();assert(composer.width<=960);
   assert.equal(await wait.locator('.character').count(),2);
   assert(await wait.locator('.collaboration-wait-label').evaluate(n=>n.getBoundingClientRect().height<30));
   await summary.click();await page.waitForTimeout(250);
   assert(await progress.evaluate(n=>n.open));
   assert(await summary.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   assert(await summary.locator('.character').evaluate(n=>n.getBoundingClientRect().width>=20),'Bot avatar must not shrink out of view');
   assert(await progress.locator('.command-wait-status').evaluate(n=>n.clientWidth>=n.scrollWidth),'Elapsed status must remain visible beside long titles');
   assert(await wait.locator('.collaboration-wait-label').evaluate(n=>n.getBoundingClientRect().width>100));
   if(process.env.KINDRED_TEST_ARTIFACTS){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.KINDRED_TEST_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,`group-wait-${width}-${theme}.png`)});}
   elapsed++;await page.waitForTimeout(1300);assert(await progress.evaluate(n=>n.open),'Polling must preserve the disclosure');
   await summary.click();await page.waitForTimeout(250);assert.equal(await progress.evaluate(n=>n.open),false);
  }
  await summary.click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/commands/cmd/stop')),progress.getByRole('button',{name:/Stop Build/}).click()]);assert.equal(writes[0],'/commands/cmd/stop');
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/runs/parent/cancel')),wait.getByRole('button',{name:'Stop task for Requester'}).click()]);assert(writes.includes('/runs/parent/cancel'));
  waitChat='helper-room';const open=wait.getByRole('button',{name:'Open chat with Helper'});await open.waitFor();
  assert.equal(await open.textContent(),'');assert.equal(await open.locator('svg').count(),1);
  if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:require('node:path').join(process.env.KINDRED_TEST_ARTIFACTS,'wait-with-chat-arrow.png')});
  await open.click();await page.waitForFunction(()=>document.querySelector('#heading').textContent==='Helper conversation');
  assert.deepEqual(errors,[]);console.log('PASS: group command ownership, requester wait, responsive layout, disclosure refresh and targeted stops');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
