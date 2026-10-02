const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:process.env.KINDRED_BROWSER_CHANNEL||undefined});const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],calls=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
 let releaseIdentity;const identityReady=new Promise(resolve=>releaseIdentity=resolve);
 let computer={state:'running',resources:{cpus:2,memory_mb:6144,disk_gb:30}};
 let directory={version:'fixture',entries:[{key:'personal',server:origin,profile_id:'personal',name:'Alex Morgan'},{key:'work',server:'https://work.example',profile_id:'work',name:'owner'}],launch_on_startup:false,intent:null};
 await context.exposeFunction('fixtureInvoke',async(command,args={})=>{calls.push({command,args});if(command==='profile_home_state')return directory;if(command==='profile_activity')return{work:12};if(command==='standalone_status')return {status:'idle',local_server:{version:'0.67.0',desktop_version:'0.68.0'}};if(command==='local_access_status'||command==='local_access_state')return {device_id:'fixture-pc',mode:'off',workspace:'C:\\Kindred\\workspace',origin,pending:null};if(command==='set_launch_on_startup'){directory.launch_on_startup=args.enabled;return;}if(command==='forget_profile'){directory.entries=directory.entries.filter(e=>e.key!==args.key);return;}if(command==='transfer_profile')throw Error('Finish active tasks before moving this profile');return null;});
 await context.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_LOCAL_ACCESS=true;window.__TAURI__={core:{invoke:(...args)=>window.fixtureInvoke(...args)}};},token);
 await context.addInitScript({content:fs.readFileSync(path.resolve(__dirname,'../../ui/local-server-admin.js'),'utf8')});
 const bundled=['profile-home.html','profile-home.css','profile-home.js','profiles.js','local-access.html','local-access.css','local-access.js','bundled-dialog.css','bundled-dialog.js'];
 await context.route(/^http:\/\/127\.0\.0\.1:\d+\//,async route=>{const request=route.request(),name=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;
 if(bundled.includes(name.slice(1)))return route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui',name.slice(1)))});
 if(name==='/identity/meta'){await identityReady;return route.fulfill({json:{profiles:true,first_user:false,registration:true}});}
 if(name==='/identity/profiles')return route.fulfill({json:{active:'personal',account_id:'owner',admin:true,legacy:false,profiles:[{id:'personal',name:'Alex Morgan',active:true,unread:0}],directory:[]}});
 if(name==='/identity/computer-settings'){if(body){writes.push({name,body});computer.resources=body;}return route.fulfill({json:computer});}
 if(name==='/api/vm/shutdown'||name==='/api/vm/start'){computer.state=name.endsWith('/start')?'running':'shut off';return route.fulfill({json:{state:computer.state}});}
 if(name==='/identity/transfer')return route.fulfill({json:null});
 if(name==='/identity/admin'){if(body)writes.push({name,body});return route.fulfill({json:body?.action==='invite'?{invite:'fixture-invite'}:{users:[{id:'owner',username:'owner',admin:true}],registration:true,max_users:128,max_profiles_per_user:8}});}
 if(new URL(request.url()).origin!==origin)return route.fulfill({response:await route.fetch({url:origin+name+new URL(request.url()).search})});return route.continue();});
 releaseIdentity();
 for(const address of [origin,'http://127.0.0.1:9444']){
  await p.goto(address);await p.locator('#app').waitFor({state:'visible'});
  await p.locator('#switch-profiles').click();await p.getByRole('menuitem',{name:'Server administration',exact:true}).click();
  const admin=p.locator('.server-admin-dialog'),nav=admin.locator('.settings-nav');
  await nav.getByRole('button',{name:'Computers',exact:true}).click();await admin.locator('.vm-resource-readout').first().waitFor();
  assert.equal(await admin.locator('.local-server-admin:visible').count(),0);
  const layout=await admin.locator('.vm-resource-settings').evaluate(n=>({x:n.getBoundingClientRect().left,top:n.getBoundingClientRect().top,header:n.closest('dialog').querySelector('.profile-dialog-heading').getBoundingClientRect().bottom,border:getComputedStyle(n).borderBottomWidth}));
  const inset=await admin.locator('.server-admin-content').evaluate(n=>n.getBoundingClientRect().left+parseFloat(getComputedStyle(n).paddingLeft));
  assert(Math.abs(layout.x-inset)<1);assert(layout.top-layout.header>=20&&layout.top-layout.header<40);assert.equal(layout.border,'0px');
  await p.screenshot({path:path.join(artifacts,engine+'-computers-'+(address===origin?'hosted':'standalone')+'.png')});
  if(address!==origin){await nav.getByRole('button',{name:'Updates',exact:true}).click();await admin.getByRole('button',{name:'Update local server',exact:true}).click();assert(calls.some(c=>c.command==='prepare_local_server'));assert.equal(await admin.locator('[data-page="Updates"] .local-server-admin').count(),1);}
 }
 console.log('Computers padding, section spacing and native updater tab placement passed.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
