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
 page.on("pageerror",e=>console.error("PAGEERROR",e));
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
 const update=(seq,mode='summaries')=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:run.created+seq,text:'Progress update '+seq,progress:{mode,phase:'commentary',run_id:run.id,group_id:'summary-group'}});
 const marker={...update(0),kind:'task_progress',text:'',progress:{...update(0).progress,work_qualified:true,presentation:{mode:'compact',promoted:false,stages:[],current_stage:0},activity:{actions:1,completed:0,current_label:'Run computer command',recent:[]}}};
 messages=[marker,update(1)];await page.goto(origin);await page.locator('.task-compact').waitFor();assert.equal(await page.locator('.task-staged').count(),0,'a first update is not a staged task');
 run.created=now-519;run.progress_started=run.created;messages=[marker,update(1),update(2)];
 await page.reload();await page.locator('.task-compact').waitFor();assert.equal(await page.locator('.task-staged').count(),0,'eight minutes plus two updates do not establish stages');
 run.status='completed';messages.push({seq:3,sender:'piper',kind:'result',run_id:run.id,created:now,text:'Final tracker answer'});
 await page.getByText('Final tracker answer',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.summary-progress'));
 messages=[update(1,'balanced')];await page.reload();await page.getByText('Progress update 1',{exact:true}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0,'explicit alternative mode preserved');
 console.log(JSON.stringify({passed:true,engine,firstUpdateCompact:true,sparseLongJobCompact:true,finalSeparate:true,explicitModePreserved:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
