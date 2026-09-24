const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1320,height:940}}),p=await context.newPage(),errors=[],writes=[],sent=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
 const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
 let list={id:'list-today',chat_id:chat.id,bot_id:'piper',revision:1,title:'Today · Northwind',local_date:'2099-09-10',archived:false,items:[{id:'scope',title:'Prepare Northwind scope',state:'current',owner:'bot',sources:[{title:'Monday objective',url:'https://monday.example/boards/10/items/20'}]},{id:'scan',title:'Start Northwind scans',state:'pending',owner:'user',sources:[]},{id:'report',title:'Review evidence',state:'pending',owner:'bot',sources:[]}]};
 let reminder={id:'reminder-noon',chat_id:chat.id,bot_id:'piper',revision:1,message:'Start scans for Northwind',run_at:4092739200,local_time:'2099-09-10T12:00',timezone:'America/New_York',status:'pending',sources:[{title:'Confluence scope',url:'https://confluence.example/scopes/northwind'}]};let forceConflict=false,delivery=false,loseWorkReply=false;const workReceipts=new Map();
 await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await context.route(origin+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname,method=req.method(),body=['PATCH','POST'].includes(method)?req.postDataJSON():null;
  if(name==='/api/settings')return route.fulfill({json:{name:'You',theme:'dark',reduced_motion:true,approval_mode:'auto',timezone:'America/New_York'}});
  if(name==='/api/runs')return route.fulfill({json:[]});
  if(name==='/api/chats')return route.fulfill({json:[chat]});
  if(name==='/api/chats/dm-piper')return route.fulfill({json:{chat,messages:[{seq:1,sender:'user',kind:'message',text:'Make a list for today and remind me at noon.',run_id:'',created:now-5},{seq:2,sender:'piper',kind:'checklist',text:list.title,planning:list,run_id:'',created:now-4},{seq:3,sender:'piper',kind:'reminder_card',text:reminder.message,planning:reminder,run_id:'',created:now-3},...(delivery?[{seq:4,sender:'piper',kind:'reminder',text:reminder.message,planning:reminder,run_id:'',created:now}]:[])],page:{has_before:false,has_after:false}}});
  if(name==='/api/chats/dm-piper/planning')return route.fulfill({json:{checklists:[list],reminders:[reminder]}});
  if(name==='/api/bots/piper/artifacts')return route.fulfill({json:{items:[{id:list.id,title:list.title,kind:'checklist',created:1}],next_cursor:null}});
  if(name==='/api/bots/piper/artifacts/checklist/list-today')return route.fulfill({json:list});
  if(name==='/api/chats/dm-piper/checklists/list-today'&&method==='PATCH'){
   writes.push({name,body});if(forceConflict||body.expected_revision!==list.revision){forceConflict=false;return route.fulfill({status:400,json:{error:'This list changed. Refresh its state before editing'}});}
   if(body.item_id){const item=list.items.find(i=>i.id===body.item_id),advance=item.state==='current'&&body.state==='done';if(body.state==='current')list.items.forEach(i=>{if(i.state==='current')i.state='pending';});item.state=body.state;if(advance){const next=list.items.find(i=>i.state==='pending');if(next)next.state='current';}}
   if(body.items)list.items=body.items.map((i,n)=>({...i,id:i.id||'added-'+n}));if(body.title)list.title=body.title;if(typeof body.archived==='boolean')list.archived=body.archived;list.revision++;return route.fulfill({json:list});
  }
  if(name==='/api/chats/dm-piper/reminders/reminder-noon'&&method==='PATCH'){
   writes.push({name,body});assert.equal(body.expected_revision,reminder.revision);if(body.cancel)reminder.status='cancelled';if(body.local_time){reminder.local_time=body.local_time;reminder.run_at=Date.parse(body.local_time+'-04:00')/1000;reminder.timezone=body.timezone||reminder.timezone;reminder.status='pending';}if(body.message)reminder.message=body.message;reminder.revision++;return route.fulfill({json:reminder});
  }
  if(name==='/api/chats/dm-piper/messages'&&method==='POST'){sent.push(body);if(!workReceipts.has(body.request_id))workReceipts.set(body.request_id,body);if(loseWorkReply){loseWorkReply=false;return route.abort();}return route.fulfill({json:{runs:['fixture-work-request']}});}
  return route.continue();
 });
 await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});const card=p.locator('#content [data-list="list-today"]');await card.waitFor();
 await card.locator('.checklist-item.current').hover();
 await card.screenshot({path:path.join(artifacts,'checklist-compact-'+engine+'.png')});
 assert.equal(await card.getByRole('button',{name:'Focus',exact:true}).count(),0);
 assert.equal(await card.getByRole('link',{name:'Monday objective'}).isVisible(),false);
 await card.locator('.checklist-description summary').click();
 assert(await card.getByRole('link',{name:'Monday objective'}).isVisible());await card.screenshot({path:path.join(artifacts,'checklist-expanded-'+engine+'.png')});
 await card.locator('.checklist-description summary').click();
 assert.equal(await card.getByRole('link',{name:'Monday objective'}).isVisible(),false);
 await card.locator('.checklist-description summary').click();
 assert.equal(await card.locator('.current').count(),1);assert.equal(await card.getByRole('link',{name:'Monday objective'}).getAttribute('href'),'https://monday.example/boards/10/items/20');
 await card.getByRole('checkbox',{name:'Mark Prepare Northwind scope done'}).check();await p.waitForFunction(()=>document.querySelector('#content .checklist-item.current')?.textContent.includes('Start Northwind scans'));assert.equal(sent.length,0);
 forceConflict=true;await card.getByRole('checkbox',{name:'Mark Start Northwind scans done'}).check();await p.getByText('This list changed. Refresh its state before editing',{exact:true}).waitFor();assert.equal(list.items[1].state,'current');
 await card.locator('.checklist-item.current').getByRole('button',{name:'Work on this'}).click();for(let i=0;sent.length<1&&i<100;i++)await p.waitForTimeout(50);assert.equal(sent.length,1);assert(sent[0].prompt.includes('Today · Northwind'));assert(sent[0].prompt.includes('Start Northwind scans'));assert(sent[0].request_id);assert.deepEqual(sent[0].mentions,['piper']);
 loseWorkReply=true;await card.locator('.checklist-item.current').getByRole('button',{name:'Work on this'}).click();await p.getByText(/Focus saved, but the work request could not be confirmed/).waitFor();await card.locator('.checklist-item.current').getByRole('button',{name:'Work on this'}).click();for(let i=0;sent.length<3&&i<100;i++)await p.waitForTimeout(50);assert.equal(sent.length,3);assert.equal(sent[1].request_id,sent[2].request_id);assert.equal(workReceipts.size,2,'A retry checks the same work request');
 await card.getByRole('button',{name:'Edit',exact:true}).click();let edit=p.getByRole('dialog',{name:'Edit checklist'});await p.screenshot({path:path.join(artifacts,'checklist-editor-'+engine+'.png')});await edit.getByLabel('List title').fill('Northwind · Today');await edit.getByLabel('Item 3',{exact:true}).fill('Review Northwind evidence');await edit.getByRole('button',{name:'Add item',exact:true}).click();await edit.getByLabel('Item 4',{exact:true}).fill('Write the summary');await edit.getByRole('button',{name:'Save',exact:true}).click();await edit.waitFor({state:'detached'});assert.equal(list.items[0].id,'scope');assert.equal(list.items[0].state,'done');assert.equal(list.items.length,4);
 const remind=p.locator('#content [data-reminder="reminder-noon"]');await remind.getByRole('button',{name:'Edit',exact:true}).click();edit=p.getByRole('dialog',{name:'Edit reminder'});await edit.getByLabel('Date and time').fill('2099-09-10T13:00');await edit.getByLabel('Reminder',{exact:true}).fill('Start the Northwind scans after scope review');await edit.getByRole('button',{name:'Save',exact:true}).click();await edit.waitFor({state:'detached'});assert.equal(reminder.local_time,'2099-09-10T13:00');assert.equal(reminder.sources.length,1);
 await remind.getByRole('button',{name:'Cancel',exact:true}).click();await remind.getByRole('heading',{name:'Reminder cancelled'}).waitFor();assert.equal(reminder.status,'cancelled');
 await p.locator('#bot-details').click();await p.getByRole('button',{name:'Artifacts',exact:true}).click();const overview=p.locator('.artifact-library');await overview.locator('summary').click();await overview.locator('[data-list="list-today"]').waitFor();assert(await overview.getByRole('heading',{name:'Northwind · Today',exact:true}).isVisible());await p.locator('#details-close').click();await overview.waitFor({state:'detached'});
 reminder.status='delivered';reminder.delivered_at=reminder.run_at+120;reminder.revision++;delivery=true;await p.reload();await p.locator('#content .reminder-card').last().getByRole('heading',{name:'Reminder',exact:true}).waitFor();assert(await p.getByText('Delivered after its scheduled time when the server and conversation were available.',{exact:true}).isVisible());assert.equal(await p.locator('#content .reminder-card button').count(),0);
 for(const theme of ['dark','light'])for(const width of [1320,390]){
  await p.setViewportSize({width,height:940});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.locator('#content').evaluate(n=>n.scrollTop=0);
  assert.equal(await p.locator('#chat-planning').count(),0);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow,'No viewport overflow '+width);
  await p.screenshot({path:path.join(artifacts,engine+'-planning-'+theme+'-'+width+'.png')});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,sharedChecklist:true,completionAdvancesWithoutExecuting:true,revisionConflict:true,workRequest:true,workRetryKeepsReceipt:true,editPreservesIds:true,reminderEditCancel:true,lateDelivery:true,safeSources:true,responsive:true,writes:writes.length}));
 await context.close();
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
