const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1250,height:850}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};let runs=[],messages=[],sends=0,paused=false;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/chats/dm-piper/messages'&&req.method()==='POST'){
    sends++;const created=Math.floor(Date.now()/1000),body=req.postDataJSON();const run={id:'send-'+sends,bot_id:'piper',chat_id:chat.id,prompt:body.prompt,status:'queued',output:'',error:'',created};runs.push(run);messages.push({seq:sends,sender:'user',kind:'message',text:body.prompt,created,run_id:'',source_event_seq:null});return send([run.id]);
   }
   if(name==='/runs')return send(runs);
   if(name.startsWith('/runs/'))return send({run:runs.find(r=>name.endsWith(r.id)),events:[],attachments:[],approvals:[]});
   if(name==='/chats')return send([chat]);if(name==='/chats/dm-piper')return send({chat,messages,page:{has_before:false,has_after:false,first:messages[0]?.seq,last:messages.at(-1)?.seq}});
   if(name==='/activity'){const run=runs.find(r=>r.status==='running')||runs[0];return send(run?{piper:{run_id:run.id,status:run.status,shape:run.status==='running'?'think':'idle',label:run.status==='running'?'Thinking it through':'Queued',started_at:run.created,run_created_at:run.created,server_time:Math.floor(Date.now()/1000)}}:{});}
   if(name==='/status')return send({version:'0.48.17',screen_bot_id:'piper',vm_enabled:true,takeover:paused,control_pauses:paused?[{bot_id:'piper',name:'Piper',control_id:'pause-fixture',reason:'manual',queued:runs.length}]:[]});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#prompt').fill('Help me plan this');await p.locator('#prompt').press('Enter');
  await p.locator('.work-line .character').waitFor();await p.waitForTimeout(1200);assert.equal(sends,1);
  assert(await p.locator('.work-label').isHidden(),'Normal scheduler startup has no status flash');assert(await p.locator('#queue-status').isHidden(),'The first message is not a backlog');assert(!await p.getByText('Waiting my turn',{exact:true}).count());
  await p.locator('.work-line .character').evaluate(b=>window.firstSendAvatar=b);await p.screenshot({path:path.join(artifacts,engine+'-quiet-send.png')});
  runs[0].status='running';await p.getByText('Thinking it through',{exact:true}).waitFor();assert(await p.locator('#queue-status').isHidden());assert.equal(await p.locator('.work-line .character').evaluate(b=>b===window.firstSendAvatar),true,'Starting work retains the bot already on screen');
  await p.locator('#prompt').fill('Also check tomorrow');await p.locator('#prompt').press('Enter');await p.getByText('1 message queued',{exact:true}).waitFor();assert.equal(sends,2);assert.equal(await p.locator('.work-line').count(),1);
  runs[0].status='queued';runs[0].created=Math.floor(Date.now()/1000);await p.reload();await p.locator('.work-line').waitFor();assert.equal(await p.locator('#queue-status').textContent(),'1 message queued','Only the second message is behind the starting task');
  runs=runs.slice(0,1);runs[0].created=Math.floor(Date.now()/1000)-20;await p.reload();await p.getByText('Waiting to start',{exact:true}).waitFor();assert(await p.locator('#queue-status').isHidden(),'A delayed start gets an explanation without a misleading queue count');
  paused=true;await p.reload();await p.getByText('Waiting for control',{exact:true}).waitFor();await p.locator('#queue-status').getByRole('button',{name:'Return control'}).waitFor();assert.match(await p.locator('#queue-status').textContent(),/1 message queued/);
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.setViewportSize({width:390,height:850});await p.screenshot({path:path.join(artifacts,engine+'-held-send-mobile.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,realSendQuiet:true,avatarPreserved:true,actualBacklogVisible:true,startingTaskExcludedFromCount:true,delayedStartExplained:true,manualControlPreserved:true}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
