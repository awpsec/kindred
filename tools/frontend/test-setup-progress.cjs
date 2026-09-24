const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/setup-progress');fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:820,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  for(const name of ['profile-home.html','profile-home.js','profile-home.css','bundled-dialog.js','bundled-dialog.css'])await p.route(url=>url.pathname==='/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui',name))}));
  await p.addInitScript(()=>{
   window.fixture={starts:0,switches:[],active:0,maximum:0,delay:0,status:{status:'working',stage:'Downloading and building server software',stage_index:3,stage_count:5,completed_stages:2,message:'Downloading and building server software',detail:'Downloading computer tools…',started_at:Math.floor(Date.now()/1000)-73}};
   window.__TAURI__={core:{invoke:async(name,args)=>{
    if(name==='profile_home_state')return {version:'fixture',entries:[{key:'local',account_key:'local',server:'http://127.0.0.1:9444',name:'Local account',profile_id:'local',session_available:true},{key:'remote',account_key:'remote',server:'https://work.example',name:'Work account',profile_id:'remote',session_available:true}],last:'remote',theme:'dark'};
    if(name==='profile_activity')return {};
    if(name==='standalone_status'){fixture.active++;fixture.maximum=Math.max(fixture.maximum,fixture.active);const status=structuredClone(fixture.status);await new Promise(r=>setTimeout(r,fixture.delay));fixture.active--;if(fixture.statusFailure)throw Error('Status temporarily unavailable');return status;}
    if(name==='start_standalone'){fixture.starts++;fixture.status={...fixture.status,status:'working',stage:'Checking Docker',stage_index:1,completed_stages:0,message:'Checking Docker'};return;}
    if(name==='switch_native_profile'){fixture.switches.push(args.key);return;}
    throw Error('Unexpected command '+name);
   }}};
  });
  await p.goto('http://127.0.0.1:'+server.address().port+'/profile-home.html');
  const local=p.locator('.select[data-key=local]'),remote=p.locator('.select[data-key=remote]');
  await p.getByText('Step 3 of 5 · Downloading and building server software',{exact:true}).waitFor();
  assert(await local.isDisabled());assert(await remote.isEnabled());assert.equal(await p.locator('#setup-progress').getAttribute('value'),'2');
  await local.evaluate(b=>b.click());assert.deepEqual(await p.evaluate(()=>fixture.switches),[]);
  await remote.click();assert.deepEqual(await p.evaluate(()=>fixture.switches),['remote']);
  await p.getByText('Setup details',{exact:true}).click();assert(await p.getByText('Downloading computer tools…',{exact:true}).isVisible());
  for(const width of [390,680,1320])for(const size of [100,150])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:900});await p.evaluate(({size,theme})=>{document.documentElement.style.setProperty('--text-scale',size/100);document.documentElement.dataset.theme=theme;},{size,theme});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify({width,size,theme}));
  }
  await p.setViewportSize({width:820,height:900});await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale',1));
  await p.screenshot({path:path.join(out,engine+'-building.png')});
  await p.evaluate(()=>{fixture.delay=1600;fixture.status={...fixture.status,status:'error',message:'Download interrupted. Retry to continue.',detail:'Connection lost while downloading'};});
  await p.getByText('Download interrupted. Retry to continue.',{exact:true}).waitFor();
  assert(await local.isDisabled());assert(await p.locator('#standalone').isEnabled());assert(await p.locator('#setup-details').getAttribute('open')!==null);
  await p.evaluate(()=>{fixture.delay=0;fixture.statusFailure=true;});await p.locator('#standalone').evaluate(b=>{b.click();b.click();});
  await p.waitForFunction(()=>fixture.starts===1);assert(await local.isDisabled());
  await p.getByText(/Could not check setup progress/).waitFor();assert(await p.locator('#standalone').isDisabled(),'An unavailable status must not offer another setup attempt');
  await p.evaluate(()=>{fixture.statusFailure=false;});
  await p.waitForFunction(()=>document.querySelector('#setup-stage').textContent==='Step 1 of 5 · Checking Docker');
  await p.evaluate(()=>{fixture.status={...fixture.status,status:'ready',completed_stages:5,message:'Your local server is ready.',local_server:{version:'fixture',desktop_version:'fixture',update_available:false}};});
  await p.locator('#open-local').waitFor();assert(await local.isEnabled());assert.equal(await p.locator('#setup-progress').getAttribute('value'),'5');
  assert.deepEqual(await p.evaluate(()=>fixture.switches),['remote'],'Setup must not auto-switch to an unrelated saved account');
  await local.click();assert.deepEqual(await p.evaluate(()=>fixture.switches),['remote','local']);
  assert.equal(await p.evaluate(()=>fixture.maximum),1,'Status polls must not overlap');assert.deepEqual(errors,[]);
  await p.goto('http://127.0.0.1:'+server.address().port+'/profile-home.html?embedded=1');
  await p.locator('.select[data-key=local] .profile-setup-progress').waitFor();
  assert(await p.locator('.select[data-key=local]').isDisabled());assert(await p.locator('.standalone').isHidden());
  assert.equal(await p.locator('.profile-setup-progress').first().getAttribute('value'),'2');
  await p.screenshot({path:path.join(out,engine+'-embedded-accounts.png')});
  console.log(JSON.stringify({passed:true,engine,layouts:12,profileReadiness:true,remoteAccountUsable:true,actualStages:true,details:true,retry:true,noOverlappingPolls:true,noWrongAccountResume:true,statusFailurePreservesWorker:true,embeddedProgress:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
