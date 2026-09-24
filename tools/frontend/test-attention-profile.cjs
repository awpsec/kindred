const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],reads=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const now=Math.floor(Date.now()/1000),bots=['piper','iz'].map((id,i)=>({id,name:i?'Izabella':'Piper',provider:'codex',model:'test',instructions:'Keep instructions',memory:'Keep memory',profile:{shape:i?'triangle':'round',color:i?'#2ec767':'#2475ff',label:'Assistant',description:'A helpful teammate',notifications:true}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));chats.push({id:'team',name:'Team',members:['piper','iz'],pinned:true});
  const messages=Object.fromEntries(chats.map(c=>[c.id,[{seq:1,sender:'user',text:'Hello',created:now},{seq:2,sender:c.members[0],text:'Reply',created:now,kind:'message'}]]));
  const attention={bots:{piper:{last_active_at:now-1798},iz:{last_active_at:now-1801}},chats:Object.fromEntries(chats.map(c=>[c.id,{cursor:2,read_cursor:0,latest_message_seq:2,unread:true}]))};
  let holdIdentity=false,releaseIdentity,raceReply=true;
  await context.route(origin+'/app.js',r=>r.fulfill({body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh,markVisibleConversationRead};',contentType:'text/javascript'}));
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON(),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});if(name==='/attention')return send(attention);
   if(name.endsWith('/read')){const id=name.split('/')[2];reads.push({id,...body});const a=attention.chats[id];if(raceReply&&id==='dm-piper'){raceReply=false;messages[id].push({seq:3,sender:'piper',text:'Arrived during acknowledgment',created:now+1,kind:'message'});a.cursor=3;a.latest_message_seq=3;}a.read_cursor=Math.max(a.read_cursor,body.cursor);a.unread=a.cursor>a.read_cursor;return send(a);}
   if(name.startsWith('/chats/')){const id=name.split('/')[2];return send({chat:chats.find(c=>c.id===id),messages:messages[id]});}
   if(name.endsWith('/identity')){writes.push(body);if(holdIdentity){holdIdentity=false;await new Promise(r=>releaseIdentity=r);}const b=bots.find(b=>b.id===name.split('/')[2]);b.name=body.name;Object.assign(b.profile,{label:body.label,description:body.description,notifications:body.notifications});return send(b);}
   if(name==='/bots/piper'){assert(body.preserve_text);Object.assign(bots[0],body);return send(bots[0]);}
   return route.continue();
  });
  await context.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.fixtureFocused=false;document.hasFocus=()=>window.fixtureFocused;},token);
  await p.goto(origin);await p.locator('#bots [aria-label="Piper"] .unread-dot').waitFor();
  const refresh=()=>p.evaluate(async()=>{const m=await import('./app.js');await m.refresh(true);});
  assert.equal(await p.locator('#pinned-bots [aria-label="Team"] .unread-dot').count(),1);
  const dotSize=await p.locator('#pinned-bots .unread-dot').boundingBox();assert.equal(dotSize.width,7);assert.equal(dotSize.height,7);
  await p.waitForFunction(()=>document.querySelector('#bots [aria-label="Izabella"] .character').dataset.action==='rest');
  attention.bots.piper.last_active_at=now;await refresh();assert(await p.locator('#bots [aria-label="Piper"] .character').evaluate(n=>n.classList.contains('is-online')));
  const poses=await p.evaluate(async()=>{
   const m=await import('./characters.js'),out=[];
   for(const shape of m.shapes){const c=m.character({shape},60);document.body.append(c);m.setActivity(c,'rest',{immediate:true});m.renderCharacterMotion(c,10000);const one=c.querySelector('.character-gaze').getAttribute('transform');const eyes=c.querySelector('.character-eyes').innerHTML;m.renderCharacterMotion(c,99000);out.push({one,two:c.querySelector('.character-gaze').getAttribute('transform'),sameEyes:eyes===c.querySelector('.character-eyes').innerHTML,animation:getComputedStyle(c.querySelector('.character-eyes')).animationName});c.remove();}
   return {out,boundary:[1799,1800].map(age=>m.activityState(null,10000,10000-age)),working:m.activityState({status:'running',shape:'think'},10000)};
  });
  assert(poses.out.every(x=>x.one===x.two&&x.sameEyes&&x.animation==='none'));assert.deepEqual(poses.boundary.map(x=>[x.action,x.online]),[['idle',true],['rest',false]]);assert(poses.working.online);
  await p.waitForTimeout(450);assert.equal(reads.length,0,'Unfocused conversation stays unread');
  await p.evaluate(()=>window.fixtureFocused=true);await p.evaluate(async()=>{const m=await import('./app.js');await m.markVisibleConversationRead();});
  assert.deepEqual(reads,[{id:'dm-piper',cursor:2}]);assert.equal(await p.locator('#bots [aria-label="Piper"] .unread-dot').count(),1,'A new reply during acknowledgment stays unread');
  await p.evaluate(async()=>{const m=await import('./app.js');await m.markVisibleConversationRead();window.fixtureFocused=false;});assert.equal(reads.length,1,'An unrendered reply cannot be acknowledged');await refresh();await p.locator('#content [data-message="3"]').waitFor();
  await p.locator('#settings-button').click();await p.evaluate(async()=>{window.fixtureFocused=true;const m=await import('./app.js');await m.markVisibleConversationRead();});assert.equal(reads.length,1,'Settings cover the conversation');await p.locator('#settings-close').click();await p.locator('#settings-dialog').waitFor({state:'hidden'});
  await p.evaluate(async()=>{const m=await import('./app.js');await m.markVisibleConversationRead();});assert.deepEqual(reads,[{id:'dm-piper',cursor:2},{id:'dm-piper',cursor:3}]);
  await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();
  const divider=p.locator('.unread-divider');await divider.waitFor();assert.equal(await divider.textContent(),'New');assert.equal(await divider.evaluate(n=>n.nextElementSibling.dataset.message),'2');
  await p.waitForFunction(()=>document.querySelector('.unread-divider')?.classList.contains('is-seen'));await p.waitForTimeout(8000);assert(Number(await divider.evaluate(n=>getComputedStyle(n).opacity))<.05);
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
  assert.equal(await p.locator('#bots [aria-label="Piper"] .unread-dot').count(),0);
  await p.locator('#bot-details').click();const form=p.locator('.bot-identity-form');await form.waitFor();assert.equal(await p.locator('#computer-preview-image').count(),0);
  holdIdentity=true;await form.getByLabel('Name',{exact:true}).fill('Piper edited');await p.waitForFunction(()=>document.querySelector('.bot-identity-form .preference-status').textContent==='Saving…');
  await form.getByLabel('Description',{exact:true}).fill('New description while saving');await refresh();assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'Piper edited');assert.equal(await form.getByLabel('Description',{exact:true}).inputValue(),'New description while saving');
  await p.locator('.avatar-customize').click();await p.locator('.quick-shapes').getByRole('button',{name:'cloud',exact:true}).click();
  assert(releaseIdentity);releaseIdentity();await p.waitForFunction(()=>document.querySelector('.bot-identity-form .preference-status').textContent==='Saved');
  await form.getByLabel('Label (optional)',{exact:true}).fill('Inbox');await p.waitForFunction(()=>document.querySelector('#bots .bot-label')?.textContent==='Inbox');assert.equal(bots[0].profile.description,'New description while saving');assert.equal(bots[0].memory,'Keep memory');assert.equal(bots[0].instructions,'Keep instructions');
  assert.equal(bots[0].profile.shape,'cloud');assert.equal(bots[0].name,'Piper edited');
  for(const name of ['Connections','Skills'])assert.equal(await p.locator('#details-content').getByRole('button',{name,exact:true}).count(),1);
  await p.screenshot({path:path.join(artifacts,engine+'-attention-profile.png')});
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(250);const bounds=await form.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);await p.screenshot({path:path.join(artifacts,engine+'-attention-profile-mobile.png')});await p.setViewportSize({width:1320,height:900});
  await p.locator('#bot-settings').click();await p.locator('.bot-edit-form select').first().waitFor();assert.equal(await p.locator('#details-title').textContent(),'Bot settings');
  assert.deepEqual(errors,[]);assert(writes.length>=2);console.log(JSON.stringify({passed:true,engine,unreadAndReadVisibility:true,groupUnread:true,presenceBoundary:true,staticRestAllShapes:true,profileDraftSurvivesRefresh:true,deepSettingsPreserved:true}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
