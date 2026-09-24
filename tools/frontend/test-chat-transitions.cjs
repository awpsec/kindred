const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_TEST_BROWSER==='edge'?'edge':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:!process.env.KINDRED_HEADED}:{headless:!process.env.KINDRED_HEADED,...(engine==='edge'?{channel:'msedge'}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=[{id:'piper',name:'Piper'},{id:'iz',name:'Izabella'}].map(b=>({...b,provider:'codex',profile:{shape:b.id==='iz'?'capsule':'cloud',color:b.id==='iz'?'#ff9d36':'#2475ff'}}));
  const chat={id:'team-fixture',name:'Piper, Izabella',members:['piper','iz'],archived:false},dm={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const outside={id:'outside',bot_id:'piper',chat_id:dm.id,status:'running',prompt:'Original private request',output:'',error:'',created:now};
  let work={id:'work',bot_id:'iz',chat_id:chat.id,status:'running',prompt:'Handle inbox work',output:'',error:'',created:now},general={name:'You',identity:'',theme:'dark',reduced_motion:false,approval_mode:'ask'};
  const messages=[{seq:1,sender:'piper',text:'Please handle inbox work.',kind:'handoff',run_id:outside.id,source_event_seq:null,created:now}],events=[];
  let lagFinalPage=true;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/settings')return send(general);if(name==='/chats')return send([dm,chat]);
   if(name==='/chats/'+chat.id){if(lagFinalPage&&messages.some(m=>m.seq===2)){lagFinalPage=false;return send({chat,messages:messages.filter(m=>m.seq!==2)});}return send({chat,messages});}if(name==='/chats/'+dm.id)return send({chat:dm,messages:[]});
   if(name==='/runs')return send([work,outside]);
   if(name==='/runs/outside')return send({run:outside,events:[{seq:99,kind:'assistant',body:{text:'Private progress must stay in the DM'},created:now}],approvals:[],attachments:[]});
   if(name==='/runs/'+work.id)return send({run:work,events,approvals:[],attachments:[]});
   if(name==='/runs/work')return send({run:{...work,id:'work',status:'completed',output:'I saved my role as your inbox organizer.'},events:[],approvals:[],attachments:[]});
   if(name==='/activity')return send({piper:{status:'running',shape:'think',started_at:now},iz:{status:work.status,shape:work.status==='running'?'think':'idle',started_at:now}});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#bots').getByRole('button',{name:'Piper, Izabella',exact:true}).click();
  const area=p.locator('#content');await area.locator('.work-line .character[data-bot-id="iz"]').waitFor();await p.waitForTimeout(1250);
  assert.equal(await area.locator('.work-line').count(),1,'A referenced DM run cannot appear as work in this group');
  assert.equal(await area.getByText('Private progress must stay in the DM',{exact:true}).count(),0);
  work.status='completed';work.output='I saved my role as your inbox organizer.';
  messages.push({seq:2,sender:'iz',text:work.output,kind:'result',run_id:work.id,source_event_seq:12,created:now+1});events.push({seq:12,kind:'assistant',body:{text:work.output},created:now+1});
  await area.locator('[data-message="2"]').waitFor();await area.locator('[data-finishing-run="work"]').waitFor();
  const avatar=area.locator('[data-finishing-run="work"] .character');
  const departureAt=await avatar.evaluate(n=>n._character.departureAt);assert(departureAt>Date.now(),'Bot lingers after the reply appears');
  const until=async at=>{const left=at-Date.now();if(left>0)await p.waitForTimeout(left);};
  await until(departureAt-600);assert.equal(await avatar.evaluate(n=>n._character.presence.getAttribute('transform')),null);
  await p.screenshot({path:path.join(artifacts,engine+'-reply-linger.png')});
  await until(departureAt+390);const transform=await avatar.evaluate(n=>n._character.presence.getAttribute('transform'));assert.match(transform,/scale\(0\./,'The body shrinks toward a dot');
  await p.screenshot({path:path.join(artifacts,engine+'-reply-depart.png')});
  await area.locator('[data-finishing-run="work"]').waitFor({state:'detached'});
  assert.equal(await area.getByText(work.output,{exact:true}).count(),1);assert.equal(await area.locator('.work-line').count(),0);
  await p.waitForTimeout(1600);assert.equal(await area.locator('.work-line').count(),0,'Polling cannot revive the finished bot');
  await p.reload();await p.locator('#bots').getByRole('button',{name:'Piper, Izabella',exact:true}).click();await area.locator('[data-message="2"]').waitFor();assert.equal(await area.locator('.finishing-work,.reply-arriving').count(),0,'History does not replay arrival or departure');
  // Reduced motion keeps the answer immediate and omits all lingering/shrinking.
  general.reduced_motion=true;work={...work,id:'reduced',status:'running',output:''};events.length=0;
  await p.reload();await p.locator('#bots').getByRole('button',{name:'Piper, Izabella',exact:true}).click();await area.locator('.work-line .character[data-bot-id="iz"]').waitFor();
  work.status='completed';work.output='A quiet completion.';messages.push({seq:3,sender:'iz',text:work.output,kind:'result',run_id:work.id,source_event_seq:13,created:now+2});
  await area.locator('[data-message="3"]').waitFor();assert.equal(await area.locator('.finishing-work,.reply-arriving,.work-line').count(),0);
  assert.equal(lagFinalPage,false);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,replyLinger:true,reverseDotExit:true,noPhantomDmWork:true,lateResultPage:true,noReplay:true,reducedMotion:true,errors}));
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
