// Exercise the deployed pane motion with the native bundle, not just desktop CSS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch();
 try {
  const p=await browser.newPage({viewport:{width:951,height:669},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  if(process.env.LEGACY){const shared=fs.readFileSync(path.join(root,'ui/mobile.js'),'utf8');await p.route(origin+'/mobile.js',r=>r.fulfill({contentType:'text/javascript',body:shared.slice(0,shared.indexOf('export function installMobileNavigation('))+fs.readFileSync(path.join(__dirname,'fixtures/mobile-navigation-v1.js'),'utf8')}));}
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'ui/app.js'),'utf8')+'\nexport {showPane,hidePane,finishComputerTransition};'}));
  await p.addInitScript(({token,profileID,css,js})=>{
   sessionStorage.setItem('kindred-token',token);Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
   window.__KINDRED_IOS_LAYOUT={topInset:24,bottomInset:34,leftInset:16,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
   window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[{kind:'division',active:false,x:475,y:0,width:0,height:669},{kind:'occlusion',active:true,x:867,y:0,width:84,height:120}]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await p.goto(origin+'/#kindred-chat=dm-vivienne');await p.locator('#prompt').waitFor();await p.evaluate(async()=>window.motionFixture=await import('/app.js'));
  const reports=[];
  for(const pane of ['details-panel','computer-panel'])for(const open of [true,false]) {
   const proof=await p.evaluate(async({pane,open})=>{
    const panel=document.getElementById(pane),rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const sample=()=>({pane:rect(panel),chat:rect(document.querySelector('.conversation')),composer:rect(document.querySelector('#composer'))});
    motionFixture[open?'showPane':'hidePane'](panel);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const transitions=panel.getAnimations().filter(a=>a.effect.getKeyframes().some(frame=>'opacity' in frame));
    transitions.forEach(a=>a.pause());
    const frames=[];for(const t of [0,50,150,199]){transitions.forEach(a=>a.currentTime=t);frames.push({...sample(),opacity:Number(getComputedStyle(panel).opacity)});}
    transitions.forEach(a=>a.finish());
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {frames,after:sample(),hidden:panel.hidden,transitions:transitions.length,leaks:document.querySelectorAll('.pane-layout-frame,.pane-layout-reservation').length};
   },{pane,open});reports.push({pane,open,...proof});
   for(const item of ['chat','composer',...(open?['pane']:[])])for(const axis of ['x','width'])assert(Math.abs(proof.frames.at(-1)[item][axis]-proof.after[item][axis])<2,JSON.stringify({pane,open,item,axis,proof}));
   assert.equal(proof.hidden,!open);assert.equal(proof.leaks,0,'server frame/reservation settled before native fade');
   assert(proof.transitions>0,'the native pane has an opacity transition: '+JSON.stringify({pane,open,proof}));
   const opacity=proof.frames.map(frame=>frame.opacity);
   assert(open?opacity.at(-1)>opacity[0]:opacity.at(-1)<opacity[0],'the pane fades in the requested direction');
   for(const item of ['chat','composer'])for(const axis of ['x','width'])assert(Math.abs(proof.frames[0][item][axis]-proof.after[item][axis])<2,'settled lane cannot teleport when the fade completes');
  }
  const reversal=await p.evaluate(async()=>{
   const pane=document.querySelector('#details-panel');motionFixture.showPane(pane);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const fade=pane.getAnimations().find(a=>a.effect.getKeyframes().some(f=>'opacity' in f));fade.pause();fade.currentTime=80;
   const before=Number(getComputedStyle(pane).opacity);motionFixture.hidePane(pane);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const reverse=pane.getAnimations().find(a=>a.effect.getKeyframes().some(f=>'opacity' in f));reverse.pause();reverse.currentTime=0;const after=Number(getComputedStyle(pane).opacity);
   dispatchEvent(new Event('resize'));return {before,after,hidden:pane.hidden,closing:document.querySelectorAll('.ios-pane-closing').length,vars:pane.style.cssText.includes('--ios-pane-exit-')};
  });assert(Math.abs(reversal.before-reversal.after)<0.06,'a quick reversal continues from its current opacity');assert(reversal.hidden&&!reversal.closing&&!reversal.vars,'resize cleans an interrupted closing fade');
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.evaluate(()=>motionFixture.showPane(document.querySelector('#details-panel')));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await p.locator('#details-panel').evaluate(n=>n.getAnimations().length),0,'Reduce Motion removes native pane fades');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,reports}));
 } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
