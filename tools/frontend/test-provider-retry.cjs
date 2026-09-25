const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/provider-retry');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh,updateWorkLabel};'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false},run={id:'retry-run',bot_id:'piper',chat_id:'dm-piper',prompt:'Finish my report.',status:'running',error:'',output:'',created:now};
  let attempt=1,posts=0,resumed=false,reject=true;
  await page.route(origin+'/api/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/runs/retry-run/continue'){posts++;if(reject){reject=false;return route.fulfill({status:503,json:{error:'Temporary fixture failure'}});}await new Promise(r=>setTimeout(r,150));resumed=true;return send({run_id:'next'});}
   if(name==='/runs')return send(resumed?[run,{...run,id:'next',status:'queued',error:''}]:[run]);
   if(name.startsWith('/runs/'))return send({run:name.endsWith('/next')?{...run,id:'next',status:'queued',error:''}:run,events:[],attachments:[],approvals:[]});
   if(name==='/activity')return send({piper:{run_id:run.id,status:run.status,label:'Thinking it through',shape:'think',server_time:now,started_at:now,provider_retry:attempt?{attempt,limit:5,phase:'retrying'}:null}});
   if(name==='/chats')return send([chat]);
   if(name==='/chats/dm-piper')return send({chat,messages:[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now},...(run.status==='failed'?[{seq:2,sender:'piper',kind:'result',text:run.error,run_id:run.id,created:now,status_notice:{label:'Task failed',text:run.error,...(resumed?{continued_by:'next'}:{})}}]:[]),...(resumed?[{seq:3,sender:'user',kind:'continuation',text:'Continuing task',run_id:'next',created:now}]:[])],page:{has_before:false,has_after:false}});
   return route.continue();
  });
  const refresh=()=>page.evaluate(async()=>{await(await import('/app.js')).refresh(true);});
  await page.goto(origin);
  for(attempt=1;attempt<=5;attempt++){
   await refresh();await page.getByText(`Connection issue - retrying (${attempt}/5)`,{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Continue task',exact:true}).count(),0);assert.equal(await page.locator('.provider-retry-dots').count(),1);
  }
  attempt=3;await refresh();await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(out,engine+'-retrying.png')});
  const stable=await page.evaluate(async()=>{const label=document.querySelector('.provider-retrying'),dots=label.querySelector('.provider-retry-dots');(await import('/app.js')).updateWorkLabel(label);return label.querySelector('.provider-retry-dots')===dots;});assert(stable,'activity refresh must not restart dot animation');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);assert.equal(await page.locator('.provider-retry-dots>span').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  attempt=0;await refresh();assert.equal(await page.locator('.provider-retrying').count(),0);assert.equal(await page.locator('.provider-retry-dots').count(),0);
  run.status='failed';run.error='Connection issue - 5 retries failed.';await refresh();const retry=page.getByRole('button',{name:'Retry',exact:true});await retry.waitFor();
  assert.equal(await page.getByText('Task failed',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Continue task',exact:true}).count(),0);assert.equal(await retry.locator('svg').count(),1);
  await page.screenshot({path:path.join(out,engine+'-exhausted.png')});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await retry.click();await page.locator('#notice').filter({hasText:'Temporary fixture failure'}).waitFor();assert(await retry.isEnabled());
  await retry.evaluate(b=>{b.click();b.click();});await page.locator('.task-recovery-history').waitFor();assert.equal(await page.locator('.task-continuation').count(),0);assert.equal(posts,2,'failed request plus one guarded retry');assert.equal(await page.locator('.continue-task-dialog').count(),0);assert.equal(await page.locator('.task-recovery-history').count(),1);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,fiveRetryStates:true,recoveryClearsStatus:true,animatedDotsStable:true,reducedMotion:true,compactFailure:true,directRetry:true,doubleClickGuard:true,failedRequestRecoverable:true,mobile:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
