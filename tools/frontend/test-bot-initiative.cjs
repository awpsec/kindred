const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],writes=[];
  p.on('pageerror',error=>errors.push(error.message));
  await p.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  let bot={id:'piper',name:'Piper',provider:'codex',model:'test',reasoning_effort:'high',instructions:'Keep these instructions',memory:'Keep this memory',approval_mode:'full',profile:{shape:'round',color:'#2475ff',eyes:'curious',label:'Assistant',description:'Fixture',notifications:true,animated:true,progress_updates:'summaries',pinned:true,custom_existing:'preserved'}};
  let settings={name:'You',theme:'dark',reduced_motion:true,approval_mode:'ask'};
  await p.route('**/api/settings',route=>route.fulfill({json:settings}));
  await p.route('**/api/bots',route=>route.fulfill({json:[bot]}));
  await p.route('**/api/bots/piper',route=>{
   assert.equal(route.request().method(),'PUT');bot=route.request().postDataJSON();writes.push(structuredClone(bot));return route.fulfill({json:bot});
  });
  const open=async()=>{await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Piper');await p.locator('#bot-details').click();await p.locator('#details-panel .bot-center-actions').getByRole('button',{name:'Bot settings',exact:true}).click();};
  const waitWrite=async(count,accepted=()=>true)=>{for(let i=0;i<100&&(writes.length<count||!accepted());i++)await p.waitForTimeout(50);assert(writes.length>=count&&accepted(),'Expected autosave');await p.locator('.bot-edit-form .preference-status').filter({hasText:'Saved'}).waitFor();};
  await open();
  const toggle=p.getByRole('switch',{name:'Take initiative',exact:true}),guidance=p.getByLabel('What should this bot keep an eye on?',{exact:true});
  assert(!await toggle.isChecked(),'Existing bots default off');assert(!await guidance.isVisible());
  await toggle.check();await waitWrite(1);assert.equal(bot.profile.initiative,true);
  assert(await p.getByText(/Set your timezone in Settings → General/).isVisible());
  assert(await p.getByText(/Turning this off leaves routines, monitoring, and teammate updates unchanged/).isVisible());
  const instruction='Follow Aldabra contracts and delivery dates. Bring drafts to our DM.';
  await guidance.fill(instruction);await waitWrite(2);assert.equal(bot.profile.initiative_instructions,instruction);
  for(const value of writes){assert.equal(value.approval_mode,'full');assert.equal(value.instructions,'Keep these instructions');assert.equal(value.memory,'Keep this memory');assert.equal(value.profile.custom_existing,'preserved');assert.equal(value.profile.pinned,true);assert.equal(value.profile.progress_updates,'summaries');}
  // Appearance saves must retain initiative and guidance, and later toggles must retain appearance.
  await p.locator('.bot-edit-form .avatar-edit').click();await p.locator('#color-options .color-option:not(.selected)').first().click();await waitWrite(3,()=>bot.profile.color!=='#2475ff');
  const editedColor=bot.profile.color;assert.notEqual(editedColor,'#2475ff');assert.equal(bot.profile.initiative_instructions,instruction);
  await p.locator('#avatar-dialog').evaluate(dialog=>dialog.close());
  await toggle.uncheck();await waitWrite(4,()=>bot.profile.initiative===false);assert.equal(bot.profile.initiative,false);assert.equal(bot.profile.initiative_instructions,instruction);assert.equal(bot.profile.color,editedColor);assert(!await guidance.isVisible());
  settings.timezone='America/New_York';await open();assert(!await toggle.isChecked());
  await toggle.check();await waitWrite(5,()=>bot.profile.initiative===true);assert.equal(await guidance.inputValue(),instruction);
  assert(await p.getByText(/08:00 and 20:00 \(America\/New_York\)/).isVisible());assert.equal(await p.getByText(/Set your timezone in Settings → General/).count(),0);
  // The server limit is UTF-8 bytes, not JS character count.
  const beforeInvalid=writes.length;await guidance.fill('🙂'.repeat(600));await p.waitForTimeout(500);assert.equal(writes.length,beforeInvalid);assert(!await guidance.evaluate(input=>input.checkValidity()));
  await toggle.uncheck();await waitWrite(beforeInvalid+1,()=>bot.profile.initiative===false);assert.equal(bot.profile.initiative_instructions,instruction,'Invalid unsaved guidance must not block disabling');
  await toggle.check();await guidance.fill(instruction);await waitWrite(beforeInvalid+2,()=>bot.profile.initiative===true);
  await p.setViewportSize({width:390,height:844});await guidance.scrollIntoViewIfNeeded();
  assert(await p.locator('.bot-initiative-settings').evaluate(root=>root.scrollWidth<=root.clientWidth+1),'Controls fit narrow panel');
  await toggle.uncheck();await waitWrite(beforeInvalid+3,()=>bot.profile.initiative===false);await open();assert(!await toggle.isChecked());assert.equal(await guidance.inputValue(),instruction);assert.equal(bot.profile.color,editedColor);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',defaultOff:true,autosave:true,guidanceRetained:true,permissionsAndProfilePreserved:true,avatarPreserved:true,timezoneExplicit:true,utf8Limit:true,responsive:true}));
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
