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
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({token,profileID,css,js})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,navigation:[]});
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:v=>navigation.push(v)},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:false,usesNativeRail:true,isPortrait:true,viewportHeight:780};
   window.__KINDRED_NATIVE_GEOMETRY={width:466,height:780,windowWidth:466,windowHeight:780,reservedRegions:[]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');
  await page.locator('#content [data-message="61"]').waitFor({state:'attached'});
  await page.waitForFunction(()=>navigation.at(-1)?.target==='chat-list'&&!document.documentElement.dataset.iosChromeMorphing);
  await page.evaluate(()=>{__KINDRED_IOS_TOOLBAR={x:382,y:170,width:84,height:156};dispatchEvent(new Event('kindred-ios-toolbar'));});
  await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-message-flow'));
  await page.evaluate(()=>{
   const area=document.querySelector('#content'),group=area.querySelector('[data-message="61"]');
   area.dispatchEvent(new WheelEvent('wheel',{deltaY:1}));area.scrollTop+=group.getBoundingClientRect().top-260;area.dispatchEvent(new Event('scroll'));
   document.querySelector('#prompt').value='Keep this draft';
   window.edgeSample=()=>{
    const pane=document.querySelector('.conversation').getBoundingClientRect();
    return {paneWidth:pane.width,scroll:area.scrollTop,rows:[61,62].map(id=>{
     const row=area.querySelector('[data-message="'+id+'"]'),bubble=row.querySelector('.message-bubble'),r=bubble.getBoundingClientRect();
     const range=document.createRange();range.selectNodeContents(bubble);
     return {width:r.width,height:r.height,left:r.left-pane.left,top:r.top-pane.top,lines:[...range.getClientRects()].map(box=>[box.width,box.height,box.top-r.top])};
    })};
   };
  });
  await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing&&[...document.querySelectorAll('#content>*')].every(n=>n.getAnimations().every(a=>a.playState!=='running')));
  const baseline=await page.evaluate(()=>edgeSample());
  const compare=(sample,label)=>{
   const near=(a,b)=>assert(Math.abs(a-b)<1,label+': '+a+' != '+b);
   near(sample.paneWidth,baseline.paneWidth);near(sample.scroll,baseline.scroll);
   sample.rows.forEach((row,i)=>{const before=baseline.rows[i];for(const key of ['width','height','left','top'])near(row[key],before[key]);assert.equal(row.lines.length,before.lines.length,label+' line wrapping');row.lines.forEach((line,j)=>line.forEach((v,k)=>near(v,before.lines[j][k])));});
  };
  for(const [commit,reduced] of [[false,false],[false,true],[true,false]]){
   await page.evaluate(reduced=>{document.documentElement.dataset.motion=reduced?'off':'on';window.edgeMessage={id:crypto.randomUUID(),revision:navigation.at(-1).revision,progress:0,x:5,y:350};},reduced);
   assert(await page.evaluate(()=>__KINDRED_EDGE_BACK({...edgeMessage,phase:'begin'})));
   for(const progress of [.12,.4,.72,.3]){
    assert(await page.evaluate(progress=>__KINDRED_EDGE_BACK({...edgeMessage,phase:'update',progress}),progress));
    // Updates and scroll notifications can arrive while the finger is down.
    await page.evaluate(()=>document.querySelector('#content').dispatchEvent(new Event('scroll')));
    await page.waitForTimeout(50);
    compare(await page.evaluate(()=>edgeSample()),'drag '+progress+' reduced='+reduced);
   }
   assert(await page.evaluate(commit=>__KINDRED_EDGE_BACK({...edgeMessage,phase:commit?'finish':'cancel',progress:.3,commit}),commit));
   await page.evaluate(()=>{window.edgeAnimations=[...document.querySelector('.conversation').getAnimations(),...document.querySelector('.sidebar').getAnimations()];edgeAnimations.forEach(a=>a.pause());});
   for(const fraction of [.2,.8,.99]){
    await page.evaluate(fraction=>{edgeAnimations.forEach(a=>a.currentTime=Number(a.effect.getTiming().duration)*fraction);document.querySelector('#content').dispatchEvent(new Event('scroll'));},fraction);
    await page.waitForTimeout(40);compare(await page.evaluate(()=>edgeSample()),'settle '+fraction);
   }
   await page.evaluate(()=>edgeAnimations.forEach(a=>a.finish()));
   await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('ios-edge-preview'));
   if(!commit)compare(await page.evaluate(()=>edgeSample()),'cancel cleanup');
   assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Keep this draft');
  }
  assert(await page.locator('#app').evaluate(n=>n.classList.contains('sidebar-open')));
  await page.locator('#bots .bot-link[aria-label="Vivienne"]').click();
  await page.waitForFunction(()=>navigation.at(-1)?.target==='chat-list'&&!document.querySelector('#app').dataset.mobileResizing);
  compare(await page.evaluate(()=>edgeSample()),'return to retained chat');
  assert(await page.evaluate(()=>{
   window.edgeMessage={id:crypto.randomUUID(),revision:navigation.at(-1).revision,progress:0,x:5,y:350};
   return __KINDRED_EDGE_BACK({...edgeMessage,phase:'begin'})&&__KINDRED_EDGE_BACK({...edgeMessage,phase:'update',progress:.4});
  }));
  // A genuine unfold cancels the gesture and must still reflow the chat.
  await page.setViewportSize({width:867,height:645});
  await page.evaluate(()=>{
   Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:true,railSide:'none',rightInset:0,viewportHeight:645});
   Object.assign(__KINDRED_NATIVE_GEOMETRY,{width:867,height:645,windowWidth:945,windowHeight:685});
   __KINDRED_IOS_TOOLBAR=null;
   dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));
   dispatchEvent(new Event('kindred-native-geometry'));
  });
  await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('ios-edge-preview')&&!document.querySelector('#app').dataset.mobileResizing&&document.documentElement.dataset.iosDuoInner==='true');
  assert.equal(await page.evaluate(()=>__KINDRED_EDGE_BACK({...edgeMessage,phase:'finish',progress:1,commit:true})),false,'an old gesture cannot navigate after unfolding');
  assert(Math.abs((await page.locator('.conversation').boundingBox()).width-baseline.paneWidth)>10,'real display changes still resize the chat');
  assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Keep this draft');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:'webkit',stableWrapping:true,stableReadingAnchor:true,cancel:true,commit:true,reducedMotion:true,draftPreserved:true,unfoldInvalidatesGesture:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
