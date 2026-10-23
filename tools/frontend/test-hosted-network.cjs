const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-hosted-network';fs.mkdirSync(out,{recursive:true});
 const base='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.route('**/network-preview',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/shell-polish.css"><dialog class="profile-dialog settings-dialog server-admin-dialog" open aria-label="Server administration"><aside class="settings-nav"><h2>Server admin</h2><nav><button>Users</button><button>Password resets</button><button>Computers</button><button class="active">Networking</button><button>Updates</button></nav><p class="server-admin-identity">Hosted</p></aside><section class="settings-main"><header class="profile-dialog-heading"><h2>Networking</h2><button aria-label="Close">×</button></header><div class="server-admin-content"><div class="server-admin-page" id="host"></div></div></section></dialog>'}));
 async function mount(mode='bridge',publicURL='https://kindred.example.ts.net',theme='dark'){
  await page.goto(base+'/network-preview');
  await page.evaluate(async({mode,publicURL,theme})=>{
   document.documentElement.dataset.theme=theme;
   const defaults={access:mode==='host'?'local':'bridge',tailnet_address:'',public_url:publicURL,allowed_origins:[],confirmed_http_origins:[]};
   window.writes=[];window.checks=[];window.pairs=[];window.replies=[];window.reloads=0;window.deferred=false;window.saveRestart=false;
   window.fetch=async()=>new Response(JSON.stringify({docker_network:{revision:'initial'}}));
   window.result={state:'reachable',message:'Kindred answered.'};
   const api=async(name,body)=>{
    if(name==='admin/network/check'){checks.push(body);if(deferred)return new Promise(resolve=>replies.push(resolve));return {...result,url:body.url};}
    if(!body)return {mode,revision:'initial',settings:structuredClone(defaults),defaults:structuredClone(defaults),pending:null};
    writes.push(body);return {revision:saveRestart?'pending':'initial',settings:body.reset?defaults:body.settings,restarting:window.saveRestart};
   };
   window.network=await(await import('/docker-network.js')).mountDockerNetwork(document.querySelector('#host'),{api,dialog:document.querySelector('dialog'),onPair:url=>pairs.push(url),reload:()=>reloads++});
  },{mode,publicURL,theme});
 }
 try{
  for(const theme of ['dark','light']){
   await mount('bridge','https://kindred.example.ts.net',theme);
   assert.equal(await page.getByText('Not checked yet. A saved URL does not confirm that it works.',{exact:true}).count(),1);
   assert(await page.getByRole('button',{name:'Connect mobile app',exact:true}).isDisabled());
   await page.getByRole('button',{name:'Check address',exact:true}).click();
   await page.getByRole('status').filter({hasText:'HTTPS verified'}).waitFor();
   await page.getByRole('button',{name:'Connect mobile app',exact:true}).click();assert.deepEqual(await page.evaluate(()=>pairs),['https://kindred.example.ts.net']);
   await page.locator('.server-admin-content').evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,engine+'-'+theme+'.png')});
  }
  await mount('bridge','https://kindred.example.ts.net:9444');
  await page.getByText(/Port 9444 normally serves plain HTTP/).waitFor();
  await page.evaluate(()=>result={state:'protocol_mismatch',message:'This port is not speaking HTTPS. Check the HTTPS proxy port.'});
  await page.getByRole('button',{name:'Check address',exact:true}).click();await page.getByRole('status').filter({hasText:'not speaking HTTPS'}).waitFor();assert(await page.getByRole('button',{name:'Connect mobile app',exact:true}).isDisabled());
  assert.equal(await page.getByLabel('Primary server URL').inputValue(),'https://kindred.example.ts.net:9444','Never silently remove custom port');
  await page.evaluate(()=>deferred=true);await page.getByRole('button',{name:'Check address',exact:true}).click();await page.waitForFunction(()=>replies.length===1);
  await page.getByLabel('Primary server URL').fill('https://other.example');await page.evaluate(()=>replies.shift()({state:'reachable'}));await page.waitForTimeout(60);
  await page.getByText('Not checked yet. A saved URL does not confirm that it works.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Connect mobile app',exact:true}).isDisabled());
  await page.evaluate(()=>{deferred=false;result={state:'reachable'};});await page.getByRole('button',{name:'Check address',exact:true}).click();await page.getByRole('status').filter({hasText:'HTTPS verified'}).waitFor();assert(await page.getByRole('button',{name:'Connect mobile app',exact:true}).isDisabled(),'Draft address cannot pair saved workspace');
  await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.getByRole('status').filter({hasText:'Settings saved.'}).waitFor();assert(await page.getByRole('button',{name:'Connect mobile app',exact:true}).isDisabled(),'Save invalidates verification');
  await page.getByRole('button',{name:'Check address',exact:true}).click();await page.getByRole('status').filter({hasText:'HTTPS verified'}).waitFor();await page.getByRole('button',{name:'Connect mobile app',exact:true}).click();assert.deepEqual(await page.evaluate(()=>pairs),['https://other.example']);
  await mount('bridge','https://localhost');await page.getByText('Set up access',{exact:true}).click();await page.getByRole('radio',{name:/Only this server/}).check();assert.equal(await page.getByLabel('Local host port',{exact:true}).inputValue(),'9444','Do not infer backend port from HTTPS proxy port');
  await mount('bridge','http://127.0.0.1:19444');
  await page.getByRole('radio',{name:/Only this server/}).check();assert.equal(await page.getByLabel('Local host port',{exact:true}).inputValue(),'19444');await page.getByLabel('Local host port',{exact:true}).fill('20444');await page.getByRole('button',{name:'Use local address',exact:true}).click();assert.equal(await page.getByLabel('Primary server URL').inputValue(),'http://127.0.0.1:20444');
  await page.getByRole('radio',{name:/My devices with Tailscale/}).check();await page.getByLabel('Local host port',{exact:true}).fill('19444');await page.getByLabel('HTTPS port',{exact:true}).fill('8443');await page.getByText('sudo tailscale serve --bg --https=8443 --set-path=/ http://127.0.0.1:19444',{exact:true}).waitFor();
  await page.getByLabel('HTTPS port',{exact:true}).fill('0');await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.waitForFunction(()=>writes.length===1);assert.equal(await page.evaluate(()=>writes[0].settings.access),'bridge','Setup choice does not claim host mutation');
  await mount('host','http://127.0.0.1:9444');assert(await page.getByLabel('Local host port',{exact:true}).isDisabled());
  await page.getByRole('radio',{name:/Advanced: choose networks/}).check();await page.getByLabel('Connection access',{exact:true}).selectOption('tailnet');await page.getByLabel('This host’s Tailscale IP address').fill('100.64.1.2');await page.getByLabel('Primary server URL').fill('http://100.64.1.2:9444');await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.waitForFunction(()=>writes.length===1);assert.equal(await page.evaluate(()=>writes[0].settings.tailnet_address),'100.64.1.2');
  await page.getByRole('radio',{name:/My devices with Tailscale/}).check();await page.getByRole('button',{name:'Use host-only listener',exact:true}).click();await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.waitForFunction(()=>writes.length===2);assert.equal(await page.evaluate(()=>writes[1].settings.access),'local');
  await mount('bridge','http://127.0.0.1:9444');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.5'));
  assert(await page.evaluate(()=>{const h=document.querySelector('#host');return h.scrollWidth<=h.clientWidth+1;}),'No horizontal overflow at phone width and 150% text');
  await page.screenshot({path:path.join(out,engine+'-mobile-large-text.png')});
  await page.setViewportSize({width:1200,height:1000});
  await mount();await page.evaluate(()=>saveRestart=true);await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.getByRole('status').filter({hasText:'This address is no longer allowed'}).waitFor();assert(await page.evaluate(()=>network.canLeave()),'Can leave after address change removes current origin');
  await mount();await page.getByText('Advanced network settings',{exact:true}).click();await page.getByLabel('Additional allowed URLs · one per line').fill(base);await page.evaluate(()=>saveRestart=true);await page.getByRole('button',{name:'Save and restart',exact:true}).click();await page.getByRole('status').filter({hasText:'previous settings were restored'}).waitFor();assert(await page.evaluate(()=>network.canLeave()),'Can leave after rollback');
  await mount();await page.evaluate(()=>deferred=true);await page.getByRole('button',{name:'Check address',exact:true}).click();await page.waitForFunction(()=>replies.length===1);await page.evaluate(()=>{document.querySelector('dialog').close();replies.shift()({state:'reachable'});});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>pairs.length+writes.length+reloads),0);
  // Exercise the real profile menu and pairing dialog, not only the component.
  const pairingWrites=[];
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const saved={access:'bridge',tailnet_address:'',public_url:'https://shared.example.ts.net',allowed_origins:[],confirmed_http_origins:[]};
  await page.route('**/identity/**',async r=>{
   const req=r.request(),name=new URL(req.url()).pathname,send=json=>r.fulfill({json});
   if(name==='/identity/meta')return send({profiles:true,first_user:false,registration:true,version:'0.87.2',deployment:'hosted',docker_network:{mode:'bridge',revision:'initial'},mobile_pairing:true});
   if(name==='/identity/profiles')return send({active:'main',username:'owner',admin:true,legacy:false,account_id:'owner',profiles:[{id:'main',name:'Main',active:true,unread:0}]});
   if(name==='/identity/admin')return send({users:[],registration:false});
   if(name==='/identity/admin/password-resets')return send({requests:[]});
   if(name==='/identity/admin/network')return send({mode:'bridge',revision:'initial',settings:saved,defaults:saved,pending:null});
   if(name==='/identity/admin/network/check'){assert.equal(req.headers().authorization,'Bearer '+token);assert.equal(req.postDataJSON().url,saved.public_url);return send({url:saved.public_url,state:'reachable',encrypted:true,checked_from:'server'});}
   if(name==='/identity/mobile-pairing'&&req.method()==='POST'){pairingWrites.push(req.postDataJSON());return send({id:'pair',url:'kindred://pair',server:req.postDataJSON().server,expires_at:Date.now()/1000+60,qr:{width:21,modules:Array(441).fill(false)}});}
   if(name==='/identity/mobile-pairing/pair')return send({status:'pending'});
   return send({});
  });
  await page.goto(base);await page.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
  await page.locator('#switch-profiles').click();await page.getByRole('menuitem',{name:'Server administration',exact:true}).click();await page.locator('.settings-nav').getByRole('button',{name:'Networking',exact:true}).click();
  await page.getByRole('button',{name:'Check address',exact:true}).click();await page.getByRole('status').filter({hasText:'HTTPS verified'}).waitFor();
  await page.locator('.server-admin-content').evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(out,engine+'-actual-admin.png')});
  await page.getByText('Set up access',{exact:true}).click();await page.locator('.network-setup').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,engine+'-setup.png')});
  await page.getByRole('button',{name:'Connect mobile app',exact:true}).click();await page.locator('.mobile-pairing-dialog').waitFor();await page.waitForFunction(()=>!!document.querySelector('.mobile-pairing-qr svg'));
  assert.equal(await page.getByLabel('Server address',{exact:true}).inputValue(),saved.public_url);assert.deepEqual(pairingWrites,[{server:saved.public_url}]);assert.equal(await page.locator('.server-admin-dialog').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,passed:true,checks:['themes','wrong-port','check-race','draft-pairing','save-invalidates-check','custom-ports','host-listeners','guide-validation','mobile-150pct','close-during-check','reconnect-exits','actual-admin-to-pairing']}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
