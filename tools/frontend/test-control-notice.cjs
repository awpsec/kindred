const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_PLAYWRIGHT_CHANNEL||'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,...(process.env.KINDRED_PLAYWRIGHT_CHANNEL?{channel:process.env.KINDRED_PLAYWRIGHT_CHANNEL}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(15000);const errors=[],writes=[],sessions=[];p.on('pageerror',e=>errors.push(e.message));
  const bots=[['piper','Piper'],['iz','Izabella'],['viv','Vivienne']].map(([id,name])=>({id,name,provider:'codex',profile:{shape:'round',color:'#2475ff',archived:false}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
  const runs=[{id:'queued-viv',bot_id:'viv',chat_id:'dm-viv',status:'queued',prompt:'Queued work',output:'',error:'',created:1}];
  let pauses=[{bot_id:'iz',name:'Izabella',control_id:'legacy-1',reason:'',queued:0},{bot_id:'viv',name:'Vivienne',control_id:'viv-pause-1',reason:'open_app',queued:1}],fail=false;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);
   if(name.startsWith('/chats/'))return send({chat:chats.find(c=>c.id===name.slice(7)),messages:[]});
   if(name==='/runs')return send(runs);if(name==='/activity')return send({});
   if(name.startsWith('/runs/')){if(req.method()==='POST')writes.push({path:name,body:req.postDataJSON()});return send({run:runs[0],events:[],attachments:[],approvals:[]});}
   if(name==='/status'){const id=u.searchParams.get('bot_id');return send({version:'0.48.13',screen_bot_id:id,takeover:pauses.some(p=>p.bot_id===id),control_pauses:pauses,vm_enabled:true});}
   if(name==='/computer/session'){sessions.push(req.postDataJSON());return send({ticket:'fixture',control:req.postDataJSON().control});}
   if(name==='/computer/resources')return send({});
   if(name==='/takeover'){
    const body=req.postDataJSON();writes.push({path:name,body});
    if(fail){fail=false;return route.fulfill({status:503,json:{error:'Fixture could not return control. Try again.'}});}
    assert.equal(body.enabled,false);const current=pauses.find(p=>p.bot_id===body.bot_id);assert.equal(body.control_id,current.control_id);pauses=pauses.filter(p=>p.bot_id!==body.bot_id);return send({enabled:false});
   }
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const notice=p.locator('#control-notice');await p.locator('#content .empty').waitFor();assert(await notice.isHidden(),'Stored pauses do not cover the controls on startup');
  for(const name of ['Izabella','Vivienne']){
    await p.locator('#bots').getByRole('button',{name,exact:true}).click();await p.locator('#show-computer').click();await p.getByRole('button',{name:'Use screen',exact:true}).click();
    assert(await notice.isHidden(),'Rejoining a screen keeps controls clear');
    await p.locator('#computer-close').click();await notice.waitFor();
  }
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();assert.match(await notice.textContent(),/earlier action was not recorded/);assert.match(await notice.textContent(),/Opening an app paused/);
  await p.waitForTimeout(10500);assert(await notice.isVisible(),'Control notice outlives ordinary toast timers');assert.deepEqual(writes,[],'Reading/reopening does not take or return control');assert.equal(await p.locator('#notice.error:not([hidden])').count(),0);await p.locator('#content .empty').waitFor();
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(500);await p.screenshot({path:path.join(artifacts,engine+'-control-'+theme+'.png')});}
  await p.setViewportSize({width:390,height:844});const box=await notice.boundingBox();assert(box.x>=0&&box.x+box.width<=390);assert.equal(await notice.evaluate(n=>n.scrollWidth<=n.clientWidth),true);await p.screenshot({path:path.join(artifacts,engine+'-control-mobile.png')});await p.setViewportSize({width:1320,height:900});
  await notice.getByRole('button',{name:'Dismiss control notice',exact:true}).click();await p.waitForTimeout(3200);assert(await notice.isHidden());assert.deepEqual(writes,[]);
  await p.locator('#bots').getByRole('button',{name:'Vivienne',exact:true}).click();await p.locator('#queue-status').getByRole('button',{name:'Return control',exact:true}).waitFor();
  await p.locator('#show-computer').click();await p.getByRole('button',{name:'Use screen',exact:true}).click();
  for(let i=0;i<100&&!sessions.some(s=>s.control);i++)await p.waitForTimeout(20);assert(sessions.some(s=>s.bot_id==='viv'&&s.control));assert.deepEqual(writes,[],'Rejoining manual control must not cancel queued work');
  await p.locator('#computer-close').click();await notice.waitFor();
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();fail=true;
  await notice.getByRole('button',{name:'Return control to Vivienne',exact:true}).click();await notice.getByRole('alert').filter({hasText:'Fixture could not return control'}).waitFor();assert(await notice.isVisible());
  await notice.getByRole('button',{name:'Return control to Vivienne',exact:true}).click();await notice.getByRole('button',{name:'Return control to Vivienne',exact:true}).waitFor({state:'hidden'});assert.equal(writes.length,2);assert(writes.every(w=>w.path==='/takeover'&&w.body.bot_id==='viv'&&w.body.enabled===false));assert.equal(runs[0].status,'queued');assert.deepEqual(pauses.map(p=>p.bot_id),['iz']);
  await p.reload();await p.locator('#content .empty').waitFor();assert(await notice.isHidden(),'Reload waits for a new leave-pane gesture');
  await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();await p.locator('#queue-status').getByRole('button',{name:'Return control',exact:true}).click();await notice.waitFor({state:'hidden'});assert.equal(pauses.length,0);
  pauses=[{bot_id:'viv',name:'Vivienne',control_id:'viv-pause-2',reason:'manual',queued:1}];await p.locator('#bots').getByRole('button',{name:'Vivienne',exact:true}).click();await p.locator('#show-computer').click();await p.getByRole('button',{name:'Use screen',exact:true}).click();assert(await notice.isHidden());await p.locator('#computer-close').click();await notice.getByRole('button',{name:'Return control to Vivienne',exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.equal(await p.locator('#notice.error:not([hidden])').count(),0);await context.close();console.log(JSON.stringify({passed:true,engine,persistentPastToastTimeout:true,reloadWaitsForLeaveGesture:true,dismissDoesNotResume:true,returnActionRemainsInChat:true,exactBotReturnedAcrossNavigation:true,queuedWorkNotCancelled:true,otherPausesPreserved:true,failedReturnStaysActionable:true,newPauseReshows:true,mobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
