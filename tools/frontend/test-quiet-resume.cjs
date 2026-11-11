const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();let release;
 try{
 const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.fixtureHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.fixtureHidden});const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+`
 window.resumeTest={age:()=>{state.activityReadAt=Date.now()-60000;updateReactions();},paint:()=>updateReactions(),readAt:()=>state.activityReadAt,deadline:()=>activityResumeUntil,refresh:()=>refresh(true),poll:()=>refreshActivityPoll(true),error:async(status)=>{const old=refresh;refresh=async()=>{const e=new Error('fixture');e.status=status;throw e;};try{await refreshActivityPoll();return 'quiet';}catch{return 'visible';}finally{refresh=old;}}};
 `}));
 const now=Math.floor(Date.now()/1000),run={id:'work',bot_id:'piper',chat_id:'dm-piper',prompt:'Review files',status:'running',output:'',error:'',created:now-90,depth:0};let hold=false;
 await p.route(origin+'/api/runs',r=>r.fulfill({json:[run]}));
 await p.route(origin+'/api/runs/work*',r=>r.fulfill({json:{run,events:[],attachments:[],approvals:[]}}));
 await p.route(origin+'/api/activity',async r=>{if(hold)await new Promise(resolve=>release=resolve);try{await r.fulfill({json:{piper:{run_id:'work',status:'running',shape:'read',label:'Reading the files',server_time:now,started_at:now-20}}});}catch{}});
 await p.goto(origin);await p.locator('.work-label').first().waitFor();await p.waitForTimeout(450);await p.locator('#prompt').fill('Keep my draft');
 // An uninterrupted, visible outage must still be reported.
 await p.evaluate(()=>resumeTest.age());assert.match(await p.locator('.work-label').first().textContent(),/Connection lost/);
 const readAt=await p.evaluate(()=>resumeTest.readAt());
 await p.evaluate(()=>{fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
 assert.doesNotMatch(await p.locator('.work-label').first().textContent(),/Connection lost/);
 hold=true;await p.evaluate(()=>{fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 await p.waitForFunction(()=>resumeTest.deadline()>Date.now());
 assert.doesNotMatch(await p.locator('.work-label').first().textContent(),/Connection lost/);assert.equal(await p.evaluate(()=>resumeTest.readAt()),readAt,'Grace never falsifies snapshot freshness');
 // The timer remains paused even though the alarming label is suppressed.
 const timer=await p.locator('.work-timer').first().textContent();
 await p.clock.install();await p.clock.fastForward(5000);await p.evaluate(()=>{dispatchEvent(new Event('focus'));resumeTest.paint();});assert.equal(await p.locator('.work-timer').first().textContent(),timer);
 const deadline=await p.evaluate(()=>resumeTest.deadline());await p.evaluate(()=>dispatchEvent(new Event('online')));assert.equal(await p.evaluate(()=>resumeTest.deadline()),deadline,'Repeated foreground signals cannot extend recovery');
 assert.equal(await p.evaluate(()=>resumeTest.error()),'quiet');assert.equal(await p.evaluate(()=>resumeTest.error(503)),'quiet');assert.equal(await p.evaluate(()=>resumeTest.error(401)),'visible');assert.equal(await p.evaluate(()=>resumeTest.error(403)),'visible');
 await p.clock.fastForward(6000);await p.evaluate(()=>resumeTest.paint());assert.match(await p.locator('.work-label').first().textContent(),/Connection lost/);
 assert.equal(await p.evaluate(()=>resumeTest.error()),'visible','Real failed recovery remains visible');
 hold=false;release?.();release=null;await p.evaluate(()=>resumeTest.refresh());await p.waitForFunction(()=>!document.querySelector('.work-label').textContent.includes('Connection lost'));
 // Successful resume clears the grace period and leaves the composer intact.
 await p.evaluate(()=>{fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await p.clock.fastForward(20000);await p.evaluate(()=>{resumeTest.age();fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>resumeTest.deadline()===0);assert.doesNotMatch(await p.locator('.work-label').first().textContent(),/Connection lost/);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my draft');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({engine,passed:true,silentResume:true,boundedRecovery:true,uninterruptedOutageVisible:true,snapshotAgePreserved:true,timerPaused:true,authErrorsVisible:true,draftPreserved:true}));
 }finally{release?.();await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
