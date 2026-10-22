const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch(),reports=[];
 try{for(const pose of ['inner','outer','slab']){
  const width=pose==='inner'?951:pose==='outer'?466:402,height=pose==='inner'?669:pose==='outer'?678:780;
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({pose,width,height,token,profileID,css,js})=>{
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});sessionStorage.setItem('kindred-token',token);
   window.requests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>requests.push(v)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:pose==='slab'?59:24,bottomInset:34,composerBottomInset:12,leftInset:0,rightInset:pose==='slab'?0:84,railSide:pose==='slab'?'none':'right',isSlab:pose!=='inner',isDuo:pose!=='slab',isDuoInner:pose==='inner',usesNativeRail:pose!=='slab',isPortrait:pose!=='inner',viewportHeight:height};
   window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width,windowHeight:height,reservedRegions:pose==='inner'?[{kind:'division',active:false,x:width/2,y:0,width:0,height}]:pose==='outer'?[{kind:'occlusion',active:true,x:width-84,y:0,width:84,height:170}]:[]};
   document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
  },{pose,width,height,token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');await page.locator('#prompt').waitFor();await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-bot-center'));
  await page.locator('#prompt').fill('Retain my draft.');
  await page.locator('#show-computer').evaluate(n=>n.click());const computer=page.locator('#computer-panel');await computer.waitFor({state:'visible'});await page.waitForFunction(()=>window.__duoFixtureRFB&&!document.querySelector('.pane-layout-frame,.ios-pane-closing,#desktop-loading') && !document.documentElement.dataset.iosChromeMorphing);
  const fit=await computer.evaluate(n=>{const r=n.getBoundingClientRect(),s=document.querySelector('#desktop').getBoundingClientRect(),c=document.querySelector('.conversation').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,chatX:c.x,chatWidth:c.width,overflowX:n.scrollWidth-n.clientWidth,overflowY:n.scrollHeight-n.clientHeight,screenWidth:s.width};});
  assert(Math.abs(fit.x-fit.chatX)<1&&Math.abs(fit.width-fit.chatWidth)<1,pose+': computer shares the center destination '+JSON.stringify(fit));
  assert(fit.screenWidth>width*.5,pose+': the screen is not squeezed into a third pane');assert(fit.overflowX<=1,pose+': no horizontal scroll '+JSON.stringify(fit));assert(fit.overflowY<=1,pose+': compact resources fit the normal viewport '+JSON.stringify(fit));
  for(const size of [{width:700,height:500},{width:390,height:844},{width,height}]){
   await page.setViewportSize(size);await page.evaluate(size=>{Object.assign(__KINDRED_IOS_LAYOUT,{viewportHeight:size.height});Object.assign(__KINDRED_NATIVE_GEOMETRY,{width:size.width,height:size.height,windowWidth:size.width,windowHeight:size.height});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));},size);
   await page.waitForFunction(()=>!document.documentElement.dataset.iosChromeMorphing);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const overflow=await computer.evaluate(n=>({x:n.scrollWidth-n.clientWidth,y:n.scrollHeight-n.clientHeight}));assert(overflow.x<=1,pose+': resizing cannot create horizontal overflow '+JSON.stringify({size,overflow}));assert(overflow.y<=1,pose+': screen fits above compact controls '+JSON.stringify({size,overflow}));
  }
  await page.evaluate(()=>window.retainedComputer=__duoFixtureRFB);await computer.getByRole('tab',{name:'Details',exact:true}).click();await page.locator('#details-panel').getByRole('tab',{name:'Computer',exact:true}).click();assert(await page.evaluate(()=>retainedComputer===__duoFixtureRFB),'tab switches retain the same connection');
  await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing&&!document.querySelector('.pane-layout-frame,.ios-pane-closing'));
  if(pose==='slab')await computer.getByRole('button',{name:'Close bot center',exact:true}).evaluate(n=>n.click());else await page.evaluate(()=>__kindredDuoActions.perform('back'));await computer.waitFor({state:'hidden'});assert.equal(await page.locator('#prompt').innerText(),'Retain my draft.');
  if(pose!=='slab'){
   const nav=await page.evaluate(()=>requests.filter(r=>r.action==='duo-navigation').at(-1));assert.equal(nav.botAvatarShape,'wedge');
   await page.evaluate(()=>{document.querySelector('.jump-latest').hidden=false;});const latest=await page.locator('.jump-latest').boundingBox(),area=await page.locator('#composer-area').boundingBox();assert(Math.abs(latest.x+latest.width-(area.x+area.width-10))<1,'Latest uses the full bottom lane');
  }
  if(pose==='outer'){
   await page.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:399,y:175,width:38,height:142};dispatchEvent(new Event('kindred-ios-toolbar'));const content=document.querySelector('#content');content.scrollTop=content.scrollHeight;});
   await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-message-flow'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.waitForFunction(()=>[...document.querySelectorAll('#content>[data-ios-user-message]')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
   await page.evaluate(()=>{const content=document.querySelector('#content');content.dispatchEvent(new WheelEvent('wheel',{deltaY:-1}));content.scrollTop+=content.querySelector('[data-message="71"]').getBoundingClientRect().top-390;content.dispatchEvent(new Event('scroll'));});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.waitForFunction(()=>[...document.querySelectorAll('#content>[data-ios-user-message]')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
   const flow=await page.evaluate(()=>[...document.querySelectorAll('#content>.message-group')].map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right,user:n.hasAttribute('data-ios-user-message')};}).filter(r=>r.bottom>0&&r.top<innerHeight-100));
   assert(flow.some(r=>r.user&&r.top>329&&r.right>400),'user messages below native controls reclaim the right gutter');assert(flow.filter(r=>r.top<329&&r.bottom>0).every(r=>r.right<=382),'messages beside the toolbar/status stay clear');
  }
  assert.deepEqual(errors,[]);reports.push({pose,...fit});await page.close();
 }console.log(JSON.stringify({passed:true,reports}));}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
