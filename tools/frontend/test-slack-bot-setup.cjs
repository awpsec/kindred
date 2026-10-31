const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const errors=[],account={id:'slack-helpdesk',name:'Helpdesk',team_id:'T123',team_name:'Example team',user_id:'U123',user_name:'helpdesk',bot_id:'',status:'connected',error:''};
 async function fixture(width=1280,height=950,{completed=false,declined=false,dismissed=false}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const state={connections:[],completed,declined,dismissed,posts:[],failComplete:true,failList:false};
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/**',route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/identity/meta')return send({profiles:false});
   if(u.pathname==='/api/settings')return send({theme:'dark',reduced_motion:true,notifications:'all'});
   if(u.pathname==='/api/questions')return send([]);
   if(u.pathname==='/api/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages:[{seq:1,sender:'user',text:'Monitor all messages in urgent-requests, mentions everywhere, and my Helpdesk DMs.',kind:'message',created:100},{seq:2,sender:'piper',kind:'connection_card',text:JSON.stringify({toolkit:'slack_events',question_id:'q-slack',bot_id:'piper',account_name:'Helpdesk',completed:state.completed,declined:state.declined,dismissed:state.dismissed}),run_id:'run-screenshot',created:101}],page:{has_before:false,has_after:false}});
   if(u.pathname==='/api/slack-monitoring')return state.failList?route.fulfill({status:503,json:{error:'Connection status unavailable'}}):send({connections:state.connections,items:[]});
   if(req.method()==='POST'){
    const body=req.postDataJSON();state.posts.push({path:u.pathname,body});
    if(u.pathname==='/api/slack-connections'){assert.equal(body.app_token,'xapp-synthetic');assert.equal(body.access_token,'xoxp-synthetic');state.connections=[{...account,status:'connecting'}];return send(state.connections[0]);}
    if(u.pathname==='/api/slack-setup/q-slack/complete'){assert.deepEqual(body,{account_id:account.id});if(state.failComplete){state.failComplete=false;return route.fulfill({status:409,json:{error:'Slack reconnected; check again'}});}state.completed=true;return send({status:'connected',continuation_run_id:'resume-1'});}
    if(u.pathname==='/api/questions/q-slack/answer'){assert.deepEqual(body,{selected:1});state.completed=state.declined=true;return send({status:'answered'});}
   }
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);const card=page.locator('.slack-setup-card');await card.waitFor();return{context,page,card,state};
 }
 try{
  let f=await fixture();let{page,card,state}=f;
  await card.getByText('Connection needed',{exact:true}).waitFor();assert.equal(await card.locator('input').count(),0);
  await card.getByRole('button',{name:'Connect Slack',exact:true}).click();let dialog=page.locator('.slack-monitor-dialog');await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Connection name',{exact:true}).inputValue(),'Helpdesk');
  await dialog.getByLabel('App-level token',{exact:true}).fill('xapp-synthetic');await dialog.getByLabel('Slack account token',{exact:true}).fill('xoxp-synthetic');assert.equal(await dialog.getByLabel('App-level token',{exact:true}).getAttribute('type'),'password');
  await dialog.getByRole('button',{name:'Connect',exact:true}).click();await dialog.waitFor({state:'detached'});await card.getByText('Connecting',{exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:/^Use Helpdesk/}).count(),0);
  state.connections=[account];await card.getByRole('button',{name:/^Use Helpdesk/}).waitFor();
  await page.screenshot({path:path.join(artifacts,`slack-bot-setup-${engine}-desktop.png`)});
  await card.getByRole('button',{name:/^Use Helpdesk/}).click();await card.getByText('Slack reconnected; check again',{exact:true}).waitFor();assert.equal(state.completed,false);
  await card.getByRole('button',{name:/^Use Helpdesk/}).click();await card.getByText('Connected · setup continuing',{exact:true}).waitFor();assert.equal(state.posts.filter(p=>p.path.includes('/complete')).length,2);
  assert.equal(state.posts.filter(p=>p.path.includes('routines')||p.path==='/api/slack-monitors').length,0,'Connection alone must not create monitoring or polling');
  assert(!(await card.innerText()).includes('synthetic'));await page.reload();await card.getByRole('button',{name:'Manage monitoring',exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:/^Use /}).count(),0);
  await f.context.close();
  for(const [width,height,name] of [[390,844,'phone'],[466,780,'duo-front'],[900,650,'duo-inner']]){
   f=await fixture(width,height);({page,card,state}=f);state.connections=[account];await card.getByRole('button',{name:'Check again',exact:true}).click();await card.getByRole('button',{name:/^Use Helpdesk/}).waitFor();
   assert(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width<=600)assert(await card.getByRole('button',{name:'Connect Slack',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44));
   await page.screenshot({path:path.join(artifacts,`slack-bot-setup-${engine}-${name}.png`)});
   await card.getByRole('button',{name:'Connect Slack',exact:true}).click();dialog=page.locator('.slack-monitor-dialog');await dialog.waitFor();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await dialog.locator('.dialog-header').getByRole('button',{name:'Close',exact:true}).click();
   if(name==='phone'){await card.getByRole('button',{name:'Not now',exact:true}).click();await card.getByText('Setup deferred.',{exact:true}).waitFor();await page.reload();await card.getByText('Setup deferred.',{exact:true}).waitFor();assert.equal(state.posts.filter(p=>p.path.includes('/complete')).length,0);}
   await f.context.close();
  }
  f=await fixture(466,780,{completed:true,dismissed:true});await f.card.getByText('Setup dismissed.',{exact:true}).waitFor();assert.equal(await f.card.getByRole('button',{name:'Connect Slack',exact:true}).count(),0);await f.context.close();
  f=await fixture();f.state.failList=true;await f.card.getByRole('button',{name:'Check again',exact:true}).click();await f.card.getByText('Unavailable',{exact:true}).waitFor();await f.card.getByRole('button',{name:'Not now',exact:true}).click();await f.card.getByText('Setup deferred.',{exact:true}).waitFor();await f.context.close();
  f=await fixture();await f.page.evaluate(async account=>{
   const {slackSetupCard}=await import('/slack-monitoring.js');
   const node=(tag,cls='',text='')=>{const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;};
   const button=(text,action,cls)=>{const el=node('button',cls,text);el.onclick=action;return el;};
   const state={token:'workspace-one'},posts=[];
   const api=async(path,method,body)=>{if(method==='POST'){posts.push({token:state.token,path,body});return new Promise(resolve=>window.slackProbe.resolve=resolve);}return {connections:[account]};};
   const card=slackSetupCard({question_id:'q-fence',bot_id:'piper'},{api,node,button,state,logo:()=>node('span'),openMonitoring:()=>{}});card.id='slack-fence-probe';document.body.append(card);window.slackProbe={state,posts,card};
  },account);
  const probe=f.page.locator('#slack-fence-probe');await probe.getByRole('button',{name:/^Use Helpdesk/}).waitFor();
  await f.page.evaluate(()=>window.slackProbe.state.token='workspace-two');await probe.getByRole('button',{name:/^Use Helpdesk/}).dispatchEvent('click');assert.equal(await f.page.evaluate(()=>window.slackProbe.posts.length),0);
  await f.page.evaluate(()=>window.slackProbe.state.token='workspace-one');await probe.getByRole('button',{name:/^Use Helpdesk/}).dispatchEvent('click');
  await f.page.evaluate(()=>{window.slackProbe.state.token='workspace-two';window.slackProbe.resolve({status:'connected'});});
  assert.equal(await f.page.evaluate(()=>window.slackProbe.posts.length),1);assert.equal(await f.page.evaluate(()=>window.slackProbe.posts[0].token),'workspace-one');assert.notEqual(await probe.getAttribute('data-completed'),'true');await f.context.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,passed:true,connectionCard:true,verifiedAccountRetry:true,noPollingOrAutomaticRuleCreation:true,deferralAndDismissal:true,phoneAndDuo:true,workspaceFence:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
