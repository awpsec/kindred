const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],writes=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const bots=['Piper','Izabella','Third','Fourth','Fifth','Sixth'].map((name,i)=>({id:'b'+i,name,memory:'Preserve memory',provider:'codex',profile:{shape:i%2?'capsule':'round',color:i%2?'#ff9638':'#2475ff'}}));
  const pair={id:'pair',name:'Piper, Izabella',members:['b0','b1'],pinned:true,archived:false},large={id:'large',name:'Whole team',members:bots.map(b=>b.id),pinned:true,archived:false};
  const chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),pair,large];
  const now=Math.floor(Date.now()/1000),messages=[['user','Hello team'],['b0','Hello CZ. I will work with Izabella.'],['b0','A second message from the same sender.'],['b1','I can handle the inbox.']].map(([sender,text],i)=>({seq:i+1,sender,text,kind:'message',created:now+i}));
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/settings')return send({name:'CZ',theme:'dark',reduced_motion:false,approval_mode:'auto'});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   const m=name.match(/^\/chats\/([^/]+)(\/pin)?$/);
   if(m){const chat=chats.find(c=>c.id===m[1]);if(req.method()==='PUT'){const body=req.postDataJSON();writes.push({id:chat.id,body});Object.assign(chat,body);return send(chat);}return send({chat,messages:chat.id.startsWith('dm-')?[]:messages});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const tile=p.locator('#pinned-bots').getByRole('button',{name:pair.name,exact:true});await tile.click();
  assert.equal(await p.locator('.participant-stack-header .participant-user').textContent(),'CZ');assert.equal(await p.locator('.participant-stack-header .participant-bot').count(),2);
  for(const name of [pair.name,large.name]){
   const stack=p.locator('#pinned-bots').getByRole('button',{name,exact:true}).locator('.participant-stack');
   assert.equal(await stack.locator('.participant-user').textContent(),'CZ');
   assert(await stack.evaluate(n=>{const r=n.getBoundingClientRect(),tile=n.parentElement.getBoundingClientRect();return r.left>=tile.left&&r.right<=tile.right&&r.top>=tile.top&&r.bottom<=tile.bottom&&[...n.children].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;});}));
   assert(await stack.evaluate(n=>{const boxes=[...n.children].map(c=>c.getBoundingClientRect());return boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));}),'Participant faces and counts must not overlap');
  }
  assert.equal(await p.locator('#pinned-bots .participant-more').textContent(),'+4');
  const groups=p.locator('.group-message');assert.equal(await groups.count(),3);assert.equal(await groups.first().locator('.message-avatar').count(),0);assert.equal(await groups.nth(1).locator('.message-avatar').count(),1);
  assert.equal(await p.locator('.message-author .buddy').count(),0);
  assert(await groups.first().evaluate(n=>{const tail=n.nextElementSibling,a=tail.querySelector('.message-avatar').getBoundingClientRect(),name=n.querySelector('.message-author').getBoundingClientRect(),first=n.querySelector('.message-bubble').getBoundingClientRect(),last=tail.querySelector('.message-bubble').getBoundingClientRect();return a.right<=name.left&&name.bottom<=first.top+1&&a.left<last.left&&Math.abs(a.bottom-last.bottom)<=1;}));
  assert.equal(await p.locator('.message-row.user').count(),1);
  for(const theme of ['dark','light']){
   await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(250);
   const colors=await p.locator('.message-sender-name').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).color));assert.notEqual(colors[0],colors[1]);
   for(const color of colors){const rgb=color.match(/\d+/g).slice(0,3).map(Number),lum=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);assert((theme==='dark'?(lum+.05)/.05:1.05/(lum+.05))>=4.5);}
   await p.locator('#content').click({position:{x:10,y:10}});await p.keyboard.press('Escape');await p.screenshot({path:path.join(artifacts,engine+'-group-'+theme+'.png')});
  }
  await tile.click({button:'right'});const menu=p.getByRole('menu',{name:'Chat actions'});assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Rename','Unpin','Mute conversation','Chat settings','Archive chat']);
  await menu.getByRole('menuitem',{name:'Rename',exact:true}).click();await p.getByLabel('Chat name',{exact:true}).fill('Inbox team');await p.getByRole('button',{name:'Save',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Inbox team');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{...pair});assert.deepEqual(pair.members,['b0','b1']);assert(pair.pinned&&!pair.archived);assert(bots.every(b=>b.memory==='Preserve memory'));assert.equal(await groups.count(),3);
  const renamed=p.locator('#pinned-bots').getByRole('button',{name:'Inbox team',exact:true});await p.waitForTimeout(300);await renamed.focus();assert(await renamed.evaluate(n=>n===document.activeElement));await p.keyboard.press('Shift+F10');await menu.waitFor();await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Archive chat');await p.keyboard.press('Escape');assert(await renamed.evaluate(n=>n===document.activeElement));
  await renamed.click({button:'right'});await menu.getByRole('menuitem',{name:'Unpin',exact:true}).click();const row=p.locator('#bots').getByRole('button',{name:'Inbox team',exact:true});await row.waitFor();await row.click({button:'right'});await menu.getByRole('menuitem',{name:'Rename',exact:true}).waitFor();await p.locator('#content').click({position:{x:10,y:10}});assert.equal(await menu.count(),0);
  await p.reload();await row.click();assert.equal(await p.locator('#heading').textContent(),'Inbox team');
  const rowLayout=await row.evaluate(n=>{const stack=n.querySelector('.participant-stack'),r=stack.getBoundingClientRect(),boxes=[...stack.children].map(c=>c.getBoundingClientRect()),dm=document.querySelector('#bots .bot-link:not(:has(.participant-stack))');return {width:r.width,nameX:n.querySelector('.bot-info').getBoundingClientRect().left,dmNameX:dm.querySelector('.bot-info').getBoundingClientRect().left,clear:boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))};});
  assert.equal(rowLayout.width,44);assert.equal(rowLayout.nameX,rowLayout.dmNameX);assert(rowLayout.clear);
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(220);await p.screenshot({path:path.join(artifacts,engine+'-group-rows-'+theme+'.png')});}
  await p.setViewportSize({width:390,height:844});await p.locator('#chat-actions').click();await menu.waitFor();const box=await menu.boundingBox();assert(box.x>=0&&box.x+box.width<=390);await p.screenshot({path:path.join(artifacts,engine+'-group-mobile-menu.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,userInitials:true,boundedStacks:true,headerMembers:true,avatarGutter:true,coloredNamesBothThemes:true,renamePreservesChat:true,keyboardAndMobileMenu:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
