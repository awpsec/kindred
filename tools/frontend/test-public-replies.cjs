const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try {
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const initial='Yes, let me check for connections.',final='You can sign in on my computer to continue.';
  const run={id:'reply-test',bot_id:'piper',chat_id:chat.id,prompt:'Check my accounts',status:'awaiting_user',output:'',error:'',created:now};
  const messages=[{seq:1,sender:'user',text:run.prompt,kind:'message',created:now},{seq:2,sender:'piper',text:initial,kind:'assistant',run_id:run.id,source_event_seq:10,created:now}];
  const events=[{seq:10,kind:'assistant',body:{text:initial},created:now},{seq:11,kind:'tool_requested',body:{tool:'connectors_list',args:{}},created:now}];
  let general={name:'You',identity:'',theme:'dark',reduced_motion:true,approval_mode:'ask'},human={id:'signin',run_id:run.id,bot_id:'piper',status:'pending',instructions:'Sign in on my computer.'};
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/settings'){if(req.method()==='PUT')general=req.postDataJSON();return send(general);}
   if(name==='/chats')return send([chat]);if(name==='/chats/'+chat.id)return send({chat,messages});
   if(name==='/runs')return send([run]);if(name==='/runs/'+run.id)return send({run,events,approvals:[],attachments:[]});
   if(name==='/user-tasks')return send([human]);if(name==='/activity')return send({});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const area=p.locator('#content');await area.getByText(initial,{exact:true}).waitFor();
  assert.equal(await area.getByText(initial,{exact:true}).count(),1,'Persisted replies are not repeated by live events');
  assert.equal(await area.locator('.activity').count(),0,'Raw activity defaults off');
  await area.getByRole('button',{name:'Take over',exact:true}).waitFor();
  await p.locator('#settings-button').click();
  const toggle=p.getByRole('switch',{name:'Show activity in chats',exact:true});await toggle.check();
  await p.waitForFunction(()=>document.querySelector('#content .activity'));
  assert.equal(general.show_activity,true);
  await toggle.uncheck();await p.waitForFunction(()=>!document.querySelector('#content .activity'));assert.equal(general.show_activity,false);
  await p.keyboard.press('Escape');await area.getByRole('button',{name:'Take over',exact:true}).waitFor();
  run.status='completed';run.output=final;human={...human,status:'resumed',outcome:'done'};
  messages.push({seq:3,sender:'piper',text:final,kind:'result',run_id:run.id,source_event_seq:12,created:now+1});events.push({seq:12,kind:'assistant',body:{text:final},created:now+1});
  await area.getByText(final,{exact:true}).waitFor();assert.equal(await area.getByText(initial,{exact:true}).count(),1);assert.equal(await area.getByText(final,{exact:true}).count(),1);
  await p.reload();await area.getByText(final,{exact:true}).waitFor();assert.equal(await area.getByText(initial,{exact:true}).count(),1);assert.equal(await area.locator('.activity').count(),0);
  await p.locator('#settings-button').click();await p.getByRole('switch',{name:'Show activity in chats',exact:true}).check();await p.waitForFunction(()=>document.querySelector('#content .activity'));
  await p.reload();await area.locator('.activity').waitFor();assert.equal(await area.getByText(initial,{exact:true}).count(),1);assert.equal(await area.getByText(final,{exact:true}).count(),1);
  assert.deepEqual(errors,[]);console.log(engine+': public replies stay visible during completion and reload; global activity off/on persists; sign-in request remains visible.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
