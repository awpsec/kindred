const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:860}}),now=Math.floor(Date.now()/1000);
 const run={id:'approved-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Update your instructions.',output:'Saved — my instructions are updated.',created:now,finished:now};
 const approval={id:'approved-change',run_id:run.id,tool:'bot_instructions_update',status:'approved',args:{bot_id:'piper',bot_name:'Piper',expected_instructions:'Help with research.',instructions:'Use the search skill for web research.'}};
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route('**/api/runs',r=>r.fulfill({json:[run]}));
 await page.route('**/api/runs/approved-run',r=>r.fulfill({json:{run,events:[],approvals:[approval]}}));
 await page.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now},{seq:2,sender:'piper',kind:'result',text:run.output,run_id:run.id,created:now+1}],page:{has_before:false,has_after:false}}}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const group=page.locator('[data-message="2"]'),receipt=group.locator('.instruction-review');
 await receipt.waitFor();assert.equal(await page.locator('.instruction-review').count(),1);
 assert(await group.evaluate(n=>Boolean(n.querySelector('.instruction-review').compareDocumentPosition(n.querySelector('.message-row'))&Node.DOCUMENT_POSITION_FOLLOWING)));
 assert.equal(await receipt.locator('.instruction-decision.approved svg').count(),1);
 assert.equal(await receipt.getByRole('button',{name:'Allow',exact:true}).count(),0);
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-instruction-receipt';fs.mkdirSync(out,{recursive:true});
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await group.screenshot({path:out+'/'+theme+'.png'});}

 run.status='running';run.output='';
 await page.route('**/api/activity',r=>r.fulfill({json:{piper:{run_id:run.id,status:'running',shape:'read',label:'Reviewing results',started_at:now,run_created_at:now,server_time:Math.floor(Date.now()/1000)}}}));
 await page.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now},{seq:2,sender:'piper',kind:'assistant',text:'Here is the change I am proposing.',run_id:run.id,source_event_seq:1,created:now+1}],page:{has_before:false,has_after:false}}}));
 await page.reload();
 const liveReceipt=page.locator('.instruction-review');
 await liveReceipt.waitFor();await page.locator('.work-line').waitFor();await page.waitForTimeout(500);
 assert.equal(await liveReceipt.count(),1);
 assert(await page.locator('#content').evaluate(n=>Boolean(n.querySelector('.instruction-review').compareDocumentPosition(n.querySelector('.work-line'))&Node.DOCUMENT_POSITION_FOLLOWING)));
 assert((await liveReceipt.boundingBox()).width<=640);
 await liveReceipt.locator('.decision-receipt-summary').click();await page.waitForTimeout(300);
 assert((await liveReceipt.boundingBox()).width>640,'Expanded instruction diff keeps the available chat width');
 await liveReceipt.locator('.decision-receipt-summary').click();await page.waitForTimeout(300);
 assert((await liveReceipt.boundingBox()).width<=640,'Closing details restores the shared receipt width');
 for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:out+'/'+theme+'-resumed.png'});}
 console.log('Approval precedes confirmation, appears once, and has an approved checkmark.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
