const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.join(process.cwd(),'test-artifacts/progress-inline-times');fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:760},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const run={id:'summary-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-480,prompt:'Go through my Gmail, find the recurring bills, and set up a couple of useful filters. Leave existing messages alone.',task_title:'Set up Gmail bill filters',output:'',error:'',progress_started:now-240};
  let omitRun=false,polls=0;const timezone='Pacific/Honolulu';
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},...[2,3,4,5].map((seq,i)=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:now-230+i*50,text:['I am checking recurring bills and existing labels.','I found two recurring senders. The filters will label incoming mail only.','The first filter is saved. I am checking the second sender.','Both filters are saved. I am verifying their settings.'][i],progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'phase-review',task_title:run.task_title}}))];
  const routeAPI=r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/settings')return send({name:'You',theme:'dark',timezone,approval_mode:'auto'});if(n==='/api/bots')return r.fetch().then(async response=>{const bots=await response.json();return send([...bots,{...bots[0],id:'other',name:'Other'}]);});if(n==='/api/chats')return send([chat,{id:'dm-other',name:'Other',members:['other']}]);if(n==='/api/chats/dm-other')return send({chat:{id:'dm-other',name:'Other',members:['other']},messages:[],page:{has_before:false,has_after:false}});if(n==='/api/runs')return send(omitRun?[]:[run]);if(n==='/api/runs/'+run.id)return omitRun?r.fulfill({status:404,json:{error:'Not found'}}):send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id){polls++;return send({chat,messages,page:{has_before:false,has_after:false}});}if(n==='/api/activity')return send({});return r.continue();};await p.route(origin+'/api/**',routeAPI);
  if(process.env.KINDRED_TEST_STYLE_SOURCE)await p.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.KINDRED_TEST_STYLE_SOURCE,'utf8')}));
  if(process.env.KINDRED_TEST_APP_SOURCE)await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_TEST_APP_SOURCE,'utf8')}));
  await p.goto(origin);await p.locator('.summary-progress').waitFor();assert.equal(await p.locator('.progress-update-time-toggle').count(),4,'each update has its fixed elapsed control');
  const first=p.locator('.progress-update-time').first(),toggle=first.locator('button'),clock=first.locator('time');
  assert.equal(await toggle.innerText(),'10s');assert.match(await p.locator('.summary-progress-time').innerText(),/^4m/,'header uses same task origin');
  await p.waitForFunction(()=>document.querySelector('#composer')?.getBoundingClientRect().height>0);
  const before=await p.locator('.summary-progress-body').boundingBox();assert(before.height>0);
  // Compute expected locale formatting in the same browser, independent of host locale.
  const expected=await p.evaluate(({created,timezone})=>{const d=new Date(created*1000);return {date:d.toLocaleString([],{timeZone:timezone,dateStyle:'full',timeStyle:'short'}),clock:'('+d.toLocaleTimeString([],{timeZone:timezone,hour:'numeric',minute:'2-digit'})+')'};},{created:messages[1].created,timezone});
  assert.equal(await clock.innerText(),expected.clock);assert((await toggle.getAttribute('aria-label')).includes(expected.date));
  await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.equal(await first.getAttribute('data-pinned'),'true');
  await p.waitForTimeout(180);assert.equal(await clock.evaluate(n=>getComputedStyle(n).opacity),'1');
  const after=await p.locator('.summary-progress-body').boundingBox();assert.equal(before.height,after.height);
  assert.equal(await clock.getAttribute('datetime'),new Date(messages[1].created*1000).toISOString());
  await toggle.focus();await p.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-pressed'),'false');await p.waitForTimeout(180);assert.equal(await clock.evaluate(n=>getComputedStyle(n).opacity),'1','keyboard focus reveals unpinned clock');await p.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  const priorPolls=polls;run.task_title='Updated title without changing timestamps';await p.waitForFunction(()=>document.querySelector('.summary-progress-name')?.textContent==='Updated title without changing timestamps',{},{timeout:12000});assert(polls>priorPolls);assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.equal(await toggle.innerText(),'10s');
  const polled=await p.locator('.summary-progress-body').boundingBox();assert.equal(polled.height,before.height,'poll reconstruction preserves reserved clock height');
  await toggle.evaluate(n=>window.staleProgressToggle=n);await p.getByRole('button',{name:'Other',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.summary-progress'));await p.evaluate(()=>window.staleProgressToggle.click());await p.getByRole('button',{name:'Piper',exact:true}).click();await first.waitFor();assert.equal(await toggle.getAttribute('aria-pressed'),'true','foreign/detached control must not toggle cached conversation');
  await p.setViewportSize({width:390,height:844});await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.equal(await toggle.innerText(),'10s');
  assert(await first.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  for(const theme of ['light','dark']){await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await toggle.tap();await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.equal(await toggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','Tapped elapsed control must have no fill in '+theme);const target=await toggle.boundingBox();assert(target.width>=44&&target.height>=44,'Touch target stays 44px');await p.screenshot({path:path.join(out,engine+'-'+theme+'-touch.png')});}
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await clock.evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
  run.created=0;run.progress_started=0;await p.reload();await p.locator('.summary-progress').waitFor();
  assert.equal(await p.locator('.progress-update-time-toggle').count(),0,'no invented elapsed when run metadata absent');
  assert.equal(await p.locator('.summary-progress-time').count(),0,'header cannot invent elapsed from first message');const historical=p.locator('.progress-update-clock').first();assert.equal(await historical.getAttribute('aria-label'),expected.date);assert.equal(await historical.evaluate(n=>getComputedStyle(n).opacity),'1');
  run.created=now-240;run.progress_started=-1;await p.reload();await toggle.waitFor();assert.equal(await toggle.innerText(),'10s','invalid progress start uses valid run created');
  omitRun=true;for(const m of messages){m.run_id='';if(m.progress)m.progress.run_id='';}await p.reload();await p.locator('.summary-progress').waitFor();assert.equal(await p.locator('.progress-update-time-toggle').count(),0);assert.equal(await p.locator('.summary-progress-time').count(),0);
  omitRun=false;run.created=now-480;run.progress_started=now-240;for(const m of messages)if(m.progress){m.run_id=run.id;m.progress.run_id=run.id;}
  const desktop=await browser.newPage({viewport:{width:1100,height:760}});desktop.on('pageerror',e=>errors.push(e.message));await desktop.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await desktop.route(origin+'/api/**',routeAPI);if(process.env.KINDRED_TEST_STYLE_SOURCE)await desktop.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.KINDRED_TEST_STYLE_SOURCE,'utf8')}));await desktop.goto(origin);const desktopClock=desktop.locator('.progress-update-clock').first();await desktopClock.waitFor();await desktop.locator('#prompt').focus();await desktop.waitForTimeout(180);assert.equal(await desktopClock.evaluate(n=>getComputedStyle(n).opacity),'0');const reserved=await desktopClock.boundingBox();assert(reserved.width>0);await desktop.locator('.summary-progress-update').first().hover();await desktop.waitForTimeout(180);assert.equal(await desktopClock.evaluate(n=>getComputedStyle(n).opacity),'1');assert.deepEqual(await desktopClock.boundingBox(),reserved,'hover preserves reserved clock geometry');await desktop.screenshot({path:path.join(out,engine+'-desktop-hover.png')});
  const desktopToggle=desktop.locator('.progress-update-time-toggle').first();
  for(const theme of ['light','dark']){
   await desktop.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await desktop.locator('#prompt').focus();await desktop.mouse.move(0,0);
   assert.equal(await desktopToggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','Resting elapsed control has no fill in '+theme);
   await desktopToggle.hover();assert.equal(await desktopToggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','Hovered elapsed control has no fill in '+theme);
   await desktop.mouse.move(0,0);await desktop.keyboard.press('Tab');await desktopToggle.focus();
   const focus=await desktopToggle.evaluate(n=>({visible:n.matches(':focus-visible'),width:getComputedStyle(n).outlineWidth,style:getComputedStyle(n).outlineStyle}));assert(focus.visible);assert.equal(focus.width,'2px');assert.equal(focus.style,'solid','Keyboard outline preserved');
   await desktop.keyboard.press('Enter');assert.equal(await desktopToggle.getAttribute('aria-pressed'),'true');await desktop.keyboard.press('Space');assert.equal(await desktopToggle.getAttribute('aria-pressed'),'false');
   await desktop.screenshot({path:path.join(out,engine+'-'+theme+'-keyboard-focus.png')});
  }
  await desktop.close();
  const ios=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});ios.on('pageerror',e=>errors.push(e.message));
  await ios.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';sessionStorage.setItem('kindred-token',t);},token);
  await ios.route(origin+'/api/**',routeAPI);if(process.env.KINDRED_TEST_STYLE_SOURCE)await ios.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.KINDRED_TEST_STYLE_SOURCE,'utf8')}));
  await ios.goto(origin);const iosToggle=ios.locator('.progress-update-time-toggle').first();await iosToggle.waitFor();
  assert.equal(await ios.evaluate(()=>document.documentElement.dataset.mobile),'true');
  await ios.waitForFunction(()=>document.querySelector('#app')?.dataset.mobileResizing!=='true'&&document.querySelector('.summary-progress-body')?.getBoundingClientRect().height>0);await ios.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(const width of [390,320])for(const theme of ['light','dark']){
   await ios.setViewportSize({width,height:844});await ios.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const body=await ios.locator('.summary-progress-body').boundingBox();assert(body.width>0&&body.height>0);
   await iosToggle.tap();assert.equal(await iosToggle.getAttribute('aria-pressed'),'true');assert.equal(await iosToggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','iOS-shaped tap has no fill');
   const target=await iosToggle.boundingBox();assert(target.width>=44&&target.height>=44);assert.equal((await ios.locator('.summary-progress-body').boundingBox()).height,body.height);
   await ios.screenshot({path:path.join(out,engine+'-ios-'+width+'-'+theme+'-tap.png')});
   await iosToggle.tap();assert.equal(await iosToggle.getAttribute('aria-pressed'),'false');assert.equal(await iosToggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
  }
  await ios.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,fixedElapsed:true,tapReveal:true,noReflow:true,missingStart:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
