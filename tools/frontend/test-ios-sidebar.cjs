// Actual bundled iOS presentation against current and historical server UI.
// All accounts, messages and computer effects belong to the local fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch();
  const resources=path.join(__dirname,'../../mobile/ios/KindredCompanion/Web');
  const shared=fs.readFileSync(path.join(__dirname,'../../ui/mobile.js'),'utf8');
  const legacy=shared.slice(0,shared.indexOf('export function installMobileNavigation('))+fs.readFileSync(path.join(__dirname,'fixtures/mobile-navigation-v1.js'),'utf8');
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-sidebar',reports=[];fs.mkdirSync(out,{recursive:true});
  try {
    for(const version of [1,2]) {
      const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true}),errors=[];page.setDefaultTimeout(12000);
      page.on('pageerror',error=>errors.push(error.message));
      if(version===1)await page.route(origin+'/mobile.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
      await page.addInitScript(({token,profileID,css,js})=>{
        sessionStorage.setItem('kindred-token',token);window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_MOBILE_PROFILE=profileID;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
        window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:0,isDuo:true,isDuoInner:true,isSlab:false,isPortrait:false,viewportHeight:720};
        window.__KINDRED_NATIVE_GEOMETRY={width:1280,height:720,windowWidth:1358,windowHeight:760,reservedRegions:[{kind:'division',active:false,x:640,y:0,width:28,height:720}]};
        window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:value=>accountRequests.push(value)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
        document.addEventListener('pointerdown',event=>{window.lastSidebarPointer=event.pointerId;},true);
        document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
      },{token,profileID,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
      await page.goto(origin+'/#kindred-chat=dm-vivienne');
      const prompt=page.locator('#prompt'),sidebar=page.locator('.sidebar'),handle=page.locator('.sidebar>.ios-duo-resizer');
      await prompt.waitFor({state:'visible'});
      const settled=()=>page.waitForFunction(()=>window.__kindredNativeSidebar?.active()&&!document.querySelector('#app').dataset.mobileResizing);
      await settled();await prompt.fill('Native sidebar retained draft');
      const retainedLoad=await page.evaluate(()=>__KINDRED_DUO_FIXTURE.snapshot().loadID);
      const action=name=>page.evaluate(name=>__kindredDuoActions.perform(name),name);
      const width=async()=>Math.round((await sidebar.boundingBox()).width);
      const relay=async(inner,regions=[])=>{
        const bounds=inner?{width:1280,height:720,windowWidth:1358,windowHeight:760}:{width:466,height:650,windowWidth:466,windowHeight:777};
        await page.setViewportSize({width:bounds.width,height:bounds.height});
        await page.evaluate(({inner,bounds,regions})=>{
          if(inner&&!regions.some(region=>region.kind==='division'))regions=[...regions,{kind:'division',active:false,x:640,y:0,width:28,height:720}];
          window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:0,isDuo:true,isDuoInner:inner,isSlab:!inner,isPortrait:!inner,viewportHeight:bounds.height};
          window.__KINDRED_NATIVE_GEOMETRY={...bounds,reservedRegions:regions};
          dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
        },{inner,bounds,regions});
        await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing);
      };
      const assertFill=async()=>{
        const conversation=await page.locator('.conversation').boundingBox(),form=await page.locator('#composer').boundingBox();
        assert(conversation.width>992);assert(Math.abs(form.x-conversation.x-10)<1&&Math.abs(form.x+form.width-conversation.x-conversation.width+10)<1,'composer fills conversation only with 10px margins');
      };
      const begin=async delta=>{
        const rect=await handle.boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta,y,{steps:4});
      };
      const clean=async()=>{
        await settled();assert.equal(await page.locator('.pane-resize-shield').count(),0);
        assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('pane-resizing')),false);
        assert.equal(await handle.evaluate(node=>node.hasPointerCapture(window.lastSidebarPointer)),false,'cancelled capture is released');
      };
      assert.equal(await width(),210,'native default stays narrow even when legacy shared UI requests half a display');
      assert.equal(await handle.count(),1,'older servers receive one native separator fallback');
      await assertFill();
      await relay(true,[{kind:'division',active:true,x:600,y:0,width:24,height:720}]);
      assert.equal(await width(),210,'book pose cannot widen the native sidebar');
      const foldedForm=await page.locator('#composer').boundingBox();assert(foldedForm.x>=624,'narrow legacy sidebar retains fold-safe composer controls');
      await relay(true);await action('chats');await page.waitForFunction(()=>document.querySelector('.sidebar').getClientRects().length===0);await assertFill();
      await action('chats');await settled();assert.equal(await width(),210);
      await begin(-180);await page.mouse.up();await clean();assert.equal(await width(),76);
      assert(await sidebar.locator('.bot-info').first().isHidden(),'avatar rail omits labels');
      const selected=sidebar.locator('.bot-link[aria-label="Vivienne"]');await selected.click();await settled();
      assert.equal(await prompt.evaluate(node=>node.value),'Native sidebar retained draft');
      await relay(false);assert.equal(await page.locator('html').getAttribute('data-ios-native-sidebar'),'false','outer screen clears native rail layout');
      await relay(true);await settled();assert.equal(await width(),76,'inner display restores its persisted rail');
      await begin(134);await page.mouse.up();await clean();assert.equal(await width(),210);
      const cancellations=[];
      for(const cause of ['pointercancel','escape','native-blocked','modal','visibility','posture']) {
        await begin(24);
        if(cause==='pointercancel')await handle.dispatchEvent('pointercancel');
        if(cause==='escape')await page.keyboard.press('Escape');
        if(cause==='native-blocked')await page.evaluate(()=>__kindredNativeSidebar.cancel());
        if(cause==='modal')await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='sidebar-interrupt';dialog.textContent='Native resize modal interruption';document.body.append(dialog);dialog.showModal();});
        if(cause==='visibility')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
        if(cause==='posture'){await relay(false);await relay(true);}
        await page.mouse.up();
        if(cause==='modal')await page.evaluate(()=>document.querySelector('#sidebar-interrupt').remove());
        if(cause==='visibility')await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
        await clean();assert.equal(await width(),210,`${cause} restores the committed width`);cancellations.push(cause);
      }
      const menuCount=()=>page.evaluate(()=>accountRequests.filter(value=>value.action==='native-menu').length),beforeMenus=await menuCount();
      await action('newBot');await page.locator('#bot-dialog').waitFor({state:'visible'});assert.equal(await menuCount(),beforeMenus);await page.getByRole('button',{name:'Close new bot',exact:true}).click();
      await action('newConversation');const chat=page.locator('dialog[aria-label="New chat"]');await chat.waitFor({state:'visible'});assert.equal(await menuCount(),beforeMenus);await chat.getByRole('button',{name:'Close',exact:true}).click();await chat.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>__KINDRED_DUO_FIXTURE.snapshot().loadID),retainedLoad);assert.equal(await prompt.evaluate(node=>node.value),'Native sidebar retained draft');assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,`server-v${version}-native-sidebar.png`)});
      reports.push({serverVersion:version,narrowDefault:210,collapsedRail:76,separatorFallback:true,railSelectionAndOuterInnerRestoration:true,composerConversationFill:true,foldAvoidance:true,nativeMenuLeaves:true,cancellationCleanup:cancellations,retainedLoadAndDraft:true,errors});
      await page.close();
    }
    fs.writeFileSync(path.join(out,'native-sidebar-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:true,engine:'webkit',reports}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
