const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'test-results/reminder-notifications';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1180,height:850}}),errors=[],writes=[];let fail=false;
  let reminder={id:'reminder-test',chat_id:'dm-piper',bot_id:'piper',revision:2,message:'Leave for the station',timezone:'America/New_York',local_time:'2026-10-10T16:00',run_at:1791662400,delivered_at:1791662400,status:'delivered',sources:[]};
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_DESKTOP={platform:'macos'};window.__TAURI__={core:{invoke:async command=>command==='notification_status'?{enabled:true,notch:{supported:true,enabled:false}}:null}};},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {reminderCard,reminderBatch};'}));
  await p.route(url=>url.pathname==='/api/chats/dm-piper',async r=>{const original=await(await r.fetch()).json();original.messages=[{seq:1,sender:'user',text:'Remind me to leave for the station at 4 PM.',kind:'message',created:reminder.run_at-600},{seq:2,sender:'piper',text:'I’ll remind you at 4 PM.',kind:'message',created:reminder.run_at-599},{seq:3,sender:'piper',text:reminder.message,kind:'reminder',created:reminder.run_at,planning:reminder}];await r.fulfill({json:original});});
  await p.route(origin+'/api/chats/dm-piper/reminders/reminder-test',async r=>{const body=r.request().postDataJSON();writes.push(body);await new Promise(r=>setTimeout(r,60));if(fail)return r.fulfill({status:409,json:{error:'This reminder changed. Refresh its state before editing'}});assert.deepEqual(body,{expected_revision:2,dismiss:true});reminder={...reminder,revision:3,dismissed_at:Math.floor(Date.now()/1000)};await r.fulfill({json:reminder});});
  await p.route(origin+'/api/codex/account',r=>r.fulfill({json:{account:{type:'chatgpt',email:'you@example.com'}}}));
  await p.route(origin+'/api/provider-cli/claude-code/account',r=>r.fulfill({json:{connected:true,message:'you@example.com'}}));
  await p.route(origin+'/api/connections/decisions',r=>r.fulfill({json:{configured:true,source:'saved'}}));
  await p.route(origin+'/api/codex/connectors',r=>r.fulfill({json:{connections:[{display_name:'Calendar',status:'connected'}]}}));
  await p.route(origin+'/api/provider-cli/claude-code/connectors',r=>r.fulfill({json:{data:[{display_name:'Calendar',status:'connected'}]}}));
  await p.route(origin+'/api/composio',r=>r.fulfill({json:{configured:false,apps:[]}}));
  await p.goto(origin);await p.locator('#prompt').waitFor();await p.bringToFront();
  const card=p.locator('.reminder-card').first();await card.waitFor();
  await card.hover();await card.getByRole('button',{name:'Dismiss',exact:true}).waitFor();
  await p.screenshot({path:path.join(out,engine+'-reminder-delivered.png')});
  fail=true;await card.getByRole('button',{name:'Dismiss',exact:true}).click();await p.getByText('This reminder changed. Refresh its state before editing',{exact:true}).waitFor();assert.equal(await p.locator('.reminder-dismissed').count(),0);fail=false;
  await p.evaluate(()=>{
    window.dismissFrames=null;
    const observer=new MutationObserver(()=>{
      const el=document.querySelector('.reminder-dismissed'),motion=el?.getAnimations()[0];if(!motion)return;
      observer.disconnect();motion.pause();const values=[];
      for(const t of [0,40,100,180,239]){motion.currentTime=t;values.push({t,height:el.getBoundingClientRect().height,overflow:getComputedStyle(el).overflow});}
      window.dismissFrames=values;motion.finish();
    });observer.observe(document.getElementById('content'),{subtree:true,childList:true});
  });
  await card.hover();await card.getByRole('button',{name:'Dismiss',exact:true}).click();
  await p.waitForFunction(()=>window.dismissFrames);
  const frames=await p.evaluate(()=>window.dismissFrames);
  assert(frames.length,'Dismissal should animate');assert(frames[0].height>frames.at(-1).height+10);for(let i=1;i<frames.length;i++)assert(frames[i].height<=frames[i-1].height);assert(frames.every(f=>f.overflow==='hidden'));
  fs.writeFileSync(path.join(out,engine+'-collapse.json'),JSON.stringify(frames,null,2));
  await p.waitForTimeout(300);assert.equal(writes.length,2);
  assert(await p.locator('.reminder-dismissed-text').evaluate(n=>getComputedStyle(n).textDecorationLine.includes('line-through')));
  assert(await p.locator('.reminder-dismissed').evaluate(n=>n.getBoundingClientRect().height<40));
  await p.screenshot({path:path.join(out,engine+'-reminder-dismissed.png')});
  console.log('dismissal checked');await p.reload();await p.locator('.reminder-dismissed').waitFor();console.log('reload checked');await p.screenshot({path:path.join(out,engine+'-reminder-dismissed.png')});assert.equal(await p.getByRole('button',{name:'Dismiss',exact:true}).count(),0);
  await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByText('Notch notifications',{exact:true}).waitFor();assert.equal(await p.getByText('Replaces system banners and appears even during macOS Focus.',{exact:true}).count(),0);
  console.log('notch checked');await p.getByRole('button',{name:'Connections',exact:true}).click();
  for(const provider of ['codex','claude-code']){
   const account=p.locator('.ai-account[data-provider="'+provider+'"]');await account.locator('summary').click();await account.getByText('you@example.com',{exact:true}).waitFor();
   const section=account.locator('.connection-section').first();assert.equal(await section.locator('.catalog-model-list').evaluate(n=>getComputedStyle(n).display),'none');
   await section.getByRole('button',{name:/Refresh .* connectors/}).click();await section.getByText('Calendar',{exact:false}).first().waitFor();
   for(const width of [1180,390]){await p.setViewportSize({width,height:850});assert(await section.evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
   await p.setViewportSize({width:1180,height:850});
   await p.evaluate(()=>document.documentElement.dataset.theme='dark');await p.waitForTimeout(250);await p.screenshot({path:path.join(out,engine+'-'+provider+'-connections-dark.png')});
   await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.waitForTimeout(250);await p.screenshot({path:path.join(out,engine+'-'+provider+'-connections-light.png')});
   await account.locator('summary').click();
  }
  await p.locator('#settings-close').click();await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,engine+'-dismissed-mobile.png')});
  await p.emulateMedia({reducedMotion:'reduce'});
  const batchProof=await p.evaluate(async reminder=>{
    const {reminderBatch}=await import('/app.js'),batch=reminderBatch([{planning:{...reminder,batch_id:'batch'}},{planning:{...reminder,id:'second',dismissed_at:null,batch_id:'batch'}}],{});
    document.getElementById('content').append(batch);
    const first=batch.querySelector('.reminder-dismissed .notice-pager')?.textContent;
    batch.querySelector('[aria-label="Next reminder"]').click();
    const next=batch.querySelector('.reminder-card').dataset.reminder;
    batch.querySelector('[aria-label="Previous reminder"]').click();
    return {first,next,back:batch.querySelector('.reminder-dismissed .notice-pager')?.textContent};
  },reminder);
  assert.equal(batchProof.first,'1 / 2');assert.equal(batchProof.next,'second');assert.equal(batchProof.back,'1 / 2');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,dismissalPersists:true,failedSavePreservesReminder:true,collapseClipped:true,connectionsLightDarkAndMobile:true,notchHelperRemoved:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
