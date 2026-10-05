const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
 for(const platform of ['ios','android','linux']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage();
  await p.addInitScript(({platform,token})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-text-size','150');window.__KINDRED_SYSTEM_TEXT_SCALE=1.7;if(platform==='linux')window.__KINDRED_DESKTOP={platform};else{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM=platform;}},{platform,token});
  await p.goto(origin);await p.waitForFunction(()=>window.KindredReadingSize);
  const scale=()=>p.evaluate(()=>Number(document.documentElement.style.getPropertyValue('--text-scale')));
  assert.equal(await scale(),platform==='ios'?1.7:1.5);
  await p.evaluate(()=>{window.fixtureDraft=document.createElement('textarea');fixtureDraft.value='Retain my draft';document.body.append(fixtureDraft);});
  await p.evaluate(()=>{window.__KINDRED_SYSTEM_TEXT_SCALE=2.1;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:2.1}}));});
  assert.equal(await scale(),platform==='ios'?2.1:1.5);
  const unchanged=await p.evaluate(async()=>{let mutations=0;const o=new MutationObserver(records=>mutations+=records.length);o.observe(document.documentElement,{attributes:true,attributeFilter:['style']});window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:2.1}}));await new Promise(r=>setTimeout(r,0));o.disconnect();return {mutations,draft:fixtureDraft.value};});assert.equal(unchanged.mutations,0);assert.equal(unchanged.draft,'Retain my draft');
  await p.evaluate(()=>{window.KindredReadingSize.set(100);window.dispatchEvent(new StorageEvent('storage',{key:'kindred-text-size',newValue:'115'}));});
  assert.equal(await scale(),platform==='ios'?2.1:1.15);
  if(platform==='ios'){
   assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-text-size')),'150');
   await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:NaN}})));assert.equal(await scale(),2.1);
  }
  await context.close();
 }
 console.log(JSON.stringify({passed:true,existingIosPreferenceIgnored:true,liveUpdate:true,invalidSignalIgnored:true,desktopAndroidPreserved:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
