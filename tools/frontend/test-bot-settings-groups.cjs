const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try {
  const p=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],writes=[];
  p.on('pageerror',error=>errors.push(error.message));p.setDefaultTimeout(10000);
  await p.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  let bot={id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Keep instructions',memory:'Keep memory',approval_mode:'full',profile:{shape:'round',color:'#2475ff',eyes:'curious',label:'Assistant',description:'Fixture',notifications:true,animated:true,progress_updates:'summaries',pinned:true,initiative:false,initiative_instructions:'Keep guidance',custom_existing:'preserved'}};
  await p.route('**/api/bots',route=>route.fulfill({json:[bot]}));
  await p.route('**/api/bots/piper',route=>{bot=route.request().postDataJSON();writes.push(bot);return route.fulfill({json:bot});});
  let connectorWrites=0;
  const connections={preferred_source:'kindred',apps:[],provider_connections:[]};
  await p.route('**/api/bots/piper/connectors',route=>{if(route.request().method()==='PUT'){connectorWrites++;connections.preferred_source=route.request().postDataJSON().source;}return route.fulfill({json:connections});});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Piper');
  await p.locator('#prompt').fill('Keep this draft.');
  await p.locator('#bot-details').click();await p.locator('#details-panel .bot-center-actions').getByRole('button',{name:'Bot settings',exact:true}).click();
  const groups=p.locator('[data-bot-settings-group]');
  assert.equal(await groups.count(),5);assert.equal(await p.locator('[data-bot-settings-group][open]').count(),0);
  assert(!await p.locator('.bot-edit-form').getByLabel('Name',{exact:true}).isVisible());
  const open=async key=>{const group=p.locator('[data-bot-settings-group='+key+']');if(!await group.evaluate(node=>node.open))await group.locator(':scope > summary').click();return group;};
  const identity=await open('identity');await p.locator('.bot-edit-form').getByLabel('Name',{exact:true}).fill('Piper Work');await p.locator('.bot-edit-form').getByLabel('Role',{exact:true}).fill('Delivery');
  await open('model');assert.equal(await p.locator('[data-bot-settings-group][open]').count(),1);assert.match(await identity.locator('summary').innerText(),/Piper Work · Delivery/);
  await p.waitForFunction(()=>document.querySelector('[data-bot-settings-group=model] summary').textContent.includes('Test model'));
  await open('identity');assert.equal(await p.locator('.bot-edit-form').getByLabel('Name',{exact:true}).inputValue(),'Piper Work');assert.equal(await p.locator('.bot-edit-form').getByLabel('Role',{exact:true}).inputValue(),'Delivery');
  // A hidden invalid field is revealed without sending a partial bot update.
  await p.locator('.bot-edit-form').getByLabel('Name',{exact:true}).fill('');await open('behavior');await p.waitForFunction(()=>document.querySelector('[data-bot-settings-group=identity]').open);
  assert(await identity.evaluate(node=>node.open));assert.equal(await p.locator('[data-bot-settings-group][open]').count(),1);
  await p.locator('.bot-edit-form').getByLabel('Name',{exact:true}).fill('Piper Work');await open('behavior');
  await p.getByRole('switch',{name:'Notifications',exact:true}).uncheck();
  await p.waitForFunction(()=>document.querySelector('.bot-edit-form .preference-status').textContent==='Saved');
  assert.equal(bot.profile.notifications,false);assert.equal(bot.name,'Piper Work');assert.equal(bot.instructions,'Keep instructions');assert.equal(bot.memory,'Keep memory');assert.equal(bot.approval_mode,'full');assert.equal(bot.profile.custom_existing,'preserved');assert.equal(bot.profile.pinned,true);
  const beforeConnector=writes.length;await open('connections');await p.locator('[data-bot-settings-group=connections]').getByLabel(/^Preferred source/).selectOption('ask');await p.waitForTimeout(400);
  assert.equal(connectorWrites,1);assert.equal(writes.length,beforeConnector,'Connections keep their own save pipeline');
  assert.equal(await p.locator('#prompt').evaluate(node=>node.value),'Keep this draft.');assert.equal(await p.locator('[data-bot-settings-group][open]').count(),1);
  // Keyboard changes are immediate. System and application reduced motion prevent panel motion.
  const behavior=p.locator('[data-bot-settings-group=behavior]');await behavior.locator('summary').focus();await p.keyboard.press('Enter');assert(await behavior.evaluate(node=>node.open));assert.equal(await behavior.locator('.bot-setting-body').evaluate(node=>node.getAnimations().length),0);
  await p.emulateMedia({reducedMotion:'reduce'});await open('access');assert.equal(await p.locator('[data-bot-settings-group=access] .bot-setting-body').evaluate(node=>node.getAnimations().length),0);
  for(const width of [390,320]){await p.setViewportSize({width,height:900});await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.3'));for(const key of ['identity','model','behavior','access','connections']){const group=await open(key);assert(await group.evaluate(node=>node.scrollWidth<=node.clientWidth+1),key+' fits at '+width);}}
  await p.locator('#details-back').click();assert(await p.getByRole('heading',{name:'Routines',exact:true}).isVisible(),'Routines remain in bot Details');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',groups:5,oneExpanded:true,draftsPreserved:true,invalidFieldsRevealed:true,settingsPreserved:true,connectorPipelineIndependent:true,reducedMotion:true,narrowTextScale:true}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
