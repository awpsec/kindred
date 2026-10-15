const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();
 async function fixture({legacy=false,group=false}={}){
  const context=await browser.newContext({viewport:{width:1000,height:900}}),p=await context.newPage(),errors=[],writes=[],claims=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const now=Math.floor(Date.now()/1000),chat={id:group?'team-work':'dm-piper',name:group?'Team work':'Piper',members:group?['piper','izabella']:['piper'],pinned:group},other={id:'dm-izabella',name:'Izabella',members:['izabella']};
  const run={id:'working',bot_id:'piper',chat_id:chat.id,status:'running',created:now,prompt:'Working',output:'',error:'',depth:0};
  const queued={seq:2,sender:'user',text:'Original queued text',kind:'message',created:now,files:[{id:'original-file',name:'note.txt',size:5,mime:null}],delivery:[{bot_id:'piper',run_id:'queued',status:'queued',mode:'queue'}]};
  const messages=[{seq:1,sender:'user',text:'Working',kind:'message',created:now-1},queued];
  const model={fail:null,hold:null,applied:0,includeWithdrawn:true};
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  if(group)await context.addInitScript(()=>sessionStorage.setItem('kindred-reload-selection',JSON.stringify({bot:'piper',chat:'team-work'})));
  if(legacy){
   queued.kind='withdrawn';queued.delivery[0].status='withdrawn';
   await context.addInitScript(()=>{
    sessionStorage.setItem('kindred-reload-selection',JSON.stringify({bot:'piper',chat:'dm-piper'}));
    sessionStorage.setItem('kindred-reload-drafts',JSON.stringify([['dm-piper','Recovered prior draft']]));
    sessionStorage.setItem('kindred-reload-queueEdits',JSON.stringify([['dm-piper:2',{request_id:'00000000-0000-4000-8000-000000000001',expected_text:'Original queued text',seq:2,chat_id:'dm-piper',payload:{text:'Original queued text',files:[{id:'edit-file',name:'note.txt',size:5,mime:null}],mentions:['piper'],reply_to:1,chat_id:'dm-piper',message_seq:2}}]]));
   });
  }
  await p.route(origin+'/api/**',async r=>{
   const req=r.request(),name=new URL(req.url()).pathname.slice(4),send=json=>r.fulfill({json});
   if(name==='/questions')return send([]);
   if(name==='/settings')return send({name:'You',theme:'dark',approval_mode:'auto',message_delivery:'steer'});
   if(name==='/chats')return send([chat,other]);
   if(name==='/bots')return send(['Piper','Izabella'].map(name=>({id:name.toLowerCase(),name,memory:'',provider:'codex',model:'test',profile:{shape:'round',color:'#2475ff'}})));
   if(name==='/runs')return send([run,{...run,id:'queued',status:queued.delivery[0].status}]);
   if(name.startsWith('/runs/'))return send({run:name.endsWith('/queued')?{...run,id:'queued',status:queued.delivery[0].status}:run,events:[],approvals:[],attachments:[]});
   if(name==='/chats/'+chat.id)return send({chat,messages:model.includeWithdrawn?messages:messages.filter(m=>m.kind!=='withdrawn')});
   if(name==='/chats/'+other.id)return send({chat:other,messages:[{seq:10,sender:'izabella',text:'Other conversation',kind:'message',created:now}]});
   if(name==='/chats/'+chat.id+'/messages'){
    const body=req.postDataJSON();writes.push(body);messages.push({seq:3,sender:'user',text:body.prompt,kind:'message',created:now+1,files:[],delivery:[{bot_id:'piper',run_id:'fresh',status:'queued',mode:body.delivery_mode}]});return send({ok:true});
   }
   if(name==='/chats/'+chat.id+'/messages/2'){
    assert.equal(req.method(),'PATCH');assert.equal(req.headers().authorization,'Bearer '+token);
    const b=req.postDataJSON();claims.push(b);assert.equal(b.restore_to_composer,true);assert.equal(b.expected_text,'Original queued text');assert.match(b.request_id,/^[\da-f-]{36}$/i);
    if(model.hold)await model.hold;
    if(model.fail==='consumed')return r.fulfill({status:409,json:{error:'This message already reached Piper.'}});
    if(model.fail==='temporary')return r.fulfill({status:503,json:{error:'The server is temporarily unavailable.'}});
    queued.kind='withdrawn';queued.delivery[0].status='withdrawn';model.applied++;
    return send({text:'Original queued text',files:[{id:'edit-file',name:'note.txt',size:5,mime:null}],mentions:['piper'],reply_to:1,chat_id:chat.id,message_seq:2});
   }
   return r.continue();
  });
  const edit=()=>p.getByRole('button',{name:'Edit queued message',exact:true}),draft=()=>p.locator('#prompt').evaluate(e=>e.value);
  const noPane=async()=>{assert.equal(await p.locator('#queued-edit-prompt').count(),0);assert.equal(await p.getByRole('dialog',{name:'Edit queued message'}).count(),0);};
  const noRemnant=async()=>{await p.waitForFunction(()=>!document.querySelector('[data-message="2"]'));assert.equal(await p.locator('#content').getByText('Original queued text',{exact:true}).count(),0);assert.equal(await p.getByText('Removed from the queue',{exact:true}).count(),0);};
  await p.goto(origin);if(!legacy)await edit().waitFor();else await p.locator('#composer').waitFor();
  return {context,p,errors,writes,claims,model,messages,queued,edit,draft,noPane,noRemnant,close:async()=>{assert.deepEqual(errors,[]);await context.close();}};
 }
 try{
  // A single click claims the queue entry and restores the whole message, without a confirmation or an old bubble.
  {
   const f=await fixture();await f.edit().click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Original queued text');
   await f.noPane();await f.noRemnant();assert.equal(f.claims.length,1);assert.equal(f.writes.length,0);assert.equal(await f.p.locator('.composer-file').count(),1);assert.equal(await f.p.locator('#prompt').evaluate(e=>e===document.activeElement),true);
   // Older servers can still return withdrawn rows, and newer servers can omit them. Neither may resurrect the bubble on reload.
   await f.p.reload();await f.p.locator('#composer').waitFor();await f.noRemnant();assert.equal(await f.draft(),'Original queued text');
   f.model.includeWithdrawn=false;await f.p.reload();await f.p.locator('#composer').waitFor();await f.noRemnant();assert.equal(await f.draft(),'Original queued text');
   const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});await f.p.screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-queue-restored.png')});
   await f.p.locator('#prompt').fill('Corrected queued text');await f.p.locator('#send').click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='');
   assert.equal(f.writes.length,1);assert.equal(f.writes[0].delivery_mode,'queue');assert.deepEqual(f.writes[0].files,['edit-file']);assert.equal(f.writes[0].reply_to,1);assert.deepEqual(f.writes[0].mentions,[],'DM delivery uses its selected bot');assert.equal(f.writes[0].prompt,'Corrected queued text');await f.p.locator('#content').getByText('Corrected queued text',{exact:true}).waitFor();await f.noRemnant();await f.close();
  }
  // Group mentions remain recipients even when editing the original text removes its visible mention.
  {
   const f=await fixture({group:true});await f.edit().click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Original queued text');await f.p.locator('#prompt').fill('Revised team request');await f.p.locator('#send').click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.deepEqual(f.writes[0].mentions,['piper']);assert.equal(f.writes[0].delivery_mode,'queue');await f.noRemnant();await f.close();
  }
  // Editing cannot erase another draft or steal a message the bot has already consumed.
  {
   const f=await fixture();await f.p.locator('#prompt').fill('Keep this draft');f.model.fail='consumed';await f.edit().click();await f.p.getByText('This message already reached Piper.',{exact:true}).waitFor();await f.noPane();assert.equal(await f.draft(),'Keep this draft');assert.equal(f.model.applied,0);assert.equal(f.claims.length,1);
   f.model.fail='temporary';await f.edit().click();await f.p.getByText('The server is temporarily unavailable.',{exact:true}).waitFor();assert.equal(await f.draft(),'Keep this draft');assert.notEqual(f.claims[0].request_id,f.claims[1].request_id);
   f.model.fail=null;await f.edit().click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Keep this draft\n\nOriginal queued text');assert.equal(f.claims[1].request_id,f.claims[2].request_id,'A temporary error retries the same idempotent claim');await f.noPane();await f.noRemnant();await f.close();
  }
  // Typing while the network request is outstanding must preserve those new edits.
  {
   const f=await fixture();let release;f.model.hold=new Promise(r=>release=r);await f.p.locator('#prompt').fill('First draft');await f.edit().click();await f.p.waitForTimeout(50);assert.equal(f.claims.length,1);await f.noPane();await f.p.locator('#prompt').fill('Draft changed while waiting');release();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Draft changed while waiting\n\nOriginal queued text');assert.equal(f.model.applied,1);await f.noRemnant();await f.close();
  }
  // A late claim belongs to its source chat, never the chat the user opens next.
  {
   const f=await fixture();let release;f.model.hold=new Promise(r=>release=r);await f.p.locator('#prompt').fill('Piper draft');await f.edit().click();await f.p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();await f.p.getByText('Other conversation',{exact:true}).waitFor();await f.p.locator('#prompt').fill('Private Izabella draft');release();await f.p.waitForTimeout(150);assert.equal(await f.draft(),'Private Izabella draft');assert.equal(await f.p.locator('.composer-file').count(),0);
   await f.p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Piper draft\n\nOriginal queued text');await f.noRemnant();assert.equal(await f.p.locator('.composer-file').count(),1);await f.close();
  }
  // A successful claim left by the previous UI recovers into its draft without exposing its tombstone.
  {
   const f=await fixture({legacy:true});await f.p.waitForFunction(()=>document.querySelector('#prompt').value==='Recovered prior draft\n\nOriginal queued text');await f.noPane();await f.noRemnant();assert.equal(f.claims.length,0,'A saved successful claim is restored without another withdrawal');assert.equal(await f.p.locator('.composer-file').count(),1);await f.close();
  }
  console.log('Queue editing: one-click restore; no withdrawn bubbles across reload; files/reply/mentions; fresh queue send; consumed race; idempotent retry; draft typing and chat-switch races PASS');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
