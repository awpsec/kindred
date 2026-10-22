// Native/web identity handoff uses real control rectangles, without replacing
// the retained chat or creating a second accessible bot-details button.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch();
 try {
  const p=await browser.newPage({viewport:{width:951,height:669},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({token,profileID,css,js})=>{
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});sessionStorage.setItem('kindred-token',token);
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:24,bottomInset:34,composerBottomInset:12,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
   window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
   document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await p.goto(origin+'/#kindred-chat=dm-vivienne');await p.locator('#prompt').waitFor();await p.locator('#prompt').fill('Retained through portrait.');
  await p.waitForFunction(()=>document.documentElement.dataset.iosToolbarIdentity==='false');
  await p.evaluate(()=>{
   window.identityEffects=[];const animate=Element.prototype.animate;
   Element.prototype.animate=function(...args){const effect=animate.apply(this,args);if(this.matches('.ios-identity-handoff')&&effect.effect.getKeyframes().some(f=>'left' in f)){effect.pause();effect.currentTime=0;identityEffects.push(effect);}return effect;};
  });
  const tag=p.locator('.conversation-header .bot-heading'),native={x:260,y:18,width:38,height:38};
  const before=await tag.boundingBox();
  const pose=async(portrait)=>{
   const width=portrait?669:951,height=portrait?951:669;await p.setViewportSize({width,height});
   await p.evaluate(({portrait,width,height,native})=>{
    Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:true,isPortrait:portrait,railSide:portrait?'none':'right',topInset:portrait?82:24,rightInset:portrait?0:84,viewportHeight:height});
    Object.assign(__KINDRED_NATIVE_GEOMETRY,{width,height,windowWidth:width,windowHeight:height});
    __KINDRED_IOS_TOOLBAR=portrait?{x:260,y:18,width:300,height:38,identity:native}:null;
    dispatchEvent(new Event('kindred-ios-toolbar'));dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
   },{portrait,width,height,native});
  };
  const sample=()=>p.evaluate(()=>{const n=document.querySelector('.ios-identity-handoff'),r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,opacity:Number(getComputedStyle(n).opacity),inert:n.inert,hidden:n.getAttribute('aria-hidden')};});
  const seek=async(t)=>{await p.evaluate(t=>identityEffects.at(-1).currentTime=t,t);return sample();};
  const finish=async()=>{await p.evaluate(()=>identityEffects.at(-1).finish());await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-ios-identity-handoff'));};
  await pose(true);await p.waitForFunction(()=>identityEffects.length===1);
  assert.equal(await tag.isVisible(),false,'portrait has no tag beneath the system menu');
  const into=[await seek(0),await seek(140),await seek(279)];
  for(const axis of ['x','y','width','height']){assert(Math.abs(into[0][axis]-before[axis])<2,'begins at the last painted '+axis);assert(Math.abs(into.at(-1)[axis]-native[axis])<2,'ends at the native icon '+axis);}
  assert(into[1].width>native.width&&into[1].width<before.width,'name pill shrinks through intermediate bounds');assert(into[0].inert&&into[0].hidden==='true','handoff has no duplicate accessibility/input target');await finish();
  await pose(false);await p.waitForFunction(()=>identityEffects.length===2);
  const out=[await seek(0),await seek(140),await seek(279)];await finish();const restored=await tag.boundingBox();
  for(const axis of ['x','y','width','height']){assert(Math.abs(out[0][axis]-native[axis])<2,'return starts at the remembered native '+axis);assert(Math.abs(out.at(-1)[axis]-restored[axis])<2,'return has no final cleanup jump in '+axis);}
  await pose(true);await p.waitForFunction(()=>identityEffects.length===3);const halfway=await seek(90);
  await pose(false);await p.waitForFunction(()=>identityEffects.length===4);const reversed=await seek(0);
  for(const axis of ['x','y','width','height','opacity'])assert(Math.abs(reversed[axis]-halfway[axis])<2,'rapid reversal retains painted '+axis);await finish();
  await pose(true);await p.waitForFunction(()=>identityEffects.length===5);
  await p.evaluate(()=>__kindredDuoActions.perform('botDetails'));await p.locator('#details-panel').waitFor({state:'visible'});
  await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-ios-identity-handoff'));assert.equal(await p.locator('.ios-identity-handoff').count(),0,'navigation cancels an in-flight visual copy');
  await p.evaluate(()=>__kindredDuoActions.perform('back'));await p.locator('#details-panel').waitFor({state:'hidden'});
  await p.emulateMedia({reducedMotion:'reduce'});await pose(false);
  const count=await p.evaluate(()=>identityEffects.length);await pose(true);
  assert.equal(await p.evaluate(()=>identityEffects.length),count,'Reduce Motion changes ownership without movement');assert.equal(await p.locator('.ios-identity-handoff').count(),0);assert.equal(await tag.isVisible(),false);
  await p.evaluate(()=>__kindredDuoActions.perform('botDetails'));await p.locator('#details-panel').waitFor({state:'visible'});
  const hero=await p.locator('#details-panel .bot-center-avatar').boundingBox();assert(hero.y>=82,'portrait details avatar is below the native top controls');
  await p.evaluate(()=>__kindredDuoActions.perform('back'));await p.locator('#details-panel').waitFor({state:'hidden'});
  await p.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{viewportHeight:500,keyboardVisible:true});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
  assert.equal(await p.evaluate(()=>identityEffects.length),count,'keyboard height does not change identity ownership');assert.equal(await p.locator('#prompt').innerText(),'Retained through portrait.');
  // A screenshot-sized file exercises the fixture's normal upload path rather
  // than a route mocked by this test. No user files or real server are involved.
  const png=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64'),Buffer.alloc(300000)]);
  const uploaded=p.waitForResponse(r=>r.url()===origin+'/api/uploads'&&r.request().method()==='POST');
  await p.locator('input[type=file]').setInputFiles({name:'Fixture screenshot.png',mimeType:'image/png',buffer:png});const response=await uploaded;assert.equal(response.status(),200);const file=await response.json();
  assert.equal(file.mime,'image/png');assert.equal(file.size,png.length);await p.getByRole('button',{name:'Remove Fixture screenshot.png',exact:true}).waitFor();
  const headers={Authorization:'Bearer '+token};const download=await fetch(origin+'/api/uploads/'+file.id,{headers});assert.equal(download.status,200);assert(Buffer.from(await download.arrayBuffer()).equals(png));
  const unauthorized=await fetch(origin+'/api/uploads/'+file.id);assert.equal(unauthorized.status,401);
  await p.getByRole('button',{name:'Remove Fixture screenshot.png',exact:true}).click();await p.locator('.composer-file').waitFor({state:'hidden'});assert.equal((await fetch(origin+'/api/uploads/'+file.id,{headers})).status,404);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,portraitHandoff:true,reverseHandoff:true,rapidReversal:true,navigationCancellation:true,reduceMotion:true,keyboardStable:true,fixtureScreenshotUpload:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
