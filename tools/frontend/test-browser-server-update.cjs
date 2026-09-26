const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  for(const scenario of ['update','dropped-post','failed','unsupported','current','stale-ui','denied']){
   const page=await browser.newPage();let phase='idle',posts=0,polls=0;
   await page.route('**/identity/server-update',async route=>{
    if(scenario==='denied')return route.fulfill({status:403,json:{error:'Administrator access required'}});
    if(route.request().method()==='POST'){posts++;assert.equal(route.request().postDataJSON().version,'0.83.0');phase='downloading';if(scenario==='dropped-post')return route.abort();}
    else if(phase!=='idle'){polls++;phase=polls===1?'restarting':scenario==='failed'?'failed':'complete';if(polls===1)return route.abort();}
    return route.fulfill({json:{supported:scenario!=='unsupported',phase,progress:phase==='complete'?100:40,version:['current','stale-ui'].includes(scenario)?'0.82.0':'0.83.0',message:'Host updater is not installed.',error:phase==='failed'?'Verification failed; previous server retained.':''}});
   });
   await page.route('**/api/status',r=>r.fulfill({json:{version:'0.83.0'}}));
   await page.goto(origin+'/index.html');
   await page.evaluate(async({token,scenario})=>{
    const {createServerUpdater}=await import('/server-update.js');window.reloaded=0;window.saved=0;
    const newerVersion=(a,b)=>a&&b&&a.localeCompare(b,undefined,{numeric:true})>0;
    window.updater=createServerUpdater({token:()=>token,currentVersion:()=>'0.82.0',uiVersion:scenario==='stale-ui'?'0.81.0':'0.82.0',newerVersion,beforeReload:()=>saved++,reload:()=>reloaded++});
    updater.open();
   },{token,scenario});
   const dialog=page.getByRole('dialog',{name:'Update Kindred'});
   if(['update','dropped-post','failed'].includes(scenario)){
    await dialog.getByRole('button',{name:'Update & restart'}).click();
    if(scenario==='failed'){await dialog.getByText('Verification failed; previous server retained.').waitFor();assert.equal(await page.evaluate(()=>reloaded),0);}
    else{await page.waitForFunction(()=>reloaded===1);assert((await page.evaluate(()=>saved))>=1);}
    assert.equal(posts,1,'Never resend an uncertain POST');
   }else if(scenario==='stale-ui'){
    await dialog.getByRole('button',{name:'Load updated interface'}).click();assert.equal(posts,0);
   }else if(scenario==='current')await dialog.getByText('Kindred is up to date.').waitFor();
   else if(scenario==='denied')await dialog.getByText('Sign in as a server administrator to update.').waitFor();
   else await dialog.getByText('Host updater is not installed.').waitFor();
   assert.equal(await page.evaluate(()=>reloaded),['update','dropped-post','stale-ui'].includes(scenario)?1:0);
   await page.close();
  }
  console.log('PASS browser update dialog, progress, dropped connections, single POST, failure, unsupported host, current version, and authorization');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
