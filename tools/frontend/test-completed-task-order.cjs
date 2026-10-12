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
 let reads=0;
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),n=u.pathname,send=json=>route.fulfill({json});
 if(n==='/api/chats')return send([{id:'dm-piper',name:'Piper',members:['piper']},{id:'general',name:'General',members:['piper']}]);
 if(n==='/api/runs')return send([run,otherRun]);
 if(n==='/api/runs/human-run')return send({run,events:[{seq:3,kind:'user_action',body:task,created:task.created}],approvals:[]});
 if(n==='/api/user-tasks'){reads++;return send([task,otherTask]);}
 if(n==='/api/activity')return send({});
 if(n==='/api/chats/dm-piper'){
 const after=Number(u.searchParams.get('after')||-1),before=Number(u.searchParams.get('before')||Infinity);
 return send({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:messages.filter(m=>m.seq>after&&m.seq<before),page:{has_before:false,has_after:false}});
 }
 return route.continue();});
 if(process.env.KINDRED_BASELINE_APP)await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_BASELINE_APP,'utf8')}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('#content [data-message="4"]').waitFor();
 const snapshots=[];
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
 await page.reload();await page.locator('#content [data-message="7"]').waitFor();await check('reload');
 await page.screenshot({path:path.join(out,engine+'-completed-order.png')});
 assert.equal(await page.locator('#content [data-message="human-task-other-step"]').count(),0,'Another chat’s full request stays out of this conversation history');
 messages[2].text='<finish_quietly/>';await page.reload();await page.locator('#content [data-message="7"]').waitFor();await check('hidden-quiet-history');
 // Status changes keep the same chronological anchor, including active requests.
 run.status='awaiting_user';task.status='pending';
 await page.locator('#content [data-user-task="human-step"]').getByRole('button',{name:'Take over',exact:true}).waitFor();await check('pending');
 task.status='resumed';run.status='completed';
 await page.locator('#content [data-message="human-task-human-step"] .decision-receipt-summary').waitFor();await check('completed-again');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify({engine,snapshots,errors},null,2));console.log(JSON.stringify({engine,passed:true,snapshots:snapshots.length}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
