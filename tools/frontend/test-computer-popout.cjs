// Real app, native platform flags and real noVNC/RFB pixels. All network and
// computer state are isolated fixtures; no owner account or VM is accessed.
process.env.KINDRED_TEST_SECURITY_HEADERS='1';
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const {attachComputerStream}=require('./fixtures/computer-stream.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const stream=attachComputerStream(server),engine=process.env.WEBKIT?'webkit':'chromium';
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-computer-popout';fs.mkdirSync(out,{recursive:true});
let proofPage=null;const navigation=[];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await({chromium,webkit}[engine]).launch();
 try{
  const platform=process.env.KINDRED_TEST_PLATFORM||'linux';
  const page=await browser.newPage({viewport:{width:1320,height:1000}}),errors=[],sessions=[],sessionPaths=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  proofPage=page;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigation.push({url:frame.url(),at:Date.now()});});
  await page.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.__KINDRED_MAC_OVERLAY=platform==='macos';window.__TAURI__={core:{invoke:async()=>null}};},{token,platform});
  const phases={piper:'ready',cersei:'ready'};let heldBot='',releaseHeld=null,heldReceived=null;
  await page.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/api/bots')return send(['piper','cersei'].map((id,index)=>({id,name:index?'Cersei':'Piper',provider:'codex',profile:{shape:'pebble',color:index?'#ff9c3c':'#12b8c6'}})));
   if(u.pathname==='/api/chats')return send(['piper','cersei'].map(id=>({id:'dm-'+id,name:id,members:[id]})));
   if(u.pathname==='/api/chats/dm-cersei')return send({chat:{id:'dm-cersei',members:['cersei']},messages:[]});
   if(u.pathname==='/api/computer/screen-state')return send({state:phases[u.searchParams.get('bot_id')]||'ready'});
   if(['/api/computer/session','/api/computer/observe-session'].includes(u.pathname)){const body=req.postDataJSON();sessions.push(body);sessionPaths.push(u.pathname);if(body.bot_id===heldBot){heldBot='';heldReceived?.();await new Promise(r=>releaseHeld=r);}return send({ticket:stream.ticket(body.bot_id)}).catch(()=>{});}
   if(u.pathname==='/api/computer/resources')return send({uptime_seconds:60,cpu_percent:1,memory_total:100,memory_used:10});
   return route.continue();
  });
  await page.goto(origin);await page.locator('#bot-details').click();await page.locator('#details-panel [data-tab=computer]').click();await page.waitForSelector('#desktop canvas');
  const pop=page.getByRole('button',{name:'Pop out computer',exact:true});
  assert.equal(await pop.count(),1,'Desktop Computer pane exposes its small popout control');
  await pop.click();
  const window=page.locator('.computer-popout'),surface=page.locator('.computer-popout-open');await window.waitFor();
  await page.waitForFunction(()=>document.querySelector('.computer-popout')?.dataset.status==='ready');
  await page.locator('#computer-panel').waitFor({state:'hidden'});
  const pixels=async color=>page.waitForFunction(color=>{const c=document.querySelector('.computer-popout-screen canvas');return c&&color.every((value,index)=>c.getContext('2d').getImageData(1,1,1,1).data[index]===value);},color);
  await pixels([18,184,198]);stream.push('piper',[30,170,100]);await pixels([30,170,100]);
  assert.equal(await page.locator('#computer-panel').isVisible(),false);
  assert.doesNotMatch(await window.innerText(),/\bLive\b/);
  const rect=()=>window.evaluate(n=>n.getBoundingClientRect().toJSON());
  const shape=await rect();assert(Math.abs(shape.width/shape.height-16/9)<.005);
  await page.locator('#prompt').fill('Keep this draft while I watch.');
  await surface.click({position:{x:shape.width*.4,y:shape.height*.4}});await page.waitForSelector('#computer-panel.expanded:not([hidden])');
  await window.waitFor({state:'hidden'});
  assert.equal(await window.isVisible(),false,'Opening the normal viewer suspends its floating stream');
  await page.locator('#computer-close').click();await window.waitFor();await page.waitForTimeout(400);assert.deepEqual(await rect(),shape,'Closing normal view restores floating placement');
  const drag=async(dx,dy,back=false)=>{const r=await surface.boundingBox(),px=r.x+r.width*.4,py=r.y+r.height*.4;await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px+dx,py+dy,{steps:8});if(back)await page.mouse.move(px,py,{steps:8});await page.mouse.up();await page.waitForTimeout(300);};
  await drag(3,2);await page.waitForSelector('#computer-panel.expanded:not([hidden])');await page.locator('#computer-close').click();await window.waitFor();await page.waitForTimeout(400);
  for(const corner of ['top-left','top-right','bottom-right','bottom-left']){
   const area=await page.locator('.computer-popout-layer').boundingBox(),r=await rect();const x=corner.endsWith('left')?area.x+12:area.x+area.width-r.width-12,y=corner.startsWith('top')?area.y+12:area.y+area.height-r.height-12;
   await drag(x-r.x,y-r.y);assert.equal(await window.getAttribute('data-corner'),corner);assert.equal(await page.locator('#computer-panel').isVisible(),false,'Dragging does not open normal computer');
   const placed=await rect(),composer=await page.locator('#composer-area').boundingBox(),heading=await page.locator('.conversation-header').boundingBox();assert(placed.bottom<composer.y,'Bottom-corner float never covers composer');assert(placed.top>=heading.y+heading.height,'Top-corner float stays below chat header');
  }
  await drag(35,-16,true);assert.equal(await page.locator('#computer-panel').isVisible(),false,'Dragging out and back is still a drag');
  // A normal background refresh must not snap a held pointer back to its anchor.
  const hold=await surface.boundingBox();await page.mouse.move(hold.x+80,hold.y+65);await page.mouse.down();await page.mouse.move(hold.x+145,hold.y+40);const during=await rect();await page.waitForTimeout(2800);assert.deepEqual(await rect(),during,'Background refresh preserves an in-flight drag');await page.mouse.up();await page.waitForTimeout(300);
  await surface.press('ArrowRight');await page.waitForTimeout(300);
  const beforeResize=await rect(),handle=await page.locator('.computer-popout-resize').boundingBox();await page.mouse.move(handle.x+13,handle.y+13);await page.mouse.down();await page.mouse.move(handle.x-67,handle.y-7,{steps:8});await page.mouse.up();
  const resized=await rect();assert(resized.width>beforeResize.width+65);assert(Math.abs(resized.width/resized.height-16/9)<.005);assert.equal(await page.locator('#computer-panel').isVisible(),false,'Resizing does not open normal computer');
  await page.locator('#bots').getByRole('button',{name:'Cersei',exact:true}).click();await pixels([255,156,60]);assert.deepEqual(await rect(),resized,'Bot switch preserves the floating rectangle');
  const frame=await page.locator('.computer-popout-screen canvas').boundingBox();assert(Math.abs(frame.width/frame.height-1.6)<.005,'16:10 guest fits without cropping');assert(frame.x>=resized.x-1&&frame.y>=resized.y-1&&frame.x+frame.width<=resized.right+1&&frame.y+frame.height<=resized.bottom+1);
  await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await pixels([18,184,198]);assert.equal(await page.locator('#prompt').innerText(),'Keep this draft while I watch.');
  // A sleeping computer must not receive a ticket just from switching chats.
  phases.cersei='asleep';const count=sessions.length;await page.locator('#bots').getByRole('button',{name:'Cersei',exact:true}).click();await page.locator('.computer-popout[data-status=unavailable]').waitFor();assert.match(await window.innerText(),/asleep/);assert.equal(sessions.length,count);
  await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await pixels([18,184,198]);phases.cersei='ready';
  // A delayed ticket for an earlier bot cannot paint over the latest bot.
  heldBot='cersei';const received=new Promise(r=>heldReceived=r);await page.locator('#bots').getByRole('button',{name:'Cersei',exact:true}).click();await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('Held ticket was not requested')),8000))]);await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();releaseHeld();await pixels([18,184,198]);assert.match(await window.getAttribute('aria-label'),/Piper/);
  await page.waitForTimeout(200);assert.equal(stream.active().filter(x=>x==='cersei').length,0,'Stale bot streams are closed');
  await page.locator('.computer-popout-return').click();await window.waitFor({state:'hidden'});await page.waitForTimeout(150);assert.equal(await page.locator('#computer-panel').isVisible(),false,'Return never opens side pane');assert.equal(stream.active().length,0,'Return closes the passive connection');
  await page.locator('#bot-details').click();await page.locator('#details-panel [data-tab=computer]').click();await pop.click();await window.waitFor();await pixels([18,184,198]);
  await page.locator('#computer-panel').waitFor({state:'hidden'});await page.waitForTimeout(300);const beforeReload=await rect();await page.reload();await window.waitFor().catch(async e=>{fs.writeFileSync(path.join(out,engine+'-reload-failure.json'),JSON.stringify({errors,state:await page.evaluate(()=>({saved:localStorage.getItem('kindred-computer-popout'),token:sessionStorage.getItem('kindred-token'),desktop:window.__KINDRED_DESKTOP,hidden:document.hidden,appHidden:document.getElementById('app').hidden,heading:document.getElementById('bot-details').textContent,body:document.body.innerText.slice(-2200)}))},null,2));await page.screenshot({path:path.join(out,engine+'-reload-failure.png')});throw e;});await pixels([18,184,198]);assert.deepEqual(await rect(),beforeReload,'Reload restores one shared placement');
  await page.setViewportSize({width:900,height:700});await page.waitForTimeout(350);const constrained=await rect(),area=await page.locator('.conversation-history').boundingBox();assert(constrained.x>=area.x&&constrained.y>=area.y&&constrained.right<=area.x+area.width+1&&constrained.bottom<=area.y+area.height+1,'Smaller window keeps popout above the composer');
  await page.setViewportSize({width:1320,height:1000});await page.waitForTimeout(350);
  await surface.press('ArrowDown');await page.waitForTimeout(300);await page.locator('#prompt').fill('A longer draft\nwith several lines\nshould keep the computer clear\nof the entire composer.');await page.waitForTimeout(300);assert((await rect()).bottom<(await page.locator('#composer-area').boundingBox()).y,'Growing composer moves the bottom anchor up');
  await page.evaluate(()=>document.documentElement.dataset.motion='off');await surface.press('ArrowLeft');assert.equal(await window.evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
  assert(sessionPaths.includes('/api/computer/observe-session'),'Popout requests explicitly non-starting server admission');assert(sessions.every(s=>s.control===false),'Passive popout never takes control');assert.equal(stream.inputs.length,0,'Floating pointer gestures never reach the guest');
  await page.screenshot({path:path.join(out,engine+'-floating.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,platform,realRfb:true,sessions:sessions.length,inputs:stream.inputs.length,fourCorners:true,dragThreshold:true,refreshDuringDrag:true,noAccidentalWake:true,staleTicketGuard:true,guestContained:true}));await page.close();
  for(const mode of ['browser','ios','invalid-state']){
   const context=await browser.newContext(),p=await context.newPage();const writes=[],startupErrors=[];p.on('pageerror',e=>startupErrors.push(e.message));await context.addInitScript(({token,mode})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-computer-popout',mode==='invalid-state'?'null':JSON.stringify({enabled:true,corner:'bottom-right',width:300}));if(mode!=='browser'){window.__KINDRED_DESKTOP={platform:'linux'};window.__TAURI__={core:{invoke:async()=>null}};}if(mode==='ios'){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';}},{token,mode});await p.route(/\/api\/computer\/(?:observe-session|session)$/,r=>{writes.push(r.request().postData());return r.abort();});await p.goto(origin);await p.locator('#bots button').first().waitFor();await p.waitForTimeout(150);assert.equal(await p.locator('.computer-popout-layer,.computer-popout-toggle').count(),mode==='invalid-state'?2:0,'Only desktop exposes the feature, with corrupt saved state tolerated');assert.equal(writes.length,0);assert.deepEqual(startupErrors,[]);await context.close();
  }
  const legacy=await browser.newContext(),old=await legacy.newPage(),legacyWrites=[];
  await legacy.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-computer-popout',JSON.stringify({enabled:true}));window.__KINDRED_DESKTOP={platform};window.__TAURI__={core:{invoke:async()=>null}};},{token,platform});
  await old.route(origin+'/api/computer/screen-state**',r=>r.fulfill({json:{state:'ready'}}));
  await old.route(/\/api\/computer\/(?:observe-session|session)$/,r=>{legacyWrites.push(new URL(r.request().url()).pathname);return r.fulfill({status:404,json:{error:'Unknown endpoint'}});});
  await old.goto(origin);await old.locator('.computer-popout[data-status=unavailable]').waitFor();await old.waitForTimeout(250);
  assert(legacyWrites.length>0&&legacyWrites.every(path=>path==='/api/computer/observe-session'),'Old server cannot fall back to a startup-capable endpoint');await legacy.close();
  fs.writeFileSync(path.join(out,engine+'-verification.json'),JSON.stringify({passed:true,engine,platform,sessions,sessionPaths,legacyWrites,exclusions:true,connections:stream.connections},null,2));
 }finally{if(proofPage&&!proofPage.isClosed()){try{fs.writeFileSync(path.join(out,engine+'-failure-state.json'),JSON.stringify({navigation,state:await proofPage.evaluate(()=>({url:location.href,saved:localStorage.getItem('kindred-computer-popout'),token:sessionStorage.getItem('kindred-token'),desktop:window.__KINDRED_DESKTOP,hidden:document.hidden,appHidden:document.getElementById('app')?.hidden,heading:document.getElementById('bot-details')?.textContent,body:document.body?.innerText.slice(-2400)}))},null,2));await proofPage.screenshot({path:path.join(out,engine+'-failure.png')});}catch{}}await browser.close();stream.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);stream.close();server.closeAllConnections();server.close();process.exitCode=1;});
