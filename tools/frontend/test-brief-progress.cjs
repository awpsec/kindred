// Brief work remains inline until there is enough evidence for a long job.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;
 if(out)fs.mkdirSync(out,{recursive:true});
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();let passed=0;
 try{for(const width of [1100,390]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  let seconds=90,finished=false,staged=false,mode='summaries',quiet=false,attention=false,phase='commentary',pendingKind='';
  const run=()=>({id:'short',bot_id:'piper',chat_id:chat.id,status:finished?'completed':pendingKind==='approval'?'awaiting_approval':pendingKind?'awaiting_user':'running',created:now-100,progress_started:now-100,task_title:'Check mailbox',output:'',error:''});
  const progress=()=>({mode,phase,run_id:'short',group_id:'short-group',work_qualified:true,task_title:'Check mailbox',activity:{seconds,completed:4,last_at:now},...(staged?{presentation:{mode:'staged',promoted:true,stages:['Review','Verify'],current_stage:1}}:{})});
  const question={id:'brief-choice',run_id:'short',bot_id:'piper',chat_id:chat.id,delivery_chat_id:chat.id,task_group_id:'short-group',status:'pending',question:'Choose where to save the draft',options:['Personal drafts','Team drafts'],created:now-20};
  const approval={id:'brief-permission',run_id:'short',bot_id:'piper',chat_id:chat.id,task_group_id:'short-group',message_seq:6,status:'pending',tool:'guest_exec',args:{command:'echo fixture'},created:now-15};
  const handoff={id:'brief-login',run_id:'short',bot_id:'piper',title:'Sign in to the client portal',instructions:'Please sign in on the bot computer.',authentication:{method:'signin',service:'the client portal'},status:'pending',created:now-10};
  const messages=()=>[{seq:1,sender:'piper',kind:'task_progress',run_id:'short',created:now-90,text:'',progress:progress()},...(!quiet?[{seq:2,sender:'piper',kind:'assistant',run_id:'short',created:now-60,text:'Getting connector schemas.',progress:progress(),...(attention?{status_notice:{label:'Needs attention',text:'Getting connector schemas.'}}:{})},{seq:3,sender:'piper',kind:'assistant',run_id:'short',created:now-40,text:'Checking drafts next.',progress:progress()}]:[]),...(pendingKind==='question'?[{seq:5,sender:'piper',kind:'question',run_id:'short',created:question.created,text:question.question,question}]:[]),...(pendingKind==='approval'?[{seq:6,sender:'piper',kind:'approval',run_id:'short',created:approval.created,text:'Approve action',approval}]:[]),...(finished?[{seq:4,sender:'piper',kind:'result',run_id:'short',created:now,text:'The mailbox review is complete.',progress:{...progress(),phase:'final_answer'}}]:[])];
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.briefRefresh=()=>refresh(true);'}));
  await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send([run()]);if(n==='/api/runs/short')return send({run:run(),events:pendingKind==='handoff'?[{seq:10,kind:'user_action',body:{id:'brief-login'},created:handoff.created}]:[],attachments:[],approvals:[]});if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});if(n==='/api/questions')return send(pendingKind==='question'?[question]:[]);if(n==='/api/approvals')return send(pendingKind==='approval'?[approval]:[]);if(n==='/api/user-tasks')return send(pendingKind==='handoff'?[handoff]:[]);if(n==='/api/activity')return send({});return r.continue();});
  await page.goto(origin);await page.locator('.progress-commentary').first().waitFor();
  assert.equal(await page.locator('.summary-progress').count(),0);assert.equal(await page.locator('.progress-commentary:visible').count(),2);assert(await page.locator('.work-line').isVisible(),'brief work retains the normal live indicator');passed++;
  if(out)await page.screenshot({path:path.join(out,engine+'-brief-'+width+'-running.png')});
  finished=true;await page.reload();await page.getByText('The mailbox review is complete.',{exact:true}).waitFor();assert.equal(await page.locator('.progress-commentary:visible').count(),2);assert.equal(await page.locator('.summary-progress').count(),0);passed++;
  if(out)await page.screenshot({path:path.join(out,engine+'-brief-'+width+'-completed.png')});
  await page.reload();await page.locator('.progress-commentary').first().waitFor();assert.equal(await page.locator('.summary-progress').count(),0);passed++;
  seconds=200;await page.reload();await page.locator('.summary-progress:not(.brief-progress)').waitFor();assert.equal(await page.locator('.summary-progress-author').innerText(),'Piper');passed++;
  seconds=90;staged=true;await page.reload();await page.locator('.task-staged').waitFor();assert.equal(await page.locator('.brief-progress').count(),0);passed++;
  staged=false;mode='balanced';await page.reload();await page.locator('.message-bubble').filter({hasText:'Getting connector schemas.'}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);passed++;
  mode='summaries';quiet=true;await page.reload();await page.getByText('The mailbox review is complete.',{exact:true}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);passed++;
  quiet=false;attention=true;await page.reload();await page.getByText('Getting connector schemas.',{exact:true}).waitFor();assert.equal(await page.getByText('Getting connector schemas.',{exact:true}).isVisible(),true);passed++;
  // Each pending attention surface stays outside brief activity, including after refresh.
  attention=false;finished=false;seconds=90;
  for(const kind of ['question','approval','handoff']){
   pendingKind=kind;await page.reload();await page.locator('.progress-commentary').first().waitFor();
   const control=page.locator(kind==='question'?'[data-question-id="brief-choice"]':kind==='approval'?'#request-tray':'[data-message="human-task-brief-login"]');
   await control.waitFor();assert.equal(await page.locator('.summary-progress').count(),0);
   assert.equal(await control.getAttribute('data-task-commentary'),null,kind+' remains outside collapsed commentary');
   assert.equal(await page.locator('.task-commentary:visible').count(),0);
   if(kind==='handoff')assert(await control.getByRole('button',{name:'Take over',exact:true}).isVisible());
   await page.evaluate(()=>window.briefRefresh());await control.waitFor();assert.equal(await page.locator('.task-commentary:visible').count(),0);passed++;
  }
  // Promotion moves keyboard focus from gathered commentary into the disclosure.
  pendingKind='';await page.reload();await page.locator('.progress-commentary').first().waitFor();
  await page.locator('.progress-commentary').first().focus();seconds=200;
  await page.evaluate(()=>window.briefRefresh());await page.locator('.summary-progress:not(.brief-progress)').waitFor();
  assert(await page.locator('.summary-progress summary').evaluate(n=>n===document.activeElement),'Promotion preserves keyboard access');
  assert.equal(await page.locator('.task-commentary:visible').count(),0);passed++;
  assert.deepEqual(errors,[]);await page.close();
 }console.log(JSON.stringify({passed,engine:process.env.WEBKIT?'webkit':'chromium'}));}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
