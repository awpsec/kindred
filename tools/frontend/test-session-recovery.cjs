const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true}),errors=[];
 const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
 async function scenario({native=true,expired=false}={}){
  const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  let valid=!expired,apiStatus=200,identityStatus=200;const calls=[],logins=[];
  const entries=[{key:'alex-key',profile_id:'personal',name:'Personal',username:'Alex',server:origin,session_available:true},{key:'work-key',profile_id:'work',name:'Work',username:'Other',server:'https://work.example',session_available:false}];
  await context.exposeFunction('fixtureInvoke',async(command,args={})=>{calls.push({command,args});if(command==='profile_home_state')return {entries,last:'alex-key'};if(command==='profile_activity')return {};return null;});
  await context.addInitScript(({token,native})=>{
   if(!sessionStorage.getItem('fixture-initialized')){sessionStorage.setItem('kindred-token',token);sessionStorage.setItem('fixture-initialized','1');}
   if(native){window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.__KINDRED_REMEMBER_SESSION=true;window.__KINDRED_INITIAL_PROFILE='personal';window.__TAURI__={core:{invoke:(...a)=>window.fixtureInvoke(...a)}}}
  },{token,native});
  await context.route(origin+'/**',async route=>{
   const req=route.request(),pathname=new URL(req.url()).pathname;
   if(pathname==='/identity/meta')return route.fulfill({json:{profiles:true,registration:true,first_user:false}});
   if(pathname==='/identity/profiles')return route.fulfill(identityStatus!==200?{status:identityStatus,json:{error:'Server unavailable'}}:!valid?{status:401,json:{error:'Sign in to your Kindred account.'}}:{json:{active:'personal',username:'Alex',account_id:'owner',profiles:[{id:'personal',name:'Personal',active:true}],legacy:false}});
   if(pathname==='/identity/login'){
    const body=req.postDataJSON();logins.push(body);
    if(body.password!=='updated-password')return route.fulfill({status:401,json:{error:'Incorrect username or password.'}});
    valid=true;apiStatus=200;return route.fulfill({json:{token,profile_id:'personal'}});
   }
   if(pathname.startsWith('/identity/'))return route.fulfill({json:{}});
   if(pathname.startsWith('/api/')&&(!valid||apiStatus!==200))return route.fulfill({status:valid?apiStatus:401,json:{error:valid?'Provider needs authentication':'Sign in to your Kindred account.'}});
   return route.continue();
  });
  await page.goto(origin);
  return {context,page,calls,logins,expire:()=>{valid=false},providerError:()=>{apiStatus=401},offline:()=>{apiStatus=503;identityStatus=503}};
 }
 try{
  for(const native of [true,false]){
   const s=await scenario({native}),{page}=s;
   await page.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
   await page.locator('#prompt').fill('Keep this unsent draft');
   s.expire();
   const notice=page.locator('#notice');await notice.getByRole('button',{name:'Sign in again…'}).waitFor();
   assert.equal(await page.locator('#app').isVisible(),true,'Expired session keeps the conversation visible');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('kindred-token')),null);
   if(native){await page.waitForTimeout(9500);assert(await notice.isVisible(),'Sign-in action stays visible beyond the normal error timeout');}
   await page.locator('#switch-profiles').click();const row=page.locator('.profile-account-row[aria-current=true]');
   assert.match(await row.innerText(),/Signed out/);assert(await row.evaluate(el=>el.classList.contains('is-signed-out')));assert.notEqual(await row.getAttribute('aria-disabled'),'true');
   await page.screenshot({path:path.join(artifacts,`session-signed-out-${native?'desktop':'browser'}.png`)});
   await row.click();let dialog=page.locator('dialog[data-session-signin]');await dialog.waitFor();assert.equal(await dialog.getByLabel('Username',{exact:true}).inputValue(),'Alex');assert(await dialog.getByLabel('Password',{exact:true}).evaluate(el=>el===document.activeElement));
   await dialog.getByRole('button',{name:'Close',exact:true}).click();
   await notice.getByRole('button',{name:'Sign in again…'}).click();dialog=page.locator('dialog[data-session-signin]');await dialog.waitFor();
   assert.equal(await dialog.getByLabel('Username',{exact:true}).inputValue(),'Alex');
   await dialog.getByLabel('Password',{exact:true}).fill('wrong-password');await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
   await dialog.getByText('Incorrect username or password.',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Username',{exact:true}).inputValue(),'Alex');
   await dialog.getByLabel('Password',{exact:true}).fill('updated-password');await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('dialog[data-session-signin]'));await page.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('#prompt').value==='Keep this unsent draft');
   await page.locator('#switch-profiles').click();assert.match(await page.locator('.profile-account-row[aria-current=true]').innerText(),/Current/);
   assert.equal(s.logins.length,2);assert.equal(s.logins[1].profile_id,'personal');assert.equal(s.logins[1].login,'Alex');
   if(native){assert(s.calls.some(c=>c.command==='remember_profile'&&c.args.profileId==='personal'));assert(!s.calls.some(c=>c.command==='connect_profile_server'||c.command==='forget_profile'));}
   await s.context.close();
  }
  const cold=await scenario({expired:true});await cold.page.getByLabel('Username',{exact:true}).waitFor();assert.equal(await cold.page.getByLabel('Username',{exact:true}).inputValue(),'Alex');assert.equal(await cold.page.getByRole('heading',{name:'Choose an account'}).count(),0);await cold.context.close();
  for(const issue of ['providerError','offline']){
   const s=await scenario();await s.page.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();s[issue]();
   await s.page.waitForTimeout(5500);await s.page.locator('#switch-profiles').click();assert.match(await s.page.locator('.profile-account-row[aria-current=true]').innerText(),/Current/);assert.equal(await s.page.locator('#notice').getByRole('button',{name:'Sign in again…'}).count(),0);await s.context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',desktopAndBrowserRecovery:true,prefilledUsername:true,bothRecoveryEntrypoints:true,wrongPasswordRetry:true,sameAccountAndDraftRetained:true,expiredOnStartup:true,provider401DoesNotSignOut:true,offlineDoesNotSignOut:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
