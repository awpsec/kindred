// Native Duo content geometry against current and historical server navigation.
// Uses only the disposable local fixture; it never touches a real account/VM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const resources=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
const shared=fs.readFileSync(path.resolve(__dirname,'../../ui/mobile.js'),'utf8');
const legacy=shared.slice(0,shared.indexOf('export function installMobileNavigation('))+fs.readFileSync(path.join(__dirname,'fixtures/mobile-navigation-v1.js'),'utf8');
const close=(a,b,why)=>assert(Math.abs(a-b)<1,`${why}: ${a} != ${b}`);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,browser=await webkit.launch(),reports=[];
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-duo-content';fs.mkdirSync(out,{recursive:true});
  const headers={Authorization:'Bearer '+token};
  const baseBots=await(await fetch(origin+'/api/bots',{headers})).json(),baseChats=await(await fetch(origin+'/api/chats',{headers})).json();
  const extra=Array.from({length:12},(_,i)=>({id:'content-'+i,name:'Content helper '+(i+1),provider:'codex',model:'test',approval_mode:'auto',profile:{shape:'round',color:'#2475ff'}}));
  try {
    for(const version of [1,2])for(const side of ['right','left']) {
      const leading=side==='left'?84:0,totalRail=76+leading;
      const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
      if(version===1)await page.route(origin+'/mobile.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
      await page.route(origin+'/api/bots',route=>route.fulfill({json:[...baseBots,...extra]}));
      await page.route(origin+'/api/chats',route=>route.fulfill({json:[...baseChats,...extra.map(bot=>({id:'dm-'+bot.id,name:bot.name,members:[bot.id],archived:false}))]}));
      await page.addInitScript(({token,profileID,side,css,js})=>{
        sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-ios-sidebar-v1:'+profileID,JSON.stringify({width:76,hidden:false,computerWidth:240}));
        Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
        window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:0,leftInset:side==='left'?84:0,rightInset:side==='right'?84:0,railSide:side,isDuo:true,isDuoInner:true,usesNativeRail:true,isSlab:false,isPortrait:false,viewportHeight:720};
        window.__KINDRED_NATIVE_GEOMETRY={width:1280,height:720,windowWidth:1358,windowHeight:760,reservedRegions:[{kind:'division',active:false,x:640,y:0,width:28,height:720}]};
        window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:value=>accountRequests.push(value)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
        document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
      },{token,profileID,side,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
      await page.goto(origin+'/#kindred-chat=dm-vivienne');await page.locator('#content .message-group[data-message="72"]').waitFor({state:'visible'});
      const action=name=>page.evaluate(name=>__kindredDuoActions.perform(name),name);
      const settled=async()=>{
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing&&!document.documentElement.dataset.iosChromeMorphing);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await page.waitForFunction(()=>[...document.querySelectorAll('.sidebar .nav-entry')].every(node=>node.getAnimations().every(animation=>animation.playState!=='running')));
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      };
      const rect=async selector=>page.locator(selector).boundingBox();
      const sidebar=page.locator('.sidebar'),handle=page.locator('.sidebar>.ios-duo-resizer');
      const relay=async inner=>{
        const width=inner?1280:466,height=inner?720:780;await page.setViewportSize({width,height});
        await page.evaluate(({inner,side,width,height})=>{
          window.__KINDRED_IOS_LAYOUT={topInset:inner?0:59,bottomInset:inner?0:34,leftInset:side==='left'?84:0,rightInset:side==='right'?84:0,railSide:side,isDuo:true,isDuoInner:inner,usesNativeRail:true,isSlab:!inner,isPortrait:!inner,viewportHeight:height};
          window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width+(inner?78:0),windowHeight:height+40,reservedRegions:inner?[{kind:'division',active:false,x:640,y:0,width:28,height}]:[]};
          dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
        },{inner,side,width,height});await settled();
      };
      await settled();close((await sidebar.boundingBox()).width,totalRail,'saved avatar rail plus its measured leading reserve is restored');
      assert.equal(await handle.getAttribute('aria-valuenow'),'76','the content preference excludes the native leading gutter');
      if(side==='left')assert(await sidebar.locator('.nav-entry .bot-link').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect(),pane=node.closest('.sidebar').getBoundingClientRect();return r.left>=84&&r.right<=pane.right+1;})),'every avatar link stays inside the safe left rail');
      const assertDetails=async()=>{
        await settled();await page.waitForFunction(side=>parseFloat(document.querySelector('#details-panel').style.getPropertyValue('--ios-content-'+side))>=(side==='right'?84:0),side);
        await page.evaluate(()=>new Promise((resolve,reject)=>{
          let previous='',stable=0;const deadline=performance.now()+3000;
          const check=()=>{const r=document.querySelector('#details-panel').getBoundingClientRect(),next=[r.x,r.y,r.width,r.height].join('|');stable=next===previous?stable+1:0;previous=next;if(stable>=4)return resolve();if(performance.now()>deadline)return reject(Error('Details entry geometry did not settle: '+next));requestAnimationFrame(check);};requestAnimationFrame(check);
        }));
        const rail=await sidebar.boundingBox(),details=await rect('#details-panel');
        close(rail.width,totalRail,'Details and gear preserve the safe avatar rail');close(details.x,rail.x+rail.width,'Details overlays the conversation after the entire safe rail');
        close(details.width,1280-details.x,'Details fills the remainder instead of a 340px desktop pane');
        assert(await page.locator('#details-panel>.panel-header').isHidden(),'native navigation replaces the desktop Details header');
        assert(await page.locator('#details-back').isHidden(),'Details has no vestigial HTML Back button');
        assert.equal(await handle.evaluate(node=>getComputedStyle(node).pointerEvents),'none','the rail separator is inert while Details is overlaid');
      };
      await action('botDetails');await page.locator('#details-panel').waitFor({state:'visible'});await assertDetails();
      await action('botSettings');await page.locator('.bot-edit-form').waitFor({state:'visible'});await assertDetails();
      const form=await rect('.bot-edit-form');assert(form.x>=totalRail&&form.x+form.width<=1280-(side==='right'?84:0),'the actual settings form clears the measured native rail');
      await action('back');await page.locator('#details-panel').waitFor({state:'hidden'});await settled();close((await sidebar.boundingBox()).width,totalRail,'Back preserves the safe avatar rail');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kindred-ios-sidebar-v1:'+__KINDRED_MOBILE_PROFILE)).width),76,'Details, gear and Back retain the stored 76px content preference');
      await handle.dispatchEvent('keydown',{key:'End',bubbles:true});await settled();
      assert((await sidebar.boundingBox()).width<=1280/4+1,'native list width never exceeds one quarter of the viewport');
      await page.setViewportSize({width:867,height:720});await page.evaluate(()=>{Object.assign(__KINDRED_NATIVE_GEOMETRY,{width:867,windowWidth:945,reservedRegions:[{kind:'division',active:false,x:433.5,y:0,width:28,height:720}]});dispatchEvent(new Event('kindred-native-geometry'));});await settled();
      assert(Number(await handle.getAttribute('aria-valuemax'))<=Math.floor(867/4)-leading,'the content separator maximum excludes the leading native reserve');
      assert((await sidebar.boundingBox()).width<=Math.floor(867/4)+1,'the actual sidebar respects the fractional viewport maximum');
      await relay(true);
      await handle.dispatchEvent('keydown',{key:'Home',bubbles:true});await settled();close((await sidebar.boundingBox()).width,totalRail,'Home restores the safe rail');
      const content=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
        document.querySelector('#content').scrollTop=0;document.querySelector('.jump-latest').hidden=false;
        return {conversation:rect('.conversation'),history:rect('.conversation-history'),composer:rect('#composer'),latest:rect('.jump-latest'),side:document.documentElement.dataset.iosRailSide,insets:__KINDRED_IOS_LAYOUT};
      });
      assert.equal(content.side,side);assert.equal(side==='right'?content.insets.rightInset:content.insets.leftInset,84,'the fixture publishes the measured rail inset for its physical side');
      assert(content.history.left>=Math.max(content.conversation.left,side==='left'?84:0)-1);
      assert(content.history.right<=Math.min(content.conversation.right,side==='right'?1196:1280)+1,'reading history excludes the native side gutter');
      close(content.latest.right,content.composer.right,'Latest reaches the trailing bottom lane');
      close(content.composer.left,content.conversation.left+10,'the bottom composer keeps its full lane');close(content.composer.right,content.conversation.right-10,'the bottom composer does not inherit the reading gutter');
      await action('computer');await page.waitForFunction(()=>window.__duoFixtureRFB&&!document.querySelector('#computer-panel').hidden);await settled();
      const canvas=await rect('#desktop canvas:not(.desktop-glass)');assert(canvas.x>=Math.max(0,side==='left'?84:0)-1&&canvas.x+canvas.width<=1280-(side==='right'?84:0)+1,'the real connected computer canvas clears the native rail');
      await page.setViewportSize({width:867,height:720});await page.evaluate(()=>{Object.assign(__KINDRED_NATIVE_GEOMETRY,{width:867,windowWidth:945,reservedRegions:[{kind:'division',active:false,x:433.5,y:0,width:28,height:720}]});dispatchEvent(new Event('kindred-native-geometry'));});await settled();
      assert.equal(await page.locator('.computer-panel>.ios-duo-resizer:visible').count(),0,'the bot-center computer has no third-pane resize handle');
      const center=await rect('#computer-panel'),centerLane=await rect('.conversation');
      close(center.x,centerLane.x,'computer uses the retained bot-center content lane');close(center.width,centerLane.width,'computer fills the bot-center destination');
      await page.locator('#take-control').click();await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling')&&!document.querySelector('#take-control').disabled);await settled();
      const beforeInput=await page.evaluate(()=>{window.contentControlledRFB=__duoFixtureRFB;return {pointer:__duoFixtureRFB.pointer.length,disconnects:__duoFixtureRFB.disconnects};});
      const activeCanvas=await rect('#desktop canvas:not(.desktop-glass)');
      await page.touchscreen.tap(activeCanvas.x+activeCanvas.width/2,activeCanvas.y+activeCanvas.height/2);
      const effects=await page.evaluate(start=>contentControlledRFB.pointer.slice(start),beforeInput.pointer);
      assert(effects.some(effect=>effect.mask===1)&&effects.at(-1)?.mask===0,'a trusted canvas touch sends a bounded press and release through the nonzero gutter transform');
      assert(effects.every(effect=>effect.x>=0&&effect.x<=1600&&effect.y>=0&&effect.y<=1000),'the connected framebuffer receives valid mapped coordinates');
      const press=effects.find(effect=>effect.mask===1);
      assert(Math.abs(press.x-800)<=Math.ceil(1600/activeCanvas.width)+1&&Math.abs(press.y-500)<=Math.ceil(1000/activeCanvas.height)+1,'the gutter-corrected canvas center maps to the framebuffer center within one CSS pixel of touch quantization: '+JSON.stringify({press,activeCanvas}));
      assert(await page.evaluate(count=>__duoFixtureRFB===contentControlledRFB&&contentControlledRFB.disconnects===count,beforeInput.disconnects),'valid input does not reconnect the computer');
      const returnButton=page.locator('#take-control'),target=await returnButton.boundingBox();
      await returnButton.evaluate((button,point)=>{for(const type of ['pointerdown','pointercancel','pointerup'])button.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:731,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:point.x,clientY:point.y}));},{x:target.x+target.width/2,y:target.y+target.height/2});
      assert(await page.locator('#computer-panel').evaluate(node=>node.classList.contains('is-controlling')),'a cancelled toolbar touch cannot return control');
      assert.equal(await page.evaluate(()=>contentControlledRFB.pointer.length),beforeInput.pointer+effects.length,'cancelled toolbar touches cannot reach the computer');
      await page.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);
      await page.waitForFunction(()=>!document.querySelector('#computer-panel').classList.contains('is-controlling')&&!document.querySelector('#take-control').disabled&&__duoFixtureRFB.viewOnly);
      await relay(true);
      await action('back');await page.locator('#computer-panel').waitFor({state:'hidden'});await relay(false);await action('back');await sidebar.waitFor({state:'visible'});await settled();
      const rows=async()=>page.evaluate(()=>{
        const sidebar=document.querySelector('.sidebar'),base=sidebar.getBoundingClientRect(),scroll=document.querySelector('#bots'),view=scroll.getBoundingClientRect();
        return [...scroll.querySelectorAll('.nav-entry')].map(node=>{const r=node.getBoundingClientRect(),css=getComputedStyle(node),link=node.querySelector('.bot-link');return {id:link?.dataset.sidebarId,left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,visible:r.height>0&&r.bottom>Math.max(base.top,view.top)&&r.top<Math.min(base.bottom,view.bottom),leftInset:parseFloat(node.style.getPropertyValue('--ios-list-left'))||0,rightInset:parseFloat(node.style.getPropertyValue('--ios-list-right'))||0,corner:node.hasAttribute('data-ios-leading-corner'),radius:css.borderTopLeftRadius,linkRadius:getComputedStyle(link).borderTopLeftRadius,transition:css.transitionDuration};});
      });
      const assertRows=async(phase,searching=false)=>{
        // The search field occupies one compact slot. With it hidden, the
        // fifth card uses that slot; this is the requested list design rule.
        const upperCount=searching?4:5;
        await settled();const list=await rows(),visible=list.filter(row=>row.visible);assert(visible.length>upperCount,'the fixture has upper and lower visible cards');
        for(const [index,row] of visible.entries()) {
          close(side==='left'?row.leftInset:row.rightInset,index<upperCount?84:0,phase+': only the designated upper visible cards use the side gutter');
          close(side==='left'?row.rightInset:row.leftInset,0,phase+': the opposite side stays available');
          assert.equal(row.corner,false,phase+': cards do not own a guessed physical corner');
        }
        close(visible[upperCount].width-visible[0].width,84,phase+': lower rows remain full width');
        assert.notEqual(visible[0].radius,'48px','the physical contour belongs to the viewport');return visible;
      };
      const first=await assertRows('initial');
      await action('search');await page.locator('.navigation-search').waitFor({state:'visible'});await settled();
      const search=await rect('.navigation-search');assert(search.x>=0&&search.x+search.width<=466,'native search fits the display');
      await action('search');await page.locator('.navigation-search').waitFor({state:'hidden'});
      await page.locator('#bots').evaluate(node=>{node.scrollTop=150;});const scrolled=await assertRows('scrolled');assert.notEqual(scrolled[0].id,first[0].id,'scrolling reclassifies the actual first visible card');
      await page.locator('#bots').evaluate(async node=>{node.scrollTop=0;const rows=[...node.querySelectorAll('.nav-entry')],moved=rows.at(-1),before=moved.getBoundingClientRect().top;rows[0].parentElement.prepend(moved);const delta=before-moved.getBoundingClientRect().top;await moved.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0px)'}],{duration:180,easing:'linear'}).finished;});
      const reordered=await assertRows('reordered');assert.notEqual(reordered[0].id,first[0].id,'reordering reclassifies compact rows');
      await page.emulateMedia({reducedMotion:'reduce'});await settled();assert((await rows()).every(row=>row.transition==='0s'),'Reduce Motion removes card-width transitions');
      assert.equal(await page.evaluate(()=>accountRequests.filter(value=>value.action==='duo-navigation').at(-1).reduceMotion),true,'Reduce Motion reaches the native dock transaction');
      // Closed landscape is a compact input pose, distinct from an opened
      // display whose web viewport was merely shortened by the keyboard.
      await page.locator('.sidebar .bot-link').first().click();
      await page.setViewportSize({width:678,height:466});
      await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:false,isSlab:true,isPortrait:false,viewportHeight:466,composerBottomInset:16});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      await page.evaluate(()=>{__KINDRED_NATIVE_GEOMETRY={width:678,height:466,windowWidth:678,windowHeight:466,reservedRegions:[{kind:'occlusion',active:true,x:594,y:384,width:84,height:82}]};dispatchEvent(new Event('kindred-native-geometry'));});
      await settled();
      const compact=await rect('.conversation>.composer-area'), lane=await rect('.conversation');
      assert(compact.width<=641&&compact.width<lane.width-20,'closed landscape composer is shorter than the conversation lane');
      close(compact.x+compact.width/2,lane.x+lane.width/2,'compact composer stays centered');
      close(compact.y+compact.height,lane.y+lane.height,'bottom corner status region does not lift the full composer wrapper');
      const history=await rect('.conversation-history');
      assert(history.y+history.height>=compact.y+compact.height-1,'the transcript continues beneath the floating composer');
      const indicator=await rect('.ios-reading-indicator');
      assert(indicator.y+indicator.height<=compact.y+1,'the reading indicator stops above the composer');
      const idle=await rect('#composer');
      await page.locator('#prompt').focus();await settled();const focused=await rect('#composer');
      close(focused.height,idle.height,'focusing a single-line input cannot add an empty row');
      close(focused.y+focused.height,idle.y+idle.height,'focus keeps the composer bottom anchored');
      await page.locator('#prompt').blur();
      const footer=await page.locator('.conversation>.composer-area').evaluate(node=>getComputedStyle(node,'::before').content);
      assert.equal(footer,'none','only the input capsule has a material; there is no full-width footer wash');
      assert(await page.locator('#composer').evaluate(node=>getComputedStyle(node).backdropFilter.includes('blur')),'the capsule samples the live scrolling backdrop');
      await page.evaluate(()=>{Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:true,isSlab:false,isPortrait:false,keyboardVisible:true});dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));});
      await settled();close((await rect('.conversation>.composer-area')).width,(await rect('.conversation')).width,'an opened keyboard-shortened viewport retains the full composer lane');
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`v${version}-${side}.png`)});
      reports.push({serverVersion:version,railSide:side,safeRailTotal:totalRail,railPreference:76,railPersistsThroughDetailsGearBack:true,detailsOverlay:true,quarterWidthMaximum:true,historyClearRailLatestAtTrailingEdge:true,fullComposerLane:true,connectedCanvasClearRail:true,computerSharesBotCenter:true,controlledGutterPointer:true,cancelledTouchGuard:true,closedUpperFiveRows:true,searchUpperFourRows:true,finiteWAAPIReorderReclassifies:true,scrollAndReorderReclassify:true,searchSafeSide:true,reducedMotion:true,nativeDockReduceMotion:true,nativeViewportContour:true,closedLandscapeCompactComposer:true,liveComposerBackdrop:true,indicatorClearOfComposer:true,innerKeyboardFullComposer:true});await page.close();
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:true,engine:'webkit',reports}));
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
