const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1150,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const bots=['Piper','Scratch','Atlas','Hazel'].map((name,i)=>({id:'bot-'+i,name,provider:'codex',profile:{shape:'round',color:['#ffbb22','#805cff','#ff6552','#ffffff'][i]}}));
  let chat={id:'team',name:'Team updates',description:'Piper coordinates and delegates. Keep updates to one line. Do not contact clients without my approval.',members:bots.map(b=>b.id),archived:false};
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route('**/api/**',r=>{const req=r.request(),name=new URL(req.url()).pathname.slice(4),send=json=>r.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send([chat]);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/chats/team'){if(req.method()==='PUT'){chat={...chat,...req.postDataJSON()};return send(chat);}return send({chat,messages:[]});}
   return r.continue();
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  const row=page.locator('button[data-sidebar-id="team"]').first();await row.click({button:'right'});await page.getByRole('menuitem',{name:'Chat settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Chat settings'}),description=dialog.getByLabel('Description',{exact:true});
  assert.equal(await description.inputValue(),chat.description);assert.equal(await description.getAttribute('maxlength'),'2000');
  fs.mkdirSync('/tmp/kindred-group-description',{recursive:true});await page.screenshot({path:'/tmp/kindred-group-description/settings.png'});
  await description.fill('One-line updates. Piper delegates. Ask before contacting clients.');
  await dialog.getByRole('button',{name:'Save chat',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(chat.description,'One-line updates. Piper delegates. Ask before contacting clients.');
  await row.click({button:'right'});await page.getByRole('menuitem',{name:'Chat settings',exact:true}).click();assert.equal(await description.inputValue(),chat.description);
  assert.deepEqual(errors,[]);console.log('Group description loads, saves explicitly, and remains on reopening.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
