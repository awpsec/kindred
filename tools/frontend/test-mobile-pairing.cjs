const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}});p.setDefaultTimeout(12000);const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));let issued=0,state='pending',fail=false,supported=true;
  await p.route(origin+'/**',async route=>{
   const r=route.request(),url=new URL(r.url()),name=url.pathname,send=(json,status=200)=>route.fulfill({json,status});
   if(name==='/identity/meta')return send({profiles:true,mobile_pairing:supported,first_user:false,registration:false,legacy_claim:false});
   if(name==='/identity/profiles')return send({active:'work',username:'alex',account_id:'account-one',legacy:false,admin:true,profiles:[{id:'work',name:'Work',active:true}],directory:[]});
   if(name==='/identity/mobile-pairing'){
    const body=r.postDataJSON();writes.push(body);if(fail)return send({error:'A phone cannot connect to localhost. Enter its reachable HTTPS address.'},400);
    const qr=require('./fixtures/mobile-pairing-qr.json');return send({id:'pair-'+(++issued),url:'kindred://pair?server='+encodeURIComponent(body.server)+'#code='+'a'.repeat(64),server:body.server,login:'alex',expires_at:Math.floor(Date.now()/1000)+300,qr});
   }
   if(name.startsWith('/identity/mobile-pairing/')){if(r.method()==='DELETE'){writes.push({cancel:name});return send({ok:true});}return state==='unauthorized'?send({error:'Session expired'},401):send({status:state});}
   return route.continue();
  });
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
  await p.locator('#switch-profiles').click();await p.getByRole('menuitem',{name:'Connect mobile app',exact:true}).click();
  let d=p.locator('.mobile-pairing-dialog');await d.waitFor();
  assert.equal(await d.locator('svg').count(),0,'Do not create a loopback QR');
  await d.getByLabel('Server address').fill('https://kindred.example.com');await d.getByRole('button',{name:'Create QR code',exact:true}).click();
  await d.locator('.mobile-pairing-qr svg').waitFor();assert.equal(writes[0].server,'https://kindred.example.com');
  assert.equal(await d.locator('.mobile-pairing-account strong').innerText(),'alex');
  assert.match(await d.locator('.mobile-pairing-status').innerText(),/Waiting for your phone/);
  await d.locator('.mobile-pairing-help summary').click();
  await d.screenshot({path:path.join(artifacts,engine+'-mobile-pairing.png')});
  state='claimed';await p.waitForFunction(()=>document.querySelector('.mobile-pairing-status')?.textContent.includes('Code used'));
  assert.equal(await d.locator('.mobile-pairing-qr svg').count(),0);
  state='pending';await d.getByRole('button',{name:'New code',exact:true}).click();await d.locator('.mobile-pairing-qr svg').waitFor();
  await d.getByRole('button',{name:'Close',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.mobile-pairing-dialog'));
  await p.waitForTimeout(150);assert(writes.some(w=>w.cancel?.endsWith('pair-2')),'Closing revokes unclaimed code');
  await p.locator('#switch-profiles').click();await p.getByRole('menuitem',{name:'Connect mobile app',exact:true}).click();d=p.locator('.mobile-pairing-dialog');
  state='unauthorized';await d.getByLabel('Server address').fill('https://kindred.example.com');await d.getByRole('button',{name:'Create QR code',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.mobile-pairing-status')?.textContent.includes('Pairing session ended'));
  assert.equal(await d.locator('.mobile-pairing-qr svg').count(),0);
  state='pending';fail=true;await d.getByLabel('Server address').fill('https://localhost');await d.getByRole('button',{name:'Create QR code',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.mobile-pairing-status')?.textContent.includes('cannot connect'));
  assert.equal(await d.locator('.mobile-pairing-help').evaluate(n=>n.open),true);assert.equal(await d.locator('.mobile-pairing-qr svg').count(),0);
  await p.setViewportSize({width:390,height:844});assert(await d.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  await d.getByRole('button',{name:'Close',exact:true}).click();supported=false;await p.setViewportSize({width:1100,height:850});await p.reload();await p.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
  await p.locator('#switch-profiles').click();await p.getByRole('menuitem',{name:'Connect mobile app',exact:true}).click();
  await p.getByText('Update this server to connect the mobile app with a QR code.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,localAddressHelp:true,oneUseStatus:true,closeRevokes:true,errorHelp:true,mobileLayout:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
