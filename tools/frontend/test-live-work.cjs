const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  const a='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',b='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',now=Math.floor(Date.now()/1000);
  let bot={id:'piper',name:'Leet',provider:'claude-code',model:'sonnet',reasoning_effort:'high',instructions:'Fixture',memory:'',approval_mode:'auto',profile:{shape:'round',color:'#f24d93',eyes:'curious',label:'Helper',notifications:true,animated:true,local_access:true,local_device_id:a}};
  const chat={id:'dm-piper',name:'Leet',members:['piper'],archived:false},run={id:'work',bot_id:'piper',chat_id:chat.id,prompt:'Import the approved workflows',status:'running',output:'',error:'',created:now-90,depth:0},followup={...run,id:'followup',prompt:'Everything okay?',status:'queued',created:now-15};
  let phase='terminal',started=now-29,delivered=false,devicesMissing=false,offline=false;
  const catalogue=[
   {model:'default',displayName:'Account default · Sonnet 5',selectionKind:'default'},
   {model:'sonnet',displayName:'Sonnet 5',selectionKind:'alias'},
   {model:'claude-sonnet-5',displayName:'Sonnet 5',versionLabel:'Sonnet 5 · claude-sonnet-5',selectionKind:'fixed',advanced:true},
   {model:'claude-fable-5-1[1m]',displayName:'Fable 5.1 · 1M context',selectionKind:'fixed'},
   {model:'opus[1m]',displayName:'Opus 5 · 1M context',selectionKind:'alias'},
   {model:'claude-opus-5[1m]',displayName:'Opus 5 · 1M context',selectionKind:'fixed',advanced:true},
   {model:'opus',displayName:'Opus 5 · automatic context',selectionKind:'alias',advanced:true},
   {model:'haiku',displayName:'Haiku 4.5',selectionKind:'alias'},
   {model:'claude-haiku-4-5',displayName:'Haiku 4.5',selectionKind:'fixed',advanced:true},
  ].map(m=>({...m,description:'Verified fixture selection',supportedReasoningEfforts:[{reasoningEffort:'high'}]}));
  function messages(){return [
   {seq:1,sender:'user',kind:'message',text:run.prompt,run_id:'',created:run.created,source_event_seq:null},
   {seq:2,sender:'piper',kind:'assistant',text:'Checking the approved local workflows.',run_id:run.id,created:now-50,source_event_seq:101},
   {seq:3,sender:'user',kind:'message',text:'Everything okay?',run_id:'',created:now-15,source_event_seq:null,delivery:[{bot_id:'piper',status:delivered?'steered':'queued',into_run_id:delivered?run.id:null,task_status:delivered?'running':null}]},
   ...(delivered?[{seq:4,sender:'piper',kind:'assistant',text:'The last command timed out. I am checking that blocker and keeping the original import task.',run_id:run.id,created:now,source_event_seq:110}]:[])
  ];}
  const label=()=>phase==='terminal'?'Running a command on Demo workstation':phase==='waiting'?'Waiting for permission on Demo workstation':phase==='worry'?'Command timed out · checking the failure':'Searching';
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON(),send=json=>route.fulfill({json});
   if(name==='/bots')return send([bot]);if(name==='/bots/piper'&&body){bot=body;writes.push(body);return send(bot);}
   if(name==='/status')return send({version:'0.48.10',screen_bot_id:'piper',takeover:false,vm_enabled:true});
   if(name==='/settings')return send({name:'You',theme:'dark',approval_mode:'auto',local_access:true});
   if(name==='/chats')return send([chat]);if(name==='/runs')return send([run,{...followup,status:delivered?'steered':'queued'}]);
   if(name.startsWith('/runs/'))return send({run:name.endsWith('work')?run:followup,events:name.endsWith('work')?[{seq:101,kind:'assistant',body:{text:'Checking the approved local workflows.'},created:now-50},{seq:103,kind:'tool_started',body:{tool:'local_exec',args:{command:'Write-Output 42'}},created:started},...(delivered?[{seq:110,kind:'assistant',body:{text:messages().at(-1).text},created:now}]:[])]:[],attachments:[],approvals:[]});
   if(name==='/chats/dm-piper')return send({chat,messages:messages(),page:{has_before:false,has_after:false,first:1,last:delivered?4:3}});
   if(name.startsWith('/chats/dm-piper/'))return send({});
   if(name==='/activity'){if(offline)return route.abort();return send({piper:{run_id:run.id,status:'running',shape:phase,label:label(),started_at:started,run_created_at:run.created,server_time:Math.floor(Date.now()/1000)}});}
   if(name==='/local/devices')return send({devices:devicesMissing?[]:[{id:a,name:'Demo workstation',online:false,mode:'full'},{id:b,name:'linux-client',online:true,mode:'ask'}]});
   if(name.startsWith('/provider-cli/'))return send({connected:true,installed:true,data:catalogue});
   return route.continue();
  });
  await p.clock.install();await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('.work-line').waitFor();await p.waitForTimeout(2200);
  assert.equal(await p.locator('.work-line').count(),1,'A queued follow-up cannot create a second working avatar');
  assert.equal(await p.locator('.work-line .character').getAttribute('data-action'),'terminal');
  assert(await p.locator('.work-label').isVisible());assert.match(await p.locator('.work-timer').textContent(),/^\d+s$/);
  assert.match(await p.locator('.message-delivery').textContent(),/queued for the next task/);
  await p.screenshot({path:path.join(artifacts,engine+'-command-progress-dark.png')});
  const timer=await p.locator('.work-timer').textContent();await p.waitForTimeout(1200);assert.notEqual(await p.locator('.work-timer').textContent(),timer);
  await p.locator('#bot-details').click();await p.locator('#bot-settings').click();
  const model=p.getByRole('combobox',{name:'Model',exact:true}),device=p.getByRole('combobox',{name:'Local desktop',exact:true});
  await model.locator('option[value=sonnet]').waitFor({state:'attached'});await device.locator('option[value="'+a+'"]').waitFor({state:'attached'});
  assert.deepEqual(await model.locator('option').allTextContents(),['Choose a model','Account default · Sonnet 5','Sonnet 5','Fable 5.1 · 1M context','Opus 5 · 1M context','Haiku 4.5']);
  assert.equal(await device.inputValue(),a);assert.match(await p.locator('.local-access-help').textContent(),/Demo workstation is offline.*stays saved/);
  await p.locator('.bot-edit-form').getByLabel('Role',{exact:true}).fill('Work helper');await p.waitForTimeout(800);assert.equal(writes.at(-1).profile.local_device_id,a);assert.equal(writes.at(-1).profile.local_access,true);
  await p.screenshot({path:path.join(artifacts,engine+'-saved-desktop-and-models.png')});
  await p.getByLabel('Show model versions',{exact:true}).check();await model.locator('option[value="claude-sonnet-5"]').waitFor({state:'attached'});await model.selectOption('claude-sonnet-5');await p.waitForTimeout(800);assert.equal(writes.at(-1).model,'claude-sonnet-5');
  await p.getByLabel('Show model versions',{exact:true}).uncheck();await p.waitForTimeout(300);assert.equal(await model.inputValue(),'claude-sonnet-5');
  await device.selectOption('*');await p.waitForTimeout(800);assert.equal(writes.at(-1).profile.local_device_id,'*');assert.match(await p.locator('.local-access-help').textContent(),/Each action names one computer/);
  await device.selectOption(a);await p.waitForTimeout(800);devicesMissing=true;await p.reload();await p.locator('#bot-details').click();await p.locator('#bot-settings').click();
  await p.getByRole('combobox',{name:'Local desktop',exact:true}).locator('option[value="'+a+'"]').waitFor({state:'attached'});
  assert.equal(await p.getByRole('combobox',{name:'Local desktop',exact:true}).inputValue(),a);assert.equal(await p.getByRole('combobox',{name:'Model',exact:true}).inputValue(),'claude-sonnet-5');assert(await p.locator('.bot-edit-form').getByLabel('Local access',{exact:true}).isChecked());
  assert.match(await p.locator('.local-access-help').textContent(),/stays assigned while unavailable/);await p.locator('#details-close').click();
  delivered=true;phase='worry';started=Math.floor(Date.now()/1000)-4;await p.getByText(/The last command timed out/).waitFor();
  assert.equal(await p.locator('.work-line').count(),1);assert.match(await p.locator('.message-delivery').textContent(),/included in this task/);
  await p.getByText('Command timed out · checking the failure',{exact:true}).waitFor();assert.equal(await p.locator('.work-label.working-glimmer').count(),0);
  phase='waiting';started=Math.floor(Date.now()/1000)-2;await p.getByText('Waiting for permission on Demo workstation',{exact:true}).waitFor();assert.equal(await p.locator('.work-line .character').getAttribute('data-action'),'waiting');
  phase='working';started=Math.floor(Date.now()/1000)-158;await p.getByText('Searching',{exact:true}).waitFor();assert.match(await p.locator('.work-timer').textContent(),/^2m\d{2}s$/);
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.screenshot({path:path.join(artifacts,engine+'-command-progress-light.png')});
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(artifacts,engine+'-command-progress-mobile.png')});assert(await p.locator('.work-line').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  const lost=p.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).pathname==='/api/activity'});offline=true;await lost;await p.waitForTimeout(150);
  await p.clock.fastForward(17000);await p.waitForTimeout(150);
  assert.match(await p.locator('.work-label').textContent(),/Connection lost/);assert.equal(await p.locator('.work-label.working-glimmer').count(),0);
  const paused=await p.locator('.work-timer').textContent();await p.clock.fastForward(5000);assert.equal(await p.locator('.work-timer').textContent(),paused);
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine,oneWorker:true,elapsedTimer:true,terminalMorph:true,clearFailureAndApproval:true,followupDelivery:true,offlineAssignmentPersists:true,allDesktops:true,cleanModelChoices:true,savedFixedVersionPreserved:true,staleConnectionHonest:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
