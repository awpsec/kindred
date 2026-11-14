// A navigation translation must not change the cover's reading geometry.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await webkit.launch();
 try {
  const page=await browser.newPage({viewport:{width:466,height:780},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  // This test reads geometry directly; the general fixture selection sampler
  // assumes single text nodes and throws while clearing a multiline draft.
  await page.route('**/fixture/probe.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.addInitScript(({token,profileID,css,js,duo})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,navigation:[]});
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:v=>navigation.push(v)},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:0,rightInset:duo?84:0,railSide:'right',isDuo:duo,isDuoInner:false,usesNativeRail:duo,isPortrait:true,viewportHeight:780};
   window.__KINDRED_NATIVE_GEOMETRY={width:466,height:780,windowWidth:466,windowHeight:780,reservedRegions:[]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,profileID,duo:process.env.KINDRED_TEST_IPHONE!=='1',css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');
  await page.locator('#content [data-message="61"]').waitFor({state:'attached'});

  const base='http://127.0.0.1:'+server.address().port;
  const count=async()=> (await (await fetch(base+'/fixture/state')).json()).messages['dm-vivienne'];
  const initial=await count();
  const prompt=page.locator('#prompt');
  assert.equal(await prompt.getAttribute('enterkeyhint'),'enter');
  await prompt.click();await page.keyboard.type('First paragraph');
  const oneLine=await page.locator('#composer').boundingBox();
  await page.keyboard.press('Enter');await page.keyboard.type('Second paragraph');
  await page.keyboard.press('Enter');await page.keyboard.type('Third paragraph');
  await page.waitForFunction(()=>document.querySelector('#prompt').value==='First paragraph\nSecond paragraph\nThird paragraph');
  assert.equal(await count(),initial,'Return must not send');
  await page.waitForTimeout(500);
  assert((await page.locator('#composer').boundingBox()).height>oneLine.height,'composer grows for Return');
  for(const [isDuo,isDuoInner,topInset,depth] of (process.env.KINDRED_TEST_IPHONE==='1'?[[false,false,59,44]]:[[true,false,0,28],[true,false,24,28],[true,true,24,44]])){
   await page.evaluate(layout=>{Object.assign(__KINDRED_IOS_LAYOUT,layout);dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));},{isDuo,isDuoInner,topInset});
   await page.waitForTimeout(300);
   const frost=await page.evaluate(()=>{const n=document.querySelector('.chat-top-frost'),r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return {gap:r.top-p.top,height:r.height,safe:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ios-safe-top')),layers:[...n.children].map(c=>({blur:getComputedStyle(c).backdropFilter,mask:getComputedStyle(c).webkitMaskImage}))};});
   assert.equal(frost.gap,0,'frost must start at top of transcript, including safe area');
   assert.equal(frost.height,frost.safe+depth);assert.equal(frost.layers.length,4);
   assert(frost.layers.every(l=>l.blur.includes('blur')&&l.mask.includes('gradient')),'preserve gradual blur');
  }
  for(const selector of ['#composer-actions','#send','.dictation-button']){
   const b=page.locator('#composer '+selector);
   if(!await b.isVisible())continue;
   const metrics=await b.evaluate(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,icon:getComputedStyle(n.querySelector('svg')).width,inset:getComputedStyle(n,'::before').left}));
   assert(metrics.w>=44&&metrics.h>=44,selector+' retains tap area');assert.equal(metrics.icon,'16px');
   if(selector!=='#composer-actions')assert.equal(metrics.inset,'7px');
  }
  await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#prompt').value==='');
  const sends=(await (await fetch(base+'/fixture/state')).json()).events.filter(e=>e.type==='send');
  assert.equal(sends.length,1,'only explicit Send submits');
  assert.equal(sends[0].prompt,'First paragraph\nSecond paragraph\nThird paragraph');
  const desktop=await browser.newPage({viewport:{width:1200,height:900}});
  await desktop.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  await desktop.goto(base+'/#kindred-chat=dm-vivienne');
  await desktop.locator('#prompt').fill('Desktop still sends with Return');
  await desktop.locator('#prompt').press('Enter');
  await desktop.waitForFunction(()=>document.querySelector('#prompt').value==='');
  assert.equal((await (await fetch(base+'/fixture/state')).json()).events.filter(e=>e.type==='send').length,2,'desktop Return remains Send');
  await desktop.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,returnInsertsNewline:true,composerGrows:true,explicitSendOnly:true,frostStartsAtTop:true,gradualLayers:true,compactIcons:true,touchTargetsPreserved:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
