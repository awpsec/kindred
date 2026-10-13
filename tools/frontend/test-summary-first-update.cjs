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
 messages=[update(1)];await page.goto(origin);await page.locator('.summary-progress').waitFor();assert.equal(await page.locator('.summary-progress-update').count(),1,'first update groups immediately before 60 seconds');
 run.status='completed';run.created=now-519;run.progress_started=run.created;
 messages=[update(1),update(2),{seq:3,sender:'piper',kind:'result',run_id:run.id,created:now,text:'Final tracker answer'}];
 await page.reload();await page.locator('.summary-progress').waitFor();assert.equal(await page.locator('.summary-progress-update').count(),2,'eight minute job with two updates groups');assert(!(await page.locator('.summary-progress').innerText()).includes('Final tracker answer'),'final answer remains outside group');await page.getByText('Final tracker answer',{exact:true}).waitFor();
 messages=[update(1,'balanced')];await page.reload();await page.getByText('Progress update 1',{exact:true}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0,'explicit alternative mode preserved');
 console.log(JSON.stringify({passed:true,engine,firstUpdate:true,sparseLongJob:true,finalSeparate:true,explicitModePreserved:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
