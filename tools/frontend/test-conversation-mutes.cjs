const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),mutes={},writes=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const bots=[{id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff'}}];
  const chats=[{id:'dm-piper',name:'Piper',members:['piper']},{id:'team',name:'Project team',members:['piper']}];
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route('**/api/**',r=>{
   const req=r.request(),name=new URL(req.url()).pathname.slice(4),send=json=>r.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);
   if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/attention')return send({bots:{},chats:{},mutes});
   if(name.startsWith('/notification-mutes/')){
    const [,kind,id]=name.split('/').slice(1),seconds=req.postDataJSON().seconds;writes.push({kind,id,seconds});
    mutes[kind+':'+id]=seconds>0?Math.floor(Date.now()/1000)+seconds:seconds;return send(mutes);
   }
   if(name.startsWith('/chats/'))return send({chat:chats.find(c=>c.id===name.slice(7)),messages:[]});
   return r.continue();
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  const bot=page.locator('button[data-sidebar-kind="bots"][data-sidebar-id="piper"]').first();
  await bot.click({button:'right'});
  let parent=page.getByRole('menuitem',{name:'Mute conversation',exact:true});
  await parent.focus();await page.keyboard.press('ArrowRight');
  const submenu=page.getByRole('menu',{name:'Mute conversation',exact:true});
  await submenu.waitFor();assert.equal(await submenu.getByRole('menuitem').count(),3);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'For 1 hour');
  fs.mkdirSync('/tmp/kindred-mutes',{recursive:true});await page.screenshot({path:'/tmp/kindred-mutes/menu.png'});
  await page.keyboard.press('Enter');
  await bot.click({button:'right'});await page.getByRole('menuitem',{name:'Unmute',exact:true}).click();
  for(const [label,seconds] of [['For 24 hours',86400],['Indefinitely',-1]]){
   await bot.click({button:'right'});await page.getByRole('menuitem',{name:'Mute conversation',exact:true}).hover();
   await page.getByRole('menuitem',{name:label,exact:true}).click();
   assert.equal(writes.at(-1).seconds,seconds);
   await page.reload();await bot.click({button:'right'});await page.getByRole('menuitem',{name:'Unmute',exact:true}).click();
  }
  const group=page.locator('button[data-sidebar-kind="chats"][data-sidebar-id="team"]').first();
  await group.click({button:'right'});await page.getByRole('menuitem',{name:'Mute conversation',exact:true}).click();
  await page.getByRole('menuitem',{name:'For 1 hour',exact:true}).click();assert.deepEqual(writes.at(-1),{kind:'chat',id:'team',seconds:3600});
  await group.click({button:'right'});await page.getByRole('menuitem',{name:'Unmute',exact:true}).click();
  mutes['bot:piper']=Math.floor(Date.now()/1000)-1;
  await page.reload();await bot.click({button:'right'});await page.getByRole('menuitem',{name:'Mute conversation',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert.deepEqual(writes[0],{kind:'bot',id:'piper',seconds:3600});assert.equal(writes.at(-1).seconds,0);assert.deepEqual(errors,[]);
  console.log('Mute submenu: bot/group durations, persisted unmute, hover and keyboard passed.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
