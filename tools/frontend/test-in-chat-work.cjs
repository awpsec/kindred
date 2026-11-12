const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-work-tests';fs.mkdirSync(out,{recursive:true});
 const browser=await({chromium,webkit}[engine]).launch();
 try{for(const width of [1100,390]){
  const context=await browser.newContext({viewport:{width,height:844},recordVideo:{dir:out,size:{width,height:844}}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  let run={id:'work',bot_id:'piper',chat_id:chat.id,status:'running',created:now-30,output:'',error:''};
  let activity={run_id:'work',status:'running',shape:'think',label:'Thinking it through',started_at:now,server_time:now},messages=[{seq:1,kind:'message',sender:'user',created:now-30,text:'Check the records.'}];
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.workRefresh=async()=>{while(state.refreshing)await new Promise(r=>setTimeout(r,10));await refresh(true);};export {state,updateReactions};'}));
  await p.route(origin+'/api/**',r=>{const name=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
   if(name==='/api/runs')return send([run]);if(name==='/api/runs/'+run.id)return send({run,events:[],approvals:[],attachments:[]});
   if(name.startsWith('/api/runs/'))return send({run:{...run,id:name.split('/').pop(),status:'completed',output:messages.find(m=>m.kind==='result'&&m.run_id===name.split('/').pop())?.text||''},events:[],approvals:[],attachments:[]});
   if(name==='/api/chats')return send([chat]);if(name==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
   if(name==='/api/activity')return send({piper:activity});if(['/api/questions','/api/approvals','/api/user-tasks'].includes(name))return send([]);return r.continue();});
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('.in-chat-work').waitFor();
  const refresh=()=>p.evaluate(()=>workRefresh()),phase=()=>p.locator('.in-chat-work').getAttribute('data-phase');
  assert.equal(await phase(),'dots');
  await p.evaluate(()=>{window.originalWork=document.querySelector('.in-chat-work');window.originalSlot=originalWork.querySelector('.work-visual');window.originalAvatar=originalSlot.querySelector('.character');window.originalLabel=originalWork.querySelector('.work-label');});
  await p.locator('#prompt').fill('Preserve this draft');await refresh();
  assert(await p.evaluate(()=>originalWork===document.querySelector('.in-chat-work')&&originalSlot===originalWork.querySelector('.work-visual')&&originalAvatar===originalSlot.querySelector('.character')&&originalLabel===originalWork.querySelector('.work-label')),'Poll retains row, slot, avatar and label');
  activity={...activity,shape:'read',label:'Checking the client records'};await refresh();await p.waitForTimeout(270);assert.equal(await phase(),'avatar');assert.match(await p.locator('.work-caption').innerText(),/Checking the client records/);
  // Transient speculative writing never flashes between tool steps.
  await p.evaluate(()=>{window.seenLabels=[];window.labelObserver=new MutationObserver(()=>seenLabels.push(document.querySelector('.work-caption')?.textContent));labelObserver.observe(document.querySelector('.work-label'),{childList:true,subtree:true,characterData:true});});
  activity={...activity,shape:'think',model_progress_state:'writing',label:'Typing…'};await refresh();activity={...activity,shape:'read',model_progress_state:null,label:'Checking the client records'};await refresh();await p.waitForTimeout(280);
  assert.equal(await p.locator('.work-caption').innerText(),'Checking the client records');assert(await p.evaluate(()=>{labelObserver.disconnect();return !seenLabels.some(t=>/Typing|Preparing a response/.test(t));}),'No transient label was painted');
  // A real attention state bypasses the filter; never hide an approval.
  run.status='awaiting_approval';activity={...activity,status:'awaiting_approval',label:'Waiting for your approval'};await refresh();assert.match(await p.locator('.work-caption').innerText(),/approval/i);assert.equal(await phase(),'avatar');
  run.status='running';activity={...activity,status:'running',shape:'think',label:'Thinking it through'};await refresh();await p.waitForTimeout(280);assert.equal(await phase(),'dots');
  await p.screenshot({path:path.join(out,engine+'-'+width+'-reasoning.png')});
  // Completed run arrives before its history page. There must be no empty frame.
  await p.evaluate(()=>{window.blankFrames=0;window.sampleWork=true;const sample=()=>{if(!sampleWork)return;if(!document.querySelector('.in-chat-work')&&!document.querySelector('[data-message="2"]'))blankFrames++;requestAnimationFrame(sample);};sample();});
  run.status='completed';run.output='The records are verified.';activity={...activity,status:'idle',shape:'idle',label:''};await refresh();assert.equal(await p.locator('.in-chat-work').count(),1);await p.waitForTimeout(300);
  messages.push({seq:2,kind:'result',run_id:run.id,sender:'piper',created:now+1,text:run.output});await refresh();await p.locator('[data-message="2"]').waitFor();assert.equal(await p.locator('.in-chat-work').count(),0);await p.waitForTimeout(400);
  assert.equal(await p.locator('.finishing-work').count(),0);assert.equal(await p.evaluate(()=>{sampleWork=false;return blankFrames;}),0);assert.equal(await p.locator('#prompt').innerText(),'Preserve this draft');
  await refresh();assert.equal(await p.locator('.in-chat-work,.finishing-work').count(),0,'No phantom worker on later poll');
  // Intentional silence and failures must not be held waiting for an answer.
  for(const status of ['completed','failed','cancelled']){
   run={...run,id:'case-'+status,status:'running',output:'',error:''};activity={...activity,run_id:run.id,status:'running',shape:'read',label:'Reading'};await refresh();assert.equal(await p.locator('.in-chat-work').count(),1);
   run.status=status;if(status==='failed')run.error='Fixture failure';await refresh();assert.equal(await p.locator('.in-chat-work').count(),0,status+' does not strand a worker');
  }
  // Gather promotion owns activity once, without a standalone duplicate.
  run={...run,id:'gather',status:'running',output:'',error:'',created:now-100,progress_started:now-100,task_title:'Review records'};activity={...activity,run_id:run.id,status:'running',shape:'read',label:'Reviewing records'};
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'review',work_qualified:true,task_title:'Review records',marker:{seq:10,created:now-100,sender:'piper',run_id:run.id,task_title:'Review records'},activity:{seconds:70,completed:2,last_at:now}};
  messages.push({...progress.marker,kind:'task_progress',text:'',progress});for(let i=0;i<3;i++)messages.push({seq:11+i,created:now-70+i*10,sender:'piper',run_id:run.id,kind:'assistant',text:'Verified record '+i,progress});
  await refresh();assert.equal(await p.locator('.in-chat-work').count(),1);assert.equal(await p.locator('.summary-progress').count(),0);
  messages.push({seq:14,created:now-20,sender:'piper',run_id:run.id,kind:'assistant',text:'Verified final record',progress});await refresh();await p.locator('.summary-progress').waitFor();assert.equal(await p.locator('.in-chat-work').count(),0);assert.equal(await p.locator('.summary-progress-live-status').count(),1);
  const steady=await p.locator('[data-task-status-run]').innerText();activity={...activity,shape:'think',model_progress_state:'writing',label:'Typing…'};await refresh();activity={...activity,shape:'read',model_progress_state:null,label:'Reviewing records'};await refresh();await p.waitForTimeout(280);assert.equal(await p.locator('[data-task-status-run]').innerText(),steady,'Gather filters the same transient phases');
  await p.locator('.summary-progress summary').first().click();await p.waitForTimeout(300);await refresh();assert.equal(await p.locator('.in-chat-work').count(),0);await p.screenshot({path:path.join(out,engine+'-'+width+'-gather.png')});
  activity={...activity,label:'Finishing the last check'};await refresh();
  run.status='completed';run.output='All four verified.';messages.push({seq:15,created:now+2,sender:'piper',run_id:run.id,kind:'result',text:run.output,progress:{...progress,phase:'final_answer'}});await refresh();await p.waitForTimeout(300);assert.equal(await p.locator('.in-chat-work,.finishing-work,[data-task-status-run]').count(),0);assert.match(await p.locator('.summary-progress-live-status').innerText(),/Finished/);
  // Reduced motion changes state without transition effects or pulse loops.
  for(const mode of ['system','app']){
   if(mode==='system')await p.emulateMedia({reducedMotion:'reduce'});else await p.evaluate(()=>document.documentElement.dataset.motion='off');
   run={...run,id:'reduced-'+mode,status:'running',output:''};activity={...activity,run_id:run.id,status:'running',shape:'think',label:'Thinking it through'};await refresh();
   assert.equal(await p.locator('.work-phase-dots i').first().evaluate(n=>getComputedStyle(n).animationName),'none');
   assert.equal(await p.locator('.work-phase-dots').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
   run.status='completed';run.output='';await refresh();assert.equal(await p.locator('.in-chat-work,.finishing-work').count(),0);await p.emulateMedia({reducedMotion:'no-preference'});
  }
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine,width,stableRow:true,coalescedLabels:true,attentionImmediate:true,noAnswerGap:true,gather:true,reducedMotion:true}));
 }
 }finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
