const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],writes=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='PUT')writes.push(r.url());});
  await context.addInitScript(token=>{
   if(window.top!==window)return;
   sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform:'linux'};
   window.notificationError='Notifications unavailable: org.freedesktop.Notifications is unavailable';window.testError='No notification service';window.testCount=0;
   window.__TAURI__={core:{invoke:async(command)=>{
    if(command==='notification_status')return {enabled:true,error:window.notificationError};
    if(command==='test_notification'){window.testCount++;if(window.testError)throw Error(window.testError);return;}
    return null;
   }}};
  },token);
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  await p.getByRole('button',{name:'Settings',exact:true}).click();
  const panel=p.locator('.desktop-notification-control'),status=panel.getByRole('status'),test=panel.getByRole('button',{name:'Test notification',exact:true});
  await status.getByText('Notifications unavailable: org.freedesktop.Notifications is unavailable',{exact:true}).waitFor();
  await test.click();await status.getByText('Test notification failed: No notification service',{exact:true}).waitFor();
  assert(await test.isEnabled());
  await p.evaluate(()=>{window.testError='';window.notificationError='';});
  await test.click();await p.waitForFunction(()=>document.querySelector('.desktop-notification-control [role=status]')?.textContent==='Test sent to the system.');
  assert.equal(await p.evaluate(()=>window.testCount),2);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await p.locator('#settings-close').click();await p.getByRole('button',{name:'Settings',exact:true}).click();
  await p.waitForFunction(()=>{const status=document.querySelector('.desktop-notification-control [role=status]');return status?.hidden&&status.textContent==='';});
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'edge',deliveryErrorsVisible:true,testFailureAndRecovery:true,noPreferenceChanges:true,doesNotClaimPopupVisible:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
