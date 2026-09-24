const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:950}}),p=await context.newPage();p.setDefaultTimeout(10000);const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  let items=[],connected=true;
  const scheduled={id:'daily',bot_id:'piper',name:'Daily review',prompt:'Review my work',interval_seconds:86400,enabled:true,next_run:Math.floor(Date.now()/1000)+86400};
  const now=()=>Math.floor(Date.now()/1000);
  await context.route(origin+'/**',route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/identity/meta')return send({profiles:false});
   if(u.pathname==='/api/composio')return send({configured:true,apps:connected?[{id:'gmail',accounts:[{id:'ca_work',name:'Work',status:'ACTIVE'}]}]:[]});
   if(u.pathname==='/api/routines')return send([scheduled,...items.map(w=>({id:w.id,bot_id:w.bot_id,name:w.name,enabled:w.enabled,trigger:'activity',frequency:'Constant',monitor:w}))]);
   if(u.pathname==='/api/inbox-monitors'){
    if(req.method()==='GET')return send({items,public_url:'https://kindred.example.test',minimum_check_seconds:15});
    const v=req.postDataJSON();writes.push(v);assert.equal(v.bot_id,'piper');assert.equal(v.account_id,'ca_work');assert(v.instructions);assert(!('status'in v));
    const w={...v,id:'11111111-2222-4333-8444-555555555555',status:v.enabled?(v.mode==='push'?'waiting_for_push':'fast'):'paused',mailbox:'work@example.test',checked_at:now(),next_check:now()+15,push_at:0,pending_messages:0,error:'',callback_url:v.mode==='push'?'https://kindred.example.test/hooks/gmail/11111111-2222-4333-8444-555555555555':''};items=[w];return send(w);
   }
   if(u.pathname.endsWith('/pause')){items[0].enabled=false;items[0].status='paused';return send({paused:true});}
   if(u.pathname.endsWith('/check')){items[0].checked_at=now();return send(items[0]);}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.locator('#settings-button').click();await p.locator('#settings-nav').getByRole('button',{name:'Routines',exact:true}).click();
  await p.getByRole('button',{name:'Daily review',exact:true}).waitFor();await p.getByRole('button',{name:'Add routine',exact:true}).click();await p.locator('#routine-form').getByLabel('Schedule',{exact:true}).selectOption('activity');const d=p.locator('.inbox-monitor-dialog');
  assert.equal(await d.getByLabel('Detection',{exact:true}).inputValue(),'fast');await d.getByLabel('Routine name').fill('Important work mail');
  await d.getByRole('button',{name:'Create routine',exact:true}).click();await d.waitFor({state:'detached'});await p.locator('.monitor-heading').getByText('Monitoring',{exact:true}).waitFor();assert.equal(await p.locator('.monitor-row').getAttribute('open'),null);assert((await p.locator('.monitor-heading').boundingBox()).height<40);await p.screenshot({path:path.join(artifacts,'inbox-monitors-'+engine+'-compact.png')});await p.locator('.monitor-heading').click();await p.getByText('Fast checks · every 15 seconds',{exact:true}).waitFor();assert.equal(writes.length,1);
  await p.locator('.monitor-row').getByRole('button',{name:'Pause',exact:true}).click();await p.locator('.monitor-heading').getByText('Paused',{exact:true}).waitFor();await p.getByRole('button',{name:'Resume',exact:true}).click();await p.getByText('Fast checks · every 15 seconds',{exact:true}).waitFor();assert.equal(writes.length,2);
  await p.getByRole('button',{name:'Edit',exact:true}).click();await d.getByLabel('Detection',{exact:true}).selectOption('push');await d.getByLabel('Pub/Sub topic').fill('projects/my-project/topics/inbox');await d.getByLabel('Push service account').fill('push@my-project.iam.gserviceaccount.com');
  await d.getByRole('button',{name:'Save routine',exact:true}).click();await d.waitFor({state:'detached'});await p.getByText('Waiting for push · fast checks active',{exact:true}).waitFor();
  await p.getByText('Google Cloud delivery setup',{exact:true}).click();assert((await p.getByLabel('Push endpoint').inputValue()).includes('/hooks/gmail/'));
  await p.screenshot({path:path.join(artifacts,'inbox-monitors-'+engine+'-desktop.png')});
  assert.equal(await p.locator('#settings-content .routine-assignee .character[data-bot-id="piper"]').count(),2);
  await p.locator('.monitor-row').getByRole('button',{name:'Edit',exact:true}).click();
  await d.locator('.dialog-header').getByRole('button',{name:'Close',exact:true}).click();await d.waitFor({state:'detached'});
  await p.locator('#settings-nav').getByRole('button',{name:'Skills',exact:true}).click();
  await p.getByRole('button',{name:'Add skill',exact:true}).click();await p.locator('.skill-dialog').waitFor({state:'visible'});
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'}),m=await mobile.newPage();
  await mobile.route(origin+'/**',route=>{
   const u=new URL(route.request().url());if(u.pathname==='/identity/meta')return route.fulfill({json:{profiles:false}});
   if(u.pathname==='/api/composio')return route.fulfill({json:{configured:true,apps:[]}});
   if(u.pathname==='/api/settings')return route.fulfill({json:{name:'You',theme:'light',approval_mode:'auto',notifications:'all'}});
   if(u.pathname==='/api/routines')return route.fulfill({json:[]});
   if(u.pathname==='/api/inbox-monitors')return route.fulfill({json:{items:[],public_url:'https://kindred.example.test'}});
   return route.continue();
  });
  await mobile.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await m.goto(origin);await m.locator('#app').waitFor({state:'visible'});await m.locator('#mobile-menu').click();await m.locator('#settings-button').click();await m.locator('#settings-nav').getByRole('button',{name:'Routines',exact:true}).click();await m.getByRole('heading',{name:'Monitors',exact:true}).waitFor();
  await m.getByRole('button',{name:'Add routine',exact:true}).click();await m.locator('#routine-form').getByLabel('Schedule',{exact:true}).selectOption('activity');assert(await m.locator('.inbox-monitor-dialog').getByRole('button',{name:'Create routine',exact:true}).isDisabled());
  await m.locator('.inbox-monitor-dialog').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
  await m.screenshot({path:path.join(artifacts,'inbox-monitors-'+engine+'-mobile.png')});assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,inboxRoutines:'passed',unifiedScheduledAndActivity:true,constantFrequency:true,saved:writes.length,pausedResumed:true,nativePushSetup:true,missingAccount:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
