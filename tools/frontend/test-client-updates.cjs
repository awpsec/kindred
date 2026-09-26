const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/client-updates');fs.mkdirSync(artifacts,{recursive:true});
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const key=publicKey.export({format:'jwk'});
const envelope=payload=>{const bytes=Buffer.from(JSON.stringify(payload));return {payload:bytes.toString('base64'),signature:crypto.sign('RSA-SHA256',bytes,privateKey).toString('base64')};};
const pkg={size:100,sha256:'a'.repeat(64)};
const release={version:'0.52.0',channel:'stable',source_commit:'a'.repeat(40),platforms:Object.fromEntries(['linux-x86_64','macos-aarch64'].map(p=>[p,pkg]))};
const windows={...pkg,version:'0.52.0',channel:'stable',platform:'windows-x86_64'};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try {
  for(const spec of [
   {name:'new-mac',platform:'macos',native:true,update:true},
   {name:'old-mac',platform:'macos',legacy:true,version:'0.50.0',update:true},
   {name:'new-linux',platform:'linux',native:true,update:true},
   {name:'windows',platform:'windows',native:true,update:true},
   {name:'current-mac',platform:'macos',native:true,version:'0.52.0',update:false},
   {name:'tampered-mac',platform:'macos',native:true,tampered:true,update:false},
   {name:'unavailable-feed',platform:'macos',native:true,missing:true,update:false},
   {name:'unavailable-linux-feed',platform:'linux',native:true,missing:true,update:false},
   {name:'old-mac-missing-feed',platform:'macos',legacy:true,version:'0.50.0',missing:true,update:false},
   {name:'invalid-mac-package',platform:'macos',native:true,invalid:true,update:false},
   {name:'unknown-client',platform:'macos',native:true,unknown:true,update:false},
   {name:'browser',platform:null,update:false}
  ]){
   const context=await browser.newContext({viewport:{width:1000,height:800}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(({spec,token})=>{
    sessionStorage.setItem('kindred-token',token);window.calls=[];window.open=(url,target)=>{calls.push({command:'open',url,target});return null;};
    if(spec.platform){window.__KINDRED_DESKTOP={platform:spec.platform};if(!spec.unknown)window.__KINDRED_DESKTOP_VERSION=spec.version||'0.51.0';window.__KINDRED_SERVER_UPDATER=spec.native&&spec.platform!=='windows';window.__KINDRED_NATIVE_UPDATER=spec.native&&spec.platform==='windows';window.__KINDRED_EXTERNAL_LINKS=true;window.__KINDRED_LINUX_UPDATER=spec.platform==='linux';}
    window.__TAURI__={core:{invoke:async(command,args)=>{calls.push({command,...args});if(command==='notification_status')return{enabled:true,notch:{supported:spec.platform==='macos'&&spec.native,enabled:false}};return null;}}};
   },{spec,token});
   await page.route('**/updates.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/updates.js'),'utf8').replace(/const releaseKey = .*?;/,'const releaseKey = '+JSON.stringify(key)+';')}));
   await page.route('**/api/status*',route=>route.fulfill({json:{version:spec.platform?'0.52.0':'0.51.0',vm_enabled:false}}));
   await page.route('**/updates/client-stable.json',route=>{
    if(spec.missing||spec.platform==='windows')return route.fulfill({status:404,json:{}});
    const data=envelope(spec.invalid?{...release,platforms:{...release.platforms,'macos-aarch64':{...pkg,size:0}}}:release);if(spec.tampered)data.payload=Buffer.from(JSON.stringify({...release,version:'99.0.0'})).toString('base64');
    return route.fulfill({json:data});
   });
   await page.route('**/updates/stable.json',route=>route.fulfill({json:envelope(windows)}));
   await page.goto(origin);await page.waitForFunction(()=>!document.querySelector('#server-version').textContent.includes('Connecting'));await page.locator('#settings-button').click();
   await page.locator('[data-client-version]').waitFor();
   if(spec.platform)await page.getByRole('button',{name:'Check for updates',exact:true}).click();
   const expected=spec.unknown?'Unknown':spec.version||'0.51.0';
   assert.equal(await page.locator('#server-version').textContent(),'Server '+(spec.platform?'0.52.0':'0.51.0'),spec.name);
   if(spec.platform){assert.equal(await page.locator('#version').textContent(),'Client '+expected);assert.equal(await page.locator('[data-client-version]').textContent(),expected);}
   else assert.match(await page.locator('#version').textContent(),/^Browser UI /);
   assert.equal(await page.locator('#client-update').count(),spec.update?1:0,spec.name);
   if(spec.update){
    const action=page.locator('[data-client-update-action]');assert.equal(await action.textContent(),spec.legacy?'Download app update':'Update desktop app');await action.click();
    await page.waitForFunction(()=>calls.some(c=>c.command==='open'||c.command==='open_external_url'));
    const launch=await page.evaluate(()=>calls.find(c=>c.command==='open'||c.command==='open_external_url'));
    assert.equal(launch.url,spec.legacy?origin+'/updates/kindred-macos-aarch64-0.52.0.dmg':'kindred-update://check',spec.name);
    if(spec.legacy)assert.equal(await page.locator('#client-update').getAttribute('aria-label'),'Download Kindred client update');
    if(!spec.legacy)assert.equal(launch.target,['linux','macos'].includes(spec.platform)?'_self':'_blank',spec.name);
   }
   if(spec.name==='old-mac'){await page.locator('.notch-update-required').waitFor();assert.match(await page.locator('.notch-update-required').textContent(),/Desktop app on this device: 0.50.0/);}
   if(spec.name==='new-mac'||spec.name==='old-mac')await page.screenshot({path:path.join(artifacts,engine+'-'+spec.name+'.png')});
   assert.deepEqual(errors,[],spec.name);await context.close();
  }
  console.log(engine+': separate versions, signed update badge/actions, direct server downloads for old Macs, platform-isolated feeds, tampering, missing feed and browser passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
