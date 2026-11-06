const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-gmail';fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});let errors=[],saves=[];
 try{for(const [width,height,label] of [[1280,940,'desktop'],[390,844,'phone'],[540,720,'duo']]){
  let connections=[],items=[];
  const account={id:'gmail_fixture',name:'Work Gmail',email:'work@example.test',source:'google',status:'connected'};
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/**',route=>{const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/identity/meta')return send({profiles:false});
   if(u.pathname==='/api/inbox-monitors'){
    if(req.method()==='POST'){const v=req.postDataJSON();saves.push(v);assert.equal(v.account_id,account.id);assert(!('client_secret'in v));items=[{...v,id:'watch-1',mailbox:account.email,checked_at:1793900000,status:'monitoring'}];return send(items[0]);}
    return send({connections,items,public_url:'https://kindred.example.test'});
   }
   if(u.pathname==='/api/gmail-connections/start'){const v=req.postDataJSON();assert.equal(v.client_secret,'fixture-secret');connections=[account];return send({url:'https://accounts.google.com/o/oauth2/v2/auth?state=fixture'});}
   if(u.pathname==='/api/inbox-monitors/watch-1/pause'){items[0].enabled=false;return send({ok:true});}
   if(u.pathname==='/api/inbox-monitors/watch-1'&&req.method()==='DELETE'){items=[];return send({ok:true});}
   if(u.pathname==='/api/composio')return send({configured:false,apps:[]});
   if(u.pathname==='/api/routines')return send([]);
   if(u.pathname==='/api/slack-monitoring')return send({connections:[],items:[]});
   return route.continue();
  });
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  if(await p.locator('#mobile-menu').isVisible())await p.locator('#mobile-menu').click();
  await p.locator('#identity-button').click();await p.locator('#identity-menu').getByRole('menuitem',{name:'Settings',exact:true}).click();await p.locator('#settings-nav').getByRole('button',{name:'Connections',exact:true}).click();await p.locator('.gmail-account > summary').click();
  const region=p.getByRole('region',{name:'Gmail monitoring'});await region.getByRole('button',{name:'Add monitor',exact:true}).click();
  const auth=p.getByRole('dialog',{name:'Connect Gmail monitoring',exact:true});await auth.getByLabel('Account name',{exact:true}).fill('Work Gmail');await auth.getByLabel('Google client ID',{exact:true}).fill('fixture.apps.googleusercontent.com');await auth.getByLabel('Google client secret',{exact:true}).fill('fixture-secret');
  assert.equal(await auth.getByLabel('Kindred server address',{exact:true}).inputValue(),'https://kindred.example.test');await auth.getByRole('button',{name:'Continue to Google',exact:true}).click();await auth.getByRole('link',{name:'Sign in with Google',exact:true}).waitFor().catch(async e=>{console.error(await auth.innerText());throw e;});assert.equal(await auth.getByLabel('Google client secret',{exact:true}).inputValue(),'');
  await auth.getByRole('button',{name:'Check connection',exact:true}).click();await auth.waitFor({state:'detached'});assert.equal(items.length,0,'Connecting must not start monitoring');
  await region.getByRole('button',{name:'Add monitor',exact:true}).click();let d=p.getByRole('dialog',{name:'New Gmail monitor',exact:true});await d.getByLabel('Assigned bot',{exact:true}).selectOption('piper');await d.getByLabel('Monitor name',{exact:true}).fill('Work inbox');
  assert.equal(await d.getByLabel('Detection',{exact:true}).inputValue(),'fast');assert(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await d.getByRole('button',{name:'Create monitor',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),d=el.closest('dialog').getBoundingClientRect();return r.bottom<=d.bottom&&r.top>=d.top;}),'Create stays visible without scrolling');await p.screenshot({path:path.join(artifacts,`gmail-${engine}-${label}-editor.png`)});
  await d.getByRole('button',{name:'Create monitor',exact:true}).click();await d.waitFor({state:'detached'});await region.locator('.slack-monitor-row summary').click();await region.getByRole('button',{name:'Pause',exact:true}).click();await region.getByText('Paused',{exact:true}).waitFor();await region.getByRole('button',{name:'Resume',exact:true}).click();await region.getByText('Monitoring',{exact:true}).waitFor();
  await region.getByRole('button',{name:'Edit',exact:true}).click();d=p.getByRole('dialog',{name:'Edit Gmail monitor',exact:true});assert(await d.getByLabel('Gmail account',{exact:true}).isDisabled());assert.equal(await d.getByLabel('Monitor name',{exact:true}).inputValue(),'Work inbox');await d.locator('.dialog-header').getByRole('button',{name:'Close',exact:true}).click();
  await p.screenshot({path:path.join(artifacts,`gmail-${engine}-${label}.png`)});await region.getByRole('button',{name:'Pause',exact:true}).click();await region.getByRole('button',{name:'Remove',exact:true}).click();await region.getByText('No Gmail monitors for this bot yet.',{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,saves:saves.length,desktop:true,phone:true,duo:true,connectDoesNotEnable:true,pauseResumeRemove:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
