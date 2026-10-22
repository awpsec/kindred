const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
 const page=await browser.newPage(),now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
 const run={id:'summary-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-5,progress_started:now-5,prompt:'Prepare monthly tracker',task_title:'Prepare monthly tracker',output:'',error:''};
 let messages=[];
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
 const update=(seq,mode='summaries')=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:run.created+seq,text:'Progress update '+seq,progress:{mode,phase:'commentary',run_id:run.id,group_id:'summary-group'}});
 const marker={...update(0),kind:'task_progress',text:'',created:run.created+2,progress:{...update(0).progress,presentation:{mode:'staged',promoted:true,stages:['Review evidence','Build tracker'],current_stage:1},activity:{completed:1,recent:[{label:'Read source file',created:run.created}]}}};
 messages=[marker,update(1),update(2)];await page.goto(origin);const details=page.locator('.summary-progress-disclosure');await details.waitFor();assert(await details.evaluate(n=>n.open));
 run.status='completed';messages.push({seq:3,sender:'piper',kind:'result',run_id:run.id,created:now,text:'Final tracker answer'});
 await page.waitForFunction(()=>document.querySelector('[data-progress-finished="true"]'),{},{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.summary-progress-disclosure')?.open===false);
 assert(await page.getByText('Final tracker answer',{exact:true}).isVisible());
 assert.equal(await page.locator('.progress-commentary[data-message="1"]').count(),1,'Earlier commentary retains its original node identity');assert.equal(await page.locator('.progress-commentary[data-message="1"]').isVisible(),false,'Earlier commentary collapses without reparenting');
 await page.locator('.summary-progress-heading').click();await page.waitForTimeout(350);assert(await details.evaluate(n=>n.open),'finished group reopens');assert(await page.locator('.progress-commentary[data-message="1"]').isVisible(),'Earlier commentary reopens at its original position');
 run.status='running';messages=messages.slice(0,3);await page.reload();await details.waitFor();
 // A running-time reading choice is temporary. Completion always folds the task.
 await page.locator('.summary-progress-heading').click();await page.waitForTimeout(350);assert(!(await details.evaluate(n=>n.open)));
 await page.waitForTimeout(3500);assert(!(await details.evaluate(n=>n.open)),'poll must not undo explicit collapse');
 await page.locator('.summary-progress-heading').click();await page.waitForTimeout(350);
 run.status='completed';messages.push({seq:3,sender:'piper',kind:'result',run_id:run.id,created:now,text:'Final tracker answer'});
 await page.waitForFunction(()=>document.querySelector('[data-progress-finished="true"]'),{},{timeout:15000});await page.waitForTimeout(400);
 assert(!(await details.evaluate(n=>n.open)),'running-time expansion must collapse on completion');
 await page.locator('.summary-progress-heading').click();await page.waitForTimeout(350);
 await page.waitForTimeout(3500);assert(await details.evaluate(n=>n.open),'expansion after completion survives polling');
 // Force a fresh chat render to check the saved reading preference, not only DOM reuse.
 messages.push({seq:4,sender:'piper',kind:'message',created:now+1,text:'The tracker is available.'});
 await page.getByText('The tracker is available.',{exact:true}).waitFor();
 assert(await details.evaluate(n=>n.open),'expansion after completion survives chat updates');
 await page.emulateMedia({reducedMotion:'reduce'});run.status='running';messages=messages.slice(0,3);await page.reload();await details.waitFor();run.status='completed';messages.push({seq:3,sender:'piper',kind:'result',run_id:run.id,created:now,text:'Final tracker answer'});await page.waitForFunction(()=>document.querySelector('.summary-progress-disclosure')?.open===false,{},{timeout:15000});
 console.log(JSON.stringify({passed:true,engine,autoCollapse:true,runningExpansionCollapses:true,finishedExpansionPreserved:true,manualCollapsePreserved:true,reducedMotion:true}));

 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
