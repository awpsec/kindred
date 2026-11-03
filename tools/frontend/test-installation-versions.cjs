const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{for(const spec of [
  {kind:'mac',client:'0.88.6',server:'0.88.2',text:'This server is older than your app.'},
  {kind:'ios',client:'0.88.6',server:'0.88.2',text:'This server is older than your app.'},
  {kind:'ios',client:'0.88.5',server:'0.88.6',text:'This device uses an older app'},
  {kind:'mac',client:'0.88.6',server:'0.88.6',text:''}
 ]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({spec,token})=>{sessionStorage.setItem('kindred-token',token);
   if(spec.kind==='mac'){window.__KINDRED_DESKTOP={platform:'macos'};window.__KINDRED_DESKTOP_VERSION=spec.client;}
   else window.__KINDRED_IOS_APP_VERSION='iOS '+spec.client+' (1)';
  },{spec,token});
  await page.route('**/identity/meta',r=>r.fulfill({json:{profiles:false}}));
  await page.route('**/api/status*',r=>r.fulfill({json:{version:spec.server,vm_enabled:false}}));
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {openSettings};'}));
  await page.goto(origin);await page.evaluate(async()=>{const app=await import('/app.js');await app.openSettings('general');});
  await page.locator('[data-client-version]').waitFor();assert.match(await page.locator('[data-client-version]').textContent(),new RegExp(spec.client.replaceAll('.','\\.')));
  await page.waitForFunction(v=>document.querySelector('[data-server-version]')?.textContent===v,spec.server);assert.equal(await page.locator('[data-server-version]').textContent(),spec.server);
  const status=page.locator('[data-installation-status]');
  if(spec.text){assert((await status.textContent()).startsWith(spec.text));assert(await status.isVisible());}
  else assert.equal(await status.isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({passed:true,engine,cases:4,updatesTriggered:0}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
