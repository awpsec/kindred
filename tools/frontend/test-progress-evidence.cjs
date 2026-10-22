const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();let cases=0;
 try {for(const width of [1100,390]){
 const page=await browser.newPage({viewport:{width,height:850}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'work',bot_id:'piper',chat_id:chat.id,status:'running',created:now-1200,progress_started:now-1200,task_title:'Use connected service',error:'',output:'',prompt:'Put that email in my drafts.'};
 const activity={actions:1,completed:1,failed:0,seconds:76,recent:[{label:'Use connected service',count:1,failed:false,created:now-10}],phase:'preparing'};
 const progress={mode:'summaries',phase:'commentary',work_qualified:true,group_id:'phase',run_id:run.id,task_title:run.task_title,activity};
 const marker={seq:2,sender:'piper',kind:'task_progress',text:'',created:now-76,run_id:run.id,progress};
 const call={seq:3,sender:'piper',kind:'connector_artifact',text:'Create draft',created:now-10,run_id:run.id,connector_artifact:{id:'call',bot_id:'piper',chat_id:chat.id,run_id:run.id,progress_message_seq:2,connection:'Gmail',connector:'gmail',source:'Claude',kind:'task',tool:'gmail__create_draft',title:'Create draft',status:'completed',revision:1,input:{},records:[]}};
 let messages=[{seq:1,sender:'user',kind:'message',text:'Put that email in my drafts.',created:now-80},marker,call];
 await page.route(origin+'/api/**',r=>{const p=new URL(r.request().url()).pathname;const send=json=>r.fulfill({json});if(p==='/api/runs')return send([run]);if(p==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(p==='/api/chats')return send([chat]);if(p==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});return r.continue();});
 for(const status of ['running','completed']){run.status=status;await page.goto(origin);await page.locator('.connector-call-summary').waitFor().catch(async e=>{console.error((await page.locator('#content').innerText()).slice(0,1500));throw e;});assert.equal(await page.locator('.task-staged').count(),0,'single connector stays inline');cases++;}
 run.status='running';activity.seconds=1200;await page.reload();await page.locator('.connector-call-summary').waitFor().catch(async e=>{console.error((await page.locator('#content').innerText()).slice(0,1500));throw e;});assert.equal(await page.locator('.task-staged').count(),0,'slow one-call work is not a long job');cases++;
 activity.actions=7;activity.seconds=76;await page.reload();await page.locator('.connector-call-summary').waitFor().catch(async e=>{console.error((await page.locator('#content').innerText()).slice(0,1500));throw e;});assert.equal(await page.locator('.task-staged').count(),0,'several quick preparation calls are not a long job');cases++;
 activity.actions=12;activity.completed=11;activity.failed=1;activity.seconds=1200;activity.recent=[{label:'Read local file',count:5,failed:false,created:now-50}];run.task_title=progress.task_title='Work on local computer';
 await page.reload();await page.locator('.task-compact').waitFor();await page.locator('.summary-progress-heading').click();await page.locator('.summary-progress-activity').waitFor({state:'visible'});assert.match(await page.locator('.summary-progress-activity').innerText(),/11 completed calls · 1 failed/);assert.match(await page.locator('.summary-progress-activity').innerText(),/Read local file × 5/);assert.match(await page.locator('.summary-progress-name').innerText(),/Preparing the next action/);assert.equal(await page.locator('.connector-call-summary').count(),1,'connector stays inline regardless of work duration');cases++;
 // Three written updates cannot manufacture outcome stages.
 activity.actions=2;activity.seconds=50;messages=messages.concat([4,5,6].map(seq=>({seq,sender:'piper',kind:'assistant',text:'Milestone '+seq,created:now-7+seq,run_id:run.id,progress:{...progress}})));
 await page.reload();await page.locator('.task-compact').waitFor();assert.equal(await page.locator('.task-staged').count(),0);assert.equal(await page.locator('.progress-commentary').count(),3);cases++;
 messages.splice(-1);await page.reload();await page.locator('.progress-commentary').filter({hasText:'Milestone 4'}).waitFor();assert.equal(await page.locator('.task-staged').count(),0,'two updates alone are not sufficient');assert.equal(await page.locator('.connector-call-summary').count(),1);cases++;
 assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();server.closeAllConnections();server.close();}
 console.log(JSON.stringify({passed:true,cases,engine:process.env.WEBKIT?'webkit':'chromium'}));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
