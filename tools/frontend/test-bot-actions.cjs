const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:850}}),p=await context.newPage(),errors=[],writes=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const bots=['Piper','Empty test'].map((name,i)=>({id:'b'+i,name,provider:'codex',model:'test',instructions:'Keep instructions',memory:'Keep memory',profile:{shape:'round',color:'#2475ff',pinned:false}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));let rejectArchive=false;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs'||name==='/routines')return send([]);if(name==='/activity')return send({});
   if(name.startsWith('/chats/'))return send({chat:chats.find(c=>c.id===name.slice(7)),messages:[]});
   const m=name.match(/^\/bots\/([^/]+)(\/pin)?$/);
   if(m&&req.method()==='PUT'){
    const b=bots.find(b=>b.id===m[1]),v=req.postDataJSON();writes.push({id:b.id,body:v});
    if(rejectArchive&&v.profile?.archived)return route.fulfill({status:400,json:{error:'Wait for or stop this bot\'s tasks before archiving.'}});
    if(m[2])b.profile.pinned=v.pinned;else{const {preserve_text,...value}=v;if(preserve_text){value.instructions=b.instructions;value.memory=b.memory;}Object.assign(b,value);}
    return send(b);
   }
   return route.continue();
  });
  await context.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.menuDefaults=[];document.addEventListener('contextmenu',e=>setTimeout(()=>window.menuDefaults.push(e.defaultPrevented),0),true);},token);
  await p.goto(origin);const row=()=>p.locator('#bots').getByRole('button',{name:'Empty test',exact:true}),menu=p.getByRole('menu',{name:'Bot actions'});
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
  await row().locator('strong').click({button:'right'});await menu.waitFor();assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Edit bot','Pin','Mute conversation','Instructions','Memory','Archive bot']);assert.equal(await p.locator('#heading').textContent(),'Piper');assert.equal(await p.evaluate(()=>window.menuDefaults.at(-1)),true);
  await menu.getByRole('menuitem',{name:'Memory',exact:true}).click();const textDialog=p.getByRole('dialog',{name:'Memory'});await textDialog.waitFor();assert.equal(await textDialog.getByLabel('Memory',{exact:true}).inputValue(),'Keep memory');await textDialog.getByRole('button',{name:'Cancel'}).click();
  await row().focus();await p.keyboard.press('Shift+F10');await menu.waitFor();await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Archive bot');await p.keyboard.press('Escape');assert(await row().evaluate(n=>document.activeElement===n));
  await row().hover();await row().locator('..').getByRole('button',{name:'Actions for Empty test'}).click();await menu.getByRole('menuitem',{name:'Edit bot'}).click();await p.locator('#details-title').filter({hasText:'Bot settings'}).waitFor();assert.equal(await p.locator('#heading').textContent(),'Empty test');assert.equal(await p.locator('#details-content').getByLabel('Name',{exact:true}).inputValue(),'Empty test');await p.locator('#details-close').click();
  await p.getByRole('button',{name:'Bot actions',exact:true}).click();await menu.getByRole('menuitem',{name:'Pin',exact:true}).click();const tile=()=>p.locator('#pinned-bots').getByRole('button',{name:'Empty test',exact:true});await tile().waitFor();assert(bots[1].profile.pinned);
  await tile().click({button:'right'});await menu.getByRole('menuitem',{name:'Unpin',exact:true}).waitFor();assert.equal(await p.getByRole('tooltip').count(),0);
  // A background refresh replaces the trigger; Escape restores the replacement.
  bots[1].profile.description='Changed while menu is open';await p.waitForFunction(()=>document.querySelector('#pinned-bots button[aria-label="Empty test"]')?.getAttribute('aria-expanded')!=='true');await p.keyboard.press('Escape');assert(await tile().evaluate(n=>document.activeElement===n));
  await p.setViewportSize({width:390,height:750});await p.getByRole('button',{name:'Bot actions',exact:true}).click();await menu.waitFor();assert(await menu.evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight}));await p.keyboard.press('Escape');
  await p.setViewportSize({width:1280,height:850});rejectArchive=true;await tile().click({button:'right'});await menu.getByRole('menuitem',{name:'Archive bot'}).click();await p.locator('#notice').filter({hasText:'Wait for or stop'}).waitFor();assert(!bots[1].profile.archived);await tile().waitFor();
  rejectArchive=false;await tile().click({button:'right'});bots[1].memory='A concurrent durable memory';bots[1].profile.description='Latest profile';await menu.getByRole('menuitem',{name:'Archive bot'}).click();await tile().waitFor({state:'detached'});assert(bots[1].profile.archived&&!bots[1].profile.pinned);assert(!bots[0].profile.archived);assert.equal(bots[1].memory,'A concurrent durable memory');assert.equal(writes.at(-1).body.profile.description,'Latest profile');assert.equal(writes.at(-1).body.preserve_text,true);
  await p.locator('#settings-button').click();await p.getByText('Archived bots (1)',{exact:true}).click();await p.getByRole('button',{name:'Restore Empty test',exact:true}).click();await row().waitFor();assert(!bots[1].profile.archived);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine,botContextMenu:true,noNativeMenu:true,emptyBot:true,keyboardAndRefresh:true,editAndPin:true,archiveGuardAndRestore:true,errors}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
