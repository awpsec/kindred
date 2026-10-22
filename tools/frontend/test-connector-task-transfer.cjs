const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright'),{server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.fixtureRefresh=()=>refresh(true);'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'review',bot_id:'piper',chat_id:chat.id,status:'running',created:now-300,progress_started:now-300,task_title:'Review connected documents',error:'',output:''};
  const progress={mode:'summaries',phase:'commentary',work_qualified:true,group_id:'review-phase',run_id:run.id,task_title:run.task_title};
  const card={id:'drive-read',bot_id:'piper',chat_id:chat.id,run_id:run.id,progress_message_seq:2,connection:'Google Drive',connector:'googledrive',source:'Codex',kind:'task',tool:'google_drive.search',title:'Search Drive',status:'pending',approval_id:'approve-drive',revision:1,input:{query:'Project'},records:[],read_only:true};
  let messages=[{seq:1,sender:'user',kind:'message',text:'Review the connected documents.',created:now-300},{seq:2,sender:'piper',kind:'assistant',text:'Checking the project documents.',created:now-290,run_id:run.id,progress},{seq:3,sender:'piper',kind:'connector_artifact',text:'Search Drive',created:now,run_id:run.id,connector_artifact:card}];
  messages.splice(1,0,{seq:1.5,sender:'piper',kind:'task_progress',run_id:run.id,created:now-295,text:'',progress:{...progress,activity:{actions:1,completed:0,seconds:300,recent:[]},presentation:{mode:'compact'}}});
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(450);
  await p.getByRole('button',{name:'Allow',exact:true}).focus();card.status='executing';
  await p.evaluate(()=>window.fixtureRefresh());assert(await p.locator('.connector-transfer-ghost').count()>0,'Approval must animate into compact call');
  await p.waitForTimeout(500);assert.equal(await p.locator('.connector-transfer-ghost').count(),0);assert(await p.locator('.connector-call>summary').evaluate(n=>n===document.activeElement));
  // Completion stays at the same timeline anchor. It must not fly into a tracker.
  const row=p.locator('.connector-message').filter({has:p.locator('[data-connector-artifact="drive-read"]')});
  card.status='completed';await p.evaluate(()=>window.fixtureRefresh());
  assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);
  assert.equal(await row.count(),1);assert.equal(await row.getAttribute('data-message'),'3');
  assert.equal(await p.locator('.summary-progress .connector-call,.task-connector-toggle').count(),0);
  // A fast call still animates the approval into its own readable compact receipt.
  card.status='pending';await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.getByRole('button',{name:'Allow',exact:true}).focus();
  card.status='completed';await p.evaluate(()=>window.fixtureRefresh());assert(await p.locator('.connector-transfer-ghost').count()>0);
  assert(await row.locator('.connector-call>summary').evaluate(n=>n===document.activeElement));
  // Backgrounding settles effects, even if an animation finish event is dropped.
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);
  // Multiple approvals may finish in one refresh, retaining one receipt per call.
  card.status='pending';const second={...card,id:'drive-second',approval_id:'approve-second'};
  messages.push({...messages.at(-1),seq:4,connector_artifact:second});
  await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).nth(1).waitFor();
  card.status=second.status='completed';await p.evaluate(()=>window.fixtureRefresh());
  assert.equal(await p.locator('.connector-transfer-space').count(),0,'No outgoing timeline placeholders when receipts remain inline');
  await p.evaluate(()=>window.fixtureRefresh());await p.waitForTimeout(450);
  assert.equal(await p.locator('.connector-transfer-space,.connector-transfer-ghost').count(),0);
  assert.equal(await p.locator('#content [data-connector-artifact="drive-read"]').count(),1);
  assert.equal(await p.locator('#content [data-connector-artifact="drive-second"]').count(),1);
  messages.pop();
  card.status='pending';await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'Allow',exact:true}).focus();card.status='completed';await p.evaluate(()=>window.fixtureRefresh());
  assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);assert.equal(await row.count(),1);
  assert(await row.locator('.connector-call>summary').evaluate(n=>n===document.activeElement));
  run.status='completed';messages.push({seq:5,sender:'piper',kind:'result',run_id:run.id,text:'Review finished.',created:now+5});await p.evaluate(()=>window.fixtureRefresh());
  assert.equal(await row.count(),1,'Finishing a compact task preserves its connector receipt');
  assert.equal(await p.locator('.task-compact').count(),0);assert.equal(await p.getByText('Review finished.',{exact:true}).count(),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,approvalCollapse:true,inlineReceipt:true,focusPreserved:true,completedCompactRemoved:true,fastCompletion:true,backgroundCleanup:true,burstCleanup:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
