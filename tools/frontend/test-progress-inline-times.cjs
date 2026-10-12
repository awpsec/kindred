const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/task-titles';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:760},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const run={id:'summary-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-240,prompt:'Go through my Gmail, find the recurring bills, and set up a couple of useful filters. Leave existing messages alone.',task_title:'Set up Gmail bill filters',output:'',error:'',progress_started:now-240};
  let omitRun=false;
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},...[2,3,4,5].map((seq,i)=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:now-230+i*50,text:['I am checking recurring bills and existing labels.','I found two recurring senders. The filters will label incoming mail only.','The first filter is saved. I am checking the second sender.','Both filters are saved. I am verifying their settings.'][i],progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'phase-review',task_title:run.task_title}}))];
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send(omitRun?[]:[run]);if(n==='/api/runs/'+run.id)return omitRun?r.fulfill({status:404,json:{error:'Not found'}}):send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);await p.locator('.progress-update-time-toggle').first().waitFor();
  const first=p.locator('.progress-update-time').first(),toggle=first.locator('button'),clock=first.locator('time');
  assert.equal(await toggle.innerText(),'10s');
  const before=await p.locator('.summary-progress-body').boundingBox();
  await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.equal(await first.getAttribute('data-pinned'),'true');
  await p.waitForTimeout(180);assert.equal(await clock.evaluate(n=>getComputedStyle(n).opacity),'1');
  const after=await p.locator('.summary-progress-body').boundingBox();assert.equal(before.height,after.height);
  assert.equal(await clock.getAttribute('datetime'),new Date(messages[1].created*1000).toISOString());
  await p.setViewportSize({width:390,height:844});await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.equal(await toggle.innerText(),'10s');
  assert(await first.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  run.created=0;run.progress_started=0;await p.reload();await p.locator('.summary-progress').waitFor();
  assert.equal(await p.locator('.progress-update-time-toggle').count(),0,'no invented elapsed when run metadata absent');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,fixedElapsed:true,tapReveal:true,noReflow:true,missingStart:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
