const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/quiet-task-header');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch(),results=[];
 try{for(const width of [1100,390]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<600}),page=await context.newPage(),errors=[],writes=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({token,mobile})=>{sessionStorage.setItem('kindred-token',token);if(mobile){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';document.addEventListener('DOMContentLoaded',()=>document.documentElement.dataset.mobile='ios',{once:true});}},{token,mobile:width<600});
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  let run={id:'quiet-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-2160,progress_started:now-2160,task_title:'Review monthly reports',prompt:'Review the reports and prepare a tracker.',output:'',error:''};
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'quiet-task',work_qualified:true,task_title:run.task_title,presentation:{mode:'staged',stages:['Find reports','Verify monthly totals'],current_stage:1,promoted:true},activity:{actions:28,completed:28,failed:0,seconds:2160,recent:[],phase:'thinking'}};
  const prompt={seq:1,sender:'user',kind:'message',created:now-2161,text:run.prompt};
  const marker={seq:2,sender:'piper',kind:'task_progress',text:'',run_id:run.id,created:now-2159,progress:{...progress}};
  let messages=[prompt,marker],events=[],gate=null;
  await page.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(req.method()!=='GET')writes.push(name);
   if(gate&&name==='/runs')await gate;
   if(name==='/settings')return send({name:'You',theme:'dark',progress_updates:'summaries'});
   if(name==='/chats')return send([chat]);
   if(name==='/runs')return send([run]);
   if(name==='/runs/'+run.id)return send({run,events,attachments:[],approvals:[]});
   if(name==='/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
   if(name==='/questions')return send(messages.filter(m=>m.question?.status==='pending'&&(m.question.delivery_chat_id||m.question.chat_id)===chat.id).map(m=>m.question));
   if(name==='/activity')return send({});
   return route.continue();
  });
  const group=page.locator('[data-progress-group="quiet-task"]'),details=group.locator(':scope>details');
  const tap=locator=>width<600?locator.tap():locator.click();
  await page.goto(origin);await group.waitFor();
  assert.equal(await page.locator('.summary-progress').count(),1);
  assert.equal(await group.locator('.summary-progress-name').innerText(),run.task_title);
  assert.equal(await group.getAttribute('data-message'),'2');
  assert.equal(await group.locator('.summary-progress-update').count(),0,'No invented narration or marker update');
  assert.equal(await group.locator('.summary-progress-count').innerText(),'Verify monthly totals');
  assert.equal(await page.locator('#content [data-message="2"]').count(),1,'Marker is the header, not an empty bubble');
  assert(await details.evaluate(n=>n.open));
  // Hold server polling while observing two local timer ticks; progress must not
  // depend on a new server response or new model narration.
  let release;gate=new Promise(r=>release=r);
  const ticks=await page.evaluate(async()=>{const values=[],start=performance.now();while(performance.now()-start<2600){const value=document.querySelector('.summary-progress-time').textContent;if(values.at(-1)?.value!==value)values.push({value,at:performance.now()-start});await new Promise(r=>setTimeout(r,100));}return values;});
  release();gate=null;
  assert(ticks.length>=3,'Timer ticks at least twice while server responses are held');
  fs.writeFileSync(path.join(out,`${engine}-${width}-timer.json`),JSON.stringify(ticks,null,2));
  await page.screenshot({path:path.join(out,`${engine}-${width}-quiet.png`)});
  await tap(group.locator('.summary-progress-heading'));await page.waitForFunction(()=>!document.querySelector('[data-progress-group="quiet-task"]>details').open);
  messages.push({seq:3,sender:'piper',kind:'assistant',run_id:run.id,created:now,text:'I found the monthly reports and am checking their dates.',progress:{...progress}});
  await page.waitForFunction(()=>document.querySelector('.progress-commentary')?.textContent.includes('I found the monthly reports'));
  assert.equal(await group.getAttribute('data-message'),'2','First commentary keeps the persisted task anchor');
  assert.equal(await page.locator('.summary-progress').count(),1);
  assert.equal(await group.locator('.summary-progress-update').count(),0);assert.equal(await page.locator('.progress-commentary').count(),1,'Narration stays inline');
  assert.equal(await details.evaluate(n=>n.open),false,'Incoming narration preserves a user collapse');
  await tap(group.locator('.summary-progress-heading'));await page.waitForFunction(()=>document.querySelector('[data-progress-group="quiet-task"]>details').open);
  const final={seq:4,sender:'piper',kind:'result',run_id:run.id,created:now+3,text:'The tracker is ready.',progress:{...progress,phase:'final_answer'}};
  run.status='completed';messages.push(final);
  await page.getByText(final.text,{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-progress-group="quiet-task"]>details').open);
  assert.equal(await group.getByText(final.text,{exact:true}).count(),0,'Final response remains outside the task');
  assert.equal(await group.locator('.summary-progress-count').innerText(),'Finished');
  // A task that never narrated still has a retained, collapsed history header.
  messages=[prompt,marker,final];await page.reload();await group.waitFor();
  assert.equal(await details.evaluate(n=>n.open),false);
  assert.equal(await group.locator('.summary-progress-update').count(),0);
  assert.equal(await group.locator('.summary-progress-count').innerText(),'Finished');
  assert.equal(await group.locator('.summary-progress-time').innerText(),'36m03s');
  await page.waitForTimeout(1200);assert.equal(await group.locator('.summary-progress-time').innerText(),'36m03s','Completed timer remains frozen');
  // Silent completion can have no final message or result row. Use the actual
  // run_finished receipt rather than freezing at the marker near task start.
  messages=[prompt,marker];events=[{seq:1,kind:'run_finished',created:now+3,body:{}}];
  await page.reload();await group.waitFor();
  assert.equal(await details.evaluate(n=>n.open),false);
  assert.equal(await group.locator('.summary-progress-update').count(),0);
  assert.equal(await group.locator('.summary-progress-count').innerText(),'Finished');
  assert.equal(await group.locator('.summary-progress-time').innerText(),'36m03s','Silent completion uses its actual completion receipt');
  await page.waitForTimeout(1200);
  assert.equal(await group.locator('.summary-progress-time').innerText(),'36m03s','Silent completed timer remains frozen');
  events=[];
  // A model thinking for a long time, or a marker in another presentation mode,
  // cannot independently manufacture a long-job header.
  run.status='running';messages=[prompt];await page.reload();await page.getByText(prompt.text,{exact:true}).waitFor();
  assert.equal(await page.locator('.summary-progress').count(),0,'Ordinary thinking alone stays ordinary');
  messages=[prompt,{...marker,progress:{...progress,mode:'balanced'}}];await page.reload();await page.getByText(prompt.text,{exact:true}).waitFor();
  assert.equal(await page.locator('.summary-progress').count(),0,'A non-summary marker stays invisible');
  assert.equal(await page.locator('#content [data-message="2"]').count(),0);
  // Questions and calls can anchor to the marker before there is written prose.
  const question={id:'quiet-choice',run_id:run.id,bot_id:'piper',chat_id:chat.id,delivery_chat_id:chat.id,task_group_id:'quiet-task',created:now,question:'Where should I put the tracker?',context:'The reports are checked. Choose a destination.',options:['Project folder','Shared folder'],status:'pending',answer:''};
  const connector={id:'quiet-drive',run_id:run.id,bot_id:'piper',chat_id:chat.id,progress_message_seq:2,connection:'Google Drive',connector:'google-drive',source:'Kindred',tool:'search_files',kind:'task',title:'Find reports',status:'completed',revision:1,records:[]};
  messages=[prompt,marker,{seq:5,sender:'piper',kind:'question',text:question.question,run_id:run.id,created:now,question},{seq:6,sender:'piper',kind:'connector_artifact',text:'Find reports',run_id:run.id,created:now,connector_artifact:connector}];
  await page.reload();await group.waitFor();
  await page.locator('[data-task-question="quiet-choice"]').waitFor();assert.equal(await group.locator('[data-task-question]').count(),0,'Question receipt stays at its own message');
  assert(await page.locator('#request-tray').isVisible(),'Pending question remains above the composer');
  assert.equal(await page.locator('#content .question-card').count(),0,'Question is not duplicated broadly in chat');
  assert.equal(await group.locator('.summary-progress-update').count(),0);
  assert.equal(await group.locator('.summary-progress-count').innerText(),'Waiting for your answer');
  assert.equal(await group.locator('.task-connector-toggle').count(),0,'Connector never becomes an orphan logo');
  assert.equal(await page.locator('#content .connector-call').count(),1,'Completed call stays inline once');
  await tap(page.locator('.connector-call>summary'));
  assert.equal(await page.locator('.connector-call').evaluate(n=>n.open),true);
  await page.screenshot({path:path.join(out,`${engine}-${width}-question-call.png`)});
  // A matching group id is not sufficient to steal another conversation's question.
  question.delivery_chat_id='foreign-chat';await page.reload();await group.waitFor();
  assert.equal(await group.locator('[data-task-question]').count(),0,'Foreign delivery question does not merge into the task');

  assert.deepEqual(errors,[]);
  assert.equal(writes.filter(n=>n.endsWith('/answer')||n.endsWith('/messages')||n==='/runs').length,0,'Inspection never answers a question or starts work');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Layout fits the viewport');
  results.push({width,ios:width<600,ticks,passed:true});await context.close();
  console.log(JSON.stringify({engine,width,passed:true}));
 }
 fs.writeFileSync(path.join(out,engine+'-quiet-task-results.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
