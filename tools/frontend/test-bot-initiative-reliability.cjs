const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],writes=[],held=[];
  p.setDefaultTimeout(10000);p.on('pageerror',error=>errors.push(error.message));
  await p.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  const bots=['Piper','Other'].map((name,index)=>({id:index?'other':'piper',name,provider:'codex',model:'test',reasoning_effort:'high',instructions:'Keep instructions',memory:'Keep memory',approval_mode:'full',profile:{shape:'round',color:'#2475ff',eyes:'curious',label:'Assistant',description:'Fixture',notifications:true,animated:true,progress_updates:'summaries',pinned:false,initiative:false,initiative_instructions:'Keep useful delivery updates',custom_existing:'preserved'}}));
  const chats=bots.map(bot=>({id:'dm-'+bot.id,name:bot.name,members:[bot.id],archived:false}));
  let holdNext=false,failNext=false;
  await p.route('**/api/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/settings')return send({name:'You',theme:'dark',reduced_motion:true,approval_mode:'ask',timezone:'America/New_York'});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs'||name==='/routines')return send([]);if(name==='/activity')return send({});
   if(name.startsWith('/chats/'))return send({chat:chats.find(chat=>chat.id===name.slice(7)),messages:[]});
   const match=name.match(/^\/bots\/([^/]+)$/);
   if(match&&request.method()==='PUT'){
    const body=request.postDataJSON(),bot=bots.find(bot=>bot.id===match[1]);writes.push(structuredClone(body));
    if(holdNext){holdNext=false;await new Promise(resolve=>held.push(resolve));}
    if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Temporary fixture outage'}});}
    Object.assign(bot,body);return send(bot);
   }
   return route.continue();
  });
  const until=async(predicate,label)=>{for(let i=0;i<200&&!predicate();i++)await p.waitForTimeout(25);assert(predicate(),label);};
  const open=async()=>{await p.locator('#bot-details').click();await p.locator('#bot-settings').click();};
  const close=()=>p.locator('#details-close').click();
  const toggle=()=>p.getByRole('switch',{name:'Take initiative',exact:true});
  const guidance=()=>p.getByLabel('What should this bot keep an eye on?',{exact:true});
  const saved=()=>p.locator('.bot-edit-form .preference-status').filter({hasText:'Saved'}).waitFor();
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await open();
  // Reopening during an enable save must not show stale off, or start a second autosave pipeline.
  holdNext=true;await toggle().check();await until(()=>held.length===1,'Enable request held');
  await close();await open();assert(await toggle().isChecked(),'Reopened settings preserve pending enable');
  await guidance().fill('Newest background guidance');await toggle().uncheck();
  const heldEnable=held.shift();heldEnable();await until(()=>bots[0].profile.initiative===false&&writes.length>=2,'Latest off wins after delayed enable');await saved();
  assert.equal(bots[0].profile.initiative_instructions,'Newest background guidance');
  assert(!await toggle().isChecked());
  // Failed opt-out remains visibly unsaved, retains the draft across reopening, and can be retried.
  await toggle().check();await until(()=>bots[0].profile.initiative,'Enabled before failed disable');await saved();
  failNext=true;await toggle().uncheck();await p.getByText('Not saved · Temporary fixture outage',{exact:true}).waitFor();assert.equal(bots[0].profile.initiative,true);
  await close();await open();assert(!await toggle().isChecked(),'Failed opt-out draft retained');await p.getByRole('button',{name:'Retry save',exact:true}).click();await until(()=>!bots[0].profile.initiative,'Opt-out retry persisted');await saved();
  // A save for one bot completing while another is selected must not overwrite its settings or identity.
  holdNext=true;await toggle().check();await until(()=>held.length===1,'Piper enable held');await close();
  await p.locator('#bots').getByRole('button',{name:'Other',exact:true}).click();await open();assert(!await toggle().isChecked());
  await toggle().check();await guidance().fill('Other bot guidance');await until(()=>bots[1].profile.initiative_instructions==='Other bot guidance','Other bot saved');await saved();
  held.shift()();await until(()=>bots[0].profile.initiative,'Piper delayed save finished');assert.equal(await p.locator('#heading').textContent(),'Other');assert.equal(await guidance().inputValue(),'Other bot guidance');
  await close();await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await open();assert(await toggle().isChecked());assert.equal(await guidance().inputValue(),'Newest background guidance');
  // Rapid edits are serialized behind the in-flight save and end in the latest opt-out.
  holdNext=true;await guidance().fill('Intermediate');await until(()=>held.length===1,'Guidance save held');
  await toggle().uncheck();await toggle().check();await guidance().fill('Final guidance');await toggle().uncheck();
  held.shift()();await until(()=>!bots[0].profile.initiative&&bots[0].profile.initiative_instructions==='Final guidance','Rapid edits end disabled');await saved();
  await close();await open();assert(!await toggle().isChecked());
  for(const bot of bots){assert.equal(bot.instructions,'Keep instructions');assert.equal(bot.memory,'Keep memory');assert.equal(bot.approval_mode,'full');assert.equal(bot.profile.custom_existing,'preserved');assert.equal(bot.profile.color,'#2475ff');}
  assert.equal(bots[1].profile.initiative,true);assert.equal(bots[1].profile.initiative_instructions,'Other bot guidance');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',delayedSaveReopen:true,failedOptOutRetry:true,switchBotsDuringSave:true,rapidEditsLatestWins:true,unrelatedSettingsPreserved:true}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
