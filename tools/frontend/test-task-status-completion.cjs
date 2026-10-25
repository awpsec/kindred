const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch(),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-task-completion';fs.mkdirSync(out,{recursive:true});const checks=[];
 try{for(const [name,width,column] of [['desktop',1183,0],['desktop-narrow-pane',1183,440],['mobile',390,0]]){
  const context=await browser.newContext({viewport:{width,height:620},...(name==='desktop'&&process.env.KINDRED_RECORD_PREVIEW?{recordVideo:{dir:out,size:{width,height:620}}}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,conversationHistory,summaryProgress,reconcileConversation,updateReactions};'}));
  await page.goto(origin);await page.locator('#content .message-group').first().waitFor();
  await page.evaluate(async column=>{
   const app=await import('/app.js'),bot=app.state.bots.find(b=>b.id==='piper'),now=Math.floor(Date.now()/1000);bot.name='Quellus';bot.profile={...bot.profile,color:'#8759f2'};
   const entry=app.conversationHistory('dm-piper'),host=document.createElement('div');if(column)host.style.width=column+'px';document.querySelector('#content').replaceChildren(host);
   const runs=['wapp-poc mock vulnerability video','Work on bot computer','Verify PoC render and deliver video'].map((task_title,i)=>({id:'status-'+i,bot_id:bot.id,chat_id:entry.id,status:i<2?'completed':'running',task_title,created:now-[1000,600,166][i]}));
   const markers=runs.map((run,i)=>({seq:900+i,sender:bot.id,kind:'task_progress',run_id:run.id,created:run.created,progress:{mode:'summaries',phase:'commentary',group_id:'status-group-'+i,task_title:run.task_title,work_qualified:true,...(i<2?{activity:{last_at:run.created+[288,390][i],completed:3,recent:[]}}:{})}}));
   const render=()=>{app.state.allRuns=runs;entry.messages=markers;const current=runs.at(-1);app.state.activities={piper:{run_id:current.id,status:current.status,shape:'wrench',label:'Making an adjustment',started_at:current.created,server_time:now}};app.state.activityReadAt=Date.now();const desired=document.createElement('div');for(const m of markers)desired.append(app.summaryProgress([m],entry,runs));app.reconcileConversation(host,desired);app.updateReactions();};
   render();window.statusFixture={app,host,runs,render,finish(){runs[2].status='completed';render();},continue(){runs[2].id+='-next';markers[2].run_id=runs[2].id;runs[2].status='running';render();}};
  },column);
  const active=page.locator('[data-progress-group="status-group-2"]'),status=active.locator('.summary-progress-live-status'),history=page.locator('[data-progress-group="status-group-0"]');
  await page.waitForTimeout(350);
  const initial=await active.evaluate(g=>{const h=g.querySelector('summary'),t=h.querySelector('.summary-progress-task').getBoundingClientRect(),s=h.querySelector('.summary-progress-live-status').getBoundingClientRect(),r=g.getBoundingClientRect();return {left:r.left,right:r.right,statusTop:s.top,titleTop:t.top,shimmer:getComputedStyle(h.querySelector('.summary-progress-live-status')).animationName};});
  assert.equal(initial.shimmer,'working-glimmer');assert(name==='desktop'?Math.abs(initial.statusTop-initial.titleTop)<3:initial.statusTop>initial.titleTop+5,'Status follows available chat width');
  const frozen=await history.locator('.character').evaluate(a=>({animated:a._character.p.animated,bot:a.dataset.botId,active:a._avatarHost.active(),svg:a.innerHTML}));assert.equal(frozen.animated,false);assert.equal(frozen.bot,undefined);assert.equal(frozen.active,false);
  await page.waitForTimeout(120);assert.equal(await history.locator('.character').innerHTML(),frozen.svg,'Historical avatar stays still while this bot is active');
  await page.locator('#content').screenshot({path:path.join(out,`${engine}-${name}-active-dark.png`)});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.locator('#content').screenshot({path:path.join(out,`${engine}-${name}-active-light.png`)});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  const avatarBefore=await history.locator('.character').elementHandle();await page.evaluate(()=>statusFixture.render());assert(await avatarBefore.evaluate(a=>a===document.querySelector('[data-progress-group="status-group-0"] .character')),'Refresh retains the static history avatar');
  await page.evaluate(()=>statusFixture.finish());await page.waitForTimeout(80);
  const during=await active.evaluate(g=>({margin:parseFloat(getComputedStyle(g).marginInlineStart),transitions:g.getAnimations().filter(a=>a.transitionProperty).map(a=>a.transitionProperty)}));assert(during.margin>0&&during.margin<20,'Completion moves both edges smoothly');
  await page.waitForTimeout(230);
  const ended=await active.evaluate(g=>{const r=g.getBoundingClientRect(),a=g.querySelector('.character');return {left:r.left,right:r.right,filter:getComputedStyle(g.querySelector('summary')).filter,animated:a._character.p.animated,registered:a.dataset.botId,animations:g.getAnimations({subtree:true}).filter(a=>a.playState==='running').length};});
  assert(ended.left<initial.left-10&&ended.right>initial.right+10,'Finished row extends toward both chat edges');assert.equal(ended.filter,'grayscale(1)');assert.equal(ended.animated,false);assert.equal(ended.registered,undefined);assert.equal(ended.animations,0);assert.equal(await status.count(),0);
  const stable=await active.locator('.character').innerHTML();await page.evaluate(()=>statusFixture.render());await page.waitForTimeout(120);assert.equal(await active.locator('.character').innerHTML(),stable,'Refresh never reanimates a completed task');assert.equal(await active.evaluate(g=>g.getAnimations().filter(a=>a.playState==='running').length),0,'Refresh never replays the edge transition');
  await page.locator('#content').screenshot({path:path.join(out,`${engine}-${name}-finished.png`)});
  await page.evaluate(()=>statusFixture.continue());await page.waitForTimeout(300);assert(await active.locator('.character').evaluate(a=>a._character.p.animated!==false&&a.dataset.botId==='piper'),'A real continuation restores the live avatar');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>statusFixture.finish());assert.equal(await active.evaluate(g=>parseFloat(getComputedStyle(g).marginInlineStart)),0,'OS reduce motion settles completion immediately');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{document.documentElement.dataset.motion='off';statusFixture.continue();});assert.equal(await status.evaluate(s=>getComputedStyle(s).animationName),'none');await page.evaluate(()=>statusFixture.finish());assert.equal(await active.evaluate(g=>parseFloat(getComputedStyle(g).marginInlineStart)),0,'App reduce motion settles completion immediately');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);checks.push({name,inline:name==='desktop',staticHistory:true,completion:ended,reducedMotion:true,refresh:true,continuation:true});
  const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,`${engine}-${name}-completion.webm`));
 }fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify({passed:true,engine,checks},null,2));console.log(JSON.stringify({passed:true,engine,checks}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
