const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}});p.setDefaultTimeout(10000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const now=Math.floor(Date.now()/1000);let cancelled=0,deny=true;
  let jobs=[{id:'process-one',title:'Building the report',run_id:'run-screenshot',bot_id:'piper',seen:now,status:'running',progress:{text:'phase one\n<em>untrusted output</em>',elapsed_seconds:10}}];
  await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat,commands:jobs,messages:[{seq:1,sender:'user',text:'Build my report and summarize it when ready.',kind:'message',created:now}],page:{has_before:false,has_after:false}}}));
  await p.route(origin+'/api/activity',r=>r.fulfill({json:{piper:{status:'completed',shape:'waiting',label:'1 command running',commands:jobs.length,server_time:Math.floor(Date.now()/1000)}}}));
  await p.route(origin+'/api/commands/process-one/stop',r=>{cancelled++;if(deny)return r.fulfill({status:503,json:{error:'Temporary stop failure'}});jobs[0].stopping=true;return r.fulfill({json:{ok:true}});});
  await p.goto(origin);const card=p.locator('.command-wait');await card.waitFor();
  assert.equal(await card.getByText('Waiting for 1 command',{exact:true}).count(),1);
  const details=card.locator('details');assert.equal(await details.evaluate(e=>e.open),false);
  await details.locator('summary').click();await card.getByText('Building the report · 10s',{exact:true}).waitFor();
  assert.equal(await card.locator('pre').count(),0);assert(!(await card.innerText()).includes('phase one'));
  assert.equal(await card.evaluate(e=>e.classList.contains('message-group')),false);
  jobs[0].progress.elapsed_seconds=20;jobs[0].seen=Math.floor(Date.now()/1000);
  await card.getByText('Building the report · 20s',{exact:true}).waitFor();assert.equal(await details.evaluate(e=>e.open),true);
  await card.getByRole('button',{name:'Stop Building the report',exact:true}).click();await p.getByText('Temporary stop failure',{exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'Stop Building the report',exact:true}).isDisabled(),false);
  deny=false;await card.getByRole('button',{name:'Stop Building the report',exact:true}).click();await card.getByText('Building the report · stopping',{exact:true}).waitFor();assert.equal(cancelled,2);
  // Several background commands stay as single grey rows, below active work.
  jobs=Array.from({length:6},(_,i)=>({...jobs[0],id:'process-'+i,title:'Command '+(i+1),stopping:false}));
  const run={id:'active-work',bot_id:'piper',chat_id:chat.id,prompt:'Work while commands run',status:'running',output:'',error:'',created:now,depth:0};
  await p.route(origin+'/api/runs',r=>r.fulfill({json:[run]}));
  await p.route(origin+'/api/runs/active-work',r=>r.fulfill({json:{run,events:[],attachments:[],approvals:[]}}));
  await p.route(origin+'/api/activity',r=>r.fulfill({json:{piper:{run_id:run.id,status:'running',shape:'read',label:'Reading the project',commands:jobs.length,server_time:Math.floor(Date.now()/1000)}}}));
  await card.getByText('Waiting for 6 commands',{exact:true}).waitFor();await p.getByText('Reading the project',{exact:true}).waitFor();
  assert.equal(await card.locator('.command-wait-row').count(),6);
  assert(await p.evaluate(()=>document.querySelector('.work-line').getBoundingClientRect().bottom<=document.querySelector('.command-wait').getBoundingClientRect().top));
  assert.equal(await card.locator('.command-wait-row').first().evaluate(e=>getComputedStyle(e).color),await card.evaluate(e=>getComputedStyle(e).color));
  for(const width of [1100,390]){
   await p.setViewportSize({width,height:850});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const out=process.env.KINDRED_TEST_ARTIFACTS;if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,`${process.env.WEBKIT?'webkit':'chromium'}-command-wait-${width}.png`)});}
  }
  jobs=[];await card.waitFor({state:'detached'});assert.deepEqual(errors,[]);
  console.log('PASS quiet waiting avatar, single-line grey details, active-work priority, no output flood, live updates, exact-command stop, responsive layout and completion removal');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
