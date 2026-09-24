const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
 const errors=[];
 async function scenario(options){
  const context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),calls=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);let active='personal',signed=!!options.token;
  const entries=[{key:'personal-key',profile_id:'personal',name:'Personal',username:'Alex',server:origin,session_available:true},{key:'work-key',profile_id:'work',name:'Work',username:'work-user',server:'https://work.example',session_available:false}];
  entries.push({key:'extra-workspace',profile_id:'extra',name:'Old workspace',username:'Alex',server:origin,session_available:true},{key:'second-account',profile_id:'second',name:'Second account',username:'second-user',server:origin,session_available:true});
  await context.exposeFunction('fixtureInvoke',async(command,args={})=>{calls.push({command,args});if(command==='profile_home_state')return {entries,last:'personal-key'};if(command==='profile_activity')return {};return null;});
  await context.addInitScript(o=>{window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.__KINDRED_REMEMBER_SESSION=o.remember;window.__KINDRED_NEW_ACCOUNT=!!o.fresh;window.__KINDRED_EXPLICIT_PROFILE=!!o.explicit;window.__KINDRED_INITIAL_PROFILE=o.initial||null;window.__TAURI__={core:{invoke:(...a)=>window.fixtureInvoke(...a)}};if(o.token&&!sessionStorage.getItem('kindred-token'))sessionStorage.setItem('kindred-token',o.token);if(o.oldBrowser)localStorage.setItem('kindred-token',o.oldBrowser);},options);
  await context.route(origin+'/identity/**',async route=>{const r=route.request(),name=new URL(r.url()).pathname;
   if(name==='/identity/meta')return route.fulfill({json:{profiles:true,registration:true,first_user:false}});
   if(name==='/identity/login'){const body=r.postDataJSON();writes.push(body);signed=true;active='another';return route.fulfill({json:{token,profile_id:active}});}
   if(name==='/identity/profiles')return route.fulfill(signed?{json:{active,username:'Alex',account_id:'fixture-owner',legacy:false,profiles:[{id:active,name:active==='personal'?'Personal':'Another account',active:true}],directory:[]}}:{status:401,json:{error:'Your session expired. Sign in again.'}});
   return route.fulfill({json:{}});
  });
  await page.goto(origin);return {context,page,calls,writes};
 }
 try{
  for(const remember of [true,false]){
   const {context,page,calls}=await scenario({token,remember});await page.locator('#app').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('Here is the screenshot.'));
   assert.equal(await page.locator('#remember-device').isChecked(),remember);
   await page.waitForTimeout(150);assert(calls.some(c=>c.command==='remember_profile'&&c.args.remember===remember));
   assert.equal(await page.evaluate(()=>localStorage.getItem('kindred-token')),null,'Native persistence must not depend on browser localStorage');
   await page.reload();await page.locator('#app').waitFor({state:'visible'});assert.equal(await page.locator('#remember-device').isChecked(),remember);
   await page.locator('#switch-profiles').click();const menu=page.locator('#profile-menu');await menu.waitFor();assert.equal(await menu.locator('.profile-account-row').count(),3,'Show each account once, including another account on this server');
   assert.equal(await menu.getByRole('menuitem',{name:'Old workspace'}).count(),0);await menu.getByRole('menuitem',{name:/Second account/}).click();
   for(let i=0;i<100&&!calls.some(c=>c.command==='switch_native_profile'&&c.args.key==='second-account');i++)await new Promise(r=>setTimeout(r,50));assert(calls.some(c=>c.command==='switch_native_profile'&&c.args.key==='second-account'));await context.close();
  }
  const {context,page,calls,writes}=await scenario({remember:true,initial:'personal'});
  await page.getByRole('heading',{name:'Choose an account'}).waitFor();assert.equal(await page.locator('.account-choice').count(),3,'Legacy workspaces are grouped under their account');
  await page.locator('.account-choice').first().click();assert(calls.some(c=>c.command==='switch_native_profile'&&c.args.key==='personal-key'));
  await page.screenshot({path:path.join(artifacts,engine+'-account-chooser-dark.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(artifacts,engine+'-account-chooser-light.png')});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,engine+'-account-chooser-mobile.png')});
  await page.getByRole('button',{name:'Add another account',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill('another-user');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  assert(await page.getByLabel('Keep this device connected',{exact:true}).last().isChecked());
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#app').waitFor({state:'visible'});
  assert.equal(writes.length,1);assert(!Object.hasOwn(writes[0],'profile_id'),'Another account must not be constrained to the previous account profile');
  assert(calls.some(c=>c.command==='remember_profile'&&c.args.profileId==='another'&&c.args.remember));await context.close();
  const fresh=await scenario({remember:true,fresh:true,oldBrowser:'old-account-token'});await fresh.page.getByRole('heading',{name:'Choose an account'}).waitFor();assert.equal(await fresh.page.locator('#app').isVisible(),false);assert(!fresh.calls.some(c=>c.command==='remember_profile'));await fresh.context.close();
  const explicit=await scenario({remember:false,explicit:true,initial:'personal'});await explicit.page.getByLabel('Username',{exact:true}).waitFor();assert.equal(await explicit.page.getByLabel('Username',{exact:true}).inputValue(),'Alex');await explicit.context.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,restoredRememberChoice:true,temporaryChoicePreserved:true,nativeSessionNotInLocalStorage:true,savedAccountChooser:true,addAccountKeepsProfileOwnership:true,freshAccountIgnoresOldBrowserToken:true,selectedAccountPrefilled:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
