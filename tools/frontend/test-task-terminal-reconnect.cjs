const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch(),origin='http://127.0.0.1:'+server.address().port;
 const out=process.env.KINDRED_TEST_ARTIFACTS;if(out)fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],observations=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.fixtureTaskSnapshot=({messages,runs})=>{conversationHistory("dm-piper").messages=messages;state.allRuns=runs;state.details.clear();state.chatKey="";return renderChat(true,"cached");};'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};let messages=[],runs=[];
  await page.route(origin+'/api/**',route=>{const n=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});if(n==='/api/runs')return send(runs);if(n.startsWith('/api/runs/')){const run=runs.find(r=>r.id===n.split('/').at(-1));return run?send({run,events:[],attachments:[],approvals:[]}):route.fulfill({status:404,json:{error:'Not found'}});}if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/questions')return send([]);if(n==='/api/activity')return send({});return route.continue();});
  const root={id:'parent-task',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-100,progress_started:now-100,task_title:'Verify source report',output:'',error:''};
  const progress=(id,group=root.id)=>({mode:'summaries',phase:'commentary',run_id:id,group_id:group,work_qualified:true,task_title:root.task_title,activity:{actions:2,completed:1,failed:1,seconds:90,recent:[],phase:'thinking'},presentation:{mode:'staged',promoted:true,stages:['Inspect sources','Verify report','Publish findings'],current_stage:1}});
  const marker=(seq,id,group=root.id)=>({seq,sender:'piper',kind:'task_progress',text:'',created:now-10+seq,run_id:id,progress:progress(id,group)});
  const child={...root,id:'resumed-child',status:'failed',error:'Synthetic verification failed',created:now-5};
  messages=[{seq:1,sender:'user',kind:'message',text:'Verify the source report.',created:root.created},marker(2,root.id),{...marker(3,root.id),kind:'assistant',text:'Keep this update in its original slot.'},{seq:4,sender:'user',kind:'message',text:'Keep this owner choice visible.',created:now-8},{seq:5,sender:'piper',kind:'connector_artifact',run_id:root.id,created:now-7,text:'Read source',connector_artifact:{id:'failed-source-call',run_id:root.id,bot_id:'piper',chat_id:chat.id,progress_message_seq:2,connection:'Google Drive',connector:'googledrive',source:'Kindred',tool:'read_record',kind:'task',title:'Read source',status:'failed',revision:1,records:[]}},{...marker(6,root.id),kind:'assistant',text:'Parent phase finished.',progress:{...progress(root.id),phase:'final_answer'}},marker(7,child.id)];runs=[root,child];
  const group=key=>page.locator('[data-progress-group="'+key+'"]');
  const observe=async(label,key=root.id)=>{const n=group(key),v={label,finished:await n.getAttribute('data-progress-finished'),status:await n.locator('.summary-progress-count').innerText(),timers:await n.locator('[data-group-started]').count(),working:await n.locator('.summary-progress-name.is-working').count()};observations.push(v);return v;};
  const replay=async(nextMessages,nextRuns)=>{messages=nextMessages;runs=nextRuns;await page.evaluate(snapshot=>window.fixtureTaskSnapshot(snapshot),{messages,runs});};
  const assertFailed=async label=>{const v=await observe(label);assert.equal(v.finished,'true');assert.equal(v.status,'Failed');assert.equal(v.timers,0);assert.equal(v.working,0);};
  await page.goto(origin);await group(root.id).waitFor();await assertFailed('known failed child');
  assert(await page.getByText('Keep this owner choice visible.',{exact:true}).isVisible());assert(await page.locator('.connector-call').isVisible());assert.equal(await group(root.id).locator('.connector-call,.message-bubble').count(),0);
  const all=messages.slice(),parentOnly=all.filter(m=>m.run_id!==child.id);
  await replay(parentOnly,[root]);assert.equal((await observe('older parent snapshot')).status,'Finished');
  await replay(all,[root,{...child,status:'running',error:''}]);await assertFailed('stale active child after parent');
  await replay(all,[root]);await assertFailed('known child survives absent run metadata');
  // A new explicit continuation is a new identity, not the failed child revived.
  const next={...root,id:'new-continuation',status:'running',created:now+1};const nextMessages=[...all,marker(8,next.id)];
  await replay(nextMessages,[root,child]);let v=await observe('new continuation before metadata');assert.equal(v.finished,'false');assert.equal(v.status,'Recorded activity');assert.equal(v.timers,0);
  await replay(nextMessages,[root,child,next]);v=await observe('new continuation active');assert.equal(v.finished,'false');assert.equal(v.timers,1);assert.equal(v.working,1);
  const details=group(root.id).locator(':scope>details');if(!(await details.evaluate(n=>n.open)))await group(root.id).locator('.summary-progress-heading').click();
  next.status='completed';const completed=[...nextMessages,{...marker(9,next.id),kind:'assistant',text:'Continuation verified.',progress:{...progress(next.id),phase:'final_answer'}}];await replay(completed,[root,child,next]);await page.waitForFunction(()=>!document.querySelector('[data-progress-group="parent-task"]>details').open);v=await observe('new continuation completion');assert.equal(v.status,'Finished');assert.equal(v.finished,'true');assert.equal(v.timers,0);
  await group(root.id).locator('.summary-progress-heading').click();await page.waitForTimeout(300);assert(await details.evaluate(n=>n.open));
  await replay(completed,[root,child,next]);assert(await details.evaluate(n=>n.open),'Finished reading choice survives same-run refresh');
  await replay(parentOnly,[root]);await replay(nextMessages,[root,child,{...next,status:'running'}]);v=await observe('completed new child after parent switch');assert.equal(v.status,'Finished');assert.equal(v.finished,'true');assert.equal(v.timers,0);assert(await details.evaluate(n=>n.open),'Known terminal snapshots must not erase later reading choices');
  // The same run can start another phase after a final answer: phase scope matters.
  const multi={...root,id:'multi-phase',status:'running'};const phaseA='phase-A',phaseB='phase-B';const first=[marker(20,multi.id,phaseA),{...marker(21,multi.id,phaseA),kind:'assistant',text:'First phase result.',progress:{...progress(multi.id,phaseA),phase:'final_answer'}}];
  await replay(first,[multi]);assert.equal((await observe('same-run first phase ended',phaseA)).finished,'true');
  await replay([...first,marker(22,multi.id,phaseB)],[multi]);v=await observe('same-run new phase active',phaseB);assert.equal(v.finished,'false');assert.equal(v.timers,1);assert.equal(v.working,1);
  assert.deepEqual(errors,[]);if(out){fs.writeFileSync(path.join(out,'terminal-reconnect.json'),JSON.stringify({engine,observations,errors},null,2));await page.screenshot({path:path.join(out,'phase-scope.png')});}
  console.log(JSON.stringify({engine,passed:true,failedChildSticky:true,newContinuationActive:true,phaseScoped:true,readingChoicesPreserved:true,errors}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1;});
