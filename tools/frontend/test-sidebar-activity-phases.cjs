const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await(engine==='webkit'?webkit:chromium).launch();
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,updateSidebarActivity};'}));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);await page.locator('#bots .bot-link').first().waitFor();
  const states=await page.evaluate(async()=>{
   const {state,updateSidebarActivity}=await import('/app.js');state.refreshing=true;
   const now=Date.now(),run={id:'phase-test',bot_id:'piper',chat_id:'dm-piper',status:'running',created:now/1000};
   state.allRuns=[run];state.activities={piper:{run_id:run.id,status:'running',shape:'think'}};state.activityReadAt=now;
   const row=document.createElement('span');row.dataset.sidebarActivity='piper';row.dataset.idlePreview='Last answer';document.body.append(row);
   const result=[],capture=name=>{updateSidebarActivity(row);result.push({name,text:row.textContent,dots:row.querySelectorAll('.sidebar-activity-dots').length,moving:!!row.querySelector('.is-moving')});};
   capture('reasoning');state.activities.piper.model_progress_state='writing';capture('streaming');delete state.activities.piper.model_progress_state;
   capture('reasoning again');state.activityReadAt=now-16000;capture('stale same label');state.activityReadAt=now;
   state.activities.piper.shape='read';capture('reading');state.activities.piper.shape='terminal';capture('command');
   run.status='awaiting_approval';capture('approval');run.status='awaiting_user';capture('question');run.status='queued';capture('queued');
   run.status='running';state.activities.piper.shape='think';state.activities.piper.run_id='old-run';capture('different run');state.activities.piper.run_id=run.id;
   state.activities.piper.local={phase:'awaiting_approval'};capture('local approval');delete state.activities.piper.local;
   state.activities.piper.provider_retry={phase:'retrying'};capture('retry');delete state.activities.piper.provider_retry;
   capture('restored');run.status='completed';capture('finished');row.remove();return result;
  });
  for(const r of states)assert.equal(r.dots,['reasoning','reasoning again','restored'].includes(r.name)?1:0,JSON.stringify(r));
  assert.match(states.find(r=>r.name==='approval').text,/approval/);assert.match(states.find(r=>r.name==='reading').text,/reading/);assert.equal(states.at(-1).text,'Last answer');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,states}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
