const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/completed-task-order';fs.mkdirSync(out,{recursive:true});
 try{
 const page=await browser.newPage({viewport:{width:1100,height:850}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const now=Math.floor(Date.now()/1000),run={id:'human-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Check the synthetic page',output:'The check is complete.',created:now-20};
 const task={id:'human-step',run_id:run.id,bot_id:'piper',title:'Sign into the test service',instructions:'Synthetic sign-in fixture only',status:'resumed',outcome:'done',created:now-15};
 const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-20},
 {seq:2,sender:'piper',kind:'assistant',text:'Your help is needed.',run_id:run.id,source_event_seq:2,created:now-16},
 // Empty history records have no DOM node. They must not turn a completed receipt into the newest message.
 {seq:3,sender:'piper',kind:'assistant',text:'',run_id:run.id,source_event_seq:4,created:now-14},
 {seq:4,sender:'piper',kind:'result',text:run.output,run_id:run.id,source_event_seq:5,created:now-13}];
 const otherRun={...run,id:'other-run',chat_id:'general',status:'awaiting_user'};
 const otherTask={...task,id:'other-step',run_id:otherRun.id,status:'pending'};
 let reads=0,includeActionEvent=true;
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),n=u.pathname,send=json=>route.fulfill({json});
 if(n==='/api/chats')return send([{id:'dm-piper',name:'Piper',members:['piper']},{id:'general',name:'General',members:['piper']}]);
 if(n==='/api/runs')return send([run,otherRun]);
 if(n==='/api/runs/human-run')return send({run,events:includeActionEvent?[{seq:3,kind:'user_action',body:task,created:task.created}]:[],approvals:[]});
 if(n==='/api/user-tasks'){reads++;return send([task,otherTask]);}
 if(n==='/api/activity')return send({});
 if(n==='/api/chats/dm-piper'){
 const after=Number(u.searchParams.get('after')||-1),before=Number(u.searchParams.get('before')||Infinity);
 return send({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:messages.filter(m=>(m.seq>after||(u.searchParams.get('inclusive')==='true'&&m.seq===after))&&m.seq<before),page:{has_before:false,has_after:false}});
 }
 return route.continue();});
 if(process.env.KINDRED_BASELINE_APP)await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_BASELINE_APP,'utf8')}));
 const snapshots=[];
 if(!process.env.KINDRED_GROUP_ANCHOR_ONLY){
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.locator('#content [data-message="4"]').waitFor();
 async function check(label){
 const ids=await page.locator('#content > [data-message]').evaluateAll(nodes=>nodes.map(n=>n.dataset.message));snapshots.push({label,ids});
 assert.equal(ids.filter(id=>id==='human-task-human-step').length,1,'One completed receipt');
 assert(ids.indexOf('2')<ids.indexOf('human-task-human-step'),'Receipt remains after the request context');
 assert(ids.indexOf('human-task-human-step')<ids.indexOf('4'),'Receipt remains before the original final answer');
 for(const m of messages.filter(m=>m.seq>4))assert(ids.indexOf('human-task-human-step')<ids.indexOf(String(m.seq)),'Receipt precedes later messages');
 }
 await check('loaded');
 for(let i=0;i<3;i++){
 const seq=5+i;messages.push({seq,sender:i%2?'piper':'user',kind:'message',text:'Later synthetic turn '+seq,created:now+i});
 await page.locator('#content [data-message="'+seq+'"]').waitFor();await check('arrival-'+seq);
 const prior=reads;await page.waitForFunction(()=>true);for(let j=0;reads<prior+2&&j<100;j++)await page.waitForTimeout(100);assert(reads>=prior+2);await check('poll-'+seq);
 }
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content [data-message="7"]').waitFor();await check('reload');
 await page.screenshot({path:path.join(out,engine+'-completed-order.png')});
 assert.equal(await page.locator('#content [data-message="human-task-other-step"]').count(),0,'Another chat’s full request stays out of this conversation history');
 messages[2].text='<finish_quietly/>';await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content [data-message="7"]').waitFor();await check('hidden-quiet-history');
 // Status changes keep the same chronological anchor, including active requests.
 run.status='awaiting_user';task.status='pending';
 await page.locator('#content [data-user-task="human-step"]').getByRole('button',{name:'Take over',exact:true}).waitFor();await check('pending');
 task.status='resumed';run.status='completed';
 await page.locator('#content [data-message="human-task-human-step"] .decision-receipt-summary').waitFor();await check('completed-again');
 }
 // A summary can contain later history while its actual DOM starts before the request.
 // Such members must never move the handoff ahead of its request context.
 for(const placement of ['spanning','after-request'])for(const hidden of ['empty','quiet']){
  run.created=now-600;run.progress_started=now-600;run.status='completed';task.created=now-500;task.status='resumed';
  const progress=(seq,created,source_event_seq)=>({seq,sender:'piper',kind:'assistant',text:'Progress update '+seq+'. '+'Checked another synthetic inbox batch and recorded the findings. '.repeat(12),run_id:run.id,created,source_event_seq,progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'group-'+placement}});
  const earlier=[progress(2,now-590,1),progress(3,now-560,2)];
  if(placement==='after-request')for(const m of earlier)delete m.progress;
  messages.splice(0,messages.length,{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-600},...earlier,
   {seq:4,sender:'piper',kind:'assistant',text:'Please sign into the synthetic test service before I continue.',run_id:run.id,source_event_seq:2,created:now-510},
   progress(5,now-450,4),progress(6,now-400,5),progress(7,now-350,6),
   {seq:8,sender:'piper',kind:'assistant',text:hidden==='quiet'?'<finish_quietly/>':'',run_id:run.id,source_event_seq:7,created:now-320},
   {seq:9,sender:'piper',kind:'result',text:run.output,run_id:run.id,source_event_seq:8,created:now-300});
  const markerSeq=placement==='spanning'?1.5:4.5;messages.push({...progress(markerSeq,placement==='spanning'?now-590:now-451,placement==='spanning'?1:4),kind:'task_progress',text:'',progress:{...progress(markerSeq,now-590,1).progress,work_qualified:true,presentation:{mode:'staged',promoted:true,stages:['Inspect accounts','Verify records'],current_stage:1}}});messages.sort((a,b)=>a.seq-b.seq);
  const label=placement+'-'+hidden;
  await page.setViewportSize({width:hidden==='quiet'?390:1100,height:850});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  await page.locator('#content > [data-message="9"]').waitFor();await page.locator('.summary-progress').waitFor();
  async function groupedCheck(stage){
   const ids=await page.locator('#content > [data-message]').evaluateAll(ns=>ns.map(n=>n.dataset.message));snapshots.push({label:label+'-'+stage,ids});
   const receipt=ids.indexOf('human-task-human-step');assert.equal(ids.filter(x=>x==='human-task-human-step').length,1);
   assert(ids.indexOf('4')<receipt,'Grouped handoff receipt must follow its sign-in request');assert(receipt<ids.indexOf('9'),'Grouped handoff receipt must precede the final answer');
   const group=String(markerSeq);assert(ids.indexOf(group)<ids.indexOf('9'));if(placement==='after-request')assert(receipt<ids.indexOf(group),'Entire later summary follows the receipt');else assert(ids.indexOf(group)<ids.indexOf('4'),'Earlier summary keeps its original position');
   assert(!ids.includes('8'),'Hidden history has no invented visible anchor');
   for(const m of messages.filter(m=>m.seq>9))assert(receipt<ids.indexOf(String(m.seq)),'Later arrivals follow original handoff');
  }
  await groupedCheck('loaded');
  const handoff=page.locator('#content > [data-message="human-task-human-step"]');
  assert.equal(await handoff.isVisible(),placement!=='spanning','Only handoffs from this task follow its collapsed disclosure');
  const progressCount=await page.locator('.progress-update-time-toggle').count();assert.equal(progressCount,placement==='spanning'?5:3,'Inline elapsed controls preserved outside tracker');
  await page.screenshot({path:path.join(out,engine+'-'+label+'-loaded.png')});
  assert.equal(await page.locator('.summary-progress .progress-commentary').count(),0,'Tracker never swallows commentary');await page.locator('.summary-progress-heading').click();await page.waitForTimeout(450);assert(await handoff.isVisible(),'Expanding the task keeps its handoff readable');
  const contentBox=await page.locator('#content').boundingBox();
  await page.mouse.move(contentBox.x+contentBox.width/2,contentBox.y+contentBox.height/2);await page.mouse.wheel(0,-300);
  await page.waitForTimeout(150);await page.locator('#content').evaluate(n=>n.scrollTop=40);await page.waitForTimeout(100);
  const reading=await page.locator('#content').evaluate(n=>({top:n.scrollTop,gap:n.scrollHeight-n.scrollTop-n.clientHeight}));assert(reading.top>0&&reading.gap>80,'Reading fixture must have scrollable history away from bottom '+JSON.stringify(reading));
  const beforeState=await page.evaluate(()=>({top:document.querySelector('#content').scrollTop,rows:[...document.querySelector('#content').children].map(n=>({id:n.dataset.message,y:n.getBoundingClientRect().y,h:n.getBoundingClientRect().height}))}));
  const anchor=page.locator('#content > [data-message="'+(placement==='spanning'?'2':'3')+'"]'),before=await anchor.boundingBox();assert(before.height>0);
  messages.push({seq:10,sender:'user',kind:'message',text:'Later synthetic user reply.',created:now-200},{seq:11,sender:'piper',kind:'message',text:'Later synthetic bot reply.',created:now-190});
  await page.locator('#content > [data-message="11"]').waitFor();await groupedCheck('arrivals');
  const afterState=await page.evaluate(()=>({top:document.querySelector('#content').scrollTop,rows:[...document.querySelector('#content').children].map(n=>({id:n.dataset.message,y:n.getBoundingClientRect().y,h:n.getBoundingClientRect().height}))}));fs.writeFileSync(path.join(out,engine+'-'+label+'-reading.json'),JSON.stringify({beforeState,afterState},null,2));
  const after=await anchor.boundingBox();assert(Math.abs(after.y-before.y)<1,'Grouped reader anchor retained through later arrivals '+JSON.stringify({label,before,after}));
  const prior=reads;for(let j=0;reads<prior+2&&j<100;j++)await page.waitForTimeout(100);assert(reads>=prior+2);await groupedCheck('poll');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content > [data-message="11"]').waitFor();await groupedCheck('reload');
  run.status='awaiting_user';task.status='pending';if(placement==='spanning'){await page.locator('.summary-progress-heading').click();}await page.locator('#content [data-user-task="human-step"]').getByRole('button',{name:'Take over',exact:true}).waitFor();await groupedCheck('pending');
  task.status='resumed';run.status='completed';await page.locator('#content [data-message="human-task-human-step"] .decision-receipt-summary').waitFor();await groupedCheck('completed');
  assert.equal(await page.locator('#content [data-message="human-task-other-step"]').count(),0,'Cross-chat request stays out');
 }

 // Second-resolution timestamps cannot establish which event came first.
 // Without action event details, a marker from the same second is not an owner.
 includeActionEvent=false;task.created=now;task.status='resumed';run.status='completed';
 messages.splice(0,messages.length,{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-2},
  {seq:2,sender:'piper',kind:'task_progress',run_id:run.id,created:now,text:'',progress:{mode:'summaries',phase:'commentary',work_qualified:true,run_id:run.id,group_id:'ambiguous-second'}},
  {seq:3,sender:'piper',kind:'result',run_id:run.id,created:now+1,text:run.output});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-progress-group="ambiguous-second"]').waitFor();
 const ambiguous=page.locator('[data-message="human-task-human-step"]');await ambiguous.waitFor();
 assert.equal(await ambiguous.getAttribute('data-task-commentary'),null,'Ambiguous same-second handoff stays outside the later group');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify({engine,snapshots,errors},null,2));console.log(JSON.stringify({engine,passed:true,snapshots:snapshots.length}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
