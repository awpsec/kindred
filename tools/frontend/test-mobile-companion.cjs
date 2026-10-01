const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.addInitScript(token=>{
   window.__KINDRED_MOBILE_PLATFORM='android';window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PROFILE='fixture-profile';window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
   window.mobileEvents=[];window.kindredNative={postMessage:raw=>{
    const value=JSON.parse(raw);window.mobileEvents.push(value);
    if(value.type==='download-start'||value.type==='download-end')queueMicrotask(()=>window.kindredNative.onmessage?.({data:JSON.stringify({id:value.id,stage:value.type==='download-start'?'ready':'saved'})}));
   }};
   sessionStorage.setItem('kindred-token',token);
  },token);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/#kindred-chat=dm-piper');
  await p.locator('#prompt').waitFor({state:'visible'});
  await p.waitForFunction(()=>location.hash==='');
  const prompt=p.locator('#prompt');await prompt.fill('Keep this draft when the phone opens.');await p.waitForTimeout(500);
  assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-token')),null);
  assert(await p.evaluate(()=>JSON.parse(localStorage.getItem('kindred-mobile-drafts-fixture-profile')).drafts.some(([,text])=>text.includes('Keep this draft'))));
  for(const size of [{width:840,height:720},{width:720,height:420},{width:390,height:500},{width:390,height:844}]){
   await p.setViewportSize(size);await p.waitForTimeout(200);
   assert.equal(await prompt.evaluate(n=>n.value),'Keep this draft when the phone opens.');
   const box=await prompt.boundingBox();assert(box.x>=0 && box.x+box.width<=size.width+1,'composer remains within viewport');
  }
  await p.evaluate(()=>sessionStorage.clear());
  await p.reload();await p.locator('#prompt').waitFor({state:'visible'});
  await p.waitForFunction(()=>document.querySelector('#prompt').value==='Keep this draft when the phone opens.');
  await p.evaluate(async()=>{const mobile=await import('/mobile.js');mobile.mobileAccounts();mobile.mobileSession('rotated-test-token','next-profile');});
  assert(await p.evaluate(()=>window.mobileEvents.some(e=>e.type==='accounts')));
  assert(await p.evaluate(()=>window.mobileEvents.some(e=>e.type==='session'&&e.profile_id==='next-profile')));
  assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-token')),null);
  await p.evaluate(()=>{
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['A real export with unicode: ✓']));a.download='report.txt';document.body.append(a);a.click();a.remove();
  });
  await p.waitForFunction(()=>window.mobileEvents.some(e=>e.type==='download-end'));
  await p.evaluate(()=>window.dispatchEvent(new Event('kindred-mobile-suspend')));
  assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-mobile-drafts-next-profile')),null,'old page must never save drafts under the next profile during rotation');
  const exported=await p.evaluate(()=>window.mobileEvents.filter(e=>e.type.startsWith('download-')));
  assert.equal(exported[0].type,'download-start');assert.equal(exported[0].name,'report.txt');
  assert.equal(Buffer.concat(exported.filter(e=>e.type==='download-chunk').map(e=>Buffer.from(e.data,'base64'))).toString(),'A real export with unicode: ✓');
  const folder=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing';
  await p.screenshot({path:folder+'/mobile-chat-'+(process.env.WEBKIT?'webkit':'chromium')+'.png'});
  await p.setViewportSize({width:840,height:720});await p.screenshot({path:folder+'/mobile-unfolded-'+(process.env.WEBKIT?'webkit':'chromium')+'.png'});
  assert.deepEqual(errors.filter(e=>!e.startsWith('ResizeObserver loop')&&!e.includes('/api/notifications?after=1 due to access control checks.')),[]);console.log('Mobile draft persistence, resize, notification route, and bridge tests passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
