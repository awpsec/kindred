const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,args:process.env.WEBKIT?[]:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1100,height:820}}),errors=[],requests=[],searches=[];page.on('pageerror',e=>errors.push(e.message));
 const me={id:'person:me',account:'me',kind:'person',name:'Me',owner_name:'me'},owen={id:'person:owen',account:'owen',kind:'person',name:'Owen Smith',owner_name:'owen'},orion={id:'bot:other:orion',bot_id:'orion',account:'owen',profile_id:'other',kind:'bot',name:'Atlas',owner_name:'Owen Smith',shared:true,avatar:{shape:'round',color:'#3377ff'}},oliver={id:'bot:mine:oliver',bot_id:'oliver',account:'me',profile_id:'mine',kind:'bot',name:'Oliver',owner_name:'Me',shared:false,avatar:{shape:'round',color:'#ffcc22'}};
 let localRuns=[],chats=[],messages=[],workers=[],uploads=[],seq=0,shared=false;const people=[owen,orion,oliver];
 try{
  page.setDefaultTimeout(15000);
  await page.route(origin+'/app.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh,state};'}));
  await page.route(origin+'/identity/**',route=>route.fulfill({json:route.request().url().includes('/meta')?{profiles:true,server_chats:true}:{active:'mine',account_id:'me',profiles:[{id:'mine',name:'Me',active:true}],directory:[]}}));
  await page.route(origin+'/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname.slice(4),data=req.postDataJSON(),reply=json=>route.fulfill({json});
   // No personal bot is needed to use human-to-human chat.
   if(['/bots','/chats'].includes(p))return reply([]);
   if(p==='/runs')return reply(localRuns);
   if(p.startsWith('/runs/')){if(p.endsWith('/cancel')){requests.push({p});return reply({ok:true});}return reply({run:localRuns.find(r=>p.endsWith(r.id)),events:[],attachments:[],approvals:[]});}
   if(p==='/activity')return reply({});
   if(p==='/server-uploads'){const file={id:'shared-file-'+uploads.length,name:data.name,size:5,shared:true};uploads.push({...file,chat_id:data.chat_id});return reply(file);}
   if(p==='/server-chats/directory'){searches.push(url.searchParams.get('q'));const query=(url.searchParams.get('q')||'').toLowerCase();if(query==='o')await new Promise(r=>setTimeout(r,250));return reply({items:people.filter(m=>m.name.toLowerCase().includes(query)),recent:chats.length?people.map(p=>p.id):[],me:me.id});}
   if(p==='/server-chats/sharing'){if(req.method()==='PUT'){shared=data.shared;return reply({shared});}return reply({items:[{...oliver,shared}]});}
   if(p==='/server-chats'){
    if(req.method()==='POST'){const participants=[me,...people.filter(m=>data.participants.includes(m.id))];const chat={id:'server-fixture-'+chats.length,name:data.name||participants[1].name,description:data.description||'',shared:true,owner:'me',me:me.id,participants,members:participants.filter(m=>m.kind==='bot').map(m=>m.id),all_messages:data.all_messages,bot_to_bot:data.bot_to_bot,can_manage:true,delegates:{},archived:false,unread:0,cursor:0};chats.push(chat);requests.push({p,data});return reply(chat);}
    return reply(chats);
   }
   if(p.startsWith('/server-chats/server-')){
    const chat=chats.find(c=>p.includes(c.id));if(!chat)return reply({error:'Unknown chat'});
    if(p.endsWith('/messages')){requests.push({p,data});messages.push({seq:++seq,sender:me.id,sender_name:'Me',mine:true,text:data.prompt,files:uploads.filter(f=>(data.files||[]).includes(f.id)),kind:'message',run_id:'',created:Date.now()/1000});chat.last_message=messages.at(-1);chat.cursor=seq;return reply({sent:true,runs:[]});}
    if(p.endsWith('/read'))return reply({read_cursor:data.cursor});
    if(p.endsWith('/delegate')){chat.delegates[me.id]=data.bot;requests.push({p,data});return reply(chat);}
    if(p.endsWith('/leave')){chats=chats.filter(c=>c!==chat);return reply({left:true});}
    if(req.method()==='PUT'){Object.assign(chat,data);return reply(chat);}
    return reply({chat,messages,workers,page:{has_before:false,has_after:false},pending_waits:[]});
   }
   return route.continue();
  });
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);await page.locator('#new-bot').click();await page.getByRole('button',{name:'New chat',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'New chat'}),search=picker.getByRole('searchbox',{name:'People and bots'});await search.fill('O');await picker.getByRole('button',{name:'Owen Smith · Person',exact:true}).waitFor();assert.equal(await picker.getByRole('button',{name:/ · Bot$/}).count(),2);assert.equal(await picker.locator('[data-participant="person:owen"] .person-avatar').count(),1);
  await picker.getByRole('button',{name:'Owen Smith · Person',exact:true}).click();await picker.getByRole('button',{name:'Start chat',exact:true}).click();await page.locator('#heading').filter({hasText:'Owen Smith'}).waitFor();assert(await page.locator('#composer-area').isVisible());assert(await page.locator('#show-computer').isHidden());
  await page.locator('#prompt').fill('/hello');await page.locator('#command-options').getByText('Workspace commands are available in private bot chats.',{exact:true}).waitFor();assert.equal(await page.locator('#command-options [role=option]').count(),0,'No private commands are disclosed in a shared chat');
  await page.locator('#prompt').fill('Hello Owen');await page.locator('#send').click();await page.locator('.message-row.user').filter({hasText:'Hello Owen'}).waitFor();assert.equal(requests.filter(r=>r.p.endsWith('/messages')).length,1);
  messages.push({seq:++seq,sender:owen.id,sender_name:owen.name,mine:false,text:'Hey! The project is on track.',kind:'message',run_id:'',created:Date.now()/1000});
  await page.evaluate(async()=>{const m=await import('./app.js');await m.refresh(true);});await page.locator('.message-author').filter({hasText:'Owen Smith'}).waitFor();assert.equal(await page.locator('.message-avatar.person-avatar').count(),1);
  await page.locator('#new-bot').click();await page.getByRole('button',{name:'New chat',exact:true}).click();
  await picker.getByRole('searchbox').fill('O');await page.waitForTimeout(160);await picker.getByRole('searchbox').fill('Owen');await page.waitForTimeout(500);assert.equal(await picker.getByRole('button',{name:/ · Bot$/}).count(),0,'Stale search replies cannot replace current results');
  await picker.getByRole('searchbox').fill('');await picker.getByRole('heading',{name:'Recents',exact:true}).waitFor();
  for(const label of ['Owen Smith · Person','Atlas · Bot','Oliver · Bot'])await picker.getByRole('button',{name:label,exact:true}).click();
  await picker.getByRole('textbox',{name:'Chat name'}).fill('Project management');await picker.getByLabel('Description',{exact:true}).fill('Piper coordinates; one line per update.');await picker.getByLabel('Let bots respond to each other').check();await picker.getByRole('button',{name:'Start chat',exact:true}).click();await page.locator('#heading').filter({hasText:'#project-management'}).waitFor();
  workers=[{participant:orion.id,name:orion.name,status:'running',created:Math.floor(Date.now()/1000)-60},{participant:oliver.id,name:oliver.name,status:'running',created:Math.floor(Date.now()/1000)-30},{participant:orion.id,name:orion.name,status:'waiting',label:'1 commands running'}];
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  await page.locator('.group-working-row').first().waitFor();assert.equal(await page.locator('.group-working-row').count(),2);assert.equal(await page.locator('.group-working-time').count(),2);assert.match(await page.locator('.group-activity').textContent(),/Atlas working/);
  workers.forEach(w=>{w.activity_started=false;});workers=workers.filter(w=>w.status==='running');
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  assert.equal(await page.locator('.group-activity').count(),0,'Routing-only bots have no activity strip or empty gap');
  workers[0].activity_started=true;
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  assert.equal(await page.locator('.group-working-row').count(),1,'Only the bot that started work appears');
  fs.mkdirSync('/tmp/kindred-group-participation',{recursive:true});await page.screenshot({path:'/tmp/kindred-group-participation/one-worker.png'});
  workers[1].status='awaiting_approval';
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  assert.equal(await page.locator('.group-working-row').count(),2,'Approval waits stay visible');
  localRuns=[oliver,orion].map(m=>({output:'',error:'',prompt:'Review project',id:'local-'+m.bot_id,bot_id:m.bot_id,chat_id:chats.at(-1).id,status:'running',activity_started:true,created:Math.floor(Date.now()/1000)}));
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  const ownStop=page.locator('.group-activity').getByRole('button',{name:'Stop task for Oliver',exact:true});
  await ownStop.waitFor();assert.equal(await page.getByRole('button',{name:'Stop task for Atlas',exact:true}).count(),0,'Do not offer controls for another account’s bot');
  await ownStop.locator('..').hover();await ownStop.click();assert(requests.some(r=>r.p==='/runs/local-oliver/cancel'));
  localRuns[0].id='local-oliver-next';
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});
  await page.waitForFunction(()=>document.querySelector('.group-activity [data-run="local-oliver-next"]'));
  await ownStop.locator('..').hover();await ownStop.click();assert(requests.some(r=>r.p==='/runs/local-oliver-next/cancel'),'Refreshed controls must target the new run');
  localRuns=[];
  workers=[];await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh();});await page.locator('.group-activity').waitFor({state:'detached'});
  orion.name='Charlie';orion.avatar={shape:'square',color:'#ff0000'};
  await page.evaluate(async()=>{const app=await import('/app.js');await app.refresh(true);});
  assert.equal(await page.locator('#heading').textContent(),'#project-management','Custom group title is preserved');
  assert.match(await page.locator('#header-avatar .participant-stack').getAttribute('aria-label'),/Charlie/);
  const updatedAvatar=page.locator('#header-avatar [data-bot-id="bot:other:orion"]');
  assert.match(await updatedAvatar.getAttribute('data-profile'),/#ff0000/);
  assert.match(await updatedAvatar.getAttribute('data-profile'),/square/);
  const identityOut='/tmp/kindred-group-identity';fs.mkdirSync(identityOut,{recursive:true});
  await page.screenshot({path:path.join(identityOut,(process.env.WEBKIT?'webkit':'chromium')+'.png')});
  const uploadDone=page.waitForResponse(r=>r.url().endsWith('/api/server-uploads'));
  await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(['hello'],'shared-notes.txt',{type:'text/plain'}));document.querySelector('#content').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));});
  await uploadDone;await page.locator('.composer-file').waitFor();assert.equal(uploads[0].chat_id,chats.at(-1).id);
  await page.locator('#send').click();await page.locator('.message-file').filter({hasText:'shared-notes.txt'}).waitFor();
  assert(requests.some(r=>r.data?.files?.includes('shared-file-0')));
  await page.locator('#prompt').fill('@O');await page.locator('#prompt').press('End');await page.locator('#prompt').press('w');await page.locator('#mention-options').waitFor();assert((await page.locator('#mention-options').textContent()).includes('Owen Smith'));
  await page.locator('#prompt').press('Escape');await page.locator('#chat-actions').click();await page.getByRole('menuitem',{name:'Chat settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Chat settings'});assert.equal(await settings.getByLabel('Description',{exact:true}).inputValue(),'Piper coordinates; one line per update.');const delegationSaved=page.waitForResponse(r=>r.url().endsWith('/delegate')&&r.request().method()==='PUT');await settings.getByRole('combobox',{name:'When I am mentioned'}).selectOption(oliver.id);await delegationSaved;assert(requests.some(r=>r.p.endsWith('/delegate')&&r.data.bot===oliver.id));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await settings.evaluate(d=>{const b=d.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/server-chats-ui';fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-narrow.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',humanOnlyComposer:true,attributedMessages:true,mixedSearch:true,staleSearchIgnored:true,recents:true,delegation:true,narrowLayout:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
