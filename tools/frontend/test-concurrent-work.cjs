const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await (process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:900}}),p=await context.newPage();p.setDefaultTimeout(7000);const errors=[],stops=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=['piper','leo'].map(id=>({id,name:id==='piper'?'Piper':'Leo',provider:'codex',model:'test',profile:{shape:'round',color:id==='piper'?'#2475ff':'#16867c'}}));
  const chat={id:'dm-piper',name:'Concurrent work',members:bots.map(b=>b.id),archived:false};
  const runs=bots.map((b,i)=>({id:'task-'+b.id,bot_id:b.id,chat_id:chat.id,prompt:'Independent shell '+b.name,status:'running',output:'',error:'',created:now-30-i*40,round_id:'independent-'+b.id,depth:0}));
  let refreshFails=false;const messages=()=>runs.map((r,i)=>({seq:i+1,sender:'user',kind:'message',text:r.prompt,run_id:r.id,created:r.created}));
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/api/**',route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send([chat]);
   if(name==='/settings')return send({name:'You',theme:'dark',reduced_motion:true,approval_mode:'ask'});
   if(name==='/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});
   if(name==='/runs'){if(refreshFails)return route.fulfill({status:503,json:{error:'Task status temporarily unavailable'}});return send(runs);}
   if(name==='/activity')return send(Object.fromEntries(runs.map(r=>[r.bot_id,{run_id:r.id,status:r.status,shape:r.status==='cancelling'?'waiting':'terminal',label:r.status==='cancelling'?'Stopping…':'Running '+r.bot_id+' shell',started_at:r.created,server_time:Math.floor(Date.now()/1000)}])));
   for(const r of runs){
    if(name==='/runs/'+r.id)return send({run:r,events:[],attachments:[],approvals:[]});
    if(name==='/runs/'+r.id+'/cancel'){stops.push(r.id);r.status='cancelling';return send({ok:true});}
   }
   return route.continue();
  });
  await p.goto(origin);await p.getByRole('button',{name:'Stop task for Leo',exact:true}).waitFor();assert.equal(await p.locator('.work-line').count(),2);
  assert(await p.getByText('Running piper shell',{exact:true}).isVisible());assert(await p.getByText('Running leo shell',{exact:true}).isVisible());
  await p.getByRole('button',{name:'Stop task for Piper',exact:true}).locator('..').hover();await p.getByRole('button',{name:'Stop task for Piper',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('Stop requested'));
  assert.equal(runs[0].status,'cancelling');assert.equal(runs[1].status,'running');assert.deepEqual(stops,['task-piper']);
  const piperStop=p.getByRole('button',{name:'Stopping task for Piper',exact:true});assert(await piperStop.isDisabled());
  assert(await p.getByRole('button',{name:'Stop task for Leo',exact:true}).isEnabled());
  await p.setViewportSize({width:390,height:900});await p.screenshot({path:path.join(out,engine+'-independent-stop.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // An accepted second stop stays pending if its status refresh fails.
  refreshFails=true;await p.getByRole('button',{name:'Stop task for Leo',exact:true}).locator('..').hover();await p.getByRole('button',{name:'Stop task for Leo',exact:true}).click();
  await p.getByText(/Stop requested.*could not refresh/i).waitFor();assert(await p.getByRole('button',{name:'Stopping task for Leo',exact:true}).isDisabled());assert.deepEqual(stops,['task-piper','task-leo']);
  refreshFails=false;runs.forEach(r=>{r.status='cancelled';r.error='Stopped by user';});
  await p.getByRole('button',{name:'Stopping task for Leo',exact:true}).waitFor({state:'detached'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,twoIndependentTasks:true,stopTargetsExactRun:true,noPrematureStoppedClaim:true,acceptedStopSurvivesRefreshFailure:true,mobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
