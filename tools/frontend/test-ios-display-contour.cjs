// Captured public UIKit corner geometry must project into the list's local
// viewport once, including selected/alert fills and scrolling/reordering.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const cases=require('./fixtures/duo-display-contours.json'),bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch(),reports=[];
 try {
  for(const [pose,geometry] of Object.entries(cases)) {
   const inner=pose==='open',page=await browser.newPage({viewport:{width:geometry.width,height:geometry.height},hasTouch:true});
   await page.addInitScript(({token,profileID,geometry,inner,css,js})=>{
    sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-ios-sidebar-v1:'+profileID,JSON.stringify({width:76,hidden:false}));
    Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:inner,usesNativeRail:true,isPortrait:geometry.height>geometry.width,viewportHeight:geometry.height};
    window.__KINDRED_NATIVE_GEOMETRY={...geometry,windowWidth:geometry.width,windowHeight:geometry.height,reservedRegions:[]};
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
   },{token,profileID,geometry,inner,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
   await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');await page.locator('#content [data-message="72"]').waitFor({state:'attached'});
   await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing&&!document.documentElement.dataset.iosChromeMorphing);
   if(!inner)await page.evaluate(()=>__kindredDuoActions.perform('back'));
   await page.waitForFunction(()=>document.querySelector('#bots').style.getPropertyValue('--ios-display-contour'));
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#bots')).clipPath.startsWith('path('));
   const proof=await page.locator('#bots').evaluate(scroll=>{
    const link=scroll.querySelector('.bot-link'),saved=link.className,r=link.getBoundingClientRect(),point={x:r.left+8,y:r.top+8},hits=[];
    for(const state of ['', 'active', 'active has-unread']) {link.className=saved+' '+state;hits.push(document.elementFromPoint(point.x,point.y)?.closest('.nav-entry')===link.parentElement);}
    link.className=saved;return {point,hits,clip:getComputedStyle(scroll).clipPath,radius:getComputedStyle(link).borderTopLeftRadius};
   });
   assert(proof.hits.every(hit=>hit===(geometry.displayCorners.topLeft===8)),pose+': ordinary/selected/unread fills follow the physical corner: '+JSON.stringify(proof));
   assert.notEqual(proof.radius,'48px','no independent large row radius distorts the native contour');
   await page.locator('#bots').evaluate(scroll=>{scroll.prepend(scroll.lastElementChild);scroll.scrollTop=20;});
   const after=await page.locator('#bots').evaluate(n=>getComputedStyle(n).clipPath);assert.equal(after,proof.clip,'the physical contour does not move with keyed rows or scrolling');
   await page.evaluate(()=>{__KINDRED_NATIVE_GEOMETRY.displayContour=[[3,NaN]];dispatchEvent(new Event('kindred-native-geometry'));});
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#bots')).clipPath==='none');
   reports.push({pose,...proof});await page.close();
  }
  console.log(JSON.stringify({passed:true,reports}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
