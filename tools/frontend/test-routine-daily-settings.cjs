const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}}),p=await ctx.newPage(),errors=[],writes=[];
  p.on('pageerror',e=>errors.push(e.message));
  let routines=[{id:'inbox',bot_id:'piper',name:'Workday Inbox Check',prompt:'Check mail.',interval_seconds:900,enabled:true,next_run:1790254800,schedule:{timezone:'America/New_York',days:[1,2,3,4,5],start:'09:00',end:'18:00',every_minutes:15}}];
  await ctx.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await ctx.route(origin+'/api/routines**',route=>{
   const req=route.request(),body=req.postDataJSON();
   if(req.method()==='POST'){writes.push(body);routines.unshift({...body,id:'brief',next_run:1790253900});return route.fulfill({json:routines[0]});}
   if(req.method()==='PATCH'){writes.push(body);Object.assign(routines.find(r=>r.id===new URL(req.url()).pathname.split('/').at(-1)),body,{next_run:Date.parse('2026-09-24T17:30:00-04:00')/1000});return route.fulfill({json:routines[0]});}
   return route.fulfill({json:routines});
  });
  await ctx.route(origin+'/api/inbox-monitors',r=>r.fulfill({json:{items:[],provider_sources:[]}}));
  await ctx.route(origin+'/api/composio',r=>r.fulfill({json:{configured:true,apps:[]}}));
  await p.goto(origin);
  await p.getByRole('button',{name:'Settings',exact:true}).click();
  await p.locator('[data-settings-page="routines"]').click();
  await p.getByRole('button',{name:'Add routine',exact:true}).click();
  const f=p.locator('#routine-form');
  assert.equal(await f.locator('[name=schedule_mode]').inputValue(),'daily');
  await f.locator('[name=name]').fill('Daily running list');
  await f.locator('[name=prompt]').fill('Prepare the morning brief.');
  await f.locator('[name=daily_time]').fill('08:45');
  await f.locator('[name=timezone]').fill('America/New_York');
  await f.getByRole('button',{name:'Save routine',exact:true}).click();
  await p.locator('#routine-dialog').waitFor({state:'hidden'});
  assert.deepEqual(writes[0].schedule,{timezone:'America/New_York',days:[1,2,3,4,5,6,7],start:'08:45',end:'08:45',every_minutes:1440});
  await p.locator('#settings-content').getByText('Every day at 8:45 AM · America/New_York',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Daily running list',exact:true}).click();
  assert.equal(await f.locator('[name=schedule_mode]').inputValue(),'daily');
  assert.equal(await f.locator('[name=daily_time]').inputValue(),'08:45');
  await f.locator('[name=daily_time]').fill('17:30');
  await f.getByRole('button',{name:'Save routine',exact:true}).click();
  await p.locator('#routine-dialog').waitFor({state:'hidden'});
  assert.equal(writes[1].schedule.start,'17:30');
  await p.locator('#settings-content').getByText('Every day at 5:30 PM · America/New_York',{exact:true}).waitFor();
  const dir=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results');fs.mkdirSync(dir,{recursive:true});
  for(const width of [1280,640,390]){
   await p.setViewportSize({width,height:1000});
   const bounds=await p.locator('#settings-content .routine-card-assigned').first().evaluate(el=>{
    const r=el.getBoundingClientRect(),a=el.querySelector('.row-actions').getBoundingClientRect(),c=el.querySelector('.routine-copy').getBoundingClientRect();
    return {overflow:el.scrollWidth>el.clientWidth+1,actionsInside:a.right<=r.right+1,overlap:a.left<c.right-1&&a.top<c.bottom-1};
   });
   assert(!bounds.overflow&&bounds.actionsInside&&!bounds.overlap,JSON.stringify({width,bounds}));
   await p.screenshot({path:path.join(dir,engine+'-routine-settings-'+width+'.png')});
  }
  await p.getByRole('button',{name:'Workday Inbox Check',exact:true}).click();
  assert.equal(await f.locator('[name=schedule_mode]').inputValue(),'window');
  assert.equal(await f.locator('[name=start]').inputValue(),'09:00');
  assert.equal(await f.locator('[name=end]').inputValue(),'18:00');
  assert.equal(await f.locator('[name=every_minutes]').inputValue(),'15');
  await f.getByRole('button',{name:'Save routine',exact:true}).click();
  await p.locator('#routine-dialog').waitFor({state:'hidden'});
  assert.equal(writes.at(-1).schedule,undefined,'Saving unchanged legacy routine must preserve its window');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,dailyCreateEdit:true,responsive:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
