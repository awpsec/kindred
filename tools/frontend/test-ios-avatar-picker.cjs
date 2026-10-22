const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web'),out='/tmp/kindred-ios-avatar-picker';
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{
  const p=await browser.newPage({viewport:{width:951,height:669},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/fixture/probe.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await p.addInitScript(({token,profileID,css,js})=>{
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});sessionStorage.setItem('kindred-token',token);
   window.accountRequests=[];window.navigation=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>accountRequests.push(v)},kindredNavigation:{postMessage:v=>navigation.push(v)}}};
   window.__KINDRED_IOS_LAYOUT={topInset:24,bottomInset:34,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:true,usesNativeRail:true,isPortrait:false,viewportHeight:669};
   window.__KINDRED_NATIVE_GEOMETRY={width:951,height:669,windowWidth:951,windowHeight:669,reservedRegions:[]};
   document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  const origin='http://127.0.0.1:'+server.address().port;await p.goto(origin+'/#kindred-chat=dm-vivienne');await p.locator('#prompt').waitFor();await p.locator('#prompt').fill('Keep this draft.');
  const action=name=>p.evaluate(name=>__kindredDuoActions.perform(name),name);
  await action('botDetails');const trigger=p.locator('#details-panel .avatar-customize');await trigger.waitFor();await trigger.click();
  const picker=p.locator('#details-panel .avatar-popover:popover-open');await picker.waitFor();
  const settled=()=>p.waitForFunction(()=>[...document.querySelectorAll('.avatar-popover:popover-open')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
  await settled();
  assert(await picker.evaluate(n=>n.contains(document.activeElement)&&document.activeElement.getAttribute('aria-pressed')==='true'),'opening focuses the selected visual choice');
  assert(await picker.getByRole('group',{name:'Shape',exact:true}).isVisible());assert(await picker.getByRole('group',{name:'Color',exact:true}).isVisible());
  assert(await picker.locator('.shape-option').evaluateAll(nodes=>nodes.length>3&&nodes.every(n=>n.querySelector('.character svg')||n.querySelector('svg.character'))),'each shape is an actual character preview');
  assert(await picker.locator('.shape-option,.color-option').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})),'shape and color controls have touch-sized targets');
  const bounds=async()=>{await settled();const r=await picker.boundingBox(),v=p.viewportSize(),button=await trigger.boundingBox();assert(r.x>=12&&r.x+r.width<=v.width-84&&r.y>=24&&r.y+r.height<=v.height-34,'picker clears native chrome and viewport');assert(Math.abs(r.y-button.y-button.height-10)<2||r.y+r.height<button.y,'picker originates beside its avatar');assert(await picker.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'no horizontal scroll');return r;};
  await bounds();await p.screenshot({path:path.join(out,'open.png')});
  const shape=picker.locator('.shape-option:not([aria-pressed=true])').first(),chosen=await shape.getAttribute('data-shape');
  const write=p.waitForResponse(r=>r.url().endsWith('/api/bots/vivienne')&&r.request().method()==='PUT');await shape.click();const savedShape=await(await write).json();
  await picker.locator('.shape-option[data-shape="'+chosen+'"][aria-pressed=true]').waitFor();assert(savedShape.profile.description==='Native Duo fixture','shape edit preserves other bot details');assert(await picker.isVisible(),'shape selection leaves palette available');
  const swatch=picker.locator('.color-option:not([aria-pressed=true])').first(),palette=await swatch.getAttribute('data-palette');
  const colorWrite=p.waitForResponse(r=>r.url().endsWith('/api/bots/vivienne')&&r.request().method()==='PUT');await swatch.click();const savedColor=await(await colorWrite).json();await picker.locator('.color-option[data-palette="'+palette+'"][aria-pressed=true]').waitFor();
  assert.equal(savedColor.profile.avatar.palette,palette,'palette uses the existing persistent avatar write');
  const body=await picker.locator('.shape-option[aria-pressed=true] .character').getAttribute('data-avatar-body');
  const color=await trigger.locator('.character').getAttribute('data-avatar-color');
  await p.waitForFunction(({body,color})=>accountRequests.some(n=>n.action==='duo-navigation'&&n.botAvatarShape===body&&n.botAvatarColor===color),{body,color});
  await p.setViewportSize({width:466,height:780});await p.evaluate(()=>{
   Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:false,isSlab:true,isPortrait:true,viewportHeight:780});Object.assign(__KINDRED_NATIVE_GEOMETRY,{width:466,height:780,windowWidth:466,windowHeight:780});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
  });await bounds();await p.screenshot({path:path.join(out,'closed.png')});
  await p.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert(await trigger.evaluate(n=>document.activeElement===n),'Escape restores focus to avatar');
  await p.emulateMedia({reducedMotion:'reduce'});await trigger.click();await picker.waitFor();assert.equal(await picker.evaluate(n=>n.getAnimations().length),0,'Reduce Motion opens without a picker animation');await picker.getByRole('button',{name:'Close avatar picker',exact:true}).click();await picker.waitFor({state:'hidden'});
  await trigger.click();await picker.waitFor();await picker.getByRole('button',{name:'Custom color…',exact:true}).click();await p.locator('#avatar-dialog').waitFor();await picker.waitFor({state:'hidden'});await p.locator('#avatar-dialog button[data-close]').click();
  await trigger.click();await picker.waitFor();await action('back');await picker.waitFor({state:'hidden'});assert.equal(await p.locator('#prompt').innerText(),'Keep this draft.');
  await action('botDetails');await trigger.waitFor();assert(await picker.isHidden(),'returning to Details does not reopen an abandoned picker');
  assert.equal(await p.evaluate(()=>accountRequests.filter(v=>v.action==='native-menu').length),0,'avatar never presents Shape/Color text submenus');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({visualShapes:true,swatches:true,selectionSaved:true,dockClearance:true,foldRetainsPicker:true,dismissal:true,draft:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
