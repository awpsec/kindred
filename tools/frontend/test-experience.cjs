const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,attachment}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bot={id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Handle project coordination.',memory:'Remember our invoice schedule.',approval_mode:'inherit',profile:{shape:'pebble',color:'#2475ff',label:'PM',description:'Coordinate the team.',notifications:true}};
  const bots=[bot],chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages=Array.from({length:60},(_,i)=>({seq:i+1,sender:i%2?'piper':'user',kind:'message',text:`Message ${i+1}. `+'Some conversation history to read. '.repeat(8),created:now-60+i}));
  let general={name:'You',theme:'dark',reduced_motion:false,approval_mode:'ask',notifications:'all'},run=null,activity={status:'completed',shape:'idle',last_active_at:now};
  const draft={id:'draft-1',created_bot_id:'',bot:{...bot,id:'',name:'Ada',memory:'',instructions:'Prepare invoices for approval. Track their due dates.',profile:{...bot.profile,shape:'capsule',color:'#2ec767',label:'Invoicing',description:'Keep invoices and payments organized.'}}};
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON(),send=json=>route.fulfill({json});
   if(body)writes.push({name,body});
   if(name==='/bots')return send(bots);
   if(name==='/bots/piper/text'){assert.equal(body.expected,bot[body.field]);bot[body.field]=body.value;return send(bot);}
   if(name==='/bots/piper'){assert.equal(body.preserve_text,true);const memory=bot.memory,instructions=bot.instructions;Object.assign(bot,body,{memory,instructions});return send(bot);}
   if(name==='/settings'){if(body)general=body;return send(general);}
   if(name==='/chats')return send([chat]);
   if(name==='/chats/dm-piper/messages'){if(body.prompt==='Slow send')await new Promise(r=>setTimeout(r,900));messages.push({seq:messages.length+1,sender:'user',kind:'message',text:body.prompt,files:body.files.map(id=>({id,name:'invoice.csv',size:21})),created:now+100});return send({runs:[]});}
   if(name==='/chats/dm-piper')return send({chat,messages});
   if(name==='/runs')return send(run?[run]:[]);
   if(name.startsWith('/runs/'))return send({run,events:[],approvals:[],attachments:[]});
   if(name==='/activity')return send({piper:activity});
   if(name==='/computer/resources')return send({cpu_percent:2,cpus:4,memory_used:1,memory_total:8,disk_used:1,disk_total:24});
   if(name==='/computer/session')return send({ticket:'fixture',control:false});
   if(name==='/uploads'){assert.equal(Buffer.from(body.data,'base64').toString(),'client,amount\nAcme,42');return send({id:'file-1',name:body.name,size:21});}
   if(name==='/bot-drafts/draft-1/create'){Object.assign(draft.bot,body.bot||{});draft.created_bot_id='ada';draft.bot.id='ada';bots.push(draft.bot);return send(draft.bot);}
   if(name.startsWith('/attachments/')){await new Promise(r=>setTimeout(r,700));return route.continue();}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#content [data-message="60"]').waitFor();
  const gap=()=>p.locator('#content').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight);
  await p.waitForTimeout(250);assert(await gap()<3);
  // Incoming refreshes and asynchronously loaded images keep the latest message in view.
  messages.push({seq:61,sender:'piper',kind:'result',text:'Delayed screenshot',attachments:[{id:attachment,title:'A delayed image'}],created:now+1});
  await p.locator('#content [data-message="61"] img').waitFor();await p.waitForTimeout(1200);assert(await gap()<3,'Follow the bottom after image load');
  for(let i=62;i<=64;i++){messages.push({seq:i,sender:'piper',kind:'message',text:'Incoming reply '+i,created:now+i});await p.locator(`#content [data-message="${i}"]`).waitFor();assert(await gap()<3,'Follow incoming refresh');}
  await p.locator('#content').evaluate(n=>n.scrollTop=1000);await p.waitForTimeout(200);
  const anchor=()=>p.locator('#content').evaluate(n=>{const top=n.getBoundingClientRect().top,m=[...n.querySelectorAll('[data-message]')].find(m=>m.getBoundingClientRect().bottom>top+1);return {seq:m.dataset.message,y:m.getBoundingClientRect().top-top};});
  const before=await anchor();messages.push({seq:65,sender:'piper',kind:'message',text:'A reply while reading older history',created:now+65});await p.locator('#content [data-message="65"]').waitFor();await p.waitForTimeout(800);const after=await anchor();assert.equal(after.seq,before.seq);assert(Math.abs(after.y-before.y)<2,'Preserve reader anchor');
  await p.locator('#prompt').fill('Continue');await p.locator('#send').click();await p.locator('#content [data-message="66"]').waitFor();await p.waitForFunction(()=>{const n=document.querySelector('#content');return n.scrollHeight-n.scrollTop-n.clientHeight<3;});assert(await gap()<3,'Sending follows latest');
  // Recent idle gaze stays alive, including previews; dormant bots keep their separate rest pose.
  const gaze=await p.evaluate(async()=>{
   const c=await import('/characters.js'),box=c.character({shape:'pebble'},100);document.body.append(box);box._character.gazeSeed=0;
   const old=c.activityState({status:'completed',shape:'success',last_active_at:0},Date.now());c.setActivity(box,'sleep',{immediate:true});const idle=box.dataset.action;
   c.renderCharacterMotion(box,100000);const first=box.querySelector('.character-gaze').getAttribute('transform'),eye1=box.querySelector('[data-eye]').getAttribute('d');c.renderCharacterMotion(box,107000);const second=box.querySelector('.character-gaze').getAttribute('transform'),eye2=box.querySelector('[data-eye]').getAttribute('d');
   c.setActivity(box,'think',{immediate:true});const thinking=box.dataset.action;const sleepingNodes=box.querySelectorAll('.character-zzz,.character-closed-eyes').length;box.remove();return {old,idle,first,second,eye1,eye2,thinking,sleepingNodes};
  });assert.equal(gaze.old.action,'rest');assert.equal(gaze.idle,'idle');assert.equal(gaze.thinking,'working');assert.notEqual(gaze.first,gaze.second);assert.notEqual(gaze.eye1,gaze.eye2);assert.equal(gaze.sleepingNodes,0);
  run={id:'work',bot_id:'piper',chat_id:chat.id,status:'running',prompt:'Working',output:'',error:'',created:now};activity={status:'running',shape:'think',label:'Thinking it through',started_at:now};
  await p.locator('.work-line').waitFor();assert(!(await p.locator('.work-line').textContent()).includes('Piper'));await p.waitForFunction(()=>document.querySelector('.work-line .character')?.dataset.action==='working');run=null;activity={status:'completed',shape:'idle'};
  await p.locator('#bot-details').click();await p.locator('#bot-settings').click();
  assert.equal(await p.locator('#details-content').getByLabel('Memory',{exact:true}).count(),0);assert.equal(await p.locator('#details-content').getByLabel('Instructions',{exact:true}).count(),0);
  assert.equal(await p.locator('#details-content').getByText('Send test notification').count(),0);assert.equal(await p.locator('#details-content').getByRole('switch',{name:'Notifications',exact:true}).count(),1);
  await p.locator('#details-content').getByRole('button',{name:'Memory',exact:true}).click();const editor=p.locator('.bot-text-dialog');await editor.getByLabel('Memory',{exact:true}).fill('Long memory\n'+'Remember this responsibility.\n'.repeat(130));assert((await editor.locator('textarea').boundingBox()).height>350);await editor.getByRole('button',{name:'Save',exact:true}).click();await editor.waitFor({state:'detached'});assert(bot.memory.startsWith('Long memory'));
  bot.memory+='\nNew fact saved by bot';await p.locator('#details-content').getByLabel('Name',{exact:true}).fill('Piper PM');await p.waitForTimeout(1000);assert(bot.memory.endsWith('New fact saved by bot'));
  await p.locator('#details-close').click();await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'General',exact:true}).click();const frequency=p.locator('#settings-dialog').getByLabel('Notifications',{exact:true});assert.deepEqual(await frequency.locator('option').allTextContents(),['All','Input needed','None']);await frequency.selectOption('none');await p.waitForTimeout(900);assert.equal(general.notifications,'none');await p.locator('#settings-close').click();
  // Composer actions open their actual flows and leave bot details closed.
  await p.locator('#composer-actions').click();await p.getByRole('menuitem',{name:'Attach files',exact:true}).waitFor();assert(await p.locator('#details-panel').isHidden());
  const picker=p.waitForEvent('filechooser');await p.getByRole('menuitem',{name:'Attach files',exact:true}).click();await(await picker).setFiles({name:'invoice.csv',mimeType:'text/csv',buffer:Buffer.from('client,amount\nAcme,42')});await p.getByRole('button',{name:'Remove invoice.csv'}).waitFor();await p.locator('#send').click();await p.locator('.message-file').waitFor();assert.deepEqual(writes.filter(w=>w.name.endsWith('/messages')).at(-1).body.files,['file-1']);assert(await p.locator('.composer-files').isHidden());
  messages.push({seq:messages.length+1,sender:'piper',kind:'bot_draft',text:draft.id,draft,created:now+200});await p.locator('.bot-draft-card').waitFor();assert.equal(bots.length,1);await p.locator('.bot-draft-card').getByRole('button',{name:'Details',exact:true}).click();
  await p.locator('#bot-dialog').waitFor({state:'visible'});const form=p.locator('#bot-form');assert.equal(await form.locator('[name=name]').inputValue(),'Ada');assert.equal(await form.locator('[name=instructions]').inputValue(),draft.bot.instructions);assert.equal(await form.locator('[name=description]').inputValue(),draft.bot.profile.description);await form.locator('[name=name]').fill('Ada Ledger');await p.waitForTimeout(250);await p.screenshot({path:path.join(artifacts,engine+'-teammate-draft.png')});await form.getByRole('button',{name:'Create bot',exact:true}).click();await p.locator('.bot-draft-card').getByText('Teammate created').waitFor();assert.equal(bots.length,2);assert.equal(bots[1].name,'Ada Ledger');
  await p.locator('#bot-dialog').waitFor({state:'hidden'});await p.waitForTimeout(250);await p.screenshot({path:path.join(artifacts,engine+'-experience-chat.png')});
  await p.locator('#prompt').fill('Slow send');await p.locator('#send').click();await p.locator('#prompt').fill('My next unsent draft');await p.locator('#content').evaluate(n=>n.scrollTop=900);await p.waitForTimeout(100);const duringSend=await anchor();await p.waitForFunction(()=>document.querySelector('#send').dataset.pending!=='true');await p.waitForTimeout(300);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'My next unsent draft');const afterSend=await anchor();assert.equal(afterSend.seq,duringSend.seq);assert(Math.abs(afterSend.y-duringSend.y)<2,'A user scroll during send takes precedence');
  await p.locator('#composer-actions').click();await p.getByRole('menuitem',{name:'Teach a task',exact:true}).click();await p.locator('.teach-dialog').getByLabel('Skill name',{exact:true}).waitFor();assert(await p.locator('#computer-panel').isVisible());await p.locator('.teach-dialog').getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,scrollFollowAndAnchor:true,curvedIdleGaze:true,noSleepOrThinkingMorph:true,compactEditors:true,notifications:true,upload:true,editableDraft:true,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
