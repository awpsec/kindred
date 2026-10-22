const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  for(const scenario of ['late-success','queued-after-failure','retry-after-switch']){
   const p=await browser.newPage({viewport:{width:1280,height:900}}),writes=[],errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
   const make=name=>({id:'piper',name,provider:'codex',model:'test',reasoning_effort:'high',instructions:'Keep '+name,memory:'',approval_mode:'full',profile:{shape:'round',color:'#2475ff',initiative:false,initiative_instructions:'Keep '+name}});
   const botA=make('Workspace A'),botB=make('Workspace B');let release,fail=scenario!=='late-success',hold=true,held=false;
   await p.route('**/api/**',async route=>{
    const request=route.request(),name=new URL(request.url()).pathname.slice(4),auth=request.headers().authorization,bot=auth==='Bearer '+token?botA:botB,send=json=>route.fulfill({json});
    if(name==='/settings')return send({name:'You',theme:'dark',reduced_motion:true,timezone:'America/New_York'});
    if(name==='/bots')return send([bot]);if(name==='/chats')return send([{id:'dm-piper',name:bot.name,members:['piper']}]);if(name==='/runs'||name==='/routines')return send([]);if(name==='/activity')return send({});
    if(name.startsWith('/chats/'))return send({chat:{id:'dm-piper',name:bot.name,members:['piper']},messages:[]});
    if(name==='/bots/piper'&&request.method()==='PUT'){
     const body=request.postDataJSON();writes.push({auth,body});if(hold){hold=false;held=true;await new Promise(resolve=>release=resolve);}
     if(fail){fail=false;return route.fulfill({status:503,json:{error:'Temporary fixture outage'}});}Object.assign(bot,body);return send(bot);
    }
    return route.continue();
   });
   const until=async(predicate,label)=>{for(let i=0;i<200&&!predicate();i++)await p.waitForTimeout(25);assert(predicate(),label);};
   const open=async()=>{await p.locator('#bot-details').click();await p.locator('#bot-settings').click();};
   const toggle=()=>p.getByRole('switch',{name:'Take initiative',exact:true});
   await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Workspace A');await open();await toggle().check();await until(()=>held,'Initial request held');
   if(scenario==='queued-after-failure')await toggle().uncheck();
   if(scenario==='retry-after-switch'){release();await p.getByText('Not saved · Temporary fixture outage',{exact:true}).waitFor();await p.getByRole('button',{name:'Retry save',exact:true}).evaluate(button=>window.fixtureOldRetry=button);}
   // Exercise the real legacy connect form handler: replace the active token
   // within the current document, while the old editor still has async work.
   await p.locator('#connect-form').evaluate(form=>{document.querySelector('#token').value='workspace-b-session';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
   await p.waitForFunction(()=>document.querySelector('#heading').textContent==='Workspace B');
   await p.evaluate(()=>{window.fixtureStaleHeading=false;new MutationObserver(()=>{if(document.querySelector('#heading').textContent==='Workspace A')window.fixtureStaleHeading=true;}).observe(document.querySelector('#heading'),{childList:true,subtree:true,characterData:true});});
   if(scenario==='retry-after-switch')await p.evaluate(()=>window.fixtureOldRetry.click());else release();
   await p.waitForTimeout(700);
   assert.equal(writes.filter(write=>write.auth==='Bearer workspace-b-session').length,0,scenario+': stale editor must not send to the new account');
   assert.equal(await p.locator('#heading').textContent(),'Workspace B',scenario+': late response must not paint old bot into new account');assert.equal(await p.evaluate(()=>window.fixtureStaleHeading),false,'No transient stale heading');
   await open();assert(!await toggle().isChecked());assert.equal(botB.name,'Workspace B');assert.equal(botB.profile.initiative,false);assert.deepEqual(errors,[]);await p.close();
  }
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',lateResponseIgnored:true,queuedMutationCannotCrossSessions:true,oldRetryCannotCrossSessions:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
