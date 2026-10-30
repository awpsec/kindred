const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 let connections=[],items=[],saved=[],errors=[];
 const account={id:'slack-helpdesk',name:'Helpdesk',team_id:'T123',team_name:'Example team',user_id:'U123',user_name:'helpdesk',bot_id:'',app_id:'A123',status:'connected',error:''};
 async function setup(context,light=false){
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/**',route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/identity/meta')return send({profiles:false});
   if(u.pathname==='/api/inbox-monitors')return send({items:[]});
   if(u.pathname==='/api/composio')return send({configured:false,apps:[]});
   if(u.pathname==='/api/routines')return send([]);
   if(u.pathname==='/api/settings')return send({theme:light?'light':'dark',reduced_motion:true,notifications:'all'});
   if(u.pathname==='/api/slack-monitoring')return send({connections,items});
   if(u.pathname==='/api/slack-connections'){
    const v=req.postDataJSON();assert.equal(v.app_token,'xapp-synthetic');assert.equal(v.access_token,'xoxp-synthetic');connections=[account,{...account,id:'slack-secondary',name:'Triage',user_id:'U234',user_name:'triage'}];return send(account);
   }
   if(u.pathname.endsWith('/channels'))return send(u.searchParams.get('cursor')?{items:[{id:'C456',name:'helpdesk'}],next_cursor:''}:{items:[{id:'C123',name:'urgent-requests'}],next_cursor:'page-two'});
   if(u.pathname==='/api/slack-monitors'){
    const v=req.postDataJSON();saved.push(v);assert.equal(v.bot_id,'piper');assert.equal(v.account_id,account.id);assert(!('app_token'in v));items=[{...v,id:'watch-1',pending_messages:0,rules:v.rules.map(r=>({...r,channel_name:r.channel_id==='C123'?'urgent-requests':r.channel_id==='C456'?'helpdesk':''}))}];return send(items[0]);
   }
   if(u.pathname==='/api/slack-monitors/watch-1/control'){const v=req.postDataJSON();if(v.action==='remove')items=[];else items[0].enabled=v.action==='resume';return send({action:v.action});}
   return route.continue();
  });
 }
 async function open(page){page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});if(await page.locator('#mobile-menu').isVisible())await page.locator('#mobile-menu').click();await page.locator('#identity-button').click();await page.locator('#identity-menu').getByRole('menuitem',{name:'Settings',exact:true}).click();await page.locator('#settings-nav').getByRole('button',{name:'Slack monitoring',exact:true}).click();await page.getByRole('region',{name:'Slack monitoring'}).waitFor();}
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'});await setup(context);const p=await context.newPage();p.setDefaultTimeout(12000);await open(p);
  let section=p.getByRole('region',{name:'Slack monitoring'});await section.getByRole('button',{name:'Add monitor',exact:true}).click();let d=p.locator('.slack-monitor-dialog');await d.getByText('Set up the Slack app',{exact:true}).click();
  let manifest=JSON.parse(await d.getByLabel('Slack app manifest',{exact:true}).inputValue());assert(manifest.settings.event_subscriptions.user_events);assert(!manifest.settings.event_subscriptions.bot_events);assert(!manifest.oauth_config.scopes.bot);
  await d.getByLabel('Monitor as',{exact:true}).selectOption('bot');manifest=JSON.parse(await d.getByLabel('Slack app manifest',{exact:true}).inputValue());assert(manifest.settings.event_subscriptions.bot_events);assert(!manifest.settings.event_subscriptions.user_events);await d.getByLabel('Monitor as',{exact:true}).selectOption('user');
  assert((await d.locator('ol').innerText()).includes('User OAuth Token'));await d.getByLabel('App-level token',{exact:true}).fill('xapp-synthetic');await d.getByLabel('Slack account token',{exact:true}).fill('xoxp-synthetic');await d.getByRole('button',{name:'Connect',exact:true}).click();
  // A new connection continues into the monitor editor without another setup hunt.
  await p.getByRole('dialog',{name:'Connect Slack',exact:true}).waitFor({state:'detached'});
  d=p.getByRole('dialog',{name:'Slack monitoring',exact:true});await d.getByRole('button',{name:'Create monitor',exact:true}).waitFor();
  assert.equal(await d.getByLabel('Bot',{exact:true}).inputValue(),'piper');await d.getByRole('button',{name:'Close',exact:true}).click();
  await section.getByRole('button',{name:'Add monitor',exact:true}).click();d=p.locator('.slack-monitor-dialog');await d.getByText('helpdesk · Example team · Slack account',{exact:true}).waitFor();await d.getByRole('button',{name:'Load more channels',exact:true}).click();
  await d.getByRole('button',{name:'Add rule',exact:true}).click();await d.locator('.slack-rule-edit').nth(1).getByLabel('Where',{exact:true}).selectOption('channel:C123');
  await d.getByRole('button',{name:'Add rule',exact:true}).click();await d.locator('.slack-rule-edit').nth(2).getByLabel('Where',{exact:true}).selectOption('direct_messages');
  await d.getByRole('button',{name:'Add rule',exact:true}).click();await d.locator('.slack-rule-edit').nth(3).getByLabel('Event',{exact:true}).selectOption('mentions');await d.locator('.slack-rule-edit').nth(3).getByLabel('Where',{exact:true}).selectOption('channel:C456');
  await d.getByLabel('Slack account',{exact:true}).selectOption('slack-secondary');await d.getByText('triage · Example team · Slack account',{exact:true}).waitFor();assert.equal(await d.locator('.slack-rule-edit').nth(0).getByLabel('Where',{exact:true}).inputValue(),'all_channels');assert.equal(await d.locator('.slack-rule-edit').nth(1).getByLabel('Where',{exact:true}).inputValue(),'');assert.equal(await d.locator('.slack-rule-edit').nth(2).getByLabel('Where',{exact:true}).inputValue(),'direct_messages');
  await d.getByLabel('Slack account',{exact:true}).selectOption(account.id);await d.getByRole('button',{name:'Load more channels',exact:true}).click();await d.locator('.slack-rule-edit').nth(1).getByLabel('Where',{exact:true}).selectOption('channel:C123');await d.locator('.slack-rule-edit').nth(3).getByLabel('Where',{exact:true}).selectOption('channel:C456');
  assert.equal(await d.getByLabel('What should your bot do?').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
  assert(await d.getByRole('button',{name:'Create monitor',exact:true}).evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('dialog').getBoundingClientRect();return a.bottom<b.bottom&&a.top>b.top;}),'Save stays inside the dialog');
  await p.screenshot({path:path.join(artifacts,`slack-${engine}-rules.png`)});
  await d.getByRole('button',{name:'Create monitor',exact:true}).click();await d.waitFor({state:'detached'});assert.equal(saved.length,1);assert.equal(saved[0].rules.length,4);
  assert.match(await section.locator('.slack-rule-overview').innerText(),/Mentions → All channels.*All messages → #urgent-requests.*\+2 more/);
  assert.equal(await section.locator('.slack-monitor-row').evaluate(el=>el.open),false);
  await section.locator('.slack-monitor-row summary').click();await section.getByText('All messages → Direct Messages (Helpdesk)',{exact:true}).waitFor();await p.screenshot({path:path.join(artifacts,`slack-${engine}-desktop.png`)});
  await section.getByRole('button',{name:'Pause',exact:true}).click();await section.getByText('Paused',{exact:true}).waitFor();await section.getByRole('button',{name:'Resume',exact:true}).click();await section.getByText('Listening',{exact:true}).waitFor();
  await section.getByRole('button',{name:'Edit',exact:true}).click();await d.getByRole('button',{name:'Save monitor',exact:true}).waitFor();assert.equal(await d.locator('.slack-rule-edit').count(),4);assert(await d.getByLabel('Slack account',{exact:true}).isDisabled());await d.locator('.dialog-header').getByRole('button',{name:'Close',exact:true}).click();
  const retained=await section.locator('.slack-monitor-row').elementHandle();await p.waitForTimeout(16000);assert(await retained.evaluate(el=>el.isConnected&&el.open),'Unchanged refresh preserves the expanded monitor and avatar');
  await context.close();
  for(const [width,height,name] of [[390,844,'phone'],[540,720,'duo']]){
   const mobile=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',colorScheme:'light'});await setup(mobile,true);const page=await mobile.newPage();await open(page);await page.getByRole('region',{name:'Slack monitoring'}).locator('.slack-monitor-row summary').click();await page.getByRole('region',{name:'Slack monitoring'}).getByRole('button',{name:'Edit',exact:true}).click();const form=page.locator('.slack-monitor-dialog');await form.getByRole('button',{name:'Save monitor',exact:true}).waitFor();await page.screenshot({path:path.join(artifacts,`slack-${engine}-${name}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await mobile.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,passed:true,rules:4,desktop:true,phone:true,duo:true,separateAccountCredentials:true,pauseResume:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
