const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),sessions=[],errors=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const bots=[['piper','Piper'],['iz','Izabella'],['test','TesterMan'],['viv','Vivienne']].map(([id,name])=>({id,name,provider:'codex',profile:{shape:'round',color:'#2475ff',archived:false}}));
  const group={id:'team-test',name:'Piper, Izabella',members:['piper','iz'],archived:false};
  const chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),group];
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);
   if(name.startsWith('/chats/'))return send({chat:chats.find(c=>c.id===name.slice(7)),messages:[]});
   if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/status')return send({version:'0.24.0',screen_bot_id:u.searchParams.get('bot_id'),takeover:false,vm_enabled:true});
   if(name==='/computer/session'){sessions.push(req.postDataJSON());return send({ticket:'fixture',control:false});}
   if(name==='/computer/resources')return send({});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#bots').getByRole('button',{name:group.name,exact:true}).click();await p.locator('#show-computer').click();
  const trigger=p.locator('#screen-picker'),menu=p.getByRole('menu',{name:'Chat screens'});
  await trigger.click();assert.deepEqual(await menu.getByRole('menuitemradio').allTextContents(),['Piper’s screen','Izabella’s screen']);
  assert.equal(await menu.getByRole('menuitemradio',{name:'Piper’s screen'}).getAttribute('aria-checked'),'true');
  for(const theme of ['dark','light']){
   await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await p.waitForTimeout(250);
   const colors=await menu.evaluate(n=>{const item=n.firstElementChild;return {background:getComputedStyle(n).backgroundColor,text:getComputedStyle(item).color};});
   assert.equal(colors.background,theme==='dark'?'rgb(19, 19, 19)':'rgb(251, 251, 251)');assert.equal(colors.text,theme==='dark'?'rgb(237, 237, 237)':'rgb(32, 32, 32)');
   await p.screenshot({path:path.join(artifacts,engine+'-screen-menu-'+theme+'.png')});
  }
  await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
  await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='iz');assert(await menu.isHidden());
  await trigger.focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Izabella’s screen');
  await p.keyboard.press('Escape');assert(await menu.isHidden());assert(await trigger.evaluate(n=>n===document.activeElement));
  await trigger.click();await p.locator('#computer-expand').click();assert(await menu.isHidden());
  // The anchored menu also fits the narrow layout.
  await p.setViewportSize({width:390,height:844});await trigger.click();
  const bounds=await menu.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);await p.screenshot({path:path.join(artifacts,engine+'-screen-menu-mobile.png')});await p.keyboard.press('Escape');
  await p.setViewportSize({width:1320,height:900});
  await p.locator('#bots').getByRole('button',{name:'TesterMan',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='test');await trigger.click();assert.deepEqual(await menu.getByRole('menuitemradio').allTextContents(),['TesterMan’s screen']);
  await p.keyboard.press('Escape');await p.locator('#bots').getByRole('button',{name:group.name,exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='piper');await trigger.click();await menu.getByRole('menuitemradio',{name:'Izabella’s screen'}).click();
  await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='iz');
  // If a member is removed while this computer is open, reconnect to a remaining member.
  group.members=['piper'];await p.waitForFunction(()=>document.querySelector('#screen-picker')?.value==='piper');
  await trigger.click();assert.deepEqual(await menu.getByRole('menuitemradio').allTextContents(),['Piper’s screen']);
  assert(sessions.some(s=>s.bot_id==='iz')&&sessions.some(s=>s.bot_id==='test'));assert(sessions.every(s=>s.control===false));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,chatScoped:true,directChatOnly:true,themedMenu:true,keyboard:true,mobile:true,memberRemovalReconnect:true,viewOnly:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
