const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],cancelled=[];let waits=[],helping=false;
  const artifacts=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-nametag';fs.mkdirSync(artifacts,{recursive:true});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/cancel')){cancelled.push(url.pathname);waits=[];helping=false;return route.fulfill({json:{}});}
   if(!['/api/bots','/api/chats','/api/chats/dm-piper','/api/runs'].includes(url.pathname))return route.continue();
   const response=await route.fetch(),data=await response.json();
   if(url.pathname==='/api/bots'){data[0].name='Bo';data.push({...data[0],id:'orion',name:'Orion'},{...data[0],id:'perseus',name:'Perseus'});}
   if(url.pathname==='/api/chats')data[0].name='Bo';
   if(url.pathname==='/api/chats/dm-piper'){data.chat.name='Bo';data.pending_waits=waits;}
   if(url.pathname==='/api/runs'&&helping)data.push({...data[0],id:'help',bot_id:'piper',chat_id:'team-private',status:'running',created:Date.now()/1000,delegation:{requester_bot_id:'orion',source_chat_id:'dm-orion'}});
   if(url.pathname==='/api/chats'&&helping)data.push({id:'dm-orion',name:'Orion',members:['orion']});
   return route.fulfill({response,json:data});
  });
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('.nametag-shell').waitFor();await p.waitForTimeout(400);
  const shell=p.locator('.nametag-shell'),title=p.locator('#bot-details'),row=p.locator('.nametag-status'),x=p.locator('.nametag-status-stop');
  for(const name of ['An unusually long bot name to constrain the tag','Helia','Ochrane','Bo']){
   await p.locator('#heading').evaluate((n,name)=>n.textContent=name,name);await p.waitForTimeout(300);
   const metrics=await p.locator('#heading').evaluate(n=>({actual:n.clientWidth,needed:n.scrollWidth}));
   assert(metrics.actual>=metrics.needed-1,`Name clipped: ${name} ${JSON.stringify(metrics)}`);
  }
  const compact=await shell.boundingBox();assert(compact.width<110,'Short names retain compact identity');
  await p.screenshot({path:path.join(artifacts,'nametag-idle.png')});
  waits=[{bot_id:'orion',requester_bot_id:'piper',parent_run_id:'run-screenshot'},{bot_id:'perseus',requester_bot_id:'piper',parent_run_id:'run-screenshot'}];
  await row.getByText('Waiting on Orion, Perseus').waitFor();await p.waitForTimeout(350);
  const expanded=await shell.boundingBox();assert(expanded.width>compact.width+45);assert(expanded.height>compact.height+20);
  assert.equal(await x.evaluate(n=>getComputedStyle(n).opacity),'0');
  await title.hover();await p.waitForTimeout(250);assert.equal(await x.evaluate(n=>getComputedStyle(n).opacity),'0','Title hover must not expose interrupt');
  await p.mouse.move(0,840);await p.waitForTimeout(280);await p.screenshot({path:path.join(artifacts,'nametag-waiting.png')});
  await row.hover();await p.waitForTimeout(280);assert.equal(await x.evaluate(n=>getComputedStyle(n).opacity),'1');
  assert((await shell.boundingBox()).width>expanded.width+15,'Interrupt expands the sides');
  await p.screenshot({path:path.join(artifacts,'nametag-interrupt.png')});
  await title.click();await p.waitForTimeout(400);
  const paneShell=await shell.boundingBox(),paneTitle=await title.boundingBox();
  assert(paneTitle.x>=paneShell.x&&paneTitle.x+paneTitle.width<=paneShell.x+paneShell.width+1,'Title remains inside the tag with a pane open');
  await p.getByRole('button',{name:'Close bot center',exact:true}).click();await p.waitForTimeout(400);await row.hover();await p.waitForTimeout(250);
  await x.click();await p.waitForFunction(()=>!document.querySelector('.nametag-shell').classList.contains('has-status'));await p.mouse.move(0,840);await p.waitForTimeout(350);
  assert.equal(cancelled.length,1,'Duplicate parent IDs cancelled once');
  const closed=await shell.boundingBox();assert(Math.abs(closed.width-compact.width)<2);assert(Math.abs(closed.height-compact.height)<2);
  helping=true;await row.getByText('Working for Orion').waitFor();await p.waitForTimeout(280);
  await row.focus();await p.waitForTimeout(220);assert.equal(await x.evaluate(n=>getComputedStyle(n).opacity),'1');
  await p.keyboard.press('Tab');assert.equal(await x.evaluate(n=>n===document.activeElement),true);
  await p.keyboard.press('Enter');await p.waitForFunction(()=>!document.querySelector('.nametag-shell').classList.contains('has-status'));
  assert.equal(cancelled.at(-1),'/api/runs/help/cancel');
  // Reduced motion, mobile isolation and narrow desktop clipping use actual UI.
  await p.emulateMedia({reducedMotion:'reduce'});waits=[{bot_id:'orion',requester_bot_id:'piper',parent_run_id:'run-screenshot'}];
  await row.getByText('Waiting on Orion').waitFor();
  assert.equal(await shell.evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
  await p.setViewportSize({width:780,height:850});await p.waitForTimeout(300);
  const narrow=await shell.boundingBox();assert(narrow.x>=0&&narrow.x+narrow.width<=780);
  await p.setViewportSize({width:600,height:850});await p.waitForTimeout(350);assert.equal(await p.locator('.nametag-shell').count(),0);
  assert.equal(await p.locator('#bot-details').count(),1);
  await p.setViewportSize({width:1100,height:850});await p.waitForTimeout(350);await p.locator('.nametag-shell').waitFor();
  await p.evaluate(()=>document.documentElement.setAttribute('data-kindred-ios','true'));await p.setViewportSize({width:1099,height:850});await p.waitForTimeout(100);
  assert.equal(await p.locator('.nametag-shell').count(),0,'iOS header stays native');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',compact,expanded,closed,cancelled}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
