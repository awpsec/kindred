const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/startup');fs.mkdirSync(output,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await (process.env.WEBKIT?webkit:chromium).launch({headless:true});const results=[];
 try{
 for(const fault of ['missing-module','native-directory-hang','native-directory-reject','native-remember-hang','native-start-hang','api-failure','identity-malformed','expired-session','healthy-old-desktop']){
  const context=await browser.newContext({viewport:{width:1000,height:844}}),page=await context.newPage(),errors=[],calls=[];let repaired=false,releaseStall;
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.clock.install();
  await context.exposeFunction('startupInvoke',async(command,args)=>{
   calls.push(command);
   if(!repaired&&fault==='native-directory-reject'&&command==='profile_home_state')throw Error('Synthetic bridge rejection');
   if(!repaired&&((fault==='native-directory-hang'&&command==='profile_home_state')||(fault==='native-remember-hang'&&command==='remember_profile')||(fault==='native-start-hang'&&command==='start_desktop')))return new Promise(resolve=>{releaseStall=resolve;});
   if(command==='profile_home_state')return {entries:[{key:'fixture',profile_id:'personal',server:origin,name:'Retained account'}],last:'fixture'};
   if(command==='profile_activity')return {};return null;
  });
  await context.addInitScript(({token,fault})=>{
   sessionStorage.setItem('kindred-token',token);sessionStorage.setItem('retained-draft','Do not lose this draft');localStorage.setItem('retained-setting','unchanged');
   if(fault.startsWith('native-')||fault==='healthy-old-desktop'){
    window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.__KINDRED_DESKTOP={platform:'linux'};
    window.__TAURI__={core:{invoke:(...args)=>window.startupInvoke(...args)}};
   }
  },{token,fault});
  await context.route(origin+'/standalone-access.js',route=>!repaired&&fault==='missing-module'?route.fulfill({status:404,contentType:'text/plain',body:'Not found'}):route.continue());
  await context.route(origin+'/identity/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/identity/meta')return route.fulfill({contentType:'application/json',body:!repaired&&fault==='identity-malformed'?'invalid':JSON.stringify({profiles:true,registration:true,first_user:false})});
   if(pathname==='/identity/profiles')return route.fulfill(!repaired&&fault==='expired-session'?{status:401,json:{error:'Session expired'}}:{json:{active:'personal',username:'Fixture',account_id:'fixture',profiles:[{id:'personal',name:'Retained workspace',active:true}],directory:[]}});
   return route.fulfill({json:{}});
  });
  await context.route(origin+'/api/status**',route=>!repaired&&fault==='api-failure'?route.fulfill({status:503,json:{error:'Server reconnecting'}}):route.continue());
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(250);
  if(process.env.KINDRED_STARTUP_BASELINE&&fault==='missing-module'){
   await page.clock.fastForward(45000);
   await page.screenshot({path:path.join(output,engine+'-baseline-missing-module.png')});
   assert(await page.locator('#startup-status').getByRole('button',{name:'Try again',exact:true}).count(),'missing module must offer bounded recovery');
  }
  if(fault==='healthy-old-desktop'||fault==='native-directory-reject'){
   await page.locator('#startup-status').waitFor({state:'hidden'});assert(await page.locator('#app').isVisible());
  }else if(fault==='expired-session'){
   await page.locator('#startup-status').waitFor({state:'hidden'});await page.getByRole('heading',{name:'Sign in to Kindred',exact:true}).waitFor();
  }else{
   await page.clock.fastForward(31000);
   const retry=page.locator('#startup-status').getByRole('button',{name:'Try again',exact:true});await retry.waitFor();
   assert(await page.locator('#startup-status').isVisible());assert.equal(await page.locator('#app').isVisible(),false);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),token);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('retained-draft')),'Do not lose this draft');
   assert.equal(await page.evaluate(()=>localStorage.getItem('retained-setting')),'unchanged');
   await page.screenshot({path:path.join(output,engine+'-'+fault+'.png')});
   if(releaseStall){releaseStall({entries:[],last:''});await page.waitForTimeout(150);assert(await page.locator('#startup-status').isVisible(),'late startup must not dismiss recovery');}
   repaired=true;await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),retry.click()]);await page.locator('#startup-status').waitFor({state:'hidden'});await page.locator('#app').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('retained-draft')),'Do not lose this draft');
  }
  if(fault!=='missing-module')assert.deepEqual(errors,[],fault+' unexpected page errors');
  results.push({fault,recovered:true,pageErrors:errors,calls});await context.close();
 }
 console.log(JSON.stringify({passed:true,engine,clock:'deadline advanced by Playwright clock; real HTTP/module/native promises',cases:results},null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});
