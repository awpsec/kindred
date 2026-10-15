const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage(),errors=[],claims=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000);let busy=false;
  const message={seq:1,sender:'user',text:'Original queued text',kind:'message',created:now,delivery:[{bot_id:'piper',run_id:'queued-test',status:'queued'}]};
  // Keep stale withdrawal records in fixture responses, as older servers and pre-update caches can have them.
  const old=[{seq:2,sender:'user',text:'Removed old text',kind:'withdrawn',created:now-2}, {seq:3,sender:'user',text:'Legacy withdrawn delivery',kind:'message',created:now-1,delivery:[{bot_id:'piper',run_id:'withdrawn-run',status:'withdrawn'}]}, {seq:4,sender:'user',text:'Already seen by another bot',kind:'message',created:now-1,delivery:[{bot_id:'piper',run_id:'seen-run',status:'completed'},{bot_id:'izabella',run_id:'withdrawn-part',status:'withdrawn'}]}];
  const run={id:'previous-turn',bot_id:'piper',chat_id:'dm-piper',status:'running',created:now,prompt:'Previous task',output:'',error:'',depth:0};
  await p.route(origin+'/api/runs/previous-turn',r=>r.fulfill({json:{run,events:[],attachments:[],approvals:[]}}));
  await p.route(origin+'/api/runs',r=>r.fulfill({json:busy?[run]:[]}));
  await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[...old,message]}}));
  await p.route(origin+'/api/chats/dm-piper/messages/1',r=>{const value=r.request().postDataJSON();claims.push(value);assert.equal(value.restore_to_composer,true);message.kind='withdrawn';message.delivery[0].status='withdrawn';return r.fulfill({json:{text:message.text,files:[],mentions:[],reply_to:null,chat_id:'dm-piper',message_seq:1}});});
  await p.goto(origin);await p.getByText('Original queued text',{exact:true}).waitFor();await p.getByRole('button',{name:'Edit queued message',exact:true}).waitFor();
  await p.getByText('Already seen by another bot',{exact:true}).waitFor();
  for(const text of ['Removed old text','Legacy withdrawn delivery','Removed from the queue'])assert.equal(await p.getByText(text,{exact:true}).count(),0,'Old withdrawal records must not render');
  busy=true;await p.reload();const edit=p.getByRole('button',{name:'Edit queued message',exact:true});await edit.waitFor();assert.equal(await edit.textContent(),'');assert.equal(await edit.locator('svg').count(),1);await p.mouse.move(0,0);await p.waitForTimeout(150);assert.equal(await edit.locator('..').evaluate(e=>getComputedStyle(e).opacity),'0');await p.getByText('Original queued text',{exact:true}).hover();await p.waitForTimeout(150);assert.equal(await edit.locator('..').evaluate(e=>getComputedStyle(e).opacity),'1');
  message.delivery[0].status='running';await p.reload();await p.getByText('Original queued text',{exact:true}).waitFor();assert.equal(await edit.count(),0,'A consumed message cannot be edited as queued');
  message.delivery[0].status='queued';await p.reload();await edit.waitFor();await edit.click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='Original queued text');assert.equal(claims.length,1);assert.equal(await p.locator('#queued-edit-prompt').count(),0);assert.equal(await p.getByRole('dialog',{name:'Edit queued message'}).count(),0);assert.equal(await p.locator('#content [data-message="1"]').count(),0);assert.deepEqual(errors,[]);
  console.log('Queued edit affordance: queued/running availability, hover icon, direct claim, hidden historical withdrawal records PASS');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
