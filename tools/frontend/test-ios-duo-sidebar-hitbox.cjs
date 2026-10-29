// Exercise the shipped page and installed-app layout with the Duo's horizontal
// toolbar touch region present. WebKit alone cannot model native bar hit tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const open=require('./fixtures/duo-display-contours.json').open;
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-duo-sidebar-hitbox';
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await webkit.launch(),reports=[];fs.mkdirSync(out,{recursive:true});
 try {
  for(const rail of [false,true]) {
   const page=await browser.newPage({viewport:{width:669,height:951},hasTouch:true}),errors=[];
   page.setDefaultTimeout(30000);page.on('pageerror',error=>{errors.push(error.message);console.error('pageerror',error.message);});
   await page.addInitScript(({token,profileID,css,js,open,rail})=>{
    sessionStorage.setItem('kindred-token',token);
    localStorage.setItem('kindred-ios-sidebar-v1:'+profileID,JSON.stringify({width:rail?76:210,hidden:false}));
    Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    window.__KINDRED_IOS_LAYOUT={topInset:82,bottomInset:34,leftInset:0,rightInset:0,railSide:'none',isDuo:true,isDuoInner:true,usesNativeRail:true,isSlab:false,isPortrait:true,viewportHeight:951};
    const contour=open.displayContour.map(([command,...points])=>[command,...points.map((_,i)=>points[i%2?i-1:i+1])]);
    window.__KINDRED_NATIVE_GEOMETRY={width:669,height:951,windowWidth:669,windowHeight:951,displayCorners:open.displayCorners,displayContour:contour,reservedRegions:[{kind:'division',active:false,x:334.5,y:0,width:0,height:951}]};
    document.addEventListener('DOMContentLoaded',()=>{
     const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);
     const toolbar=document.createElement('div');toolbar.id='fixture-native-toolbar';toolbar.setAttribute('aria-hidden','true');
     toolbar.style.cssText='position:fixed;inset:0 0 auto;height:82px;z-index:2147483647';document.body.append(toolbar);
    },{once:true});
   },{token,profileID,rail,open,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
   await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#content [data-message="72"]').waitFor({state:'attached'});
   await page.locator('#startup-status').waitFor({state:'hidden'});
   const settled=()=>page.waitForFunction(()=>window.__kindredNativeSidebar?.active()&&!document.querySelector('#app').dataset.mobileResizing&&!document.documentElement.dataset.iosChromeMorphing);
   await settled();
   const first=page.locator('#bots .bot-link').first();
   const proof=()=>first.evaluate(link=>{
    const r=link.getBoundingClientRect(),avatar=link.querySelector('.character').getBoundingClientRect();
    const points=[{x:avatar.x+avatar.width/2,y:avatar.y+avatar.height/2}];
    // A finger-sized square around the avatar must remain reachable, not just
    // a fortunate point in the bottom of the first row.
    for(const dx of [-21,0,21])for(const dy of [-21,0,21])points.push({x:avatar.x+avatar.width/2+dx,y:avatar.y+avatar.height/2+dy});
    if(getComputedStyle(link.querySelector('.bot-info')).display!=='none')points.push({x:r.right-20,y:r.top+r.height/2});
    return {top:r.top,bottom:r.bottom,points:points.map(point=>({...point,hit:document.elementFromPoint(point.x,point.y)?.closest('.bot-link')===link})),label:link.getAttribute('aria-label'),padding:getComputedStyle(document.querySelector('.sidebar')).paddingTop};
   });
   const before=await proof();
   fs.writeFileSync(path.join(out,`portrait-${rail?'rail':'list'}.json`),JSON.stringify(before,null,2));
   await page.screenshot({path:path.join(out,`portrait-${rail?'rail':'list'}.png`)});
   assert(before.top>=82,'first bot must be below the native horizontal toolbar: '+JSON.stringify(before));
   assert(before.points.every(point=>point.hit),'the first avatar has an unobstructed 44-point touch target');
   const selected=await first.getAttribute('aria-label'),point=before.points[0];
   await page.touchscreen.tap(point.x,point.y);
   await page.waitForFunction(label=>document.querySelector('#chat-title')?.textContent===label||document.querySelector('.bot-heading strong')?.textContent===label,selected);
   const loadID=await page.evaluate(()=>__KINDRED_DUO_FIXTURE.snapshot().loadID);
   // Search is already inside the safe container; it must not add the top
   // safe-area inset a second time.
   if(!rail&&await page.locator('.sidebar>.search').count()){
    await page.evaluate(()=>document.querySelector('.sidebar').classList.add('ios-searching'));
    const search=await page.locator('.sidebar>.search').boundingBox();
    assert(search.y>=82&&search.y<=94,'search uses the same inset exactly once');
    await page.evaluate(()=>document.querySelector('.sidebar').classList.remove('ios-searching'));
   }
   for(const portrait of [false,true,false,true]) {
    const width=portrait?669:951,height=portrait?951:669;await page.setViewportSize({width,height});
    await page.evaluate(({portrait,width,height,open})=>{
     Object.assign(__KINDRED_IOS_LAYOUT,{topInset:portrait?82:24,rightInset:portrait?0:84,railSide:portrait?'none':'right',isPortrait:portrait,viewportHeight:height});
     const contour=portrait?open.displayContour.map(([command,...points])=>[command,...points.map((_,i)=>points[i%2?i-1:i+1])]):open.displayContour;
     Object.assign(__KINDRED_NATIVE_GEOMETRY,{width,height,windowWidth:width,windowHeight:height,displayContour:contour,reservedRegions:[{kind:'division',active:false,x:width/2,y:0,width:0,height}]});
     document.querySelector('#fixture-native-toolbar').style.display=portrait?'block':'none';
     dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
    },{portrait,width,height,open});
    await settled();
    const current=await proof();
    assert.equal(current.padding,portrait?'82px':'0px','rotation must release the top inset when the toolbar moves to the side');
    if(portrait)assert(current.points.every(point=>point.hit),'rotation restores the complete first-row target');
   }
   // Keyboard height changes do not move the window's portrait toolbar.
   await page.setViewportSize({width:669,height:520});
   await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:true,viewportHeight:520});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
   await settled();assert.equal((await proof()).padding,'82px');
   assert.equal(await page.evaluate(()=>__KINDRED_DUO_FIXTURE.snapshot().loadID),loadID,'the retained page is not reloaded');
   assert.deepEqual(errors,[]);reports.push({rail,firstBot:selected,portraitHitbox:true,touchSelects:true,rotation:true,keyboard:true});await page.close();
  }
  console.log(JSON.stringify({passed:true,reports}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
