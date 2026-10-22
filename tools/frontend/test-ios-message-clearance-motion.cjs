// User bubbles reclaim the full lower lane; bot replies keep one steady lane.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web');
const near=(a,b,why)=>assert(Math.abs(a-b)<1,`${why}: ${a} != ${b}`);
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch(),reports=[];
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
   // Recover from that initially missing measurement rather than staying in
   // the permanent full-height gutter used before it becomes available.
   await page.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:382,y:170,width:84,height:156};dispatchEvent(new Event('kindred-ios-toolbar'));});
   await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-message-flow'));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
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
    window.captureClearance=change=>new Promise((resolve,reject)=>{
     const original=CSSStyleDeclaration.prototype.setProperty;let queued=false;
     const restore=()=>{CSSStyleDeclaration.prototype.setProperty=original;clearTimeout(timeout);};
     const timeout=setTimeout(()=>{restore();reject(Error('No message clearance transition'));},2000);
     CSSStyleDeclaration.prototype.setProperty=function(...args){
      const result=original.apply(this,args);
      if(this===messageTarget.style&&/^--ios-user-clearance/.test(args[0])&&!queued){queued=true;queueMicrotask(()=>{
       messageTarget.getBoundingClientRect();const motions=messageTarget.getAnimations().filter(a=>a.playState==='running');
       if(!motions.length){queued=false;return;}motions.forEach(a=>{a.pause();a.currentTime=0;});restore();resolve(motions);
      });}return result;
     };change();
    });
    window.setDock=y=>{__KINDRED_IOS_TOOLBAR.y=y;dispatchEvent(new Event('kindred-ios-toolbar'));};
   });
   const start=await page.evaluate(()=>messageSample());
   assert(start.top>350&&start.top<450,'the animated user bubble is on screen: '+start.top);
   near(start.bubble[0],start.width,'a long user bubble fills its available lane');
   near(start.right,449,'a lower user bubble reaches the full trailing content edge');
   const botBefore=await page.locator('#content [data-message="62"]').evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('.message-bubble').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,bubble:[b.width,b.height]};});
   near(botBefore.right,376,'bot messages keep a six-point gap from the controls');
   assert(start.left-botBefore.left>=32,'user bubbles retain a distinct leading inset from bot replies');
   // Move the measured controls over this retained message. This same path is
   // used when scrolling puts a message beside a stationary native dock.
   const contraction=await page.evaluate(async()=>{
    const motions=await captureClearance(()=>setDock(messageTarget.getBoundingClientRect().top-30));
    const frames=[];for(const fraction of [0,.25,.5,.75,.999]){motions.forEach(a=>a.currentTime=Number(a.effect.getTiming().duration)*fraction);frames.push(messageSample());}
    motions.forEach(a=>a.finish());const after=messageSample();return {frames,after};
   });
   near(contraction.frames[0].width,start.width,'clearance starts at the painted width');
   assert(contraction.frames.some(f=>f.right<start.right-2&&f.right>contraction.after.right+2),'a user bubble retracts through intermediate trailing edges');
   near(contraction.frames.at(-1).right,contraction.after.right,'no retraction cleanup teleport');near(contraction.after.right,376,'the bubble ends six points before the measured bar');
   const botAfter=await page.locator('#content [data-message="62"]').evaluate(n=>{const r=n.getBoundingClientRect(),b=n.querySelector('.message-bubble').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,bubble:[b.width,b.height]};});
   assert.deepEqual(botAfter,botBefore,'bot messages stay fixed when the dock overlaps a different message');
   const expansion=await page.evaluate(async()=>{
    const motions=await captureClearance(()=>setDock(1200)),frames=[];
    for(const fraction of [0,.25,.5,.75,.999]){motions.forEach(a=>a.currentTime=Number(a.effect.getTiming().duration)*fraction);frames.push(messageSample());}
    motions.forEach(a=>a.finish());return {frames,after:messageSample()};
   });
   near(expansion.frames[0].width,contraction.after.width,'release starts at the painted width');
   assert(expansion.frames.some(f=>f.right>contraction.after.right+2&&f.right<expansion.after.right-2),'a user bubble grows through intermediate trailing edges');
   near(expansion.frames.at(-1).right,expansion.after.right,'no expansion cleanup teleport');near(expansion.after.width,start.width,'the full width returns below the dock');
   const reversal=await page.evaluate(async()=>{
    const first=await captureClearance(()=>setDock(messageTarget.getBoundingClientRect().top-30));first.forEach(a=>a.currentTime=110);const before=messageSample();
    const second=await captureClearance(()=>setDock(1200));const after=messageSample();second.forEach(a=>a.finish());return {before,after};
   });near(reversal.before.width,reversal.after.width,'reversal resumes from the current width');near(reversal.before.right,reversal.after.right,'reversal keeps its current trailing edge');
   for(const f of [...contraction.frames,...expansion.frames,reversal.before,reversal.after]) {
    near(f.left,start.left,'a long user bubble keeps its leading edge steady');near(f.bubble[0],f.width,'the actual bubble fills the changing lane');assert.deepEqual(f.composer,start.composer,'reading clearance cannot move the composer');assert.equal(f.draft,'Retained draft');
   }
   // Exercise actual scrolling across the dock boundary, including the last
   // animated frames after release. A settled bubble must not restart forever.
   await page.evaluate(()=>setDock(170));
   await page.evaluate(()=>{const area=document.querySelector('#content');area.dispatchEvent(new WheelEvent('wheel',{deltaY:1}));area.scrollTop+=messageTarget.getBoundingClientRect().top-260;area.dispatchEvent(new Event('scroll'));});
   await page.waitForFunction(()=>parseFloat(messageTarget.style.getPropertyValue('--ios-user-clearance'))>0);
   await page.waitForFunction(()=>messageTarget.getAnimations().every(a=>a.playState!=='running'));
   await page.evaluate(()=>{const area=document.querySelector('#content');area.dispatchEvent(new WheelEvent('wheel',{deltaY:-1}));area.scrollTop+=messageTarget.getBoundingClientRect().top-(__KINDRED_IOS_TOOLBAR.y+__KINDRED_IOS_TOOLBAR.height+13);area.dispatchEvent(new Event('scroll'));});
   await page.waitForFunction(()=>parseFloat(messageTarget.style.getPropertyValue('--ios-user-clearance'))===0);
   await page.waitForFunction(()=>[...document.querySelectorAll('#content>*')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
   const stable=await page.evaluate(async()=>{const frames=[];for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);frames.push(messageSample());}return frames;});
   stable.forEach(f=>near(f.right,stable[0].right,'the bubble cannot oscillate after release'));
   near(stable[0].right,start.right,'a user bubble fully below the dock fills the trailing space');
   // Near the follow threshold, wrapped-height changes can generate their own
   // scroll events. One reading gesture must settle instead of fluttering.
   const bottomScroll=await page.evaluate(async()=>{
    setDock(300);const area=document.querySelector('#content'),proof=[];
    for(const gap of [0,76,79,81,84,120]){
     area.dispatchEvent(new WheelEvent('wheel',{deltaY:1}));area.scrollTop=area.scrollHeight-area.clientHeight-gap;area.dispatchEvent(new Event('scroll'));
     const frames=[];
     for(let i=0;i<48;i++){await new Promise(requestAnimationFrame);frames.push([...area.children].filter(n=>n.hasAttribute('data-ios-user-message')).slice(-5).map(n=>n.style.getPropertyValue('--ios-user-clearance')).join('|'));}
     proof.push({gap,changes:frames.filter((value,i)=>i&&value!==frames[i-1]).length,tail:new Set(frames.slice(-10)).size});
    }return proof;
   });
   bottomScroll.forEach(proof=>assert.equal(proof.tail,1,'manual bottom scrolling settles without repeated clearance reversals: '+JSON.stringify(proof)));
   await page.evaluate(()=>{const area=document.querySelector('#content');area.dispatchEvent(new WheelEvent('wheel',{deltaY:-1}));area.scrollTop+=messageTarget.getBoundingClientRect().top-260;area.dispatchEvent(new Event('scroll'));});
   const latest=page.locator('.jump-latest');await latest.waitFor({state:'visible'});
   await page.setViewportSize({width:466,height:430});
   const latestKeyboard=await page.evaluate(()=>{
    const jump=document.querySelector('.jump-latest'),before=jump.getBoundingClientRect().right;
    Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:true,composerBottomInset:0,viewportHeight:430});
    dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));jump.getBoundingClientRect();
    const motions=jump.getAnimations().filter(a=>a.transitionProperty==='right');motions.forEach(a=>{a.pause();a.currentTime=0;});
    const frames=[];for(const fraction of [0,.25,.5,.999]){motions.forEach(a=>a.currentTime=Number(a.effect.getTiming().duration)*fraction);frames.push(jump.getBoundingClientRect().right);}
    motions.forEach(a=>a.finish());return {before,frames,after:jump.getBoundingClientRect().right,motions:motions.length};
   });
   assert(latestKeyboard.motions>0,'keyboard avoidance slides Latest messages');
   near(latestKeyboard.frames[0],latestKeyboard.before,'Latest begins at its painted position');
   assert(latestKeyboard.frames.some(right=>right<latestKeyboard.before-2&&right>latestKeyboard.after+2),'Latest passes through intermediate horizontal positions');
   near(latestKeyboard.after,latestKeyboard.before-84,'Latest clears the native keyboard-side gutter');
   assert(latestKeyboard.after<=376,'Latest stays left of the right dock while typing');
   await page.setViewportSize({width:466,height:780});
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:false,composerBottomInset:34,viewportHeight:780});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await page.waitForFunction(()=>document.querySelector('.jump-latest').getAnimations().every(a=>a.playState!=='running'));
   near((await latest.boundingBox()).x+(await latest.boundingBox()).width,latestKeyboard.before,'Latest returns to the full trailing lane after keyboard dismissal');
   for(const reduce of ['system','app']) {
    if(reduce==='system')await page.emulateMedia({reducedMotion:'reduce'});else {await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('html').evaluate(n=>n.dataset.motion='off');}
    await page.evaluate(()=>setDock(messageTarget.getBoundingClientRect().top-30));
    await page.waitForFunction(()=>parseFloat(messageTarget.style.getPropertyValue('--ios-user-clearance'))>0);
    assert.equal(await page.evaluate(()=>messageTarget.getAnimations().length),0,reduce+' Reduce Motion removes bubble resizing');
    await page.evaluate(()=>setDock(1200));await page.waitForFunction(()=>parseFloat(messageTarget.style.getPropertyValue('--ios-user-clearance'))===0);
   }
   // Rotation can put the native controls on the leading edge. User bubbles
   // are already right aligned there, so the fixed lane clears it without a
   // needless horizontal shift.
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{railSide:'left',leftInset:84,rightInset:0});Object.assign(__KINDRED_IOS_TOOLBAR,{x:0,y:170});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-ios-toolbar'));});
   await page.waitForFunction(()=>document.documentElement.dataset.iosRailSide==='left'&&parseFloat(document.querySelector('.conversation').style.getPropertyValue('--ios-message-lane-left'))>0&&parseFloat(messageTarget.style.getPropertyValue('--ios-user-clearance'))===0);
   assert(await page.locator('#content .message-group').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().left>=89)),'both authors clear a leading dock by six points after rotation');
   assert.deepEqual(errors,[]);reports.push({side,contraction,expansion,reversal,bottomScroll,latestKeyboard,scrollReleaseStable:true,reducedMotion:true});await page.close();
  }
  console.log(JSON.stringify({passed:true,reports}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
