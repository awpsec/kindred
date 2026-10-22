const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch(),checks=[];
 try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  await page.route(origin+'/app.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.completedIdentityRefresh=()=>refresh(true);'}));
  let run,messages;const now=1700000000,chat={id:'dm-piper',name:'Piper',members:['piper']};
  await page.route(origin+'/api/**',route=>{
   const name=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});
   if(name==='/api/runs')return send([run]);
   if(name==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});
   if(name==='/api/chats')return send([chat]);
   if(name==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
   if(name==='/api/activity')return send({});return route.continue();
  });
  const setup=({id='retained',status='completed',marker=true,staged=false,seconds=150,calls=3,qualified=true}={})=>{
   run={id,bot_id:'piper',chat_id:chat.id,status,created:now,progress_started:now,task_title:'Later mutable run title',output:'',error:''};
   const progress={mode:'summaries',phase:'commentary',run_id:id,group_id:id,work_qualified:qualified,task_title:'Update the marketing preview',activity:{actions:calls,completed:calls,failed:0,seconds,recent:[{label:'Read source file',created:now+7,count:1}]}};
   if(staged)progress.presentation={mode:'staged',promoted:true,stages:['Inspect sources','Verify changes'],current_stage:1};
   messages=[{seq:1,sender:'user',kind:'message',text:'Please update the preview.',created:now}];
   if(marker)messages.push({seq:2,sender:'piper',kind:'task_progress',text:'',run_id:id,created:now,progress});
   for(const [index,offset] of [7,49,138].entries())messages.push({seq:3+index,sender:'piper',kind:'assistant',text:'Recorded update '+index,run_id:id,created:now+Math.min(offset,seconds),progress});
   messages.push({seq:6,sender:'piper',kind:'assistant',text:'The preview is ready for your review.',run_id:id,created:now+seconds,progress:{...progress,phase:'final_answer'}});
  };
  const load=async()=>{await page.goto(origin);await page.getByText('The preview is ready for your review.',{exact:true}).waitFor();};
  setup();await load();
  const tracker=page.locator('.task-compact'),details=tracker.locator('details');
  assert.equal(await tracker.count(),1,'persisted compact task keeps a completion identity');
  assert.equal(await tracker.locator('.summary-progress-name').innerText(),'Update the marketing preview · Finished','phase title and factual outcome retained');
  assert.equal(await details.evaluate(node=>node.open),false,'completed compact receipt starts collapsed');
  assert.equal(await tracker.locator('.task-stages').count(),0,'no inferred staged plan');
  assert.equal(await tracker.getByText('The preview is ready for your review.',{exact:true}).count(),0,'final remains outside receipt');
  assert.equal(await page.locator('.progress-commentary').count(),3,'commentary remains inline');
  assert(await tracker.locator('summary').evaluate(node=>node.scrollWidth<=node.clientWidth),'compact title fits viewport');
  await tracker.locator('summary').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.task-compact details').open);
  assert(await tracker.getByText('Recorded activity · 3 completed calls',{exact:true}).isVisible(),'keyboard disclosure reveals actual activity');
  await page.reload();await page.locator('.task-compact').waitFor();
  assert.equal(await page.locator('.summary-progress-name').innerText(),'Update the marketing preview · Finished','identity restored from persisted marker after reopen');
  checks.push({width,case:'persisted legacy compact identity/disclosure/reopen'});
  setup({id:'live'});const finalMessage=messages.pop();run.status='running';await page.goto(origin);await page.locator('.task-compact').waitFor();
  await page.locator('.task-compact summary').click();await page.waitForFunction(()=>document.querySelector('.task-compact details').open);
  run.status='completed';messages.push(finalMessage);await page.evaluate(()=>window.completedIdentityRefresh());
  await page.waitForFunction(()=>document.querySelector('.task-compact')?.dataset.progressFinished==='true'&&!document.querySelector('.task-compact details').open);
  assert.equal(await page.locator('.summary-progress-name').innerText(),'Update the marketing preview · Finished','live completion retains phase identity');
  await page.locator('.task-compact summary').click();await page.waitForFunction(()=>document.querySelector('.task-compact details').open);
  await page.evaluate(()=>window.completedIdentityRefresh());assert(await page.locator('.task-compact details').evaluate(node=>node.open),'explicit reading choice survives terminal refresh');
  checks.push({width,case:'live completion collapse and manual reading survive refresh'});

  setup({id:'quick',seconds:2,calls:2});await load();
  assert.equal(await page.locator('.task-compact').count(),1);assert.equal(await page.locator('.task-staged,.task-stages').count(),0,'few calls stay compact');
  checks.push({width,case:'quick few-call marker remains small'});
  setup({id:'unmarked',marker:false,seconds:7200,calls:99});await load();
  assert.equal(await page.locator('.task-activity').count(),0,'time, narration and calls cannot invent a marker');
  assert.equal(await page.locator('.progress-commentary').count(),3);checks.push({width,case:'unmarked long narration unchanged'});
  setup({id:'unqualified',qualified:false});await load();assert.equal(await page.locator('.task-activity').count(),0,'unqualified marker cannot invent work');
  setup({id:'staged',staged:true});await load();assert.equal(await page.locator('.task-staged').count(),1);assert.equal(await page.locator('.task-stage').count(),2);assert.equal(await page.locator('.summary-progress-name').innerText(),'Update the marketing preview');assert.equal(await page.locator('.summary-progress-count').innerText(),'Finished');
  checks.push({width,case:'persisted staged plan unchanged'});
  setup({id:'failed',status:'failed'});messages.pop();await page.goto(origin);await page.locator('.task-compact').waitFor();assert.equal(await page.locator('.summary-progress-name').innerText(),'Update the marketing preview · Failed','failed is not success');
  assert.deepEqual(errors,[]);checks.push({width,case:'terminal failure truthful'});await page.close();
 }
 console.log(JSON.stringify({engine,checks}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
