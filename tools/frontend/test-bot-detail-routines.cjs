const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
  const browser=await (process.env.WEBKIT?webkit:chromium).launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:940}}),p=await context.newPage();
    p.setDefaultTimeout(15000);const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
    const bots=['Piper','Atlas','Empty bot'].map((name,i)=>({id:['piper','orion','empty'][i],name,provider:'codex',model:'test',instructions:'',memory:'',profile:{shape:'round',color:'#2475ff',description:'',notifications:true}}));
    const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
    let scheduled=[
      {id:'daily',bot_id:'piper',name:'Morning review',prompt:'Review project status and alert me to deadlines.',interval_seconds:86400,enabled:true},
      {id:'weekly',bot_id:'piper',name:'Weekly planning and project delivery review',prompt:'Prepare the weekly plan.',interval_seconds:3600,enabled:false,schedule:{timezone:'America/New_York',days:[1,2,3,4,5],start:'09:00',end:'17:00',every_minutes:60}},
      {id:'once',bot_id:'piper',name:'Past check',prompt:'Check the deadline.',interval_seconds:60,enabled:false,run_at:1},
      {id:'other',bot_id:'orion',name:'Atlas only',prompt:'Private to Atlas.',interval_seconds:3600,enabled:true},
    ];
    let monitors=[{id:'mail',bot_id:'piper',account_id:'work',name:'Important inbox',instructions:'Alert me only when mail needs my response.',mode:'fast',enabled:true,status:'fast',error:''}];
    let rejectPatch=false,rejectDelete=false,delayPatch=null;
    await context.route(origin+'/**',async route=>{
      const req=route.request(),url=new URL(req.url()),name=url.pathname,method=req.method(),send=json=>route.fulfill({json});
      const body=req.postDataJSON();
      if(name==='/identity/meta')return send({profiles:false});
      if(name==='/api/bots')return send(bots);
      if(name==='/api/chats')return send(chats);
      if(name==='/api/runs')return send([]);
      if(name==='/api/activity')return send({});
      if(name.startsWith('/api/chats/'))return send({chat:chats.find(c=>c.id===name.slice(11)),messages:[]});
      if(name==='/api/routines')return send([...scheduled,...monitors.map(m=>({id:m.id,bot_id:m.bot_id,name:m.name,enabled:m.enabled,trigger:'activity',monitor:m}))]);
      if(name==='/api/composio')return send({configured:true,apps:[{id:'gmail',accounts:[{id:'work',name:'Work',status:'ACTIVE'}]}]});
      if(name==='/api/inbox-monitors'){
        if(method==='GET')return send({items:monitors,provider_sources:[]});
        writes.push({name,method,body});const m=monitors.find(m=>m.id===body.id);assert(m);assert(!('status' in body));Object.assign(m,body,{status:body.enabled?'fast':'paused'});return send(m);
      }
      const scheduledId=name.match(/^\/api\/routines\/([^/]+)$/)?.[1];
      if(scheduledId){
        writes.push({name,method,body});const r=scheduled.find(r=>r.id===scheduledId);assert(r);
        if(method==='PATCH'){
          if(delayPatch)await delayPatch;
          if(rejectPatch)return route.fulfill({status:400,json:{error:'Routine changed. Try again.'}});
          if(body.prompt!==undefined)assert.equal(body.expected_prompt,r.prompt);
          Object.assign(r,body);return send(r);
        }
        assert.equal(method,'DELETE');scheduled=scheduled.filter(r=>r.id!==scheduledId);return send({deleted:true});
      }
      const monitorId=name.match(/^\/api\/inbox-monitors\/([^/]+)(\/pause)?$/);
      if(monitorId){
        writes.push({name,method,body});const m=monitors.find(m=>m.id===monitorId[1]);assert(m);
        if(monitorId[2]){m.enabled=false;m.status='paused';return send({paused:true});}
        assert.equal(method,'DELETE');assert(!m.enabled,'Active monitor must pause before deletion');
        if(rejectDelete)return route.fulfill({status:400,json:{error:'Unable to remove monitor. Try again.'}});
        monitors=monitors.filter(m=>m.id!==monitorId[1]);return send({removed:true});
      }
      return route.continue();
    });
    await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
    await p.goto(origin);await p.locator('#bot-details').click();
    const section=p.getByRole('region',{name:'Routines',exact:true}),row=id=>section.locator('[data-routine-id="'+id+'"]');
    await row('mail').waitFor();assert.equal(await section.locator('li').count(),4);assert.equal(await section.getByText('Atlas only').count(),0);
    assert.equal(await p.locator('#details-content > .detail-link').allTextContents().then(v=>v.join('|')),'Connections|Skills|Artifacts');
    assert.match(await row('weekly').textContent(),/Paused · Weekdays · Hourly · 09:00–17:00 · America\/New_York/);
    assert.equal(await row('daily').locator('button').count(),3);assert.equal(await row('daily').locator('button svg').count(),3);
    // Pause/resume, failed action recovery, and no double submits while pending.
    let releasePatch;delayPatch=new Promise(resolve=>releasePatch=resolve);
    await row('daily').getByRole('button',{name:'Pause Morning review',exact:true}).click();
    await p.waitForFunction(()=>[...document.querySelectorAll('[data-routine-id="daily"] button')].every(b=>b.disabled));
    releasePatch();delayPatch=null;
    await row('daily').getByRole('button',{name:'Resume Morning review',exact:true}).waitFor();assert(!scheduled[0].enabled);
    rejectPatch=true;await row('daily').getByRole('button',{name:'Resume Morning review',exact:true}).click();
    await p.locator('#notice').getByText('Routine changed. Try again.',{exact:true}).waitFor();assert(!scheduled[0].enabled);
    await p.waitForFunction(()=>!document.querySelector('[data-routine-id="daily"] button').disabled);
    rejectPatch=false;await row('daily').getByRole('button',{name:'Resume Morning review',exact:true}).click();await row('daily').getByRole('button',{name:'Pause Morning review',exact:true}).waitFor();
    // Edit a paused weekly routine in place, preserving its bot and paused state.
    await row('weekly').getByRole('button',{name:/^Edit /}).click();const editor=p.locator('#routine-dialog'),form=p.locator('#routine-form');
    assert.equal(await form.getByLabel('Assigned bot',{exact:true}).inputValue(),'piper');assert(await form.getByLabel('Assigned bot',{exact:true}).isDisabled());
    assert.equal(await form.getByLabel('What should your bot do?').inputValue(),'Prepare the weekly plan.');
    await form.getByLabel('Name',{exact:true}).fill('Weekly plan');await form.getByLabel('What should your bot do?').fill('Review projects and send a concise plan.');
    rejectPatch=true;await editor.getByRole('button',{name:'Save routine'}).click();await p.locator('#notice').getByText('Routine changed. Try again.',{exact:true}).waitFor();assert(await editor.isVisible());
    assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Weekly plan');rejectPatch=false;
    await editor.getByRole('button',{name:'Save routine'}).click();await editor.waitFor({state:'hidden'});await row('weekly').getByText('Weekly plan',{exact:true}).waitFor();
    assert(!scheduled[1].enabled);assert.equal(scheduled[1].prompt,'Review projects and send a concise plan.');assert.deepEqual(scheduled[1].schedule.days,[1,2,3,4,5]);
    assert(await p.locator('#details-panel').isVisible());assert(!await p.locator('#settings-dialog').isVisible());
    const beforeOnce=writes.length;await row('once').getByRole('button',{name:'Resume Past check',exact:true}).click();await editor.waitFor();assert.equal(writes.length,beforeOnce);await editor.getByRole('button',{name:'Close routine'}).click();
    // Activity routines use the same compact controls and their existing editor.
    await row('mail').getByRole('button',{name:'Pause Important inbox',exact:true}).click();await row('mail').getByRole('button',{name:'Resume Important inbox',exact:true}).waitFor();
    await row('mail').getByRole('button',{name:'Edit Important inbox',exact:true}).click();const monitorEditor=p.locator('.inbox-monitor-dialog');
    assert.equal(await monitorEditor.getByLabel('When should the bot alert you?').inputValue(),'Alert me only when mail needs my response.');
    await monitorEditor.getByLabel('Routine name').fill('Urgent mail');await monitorEditor.getByLabel('When should the bot alert you?').fill('Alert me to urgent client mail.');
    await monitorEditor.getByRole('button',{name:'Save routine',exact:true}).click();await monitorEditor.waitFor({state:'detached'});await row('mail').getByRole('button',{name:'Resume Urgent mail',exact:true}).waitFor();
    assert(!monitors[0].enabled);assert.equal(monitors[0].instructions,'Alert me to urgent client mail.');
    await row('mail').getByRole('button',{name:'Resume Urgent mail',exact:true}).click();await row('mail').getByRole('button',{name:'Pause Urgent mail',exact:true}).waitFor();
    // Layout: narrow panes, reading scale, light/dark, and keyboard-visible actions.
    for(const [width,theme] of [[1280,'dark'],[390,'light']]){
      await p.setViewportSize({width,height:940});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--text-scale','1.2');},theme);
      await section.scrollIntoViewIfNeeded();await row('weekly').getByRole('button',{name:'Edit Weekly plan',exact:true}).focus();
      assert(await row('weekly').getByRole('button',{name:'Edit Weekly plan',exact:true}).evaluate(b=>b===document.activeElement));
      assert(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await section.locator('button').evaluateAll(buttons=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.width>=30&&r.height>=30&&r.left>=0&&r.right<=innerWidth;})));
      await p.screenshot({path:path.join(artifacts,engine+'-bot-routines-'+width+'.png')});
    }
    await p.setViewportSize({width:1280,height:940});
    // Confirmation cancellation must not write. An active monitor is paused before deletion;
    // if delete fails, keep it visible as paused, ready to retry.
    const beforeCancel=writes.length;p.once('dialog',d=>d.dismiss());await row('daily').getByRole('button',{name:'Delete Morning review',exact:true}).click();assert.equal(writes.length,beforeCancel);
    rejectDelete=true;p.once('dialog',d=>d.accept());await row('mail').getByRole('button',{name:'Delete Urgent mail',exact:true}).click();
    await p.locator('#notice').getByText('Unable to remove monitor. Try again.',{exact:true}).waitFor();await row('mail').getByRole('button',{name:'Resume Urgent mail',exact:true}).waitFor();assert(!monitors[0].enabled);
    rejectDelete=false;p.once('dialog',d=>d.accept());await row('mail').getByRole('button',{name:'Delete Urgent mail',exact:true}).click();await row('mail').waitFor({state:'detached'});
    p.once('dialog',d=>d.accept());await row('daily').getByRole('button',{name:'Delete Morning review',exact:true}).click();await row('daily').waitFor({state:'detached'});assert(!scheduled.some(r=>r.id==='daily'));
    await p.locator('#bots').getByRole('button',{name:'Atlas',exact:true}).click();await row('other').waitFor();assert.equal(await section.locator('li').count(),1);
    await p.locator('#bots').getByRole('button',{name:'Empty bot',exact:true}).click();await section.getByText('No routines yet.',{exact:true}).waitFor();assert.equal(await section.locator('li').count(),0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,botScoped:true,pauseResume:true,editInPlace:true,pausedEditPreserved:true,expiredOnceGuard:true,monitorDeleteGuard:true,errorsRecover:true,emptyState:true,responsive:true,writes:writes.length}));
    await context.close();
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
