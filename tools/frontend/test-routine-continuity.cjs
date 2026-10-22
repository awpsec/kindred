const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message)});p.setDefaultTimeout(30000);
  let routines=Array.from({length:12},(_,i)=>({id:'r'+i,bot_id:'piper',name:i?'Routine '+i:'Morning review',prompt:'Check status.',interval_seconds:86400,enabled:true})),posts=0,release,failRead=false;
  await ctx.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await ctx.route(origin+'/api/routines**',async route=>{const req=route.request();if(req.method()==='POST'){posts++;await new Promise(r=>release=r);return route.fulfill({json:{run_id:'manual'}});}if(failRead)return route.fulfill({status:500,json:{error:'temporary offline'}});return route.fulfill({json:routines});});
  await ctx.route(origin+'/api/inbox-monitors',r=>r.fulfill({json:{items:[],provider_sources:[]}}));await ctx.route(origin+'/api/composio',r=>r.fulfill({json:{configured:true,apps:[]}}));
  await p.goto(origin);await p.getByRole('button',{name:'Settings',exact:true}).click();await p.locator('[data-settings-page="routines"]').click();
  const card=p.locator('#settings-content [data-routine-id="r0"]'),run=card.locator('[data-routine-action="run"]');try{await run.click();}catch(e){console.error(await p.locator('#settings-content').innerText());throw e;}await p.waitForFunction(()=>document.querySelector('#settings-content [data-routine-id="r0"] [data-routine-action="run"]').disabled);
  // Switch surfaces while the RPC is still outstanding, then attempt another run.
  await p.locator('#settings-close').click();await p.locator('#show-computer').click();const computer=p.locator('#computer-routines [data-routine-id="r0"]');await computer.waitFor();assert(await computer.locator('[data-routine-action="run"]').isDisabled());await computer.locator('[data-routine-action="run"]').evaluate(b=>b.click());assert.equal(posts,1);
  routines[0].last_run={id:'manual',status:'queued'};release();await computer.getByRole('button',{name:'Queued',exact:true}).waitFor();
  const dir=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results');fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,engine+'-routine-queued.png')});
  await p.locator('#computer-close').click();await p.locator('#bot-details').click();await p.locator('#details-content [data-routine-id="r0"] .routine-flight-status').getByText('Queued',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Settings',exact:true}).click();await p.locator('[data-settings-page="routines"]').click();await card.waitFor();
  await card.evaluate(el=>{window.retainedRoutine=el;window.retainedRun=el.querySelector('[data-routine-action="run"]');});
  const edit=card.locator('[data-routine-action="edit"]');await edit.focus();
  await card.evaluate(el=>{const text=el.querySelector('.routine-name').firstChild;getSelection().setBaseAndExtent(text,0,text,7);const root=el.closest('#settings-content');root.scrollTop=100;window.routineScroll=root.scrollTop;});
  // Drive the production 15-second refresh through the existing page handler.
  routines[0].last_run={id:'manual',status:'running'};await p.locator('[data-settings-page="routines"]').evaluate(b=>b.click());await card.getByRole('button',{name:'Running',exact:true}).waitFor();
  assert(await card.evaluate(el=>el===window.retainedRoutine&&el.querySelector('[data-routine-action="run"]')===window.retainedRun));
  assert(await edit.evaluate(el=>document.activeElement===el));assert.equal(await p.evaluate(()=>getSelection().toString()),'Morning');assert(await p.evaluate(()=>Math.abs(document.querySelector('#settings-content').scrollTop-window.routineScroll)<=1));
  // Editor closes back onto the retained originating control.
  await edit.click();await p.locator('#routine-dialog').getByRole('button',{name:'Close routine'}).click();assert(await edit.evaluate(el=>document.activeElement===el));
  routines[0].last_run={id:'manual',status:'completed'};await p.locator('[data-settings-page="routines"]').click();await card.getByRole('button',{name:'Run now',exact:true}).waitFor();assert(!await run.isDisabled());
  failRead=true;await p.locator('[data-settings-page="routines"]').click();await p.locator('.routine-refresh-error').waitFor();assert.equal(await p.locator('#settings-content .routine-card').count(),12);failRead=false;await p.locator('.routine-refresh-error').getByRole('button',{name:'Retry'}).click();await p.locator('.routine-refresh-error').waitFor({state:'detached'});
  await p.screenshot({path:path.join(dir,engine+'-routine-continuity.png')});assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,crossSurfaceFlight:true,duplicateSuppressed:posts===1,ackNotCompletion:true,keyedRows:true,editorFocus:true,refreshFailurePreservesRows:true}));await ctx.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
