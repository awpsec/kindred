// Both authors keep a fixed cover reading lane throughout scrolling.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web');
const near=(a,b,why)=>assert(Math.abs(a-b)<1,`${why}: ${a} != ${b}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await (process.env.CHROMIUM?chromium:webkit).launch(),reports=[];
 try {
  for(const side of ['right']) {
   const page=await browser.newPage({viewport:{width:466,height:780},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({token,profileID,side,css,js})=>{
    sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:side==='left'?84:0,rightInset:side==='right'?84:0,railSide:side,isDuo:true,isDuoInner:false,usesNativeRail:true,isPortrait:true,viewportHeight:780};
    window.__KINDRED_NATIVE_GEOMETRY={width:466,height:780,windowWidth:466,windowHeight:780,reservedRegions:[]};
    window.__KINDRED_IOS_TOOLBAR=null;
    addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
   },{token,profileID,side,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
   await page.goto(origin+'/#kindred-chat=dm-vivienne');await page.locator('#content [data-message="61"]').waitFor({state:'attached'});
   await page.waitForFunction(()=>!document.documentElement.dataset.iosChromeMorphing&&document.querySelector('#content [data-message="61"]')?.hasAttribute('data-ios-user-message'));
   // The real native toolbar arrives after the document and UIKit attach.
   // The fixed reading lane must also work before that measurement arrives.
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const beforeToolbar=await page.locator('#content [data-message="61"]').evaluate(n=>n.getBoundingClientRect().width);
   await page.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:392,y:170,width:52,height:156};dispatchEvent(new Event('kindred-ios-toolbar'));});
   await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-message-flow'));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   near(await page.locator('#content [data-message="61"]').evaluate(n=>n.getBoundingClientRect().width),beforeToolbar,'late toolbar measurement does not change wrapping');
   await page.evaluate(()=>{
    const area=document.querySelector('#content'),group=area.querySelector('[data-message="61"]');
    // A real reading gesture cancels following before establishing an anchor.
    area.dispatchEvent(new WheelEvent('wheel',{deltaY:1}));area.scrollTop+=group.getBoundingClientRect().top-390;area.dispatchEvent(new Event('scroll'));
    document.querySelector('#prompt').value='Retained draft';document.querySelector('#prompt').dispatchEvent(new Event('input',{bubbles:true}));
   });
   await page.waitForFunction(()=>[...document.querySelectorAll('#content>*')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
   await page.evaluate(()=>{
    window.messageTarget=document.querySelector('#content [data-message="61"]');
    window.messageSample=()=>{const r=messageTarget.getBoundingClientRect(),b=messageTarget.querySelector('.message-bubble').getBoundingClientRect(),c=document.querySelector('#composer').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bubble:[b.width,b.height],composer:[c.left,c.right,c.bottom],draft:document.querySelector('#prompt').value};};
    window.setDock=y=>{__KINDRED_IOS_TOOLBAR.y=y;dispatchEvent(new Event('kindred-ios-toolbar'));};
   });
   const start=await page.evaluate(()=>messageSample());
   assert(start.top>350&&start.top<450,'the animated user bubble is on screen: '+start.top);
   near(start.bubble[0],start.width,'a long user bubble fills its available lane');
   near(start.right,376,'user bubbles clear the rail and its camera lane even below it');
   const shapes=()=>page.locator('#content>.message-group').evaluateAll(nodes=>nodes.map(n=>{
    const b=n.querySelector('.message-bubble'),r=n.getBoundingClientRect(),br=b.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(b);
    return {left:r.left,right:r.right,width:r.width,height:r.height,bubble:[br.width,br.height],lines:[...range.getClientRects()].map(v=>[v.width,v.height,v.top-br.top])};
   }));
   const baseline=await shapes();
   assert(baseline.every(row=>row.right<=376.5),'both authors retain breathing room beside the cover controls');
   for(const y of [170,400,1200,0,170]) {
    await page.evaluate(y=>setDock(y),y);await page.waitForTimeout(80);
    assert.deepEqual(await shapes(),baseline,'vertical dock movement cannot rewrap messages');
   }
   for(const gap of [0,76,79,81,84,120,400,900,0]) {
    await page.evaluate(gap=>{const a=document.querySelector('#content');a.dispatchEvent(new WheelEvent('wheel',{deltaY:gap||1}));a.scrollTop=a.scrollHeight-a.clientHeight-gap;a.dispatchEvent(new Event('scroll'));},gap);
    await page.waitForTimeout(80);
    const now=await shapes();now.forEach((row,i)=>{
     for(const key of ['left','right','width','height'])near(row[key],baseline[i][key],'scroll keeps '+key);
     assert.deepEqual(row.bubble,baseline[i].bubble,'bubble dimensions stay fixed');
     assert.equal(row.lines.length,baseline[i].lines.length,'scroll never rewraps text');
    });
    assert(await page.locator('#content>[data-ios-user-message]').evaluateAll(nodes=>nodes.every(n=>n.getAnimations().every(a=>a.playState!=='running'))),'no scroll-triggered width animation');
   }
   near((await page.evaluate(()=>messageSample())).composer[1],start.composer[1],'composer retains its independent lane');
   assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Retained draft');
   // Keyboard presentation changes available height, not the reading width.
   await page.setViewportSize({width:466,height:430});
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:true,viewportHeight:430});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await page.waitForTimeout(350);
   (await shapes()).forEach((row,i)=>near(row.width,baseline[i].width,'keyboard keeps the reading width'));
   await page.setViewportSize({width:466,height:780});
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:false,viewportHeight:780});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await page.waitForTimeout(350);
   for(const reduce of ['system','app']) {
    if(reduce==='system')await page.emulateMedia({reducedMotion:'reduce'});else {await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('html').evaluate(n=>n.dataset.motion='off');}
    await page.evaluate(()=>setDock(1200));await page.waitForTimeout(60);
    near((await page.evaluate(()=>messageSample())).right,start.right,reduce+' keeps fixed margin');
   }
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{railSide:'left',leftInset:84,rightInset:0});Object.assign(__KINDRED_IOS_TOOLBAR,{x:22,y:170});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-ios-toolbar'));});
   await page.waitForFunction(()=>document.documentElement.dataset.iosRailSide==='left'&&parseFloat(document.querySelector('.conversation').style.getPropertyValue('--ios-message-lane-left'))>0);
   assert(await page.locator('#content .message-group').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().left>=89)),'both authors clear a leading dock after rotation');
   assert.deepEqual(errors,[]);reports.push({side,fixedReadingLane:true,scrollNeverRewraps:true,keyboard:true,reducedMotion:true,draftPreserved:true});await page.close();
  }
  console.log(JSON.stringify({passed:true,reports}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
