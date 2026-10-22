const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web'),legacy=process.env.KINDRED_IOS_LEGACY==='1';
const read=name=>legacy?cp.execFileSync('git',['show','938f317:mobile/ios/KindredCompanion/Web/'+name],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(bundle,name),'utf8');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch(),reports=[];
 try{for(const pose of ['slab','outer','inner']){
  const width=pose==='inner'?951:pose==='outer'?466:402,height=pose==='inner'?669:pose==='outer'?678:780;
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({pose,width,height,token,profileID,css,js})=>{
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});sessionStorage.setItem('kindred-token',token);
   window.requests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>requests.push(v)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:pose==='slab'?59:24,bottomInset:34,composerBottomInset:12,leftInset:0,rightInset:pose==='slab'?0:84,railSide:pose==='slab'?'none':'right',isSlab:pose!=='inner',isDuo:pose!=='slab',isDuoInner:pose==='inner',usesNativeRail:pose!=='slab',isPortrait:pose!=='inner',viewportHeight:height};
   window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width,windowHeight:height,reservedRegions:pose==='inner'?[{kind:'division',active:false,x:width/2,y:0,width:0,height}]:pose==='outer'?[{kind:'occlusion',active:true,x:width-84,y:0,width:84,height:170}]:[]};
   document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
  },{pose,width,height,token,profileID,css:read('MobileLayout.css'),js:read('MobileLayout.js')});
  await page.route('**/api/chats/dm-vivienne*',async route=>{
   const response=await route.fetch(),data=await response.json();
   data.messages=[...(data.messages||[]),{seq:5000,kind:'message',sender:'vivienne',text:'Files are ready.',created:1700000000,attachments:[{id:'motion-report',kind:'file',name:'Project review report.md',mime:'text/markdown',size:2048,created:1700000000},{id:'motion-notes',kind:'file',name:'Planning notes.pdf',mime:'application/pdf',size:8192,created:1700000000}]}];
   await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');await page.locator('#prompt').waitFor();if(!legacy)await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ios-bot-center'));
  await page.locator('#prompt').fill('Retain my draft.');
  await page.locator('#show-computer').evaluate(n=>n.click());const computer=page.locator('#computer-panel');await computer.waitFor({state:'visible'});await page.waitForFunction(()=>window.__duoFixtureRFB&&!document.querySelector('.pane-layout-frame,.ios-pane-closing,#desktop-loading') && !document.documentElement.dataset.iosChromeMorphing);
  await page.evaluate(()=>window.retainedComputer=__duoFixtureRFB);
  const sampleSwitch=async(source,tab,target)=>{
   const frames=await page.evaluate(async({source,tab,target})=>{
    const rows=[],pane=document.querySelector(target),before=document.querySelector(source).getBoundingClientRect();
    document.querySelector(source+' [data-tab="'+tab+'"]').click();
    for(let i=0;i<28;i++){await new Promise(requestAnimationFrame);const r=pane.getBoundingClientRect();rows.push({x:r.x,width:r.width,hidden:pane.hidden,frames:document.querySelectorAll('.pane-layout-frame,.pane-layout-reservation,.ios-pane-closing').length});}
    return {before:{x:before.x,width:before.width},rows};
   },{source,tab,target});
   // Older adapters use different Computer gutters; each destination must still
   // keep its final bounds for every frame, without sliding through a third lane.
   const expected=legacy?frames.rows.at(-1):frames.before;
   for(const row of frames.rows){assert(!row.hidden,pose+': selected tab stays visible');assert(Math.abs(row.x-expected.x)<2&&Math.abs(row.width-expected.width)<2,pose+': tab must not slide or squeeze '+JSON.stringify({tab,before:frames.before,row}));assert.equal(row.frames,0,pose+': native tabs must not reserve desktop pane space');}
  };
  for(const reduced of [false,true]){
   await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
   await sampleSwitch('#computer-panel','library','#details-panel');
   await sampleSwitch('#details-panel','computer','#computer-panel');
   await sampleSwitch('#computer-panel','details','#details-panel');
   await sampleSwitch('#details-panel','computer','#computer-panel');
   await page.evaluate(async()=>{for(const tab of ['library','computer','details','computer','library']){const panel=document.querySelector('#computer-panel').hidden?'#details-panel':'#computer-panel';document.querySelector(panel+' [data-tab="'+tab+'"]').click();await new Promise(requestAnimationFrame);}});
   await page.waitForTimeout(400);
   assert.equal(await page.locator('#details-panel').isVisible(),true);
   assert.equal(await page.locator('#computer-panel').isVisible(),false);
   assert.equal(await page.locator('.pane-layout-frame,.pane-layout-reservation,.ios-pane-closing').count(),0);
   await sampleSwitch('#details-panel','computer','#computer-panel');
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{document.querySelector('#computer-panel [data-tab=library]').click();dispatchEvent(new Event('blur'));});
  assert.equal(await page.locator('#details-panel').evaluate(n=>n.getAnimations().length),0,'backgrounding settles pending pane fades');
  const file=page.getByRole('button',{name:'Open Project review report.md',exact:true});await file.waitFor();
  assert((await file.boundingBox()).width>150,'Library files retain readable width');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  if(process.env.KINDRED_TEST_ARTIFACTS){fs.mkdirSync(process.env.KINDRED_TEST_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,(legacy?'installed':'current')+'-'+pose+'-library.png')});}
  assert(await page.evaluate(()=>retainedComputer===__duoFixtureRFB),'tabs retain the computer connection');
  assert.equal(await page.locator('#prompt').innerText(),'Retain my draft.');
  assert.deepEqual(errors,[]);reports.push({pose,stableFrames:true,rapidSwitching:true,reducedMotion:true});await page.close();
 }console.log(JSON.stringify({passed:true,legacy,reports}));}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
