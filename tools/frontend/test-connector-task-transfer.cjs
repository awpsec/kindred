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
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(450);
  await p.getByRole('button',{name:'Allow',exact:true}).focus();card.status='executing';
  await p.evaluate(()=>window.fixtureRefresh());assert(await p.locator('.connector-transfer-ghost').count()>0,'Approval must animate into compact call');
  await p.waitForTimeout(500);assert.equal(await p.locator('.connector-transfer-ghost').count(),0);assert(await p.locator('.connector-call>summary').evaluate(n=>n===document.activeElement));
  card.status='completed';
  const transfer=await p.evaluate(async()=>{
    await window.fixtureRefresh();const space=document.querySelector('.connector-transfer-space'),start=performance.now();
    const result={ghosts:document.querySelectorAll('.connector-transfer-ghost').length,spaces:document.querySelectorAll('.connector-transfer-space').length,focused:document.activeElement===document.querySelector('.task-connector-toggle'),heights:[]};
    while(performance.now()-start<450){result.heights.push(space?.isConnected?space.getBoundingClientRect().height:0);await new Promise(requestAnimationFrame);}
    return result;
  });
  assert(transfer.ghosts>0,'Completed call must animate into its task');assert.equal(transfer.spaces,1);assert(transfer.focused);
  assert(transfer.heights.some(h=>h>0&&h<transfer.heights[0]-1),'Intermediate layout height');
  assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);assert.equal(await p.locator('.connector-message').count(),0);
  // A fast call may complete before the first refreshed approval receipt.
  card.status='pending';await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.locator('.summary-progress-heading').click();await p.waitForTimeout(400);await p.getByRole('button',{name:'Allow',exact:true}).focus();
  card.status='completed';await p.evaluate(()=>window.fixtureRefresh());assert(await p.locator('.connector-transfer-ghost').count()>0);assert(await p.locator('.summary-progress-heading').evaluate(n=>n===document.activeElement));
  // Backgrounding must settle all effects, even if animation finish is dropped.
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);
  // Multiple approvals can finish in one refresh without duplicate ghosts.
  card.status='pending';const second={...card,id:'drive-second',approval_id:'approve-second'};
  messages.push({...messages.at(-1),seq:4,connector_artifact:second});
  await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).nth(1).waitFor();
  card.status=second.status='completed';await p.evaluate(()=>window.fixtureRefresh());
  assert.equal(await p.locator('.connector-transfer-space').count(),2);
  await p.evaluate(()=>window.fixtureRefresh());await p.waitForTimeout(450);
  assert.equal(await p.locator('.connector-transfer-space,.connector-transfer-ghost').count(),0);
  messages.pop();
  card.status='pending';await p.reload();await p.getByRole('button',{name:'Allow',exact:true}).waitFor();await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'Allow',exact:true}).focus();card.status='completed';await p.evaluate(()=>window.fixtureRefresh());assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0);assert.equal(await p.locator('.connector-message').count(),0);
  assert(await p.locator('.task-connector-toggle').evaluate(n=>n===document.activeElement));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,approvalCollapse:true,taskTransfer:true,intermediateHeight:true,focusPreserved:true,collapsedTask:true,fastCompletion:true,backgroundCleanup:true,burstCleanup:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
