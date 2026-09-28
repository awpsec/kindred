const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/onboarding-platforms');fs.mkdirSync(out,{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 for(const platform of ['windows','macos','linux']){
 const p=await browser.newPage({viewport:{width:560,height:700}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(platform=>{window.statusFixture={};window.__TAURI__={core:{invoke:async name=>{
 if(name==='profile_home_state')return {entries:[],version:'preview',theme:'dark',platform};
 if(name==='profile_activity')return {};
 if(name==='standalone_status')return window.statusFixture;
 if(name==='start_standalone'){window.statusFixture={status:'error',stage:'Checking Docker',stage_index:1,stage_count:5,completed_stages:0,message:platform==='linux'?'Docker Engine is missing or cannot start. Copy the Linux setup block below to install the prerequisites.':'Docker Desktop is missing or cannot start. Install it using the installation guide, open it, then retry setup.'};return;}
 throw Error(name);
 }}};if(platform==='macos')window.__KINDRED_NATIVE_FRAME=true;},platform);
 await p.goto('http://127.0.0.1:'+server.address().port+'/profile-home.html');await p.locator('#setup-choices').waitFor();
 if(platform==='windows')await p.screenshot({path:path.join(out,'welcome.png')});
 await p.locator('#choose-local').click();assert(await p.locator('#docker-guide').isVisible());
 assert.match(await p.locator('#docker-guide-link').getAttribute('href'),new RegExp(platform==='macos'?'mac-install':platform==='windows'?'windows-install':'engine/install'));
 assert.equal(await p.locator('#docker-guide-link').getAttribute('target'),'_blank');
 await p.locator('#standalone').click();await p.getByText(/is missing or cannot start/).waitFor();assert(await p.locator('#standalone').isEnabled());assert(await p.locator('#open-local').isHidden());
 await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,platform+'-docker.png'),fullPage:true});
 for(const theme of ['light','dark'])for(const width of [420,560]){await p.setViewportSize({width,height:700});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);await p.close();
 }
 console.log('All three platform guides, missing-Docker recovery, and light/dark layouts passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
