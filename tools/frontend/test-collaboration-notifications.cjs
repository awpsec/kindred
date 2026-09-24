const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[],portraits=[],stops=[];
  p.on('pageerror',e=>errors.push(e.message));
  const a={id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff'}},b={id:'mara',name:'Mara',provider:'codex',profile:{shape:'triangle',color:'#ff9754'}};
  const dm={id:'dm-piper',name:'Piper',members:['piper'],archived:false},team={id:'team-qa',name:'QA collaboration',members:['piper','mara'],archived:false},now=Math.floor(Date.now()/1000);
  const parent={id:'parent',bot_id:a.id,chat_id:dm.id,prompt:'Ask Mara to review the notes',status:'completed',output:'I asked Mara.',error:'',created:now,depth:0};
  let waiting=true,notify=false;
  const waits=()=>waiting?[{parent_run_id:parent.id,requester_bot_id:a.id,bot_id:b.id,run_id:'helper',chat_id:team.id,status:'running',name:b.name}]:[];
  const message={seq:1,sender:'user',kind:'message',text:parent.prompt,created:now,run_id:parent.id};
  await context.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);
   window.fixtureNotifications=[];window.fixtureSounds=0;window.fixtureDecoded=0;
   window.AudioContext=class {state='running';destination={};resume(){return Promise.resolve();}decodeAudioData(bytes){window.fixtureDecoded++;if(bytes.byteLength<1000)throw Error('Invalid sound');return Promise.resolve({});}createBufferSource(){return {connect(){},disconnect(){},start(){window.fixtureSounds++;}};}};
   window.Notification=class {static permission='granted';constructor(title,options){this.title=title;this.options=options;window.fixtureNotifications.push(this);}close(){if(this.onclose)this.onclose();}};
  },token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),name=url.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send([a,b]);if(name==='/chats')return send([dm,team]);if(name==='/runs')return send([parent]);if(name==='/runs/'+parent.id)return send({run:parent,events:[],attachments:[],approvals:[]});if(name==='/activity')return send({});
   if(name==='/chats/'+dm.id)return send({chat:dm,messages:[message],pending_waits:waits()});
   if(name==='/chats/'+team.id)return send({chat:team,messages:[{...message,text:'Helper conversation'}],pending_waits:waits()});
   if(name==='/notifications')return send({cursor:notify?1:0,items:notify&&url.searchParams.has('after')&&Number(url.searchParams.get('after'))<1?[{id:1,bot_id:b.id,chat_id:team.id,title:'Mara',body:'The review found two items to address.',avatar_key:'a'.repeat(64)}]:[]});
   if(name==='/bots/mara/avatar.png'){portraits.push(req.headers().authorization);return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});}
   if(name==='/runs/parent/cancel'){stops.push(req.method());waiting=false;return send({ok:true});}
   return route.continue();
  });
  await p.goto(origin);await p.getByText('Piper is waiting for answer from Mara',{exact:true}).waitFor();
  assert.equal(await p.locator('.collaboration-wait .character').count(),0);
  await p.reload();await p.getByText('Piper is waiting for answer from Mara',{exact:true}).waitFor();
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:path.join(artifacts,engine+'-waiting-mobile.png')});
  await p.locator('.collaboration-wait .work-line').hover();await p.locator('.collaboration-wait').getByRole('button',{name:'Stop task for Piper',exact:true}).click();await p.locator('.collaboration-wait').waitFor({state:'hidden'});assert.deepEqual(stops,['POST']);
  notify=true;await p.waitForFunction(()=>window.fixtureNotifications.length===1);const n=await p.evaluate(()=>({title:window.fixtureNotifications[0].title,options:window.fixtureNotifications[0].options}));assert.equal(n.options.silent,true);await p.waitForFunction(()=>window.fixtureSounds===1);assert.equal(await p.evaluate(()=>window.fixtureDecoded),1);assert.equal(n.title,'Mara');assert.equal(n.options.body,'The review found two items to address.');assert(n.options.icon.startsWith('blob:'));assert.deepEqual(portraits,['Bearer '+token]);
  await p.evaluate(()=>window.fixtureNotifications[0].onclick());await p.getByText('Helper conversation',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,waitingAvatar:true,waitingSurvivesReload:true,stopClearsWait:true,messagePreview:true,avatarFetchAuthenticated:true,notificationClickOpensConversation:true,mobileNoOverflow:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
