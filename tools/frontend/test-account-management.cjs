const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/account-management');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
try{
 for(const [width,theme,scale] of [[1000,'dark',1],[390,'light',1.5],[320,'dark',1.5]]){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});p.setDefaultTimeout(12000);
  let username='original-owner',mode='owner',failRole=false;
  let users=[{id:'owner-id',username,admin:true,role:'owner',disabled:false,profile_count:1},{id:'member-id',username:'member',admin:false,role:'user',disabled:false,profile_count:2},{id:'disabled-id',username:'disabled-user',admin:false,role:'user',disabled:true,profile_count:1}];
  const projection=()=>({active:'personal',legacy:false,account_management:true,username,admin:true,account_id:'owner-id',role:mode==='owner'?'owner':'admin',owner_resolved:mode!=='unresolved',profiles:[{id:'personal',name:'Personal',active:true,unread:0}],directory:[]});
  await context.addInitScript(({token,scale})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-text-scale',String(scale));}, {token,scale});
  await context.route(origin+'/**',async route=>{const req=route.request(),name=new URL(req.url()).pathname,body=req.method()==='POST'?req.postDataJSON():null,send=(json,status=200)=>route.fulfill({json,status});
   if(name==='/identity/meta')return send({profiles:true,registration:true});
   if(name==='/identity/profiles')return send(projection());
   if(name==='/identity/transfer')return send(null);
   if(name==='/identity/account'){
    writes.push({name,body});if(body.username==='taken')return send({error:'That username is already in use.'},409);
    if(body.username==='stale')return send({error:'Your account changed elsewhere. Reload and try again.'},409);
    assert.equal(body.account_id,'owner-id');assert.equal(body.expected_username,username);username=body.username.trim().toLowerCase();users[0].username=username;return send({...projection(),username});
   }
   if(name==='/identity/profile'){writes.push({name,body});return send({saved:true});}
   if(name==='/identity/admin'){
    if(body){writes.push({name,body});if(body.action==='role'){if(failRole)return send({error:'Only the Owner can change roles.'},403);const u=users.find(u=>u.id===body.user_id);assert.equal(body.expected_role,u.role);u.role=body.role;u.admin=u.role==='admin';}return send({saved:true});}
    return send({users,owner_resolved:mode!=='unresolved',can_manage_roles:mode==='owner',registration:true,max_users:128,max_profiles_per_user:8});
   }
   if(name==='/identity/admin/password-resets')return send({requests:[{id:'reset-fixture',username:'member',created:1700000000,ip:'192.0.2.1',location:'Unavailable',state:'pending'}]});
   if(name==='/identity/computer-settings')return send({supported:false});
   if(name==='/identity/server-update')return send({available:false});
   if(name==='/api/settings')return send({name:'Personal',theme,approval_mode:'ask'});
   return route.continue();
  });
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.evaluate(scale=>document.documentElement.style.setProperty('--text-scale',String(scale)),scale);
  async function openMenu(){if(width<600&&!await p.locator('#switch-profiles').isVisible())await p.locator('#mobile-menu').click();await p.locator('#switch-profiles').click();await p.locator('#profile-menu').waitFor();}
  await openMenu();await p.getByRole('menuitem',{name:'Account settings',exact:true}).click();let d=p.locator('.profile-dialog').filter({has:p.getByRole('heading',{name:'Account settings',exact:true})});
  const field=d.getByLabel('Username',{exact:true}),save=d.getByRole('button',{name:'Save changes',exact:true});assert(await save.isDisabled());
  for(const [value,message] of [['taken','That username is already in use.'],['stale','Your account changed elsewhere. Reload and try again.'],['bad/name','Use letters, numbers, dots, hyphens or an email address for your username']]){
   await field.fill(value);await save.click();await d.getByRole('alert').getByText(message,{exact:true}).waitFor();assert.equal(await field.inputValue(),value);assert(await d.isVisible());
   await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-${value.replace('/','-')}.png`)});
  }
  await field.fill('Changed.Owner');await save.click();await d.waitFor({state:'detached'});assert.equal(username,'changed.owner');assert.equal(writes.filter(w=>w.name==='/identity/profile').length,0);assert.equal(await p.evaluate(()=>sessionStorage.getItem('kindred-token')),token);
  await openMenu();await p.locator('#profile-menu').getByText('changed.owner',{exact:false}).first().waitFor();await p.getByRole('menuitem',{name:'Server administration',exact:true}).click();d=p.locator('.server-admin-dialog');
  await d.getByLabel('Role for member',{exact:true}).waitFor();assert.equal(await d.getByRole('combobox').count(),2);await d.getByRole('button',{name:'Password resets',exact:true}).click();await d.getByRole('button',{name:'Approve',exact:true}).waitFor();assert.equal(await d.getByRole('button',{name:'Deny',exact:true}).count(),1);assert.equal(await d.locator('[data-page="Password resets"] .server-user-role').count(),0);await d.getByRole('button',{name:'Users',exact:true}).click();assert.equal(await d.getByRole('button',{name:'Disable changed.owner'}).count(),0);
  const select=d.getByLabel('Role for member',{exact:true});const rect=await select.boundingBox();assert(rect.height>=44);assert(rect.x>=0&&rect.x+rect.width<=width);
  await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-owner.png`)});
  await select.selectOption('admin');let confirm=p.locator('.profile-dialog').filter({has:p.getByRole('heading',{name:'Make member an admin?',exact:true})});await confirm.waitFor();await confirm.evaluate(async node=>{await Promise.allSettled(node.getAnimations().map(a=>a.finished));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Cancel');await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-promote.png`)});await confirm.getByRole('button',{name:'Cancel',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[aria-label="Role for member"]')?.value==='user'&&!document.querySelector('[aria-label="Role for member"]').disabled);assert.equal(await select.inputValue(),'user');assert.equal(writes.filter(w=>w.body?.action==='role').length,0);
  const beforePromote=await d.elementHandle();await select.selectOption('admin');await p.locator('.profile-dialog').filter({has:p.getByRole('heading',{name:'Make member an admin?',exact:true})}).getByRole('button',{name:'Make admin',exact:true}).click();await p.waitForFunction(n=>!n.isConnected,beforePromote);await p.waitForFunction(()=>document.querySelector('[aria-label="Role for member"]')?.value==='admin');
  d=p.locator('.server-admin-dialog');const beforeDemote=await d.elementHandle();await d.getByLabel('Role for member').selectOption('user');await p.waitForFunction(n=>!n.isConnected,beforeDemote);await p.waitForFunction(()=>document.querySelector('[aria-label="Role for member"]')?.value==='user');
  failRole=true;await d.getByLabel('Role for member').selectOption('admin');await p.locator('.profile-dialog').filter({has:p.getByRole('heading',{name:'Make member an admin?',exact:true})}).getByRole('button',{name:'Make admin',exact:true}).click();await d.getByRole('alert').getByText('Only the Owner can change roles.',{exact:true}).waitFor();assert.equal(await d.getByLabel('Role for member').inputValue(),'user');await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-role-failure.png`)});
  for(const next of ['admin','unresolved']){await d.getByRole('button',{name:'Close',exact:true}).click();mode=next;await openMenu();await p.getByRole('menuitem',{name:'Server administration',exact:true}).click();d=p.locator('.server-admin-dialog');await d.getByText(next==='admin'?'Only the Owner can change roles.':"Role changes are unavailable until this server's Owner is confirmed on the host.",{exact:true}).waitFor();assert.equal(await d.getByRole('combobox').count(),0);await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-${next}.png`)});}
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({passed:true,engine,layouts:3,renameErrors:9,unchangedSession:true,onlyChangedFields:true,ownerRoles:true,promotionCancel:true,failureRevert:true,nonOwnerReadOnly:true,unresolvedReadOnly:true}));
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
