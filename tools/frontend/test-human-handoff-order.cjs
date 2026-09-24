const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),now=Math.floor(Date.now()/1000);page.setDefaultTimeout(15000);
 let phase='pending',takeover=false;const writes=[];
 const run=()=>({id:'human-run',bot_id:'piper',chat_id:'dm-piper',status:phase==='pending'?'awaiting_user':phase==='running'?'running':'completed',prompt:'Search the web.',output:phase==='done'?'Verified the page after your help.':'',created:now-10});
 const task=()=>({id:'human-step',run_id:'human-run',bot_id:'piper',title:'Complete browser verification',instructions:'Complete the CAPTCHA in the browser, then return control.',status:phase==='pending'?'pending':'resumed',outcome:phase==='pending'?'':'done',created:now-5});
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route('**/api/**',async r=>{const req=r.request(),name=new URL(req.url()).pathname,send=json=>r.fulfill({json});
 if(name==='/api/runs')return send([run()]);
 if(name==='/api/runs/human-run')return send({run:run(),events:[],approvals:[]});
 if(name==='/api/user-tasks')return send([task()]);
 if(name==='/api/status')return send({screen_bot_id:'piper',takeover,vm_enabled:true});
 if(name==='/api/takeover'){writes.push(req.postDataJSON());takeover=req.postDataJSON().enabled;return send({ok:true});}
 if(name==='/api/computer/session')return send({ticket:'fixture'});
 if(name==='/api/activity')return send({});
 if(name==='/api/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[
 {seq:1,sender:'user',kind:'message',text:'Search the web.',created:now-10},
 {seq:2,sender:'piper',kind:'assistant',text:'The browser needs your help.',run_id:'human-run',created:now-6},
 ...(phase==='pending'?[]:[{seq:3,sender:'piper',kind:phase==='done'?'result':'assistant',text:phase==='done'?run().output:'Checking the page now.',run_id:'human-run',created:now-2}])
 ],page:{has_before:false,has_after:false}});
 return r.continue();});
 const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin);
 const handoff=page.locator('[data-message="human-task-human-step"]');await handoff.waitFor();
 await handoff.getByRole('button',{name:'Take over',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('expanded'));
 for(let i=0;!writes.length&&i<100;i++)await page.waitForTimeout(50);
 assert(writes.some(w=>w.enabled===true&&w.bot_id==='piper'));
 for(const stage of ['running','done']){
 phase=stage;await page.reload();await handoff.waitFor();
 assert.equal(await page.locator('[data-user-task="human-step"]').count(),1);
 assert(await page.locator('#content').evaluate(n=>{
  const card=n.querySelector('[data-message="human-task-human-step"]'),reply=n.querySelector('[data-message="3"]'),work=n.querySelector('[data-run="human-run"]:not([data-message])');
  return Boolean(card.compareDocumentPosition(reply)&Node.DOCUMENT_POSITION_FOLLOWING)&&(!work||Boolean(card.compareDocumentPosition(work)&Node.DOCUMENT_POSITION_FOLLOWING));
 }));
 }
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-human-handoff';fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:out+'/handoff-order.png'});
 console.log('Human card stays before subsequent replies/work, deduplicates, and Take over expands the correct screen.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
