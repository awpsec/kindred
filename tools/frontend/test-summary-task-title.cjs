const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/task-titles';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const run={id:'summary-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-240,prompt:'Go through my Gmail, find the recurring bills, and set up a couple of useful filters. Leave existing messages alone.',task_title:'Set up Gmail bill filters',output:'',error:'',progress_started:now-240};
  let omitRun=false;
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},...[2,3,4,5].map((seq,i)=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:now-230+i*50,text:['I am checking recurring bills and existing labels.','I found two recurring senders. The filters will label incoming mail only.','The first filter is saved. I am checking the second sender.','Both filters are saved. I am verifying their settings.'][i],progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'phase-review',task_title:run.task_title}}))];
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send(omitRun?[]:[run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  const heading=p.locator('.summary-progress-task'),name=p.locator('.summary-progress-name');
  const load=async()=>{await p.goto(origin);await heading.waitFor();};
  const anim=()=>name.evaluate(n=>({color:getComputedStyle(n).color,animation:getComputedStyle(n).animationName,working:n.classList.contains('is-working')}));
  await load();assert.equal(await heading.innerText(),run.task_title);assert(!(await heading.innerText()).includes(run.prompt));
  assert.equal((await anim()).animation,'summary-task-shimmer');
  run.task_title='Organize recurring bills';
  await p.waitForFunction(()=>document.querySelector('.summary-progress-task')?.textContent==='Organize recurring bills',{},{timeout:12000});
  run.status='awaiting_user';
  await p.waitForFunction(()=>!document.querySelector('.summary-progress-name')?.classList.contains('is-working'),{},{timeout:12000});
  run.status='running';run.task_title='Set up Gmail bill filters';
  await p.waitForFunction(()=>document.querySelector('.summary-progress-name')?.classList.contains('is-working'),{},{timeout:12000});
  // Inspect both the quiet interval and the brief sweep in the actual app.
  for(const theme of ['light','dark'])for(const width of [1100,390]){
   await p.setViewportSize({width,height:760});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await name.evaluate(n=>{const a=n.getAnimations()[0];a.pause();a.currentTime=4900;});
   assert(await heading.evaluate(n=>n.getBoundingClientRect().right<=innerWidth),'Header stays within viewport');
   await p.screenshot({path:path.join(out,`${engine}-${theme}-${width}-working.png`)});
  }
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal((await anim()).animation,'none');assert.notEqual((await anim()).color,'rgba(0, 0, 0, 0)');
  await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>document.documentElement.dataset.motion='off');assert.equal((await anim()).animation,'none');assert.notEqual((await anim()).color,'rgba(0, 0, 0, 0)');
  for(const status of ['awaiting_user','awaiting_approval','queued','cancelling','completed','failed','cancelled','interrupted']){
   run.status=status;await load();assert.equal((await anim()).working,false,status+' must not shimmer');assert.equal(await heading.innerText(),run.task_title);
  }
  // Title in historical message metadata works when the old run leaves /api/runs.
  omitRun=true;run.task_title='';await load();assert.equal(await heading.innerText(),'Set up Gmail bill filters');
  for(const m of messages)if(m.progress)delete m.progress.task_title;
  await load();assert.equal(await heading.innerText(),'Task progress');
  // Titles are plain text even if a model supplies markup.
  omitRun=false;run.task_title='<b>Review filters</b>';await load();assert.equal(await heading.innerText(),run.task_title);assert.equal(await heading.locator('b').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,historyTitle:true,allTerminalAndWaitingStates:true,reducedMotion:true,lightDark:true,desktopMobile:true,plainText:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
