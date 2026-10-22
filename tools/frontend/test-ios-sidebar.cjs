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
        window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:0,rightInset:0,isDuo:true,isDuoInner:true,usesNativeRail:true,isSlab:false,isPortrait:false,viewportHeight:720};
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
      const relay=async(inner,regions=[],landscape=false)=>{
        const bounds=inner?{width:1280,height:720,windowWidth:1358,windowHeight:760}:landscape?{width:844,height:390,windowWidth:844,windowHeight:390}:{width:466,height:650,windowWidth:466,windowHeight:777};
        await page.setViewportSize({width:bounds.width,height:bounds.height});
        await page.evaluate(({inner,bounds,regions,landscape})=>{
          if(inner&&!regions.some(region=>region.kind==='division'))regions=[...regions,{kind:'division',active:false,x:640,y:0,width:28,height:720}];
          window.__KINDRED_IOS_LAYOUT={topInset:!inner&&!landscape?59:0,bottomInset:!inner?landscape?21:34:0,leftInset:!inner&&landscape?12:0,rightInset:!inner&&landscape?78:0,isDuo:true,isDuoInner:inner,usesNativeRail:true,isSlab:!inner,isPortrait:!inner&&!landscape,viewportHeight:bounds.height};
          window.__KINDRED_NATIVE_GEOMETRY={...bounds,reservedRegions:regions};
          dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
        },{inner,bounds,regions,landscape});
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
      assert(await page.locator('.conversation-header').isVisible()&&await page.locator('#bot-details').isVisible(),'inner display retains the centered avatar-and-name tag');
      const identity=await page.locator('#bot-details').boundingBox(),chatBounds=await page.locator('.conversation').boundingBox();
      assert(Math.abs(identity.x+identity.width/2-chatBounds.x-chatBounds.width/2)<1,'inner identity is centered within the conversation');
      assert(await page.locator('#mobile-menu').isHidden()&&await page.locator('#show-computer').isHidden(),'inner identity does not restore duplicate web navigation');
      await page.evaluate(()=>{for(const node of document.querySelectorAll('.conversation-header,#composer-area')){node.style.setProperty('--ios-camera-left','400px');node.style.setProperty('--ios-camera-right','0px');}dispatchEvent(new Event('kindred-native-geometry'));});
      await settled();await page.waitForFunction(()=>Math.abs(document.querySelector('#composer').getBoundingClientRect().x-document.querySelector('.conversation').getBoundingClientRect().x-10)<1);
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
      for(const landscape of [false,true]) {
        await relay(false,[],landscape);
        assert.equal(await page.locator('html').getAttribute('data-ios-duo'),'true','closed outer display retains its native rail');
        assert(await page.locator('#mobile-menu').isHidden()&&await page.locator('#show-computer').isHidden(),'closed outer rail replaces web navigation');
        const bounds=await page.evaluate(()=>{
          const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const css=getComputedStyle(document.querySelector('#composer-area'));
          return {header:rect('.conversation-header'),conversation:rect('.conversation'),form:rect('#composer'),area:rect('#composer-area'),blur:rect('#ios-status-blur'),paddingBottom:parseFloat(css.paddingBottom),layout:__KINDRED_IOS_LAYOUT};
        });
        assert.equal(bounds.header.height,0,'native bot avatar leaves no empty HTML header');
        assert(Math.abs(bounds.form.x-10)<1&&Math.abs(bounds.form.right-((landscape?844:466)-10))<1,'outer composer fills the bottom lane instead of reserving a full-height rail strip');
        assert.equal(bounds.paddingBottom,8+bounds.layout.bottomInset,'outer composer includes the bottom safe inset exactly once');
        assert.equal(bounds.area.bottom,landscape?390:650,'composer remains attached to its phone viewport');
        assert.equal(bounds.blur.height,0,'native localized glass must not leave a global top blur over the chat list');
        assert(await page.locator('#ios-status-blur').isHidden());
        const earlyPadding=await page.evaluate(()=>{
          const html=document.documentElement,previous=html.getAttribute('data-native-safe-area');html.removeAttribute('data-native-safe-area');
          const legacy=document.createElement('style');legacy.textContent='html[data-ios-layout]:not([data-native-safe-area=host]) .shell{padding-block:31px 29px}';document.head.prepend(legacy);
          const css=getComputedStyle(document.querySelector('#app')),values=[css.paddingTop,css.paddingBottom];
          legacy.remove();if(previous!==null)html.setAttribute('data-native-safe-area',previous);return values;
        });
        assert.deepEqual(earlyPadding,['0px','0px'],'rail canvas clears legacy block padding before the native-safe-area marker arrives');
        const navigation=await page.evaluate(()=>accountRequests.filter(value=>value.action==='duo-navigation').at(-1));assert.equal(navigation.botDetailsAvailable,true);assert.equal(navigation.botAvatarShape,'triangle');assert.match(navigation.botAvatarColor,/^#[a-f0-9]{6}$/i);
      }
      await page.waitForFunction(()=>accountRequests.some(value=>value.action==='composer-extent'));
      const measuredExtent=await page.evaluate(()=>({sent:accountRequests.filter(value=>value.action==='composer-extent').at(-1).height,actual:Math.round(document.querySelector('#composer').getBoundingClientRect().height*100)/100}));
      assert.equal(measuredExtent.sent,measuredExtent.actual,'native bottom-row query receives the actual visible form extent');
      await page.evaluate(()=>{__KINDRED_IOS_LAYOUT.composerBottomInset=16;dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).paddingBottom),'24px','native rail uses the measured bottom-row inset16 instead of viewport inset21');
      const extentCount=await page.evaluate(()=>accountRequests.filter(value=>value.action==='composer-extent').length);
      await page.evaluate(()=>{dispatchEvent(new Event('kindred-native-geometry'));return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
      assert.equal(await page.evaluate(()=>accountRequests.filter(value=>value.action==='composer-extent').length),extentCount,'unchanged visible composer extents are deduplicated');
      await page.evaluate(()=>{
        const dialog=document.createElement('dialog');dialog.id='composer-extent-interrupt';document.body.append(dialog);dialog.showModal();
        const form=document.querySelector('#composer');form.style.minHeight=form.getBoundingClientRect().height+12+'px';
        return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      });
      assert.equal(await page.evaluate(()=>accountRequests.filter(value=>value.action==='composer-extent').length),extentCount,'a composer covered by a modal cannot publish row geometry');
      await page.evaluate(()=>{document.querySelector('#composer').style.removeProperty('min-height');document.querySelector('#composer-extent-interrupt').remove();});
      await page.waitForFunction(count=>accountRequests.filter(value=>value.action==='composer-extent').length>count,extentCount);
      await page.evaluate(()=>{__KINDRED_IOS_LAYOUT.composerBottomInset=0;dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).paddingBottom),'8px','native keyboard row inset zero keeps only designed composer margin');
      await relay(false,[{kind:'occlusion',active:true,x:766,y:0,width:78,height:180}],true);
      assert(Math.abs((await page.locator('#composer').boundingBox()).width-824)<1,'localized upper rail occlusion leaves the bottom composer lane available');
      await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{keyboardVisible:true,rightInset:84});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).paddingRight),'84px','keyboard keeps trailing composer action outside the native rail');
      await page.evaluate(()=>{__KINDRED_IOS_LAYOUT.keyboardVisible=false;dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).paddingRight),'10px','keyboard dismissal restores the full-width bottom lane');
      await action('botDetails');await page.locator('#details-panel').waitFor({state:'visible'});await action('back');await page.locator('#details-panel').waitFor({state:'hidden'});
      await page.evaluate(()=>{__KINDRED_IOS_LAYOUT.usesNativeRail=false;__KINDRED_IOS_LAYOUT.composerBottomInset=16;dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      assert(await page.locator('#mobile-menu').isVisible()&&await page.locator('.conversation-header').isVisible(),'an explicit native no-rail trait restores ordinary phone chrome despite retained Duo capability');
      assert(await page.locator('#ios-status-blur').isVisible(),'ordinary phone status blur is restored when no native rail is present');
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).paddingBottom),'29px','slab composer retains its raw bottom inset despite a rail-only row field');
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
      await action('computer');await page.waitForFunction(()=>window.__duoFixtureRFB&&!document.querySelector('#computer-panel').hidden);await settled();
      const computer=page.locator('#computer-panel'),computerHandle=page.locator('.computer-panel>.ios-duo-resizer');
      assert.equal(Math.round((await computer.boundingBox()).width),240,'native computer defaults to compact width independent of deployed server');
      assert.equal(await computerHandle.count(),1,'old servers receive exactly one native computer separator fallback');
      assert(await page.locator('.computer-panel>.panel-header').isHidden(),'native toolbar replaces web title/border/expand controls');
      const connection=await page.evaluate(()=>{window.retainedSidebarRFB=__duoFixtureRFB;return __duoFixtureRFB.disconnects;});
      const grip=await computerHandle.boundingBox();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2-40,grip.y+grip.height/2,{steps:4});await page.mouse.up();await clean();
      assert.equal(Math.round((await computer.boundingBox()).width),280,'computer separator increases width when pulled left');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kindred-ios-sidebar-v1:'+__KINDRED_MOBILE_PROFILE)).computerWidth),280,'computer width is stored with the isolated profile preference');
      await action('expandComputer');await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('expanded')&&!document.querySelector('#app').dataset.mobileResizing);
      let navigation=await page.evaluate(()=>accountRequests.filter(value=>value.action==='duo-navigation').at(-1));assert.equal(navigation.computerExpanded,true);assert.equal(navigation.computerExpandAvailable,true);assert.equal(navigation.listToggleAvailable,false);
      const preference=await page.evaluate(()=>localStorage.getItem('kindred-ios-sidebar-v1:'+__KINDRED_MOBILE_PROFILE));await action('chats');assert.equal(await page.evaluate(()=>localStorage.getItem('kindred-ios-sidebar-v1:'+__KINDRED_MOBILE_PROFILE)),preference,'unavailable list toggle cannot mutate a hidden pane');
      await relay(false,[],true);assert(!await computer.evaluate(node=>node.classList.contains('expanded')),'closing normalizes fullscreen before outer rail controls return');assert(await page.locator('#ios-computer-back').isHidden());assert(await computerHandle.isHidden());
      assert.equal(await page.evaluate(()=>accountRequests.filter(value=>value.action==='duo-navigation').at(-1).computerExpandAvailable),false,'outer rail must not offer inner-only expansion');
      assert.equal((await page.locator('#desktop').boundingBox()).y,0,'closed landscape computer has no vestigial HTML header row');
      assert.equal((await page.locator('.ios-computer-controls').boundingBox()).y,0,'closed landscape resources share the full native canvas height');
      await relay(true);await settled();assert.equal(Math.round((await computer.boundingBox()).width),280,'unfold retains the chosen compact computer width');
      assert.equal(await page.evaluate(()=>__duoFixtureRFB===retainedSidebarRFB&&__duoFixtureRFB.disconnects===0),connection===0,'resize/fold retains the computer connection');
      await action('back');await computer.waitFor({state:'hidden'});await settled();
      const menuCount=()=>page.evaluate(()=>accountRequests.filter(value=>value.action==='native-menu').length),beforeMenus=await menuCount();
      await action('newBot');await page.locator('#bot-dialog').waitFor({state:'visible'});assert.equal(await menuCount(),beforeMenus);await page.getByRole('button',{name:'Close new bot',exact:true}).click();
      await action('newConversation');const chat=page.locator('dialog[aria-label="New chat"]');await chat.waitFor({state:'visible'});assert.equal(await menuCount(),beforeMenus);await chat.getByRole('button',{name:'Close',exact:true}).click();await chat.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>__KINDRED_DUO_FIXTURE.snapshot().loadID),retainedLoad);assert.equal(await prompt.evaluate(node=>node.value),'Native sidebar retained draft');assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,`server-v${version}-native-sidebar.png`)});
      reports.push({serverVersion:version,narrowDefault:210,collapsedRail:76,computerDefault:240,computerResize:280,separatorFallback:true,railSelectionAndOuterInnerRestoration:true,closedPortraitLandscapeNativeRail:true,localizedRailDoesNotShrinkComposer:true,nativeAvatarDetails:true,innerCenteredIdentity:true,outerNativeAvatar:true,explicitNoRailRestoration:true,computerNativeExpandAndInertListToggle:true,composerConversationFill:true,foldAvoidance:true,nativeMenuLeaves:true,cancellationCleanup:cancellations,retainedLoadAndDraft:true,errors});
      await page.close();
    }
    fs.writeFileSync(path.join(out,'native-sidebar-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:true,engine:'webkit',reports}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
