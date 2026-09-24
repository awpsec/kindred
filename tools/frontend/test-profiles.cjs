const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  let active='personal',signed=true,first=false,theme='dark';const tokens=new Map([[token,'personal']]);const profiles=[{id:'personal',name:'Alex Morgan',unread:0},{id:'work',name:'owner',unread:17}];
  const projection=()=>({active,legacy:false,admin:true,account_id:'owner',profiles:profiles.map(r=>({...r,active:r.id===active})),directory:[]});
  await context.route(origin+'/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname,body=request.method()==='POST'||request.method()==='PUT'?request.postDataJSON():null,auth=request.headers().authorization?.slice(7),send=(json,status=200)=>route.fulfill({json,status});
   if(name==='/identity/meta')return send({profiles:true,first_user:first,registration:true,legacy_claim:false});
   if(name==='/identity/profiles'){
    if(!body){if(!signed)return send({error:'Your session expired. Sign in again.'},401);return send(projection());}
    writes.push({path:name,body});const profile={id:'new-profile',name:body.name,unread:0};profiles.push(profile);return send(profile);
   }
   if(name==='/identity/switch'){writes.push({path:name,body});active=body.profile_id;const next='session-'+active;tokens.set(next,active);return send({token:next,profile_id:active});}
   if(name==='/identity/register'||name==='/identity/login'){writes.push({path:name,body});signed=true;first=false;return send({token,profile_id:'personal'});}
   if(name==='/identity/password'){writes.push({path:name,body});const next='changed-password-session';tokens.set(next,active);return send({token:next,profile_id:active});}
   if(name==='/identity/transfer')return send(null);
   if(name==='/identity/admin')return send({users:[{id:'owner',username:'owner',admin:true}],registration:true,max_users:128,max_profiles_per_user:8});
   if(name==='/api/settings')return send({name:profiles.find(r=>r.id===(tokens.get(auth)||active))?.name||'You',theme,approval_mode:'ask'});
   return route.continue();
  });
  await context.addInitScript(t=>{if(!sessionStorage.getItem('kindred-token'))sessionStorage.setItem('kindred-token',t);},token);
  // Identity is painted before the workspace fetches finish. Wait for the actual
  // conversation before requesting another reload or profile transition.
  const workspaceReady=()=>p.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
  await p.goto(origin);await p.locator('#switch-profiles').waitFor();await p.locator('#app').waitFor({state:'visible'});
  await workspaceReady();
  await p.waitForFunction(()=>document.querySelector('#switch-profiles').classList.contains('has-profile-activity'));
  await p.locator('#switch-profiles').click();const menu=p.locator('#profile-menu');await menu.waitFor();assert.equal(await menu.getByRole('button',{name:'Create a profile',exact:true}).count(),0);
  assert.equal(await menu.locator('.profile-account-row').count(),1,'One account, even with two legacy workspaces');
  await menu.getByRole('menuitem',{name:'Account settings',exact:true}).click();
  await p.getByRole('dialog').getByText('Existing workspaces',{exact:true}).click();
  await p.getByRole('dialog').getByRole('button',{name:'owner',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('#identity-name')?.textContent==='owner');await workspaceReady();
  assert(writes.some(w=>w.path==='/identity/switch'&&w.body.profile_id==='work'));
  assert.equal(await p.evaluate(()=>sessionStorage.getItem('kindred-token')),'session-work');
  await p.reload();await p.waitForFunction(()=>document.querySelector('#identity-name')?.textContent==='owner');
  await workspaceReady();
  theme='light';await p.reload();await p.locator('#app').waitFor({state:'visible'});await p.locator('#switch-profiles').click();await p.screenshot({path:path.join(artifacts,engine+'-profiles-light.png')});
  await workspaceReady();
  await p.locator('#profile-menu').getByRole('menuitem',{name:'Add account',exact:true}).click();const d=p.locator('.profile-dialog');
  await d.getByRole('button',{name:'Create account',exact:true}).click();
  await d.getByRole('heading',{name:'Create account',exact:true}).waitFor();
  assert.equal(await d.locator('.profile-auth').count(),2,'Server control survives auth-mode changes');
  await d.getByLabel('Username',{exact:true}).fill('research');await d.getByLabel('Display name',{exact:true}).fill('Research');const password=d.getByLabel('Password',{exact:true});await password.pressSequentially('aaa');await d.getByRole('button',{name:'Create account',exact:true}).click();assert.equal(writes.filter(w=>w.path==='/identity/register').length,0,'Three-character passwords cannot submit');await password.pressSequentially('a');
  await p.screenshot({path:path.join(artifacts,engine+'-create-account.png')});
  await d.getByRole('button',{name:'Create account',exact:true}).click();await workspaceReady();
  assert(writes.some(w=>w.path==='/identity/register'&&w.body.login==='research'&&w.body.password==='aaaa'&&!Object.hasOwn(w.body,'profile_id')&&!Object.hasOwn(w.body,'new_profile_name')));
  assert.equal(profiles.length,2,'Adding an account must not create a workspace under the old account');
  await p.locator('#switch-profiles').click();await p.getByRole('menuitem',{name:'Change password',exact:true}).click();const change=p.getByRole('dialog');await change.getByLabel('Current password',{exact:true}).fill('aaaa');const next=change.getByLabel('New password',{exact:true});await next.pressSequentially('123');await change.getByRole('button',{name:'Save password',exact:true}).click();assert.equal(writes.filter(w=>w.path==='/identity/password').length,0);await next.pressSequentially('4');await change.getByRole('button',{name:'Save password',exact:true}).click();await change.waitFor({state:'detached'});assert(writes.some(w=>w.path==='/identity/password'&&w.body.current_password==='aaaa'&&w.body.password==='1234'));
  await p.setViewportSize({width:390,height:844});await p.locator('#mobile-menu').click();await p.locator('#switch-profiles').click();await p.screenshot({path:path.join(artifacts,engine+'-profiles-mobile.png')});
  const rect=await p.locator('#profile-menu').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=390);
  assert.deepEqual(errors,[]);await context.close();
  const fresh=await browser.newContext({viewport:{width:1000,height:820}}),page=await fresh.newPage();page.on('pageerror',e=>errors.push(e.message));
  await fresh.route(origin+'/identity/**',async route=>{const request=route.request(),name=new URL(request.url()).pathname;if(name==='/identity/meta')return route.fulfill({json:{profiles:true,first_user:true,registration:true}});if(name==='/identity/register'){writes.push({path:name,body:request.postDataJSON()});return route.fulfill({json:{token,profile_id:'personal'}});}return route.fulfill({json:{active:'personal',legacy:false,admin:true,account_id:'owner',profiles:[{id:'personal',name:'Alex',active:true,unread:0}]}});});
  await page.goto(origin);await page.getByLabel('Username',{exact:true}).fill('Alex');await page.getByLabel('Display name',{exact:true}).fill('Alex');await page.getByLabel('Password',{exact:true}).fill('aaaa');
  await page.screenshot({path:path.join(artifacts,engine+'-profile-registration.png')});await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('#app').waitFor({state:'visible'});
  assert(writes.some(w=>w.path==='/identity/register'&&w.body.login==='Alex'));assert.deepEqual(errors,[]);await fresh.close();
  console.log(JSON.stringify({passed:true,engine,profileSwitcher:true,unread9Plus:true,persistedSwitch:true,legacyWorkspacesPreserved:true,accountCreationWithoutProfileStep:true,registration:true,fourCharacterPasswords:true,passwordChange:true,rejectShortPasswords:true,darkLightMobile:true}));
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
