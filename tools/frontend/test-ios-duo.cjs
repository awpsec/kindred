const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {webkit} = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const {server,token,profileID,snapshot:fixtureState} = require('./fixtures/duo.cjs');
const resources = path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');

// These are WKWebView content bounds, after the simulator's native toolbar.
// Actual hardware folding and toolbar placement are tested separately in iOS.
const outer = {width:466,height:650,windowWidth:466,windowHeight:777};
const inner = {width:867,height:645,windowWidth:945,windowHeight:685};

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await webkit.launch();
  const out = process.env.KINDRED_TEST_ARTIFACTS || '/tmp/kindred-ios-duo';
  fs.mkdirSync(out,{recursive:true});
  try {
    const context = await browser.newContext({viewport:{width:outer.width,height:outer.height},hasTouch:true});
    await context.addInitScript(({token,profileID,css,js,outer}) => {
      window.__KINDRED_MOBILE = true;
      window.__KINDRED_MOBILE_PLATFORM = 'ios';
      window.__KINDRED_MOBILE_PROFILE = profileID;
      window.__KINDRED_NATIVE_SESSION_BOOTSTRAP = true;
      window.__KINDRED_IOS_APP_VERSION = 'iOS Duo regression';
      window.__KINDRED_IOS_LAYOUT = {topInset:0,bottomInset:0,leftInset:0,rightInset:0,isSlab:true,isDuo:true,isDuoInner:false,isPortrait:true,viewportHeight:outer.height};
      window.__KINDRED_NATIVE_GEOMETRY = {...outer,safeArea:{top:0,right:0,bottom:0,left:0},reservedRegions:[]};
      window.accountRequests = [];
      window.navigation = [];
      window.webkit = {messageHandlers:{
        kindredAccounts:{postMessage:value => window.accountRequests.push(value)},
        kindredNavigation:{postMessage:value => window.navigation.push(value)},
        kindredSession:{postMessage:() => {}}
      }};
      sessionStorage.setItem('kindred-token',token);
      document.addEventListener('DOMContentLoaded',() => {
        const style = document.createElement('style');
        style.textContent = css; document.head.append(style);
        (0,eval)(js);
      },{once:true});
    },{token,profileID,outer,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    const settled = () => page.evaluate(()=>new Promise((resolve,reject)=>{
      const deadline=performance.now()+12000;let stamp='',frames=0;
      const check=()=>{
        const shell=document.querySelector('#app'),canvas=document.querySelector('#desktop canvas:not(.desktop-glass)'),rect=canvas?.getBoundingClientRect();
        const next=[innerWidth,innerHeight,shell?.dataset.mobileResizing,rect?.x,rect?.y,rect?.width,rect?.height].join('|');
        frames=shell && !shell.dataset.mobileResizing && stamp===next?frames+1:0;stamp=next;
        if(frames>=3)return resolve();
        if(performance.now()>deadline)return reject(new Error('Duo geometry did not settle'));
        requestAnimationFrame(check);
      };requestAnimationFrame(check);
    }));
    const action = name => page.evaluate(name => window.__kindredDuoActions.perform(name),name);
    const relay = async (bounds,{regions=[],insets={top:0,right:0,bottom:0,left:0}}={}) => {
      await page.setViewportSize({width:bounds.width,height:bounds.height});
      await page.evaluate(({bounds,regions,insets}) => {
        const isDuoInner=bounds.windowWidth>=945;
        window.__KINDRED_IOS_LAYOUT = {topInset:insets.top,bottomInset:insets.bottom,leftInset:insets.left,rightInset:insets.right,isSlab:!isDuoInner,isDuo:true,isDuoInner,isPortrait:bounds.windowHeight>=bounds.windowWidth,viewportHeight:bounds.height};
        window.__KINDRED_NATIVE_GEOMETRY = {...bounds,safeArea:insets,reservedRegions:regions};
        window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:window.__KINDRED_IOS_LAYOUT}));
        window.dispatchEvent(new CustomEvent('kindred-native-geometry',{detail:window.__KINDRED_NATIVE_GEOMETRY}));
      },{bounds,regions,insets});
      await settled();
    };
    const nav = () => page.evaluate(() => window.accountRequests.filter(value=>value.action==='duo-navigation').at(-1));
    const ui = () => page.evaluate(() => window.__KINDRED_DUO_FIXTURE.snapshot());
    const readAnchor = () => page.evaluate(() => {
      const area=document.querySelector('#content'),top=area.getBoundingClientRect().top;
      const first=[...area.children].find(node=>(node.dataset.message||node.dataset.run)&&node.getBoundingClientRect().bottom>top+1);
      return {message:first?.dataset.message,run:first?.dataset.run,offset:first?first.getBoundingClientRect().top-top:null};
    });
    const assertAnchor = async anchor => {
      assert(anchor.message || anchor.run,'a retained reading anchor must exist');
      const offset=await page.evaluate(anchor => {
        const area=document.querySelector('#content'),node=[...area.children].find(node=>anchor.message?node.dataset.message===anchor.message:node.dataset.run===anchor.run);
        return node?node.getBoundingClientRect().top-area.getBoundingClientRect().top:null;
      },anchor);
      assert.notEqual(offset,null,'the reading anchor must survive folding');
      assert(Math.abs(offset-anchor.offset)<3,`reading anchor drifted ${offset-anchor.offset}px`);
    };
    const noInputEffects = () => fixtureState().events.filter(event=>['send','key','pointer','clipboard','computer-http-input'].includes(event.type));
    const localInputEffects = () => page.evaluate(()=>({
      keys:window.__duoFixtureRFB?.keys.slice() || [],
      keyEvents:window.__duoFixtureRFB?.keyEvents.slice() || [],
      pointer:window.__duoFixtureRFB?.pointer.slice() || []
    }));
    const assertSinglePauseNotice=async()=>{
      const notices=await page.evaluate(()=>[...document.querySelectorAll('#control-notice .control-notice-row,#queue-status')]
        .filter(node=>!node.hidden && node.getClientRects().length && getComputedStyle(node).visibility!=='hidden')
        .filter(node=>node.dataset.controlBotId==='vivienne' || (node.id==='queue-status'?!!node.querySelector('button'):node.querySelector('.control-notice-copy strong')?.textContent==='Vivienne'))
        .map(node=>({id:node.id || node.className,label:node.querySelector('button')?.getAttribute('aria-label')})));
      assert.equal(notices.length,1,`the current bot must have one actionable pause notice: ${JSON.stringify(notices)}`);
    };
    const assertHitTarget=async(locator,min=44)=>{
      const result=await locator.evaluate(node=>{const rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {width:rect.width,height:rect.height,hittable:node.contains(hit)};});
      assert(result.width>=min && result.height>=min && result.hittable,`the visible control must be a reachable hit target: ${JSON.stringify(result)}`);
    };
    const dragPane=async(kind,delta)=>{
      const handle=page.locator(`.ios-duo-resizer[data-pane="${kind}"]`);
      await assertHitTarget(handle,24);
      const rect=await handle.boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta,y,{steps:4});
      await page.mouse.up();await settled();
    };
    const assertRetained = async baseline => {
      const state=await ui();
      assert.equal(state.loadID,baseline.loadID,'folding must retain the same document');
      assert.equal(state.hash,baseline.hash,'folding must retain the selected conversation');
      assert.equal(state.heading,baseline.heading,'folding must retain the selected bot');
      assert.equal(state.draft,baseline.draft,'folding must retain the draft');
      assert.deepEqual(state.selection && {start:state.selection.start,end:state.selection.end},baseline.selection && {start:baseline.selection.start,end:baseline.selection.end},'folding must retain the composer selection');
      assert(state.scrollWidth<=state.width,'folding must not create horizontal page overflow');
    };

    // Use a non-default bot so an accidental reset to the first chat is visible.
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');
    const prompt=page.locator('#prompt');
    await prompt.waitFor({state:'visible'});
    await page.waitForFunction(()=>window.__kindredDuoActions && window.__KINDRED_DUO_FIXTURE);
    await settled();
    assert((await ui()).heading.includes('Vivienne'),'the requested non-default conversation must open');
    assert.equal((await ui()).iosLayout,'compact','the outer display uses separate list/chat pages');
    assert.equal((await nav()).route,'bot-chat');
    for(const selector of ['#mobile-menu','#show-computer','#ios-computer-back','#computer-close','#details-close','.sidebar-top'])
      assert(await page.locator(selector).isHidden(),`${selector} duplicates native Duo navigation`);

    const draft='Retain this Duo draft, its caret, and this selected conversation.';
    await prompt.fill(draft);
    const selectDraft=()=>prompt.evaluate(node=>{
      if(node.setSelectionRange)node.setSelectionRange(8,19);
      else {
        const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode();
        const range=document.createRange();range.setStart(text,8);range.setEnd(text,19);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      }
    });
    await selectDraft();
    assert((await ui()).selectedText,'the explicit Back regression requires a selected draft');
    const draftBackEffects=noInputEffects();
    await action('back');
    await page.waitForFunction(()=>document.querySelector('#app').classList.contains('sidebar-open'));
    assert.equal((await nav()).route,'chat-list','explicit native Back works while draft text is selected');
    assert.equal(await prompt.evaluate(node=>node.value),draft);
    await page.locator('.sidebar .bot-link[aria-label="Vivienne"]').click();
    await prompt.waitFor({state:'visible'});await settled();
    assert.equal(await prompt.evaluate(node=>node.value),draft,'reopening the conversation preserves its selected draft');
    assert.deepEqual(noInputEffects(),draftBackEffects,'selected draft navigation must not send a message');
    await prompt.focus();await selectDraft();
    await page.locator('#content').evaluate(area=>{area.scrollTop=area.scrollHeight*.52;area.dispatchEvent(new Event('scroll'));});
    await page.waitForTimeout(150);
    const baseline=await ui(),anchor=await readAnchor();
    await relay(inner);
    assert.equal((await ui()).iosLayout,'regular','the flat inner display shows list and chat');
    assert(await page.locator('.sidebar').evaluate(node=>!node.inert),'the visible list must accept input');
    await assertRetained(baseline); await assertAnchor(anchor);
    const flatList=await page.locator('.sidebar').boundingBox(),flatChat=await page.locator('.conversation').boundingBox();
    assert(flatList.width>=200 && flatChat.x>=flatList.x+flatList.width-1,'flat panes must be separate');
    await page.screenshot({path:path.join(out,'flat-list-chat.png')});

    await relay({...inner,height:315});
    assert.equal((await ui()).iosLayout,'regular','a keyboard-only host resize must retain navigation');
    assert.equal(await prompt.evaluate(node=>document.activeElement===node),true,'keyboard avoidance must retain composer focus');
    await assertRetained(baseline); await assertAnchor(anchor);
    await relay(outer);
    assert.equal((await ui()).iosLayout,'compact','closing mid-draft returns to the outer chat');
    await assertRetained(baseline); await assertAnchor(anchor);
    await relay(inner);

    // A real reserved division aligns independent panes to opposite book halves.
    const division={kind:'division',x:420,y:0,width:27,height:inner.height};
    await relay(inner,{regions:[division]});
    const bookList=await page.locator('.sidebar').boundingBox(),bookChat=await page.locator('.conversation').boundingBox();
    assert(Math.abs(bookList.width-division.x)<2,'book list must finish at its half of the division');
    assert(Math.abs(bookChat.x-(division.x+division.width))<2,'book chat must begin after the reserved division');
    await assertRetained(baseline); await assertAnchor(anchor);
    await page.screenshot({path:path.join(out,'book-list-chat.png')});
    await relay(inner,{regions:[division],insets:{top:0,right:21,bottom:0,left:12}});
    const paddedList=await page.locator('.sidebar').boundingBox(),paddedChat=await page.locator('.conversation').boundingBox();
    assert.equal(paddedList.x,12,'book layout must retain the left hardware inset');
    assert(Math.abs(paddedList.x+paddedList.width-division.x)<2,'book division coordinates must be converted from web view to padded content');
    assert(Math.abs(paddedChat.x-(division.x+division.width))<2,'asymmetric padding must not displace the hinge gap');
    assert(paddedChat.x+paddedChat.width<=inner.width-21+1,'book chat must retain the separate right inset');
    await relay(inner);

    const tag=await page.locator('.bot-heading').boundingBox(),composer=await page.locator('#composer-area').boundingBox();
    const camera={kind:'occlusion',x:tag.x+tag.width/2-20,y:0,width:40,height:72};
    const bottomCamera={kind:'occlusion',x:composer.x+composer.width/2-24,y:inner.height-32,width:48,height:32};
    await relay(inner,{regions:[camera,bottomCamera]});
    const clearTag=await page.locator('.bot-heading').boundingBox(),clearComposer=await page.locator('#composer-area').boundingBox();
    assert(clearTag.y>=camera.y+camera.height+7,'the bot tag must clear an active camera occlusion');
    assert(clearComposer.y+clearComposer.height<=bottomCamera.y-7,'the composer must clear a lower active occlusion');
    await page.locator('#content').evaluate(area=>{
      window.duoReadingPosition=area.scrollTop;
      area.scrollTop=area.scrollHeight;area.dispatchEvent(new Event('scroll'));
    });
    await settled();
    const lastMessageBottom=await page.locator('#content').evaluate(area=>{
      const last=[...area.children].filter(node=>node.dataset.message||node.dataset.run).at(-1);
      return last?.getBoundingClientRect().bottom;
    });
    assert(lastMessageBottom<=clearComposer.y-7,'the last message must scroll above the composer moved by an occlusion');
    await page.locator('#content').evaluate(area=>{area.scrollTop=window.duoReadingPosition;area.dispatchEvent(new Event('scroll'));});
    await settled();
    await page.screenshot({path:path.join(out,'active-camera-clearance.png')});
    await relay(inner);
    assert.equal(await page.locator('.bot-heading').evaluate(node=>getComputedStyle(node).top),'10px','inactive occlusions must not leave an empty header gap');
    assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).bottom),'0px','inactive occlusions must not leave an empty composer gap');

    // The native gear targets the existing settings form only on Details.
    await action('botSettings');
    assert(await page.locator('#details-panel').isHidden(),'a stale gear action cannot open bot settings from chat');
    await page.locator('.bot-heading').click();
    await page.locator('#details-panel').waitFor({state:'visible'});
    await page.waitForFunction(()=>window.accountRequests.filter(v=>v.action==='duo-navigation').at(-1)?.botSettingsAvailable===true);
    assert(await page.locator('#bot-settings').isHidden(),'Duo Details must not duplicate the native gear');
    await action('botSettings');
    await page.waitForFunction(()=>document.querySelector('#details-title').textContent==='Bot settings');
    assert.equal((await nav()).botSettingsAvailable,false,'the gear is unavailable while its settings form is already open');
    await action('back');await page.locator('#details-panel').waitFor({state:'hidden'});await settled();
    assert.equal(await prompt.evaluate(node=>node.value),draft);

    // Exit keeps the sheet modal while both its position and input availability
    // settle. An interrupted entrance must close from its actual current pose.
    for(const interruptEntrance of [false,true]) {
      await action('settings');await page.locator('#settings-dialog').waitFor({state:'visible'});
      const exit=await page.evaluate(async interruptEntrance=>{
        const sheet=document.querySelector('#settings-dialog');
        const entries=sheet.getAnimations();
        if(interruptEntrance){for(const animation of entries){animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*.4;}}
        else await Promise.all(entries.map(animation=>animation.finished));
        const translate=()=>{const value=getComputedStyle(sheet).transform;return value==='none'?0:new DOMMatrixReadOnly(value).m42;};
        const start=translate();sheet.querySelector('[aria-label="Close settings sheet"]').click();
        const animations=sheet.getAnimations().filter(animation=>!entries.includes(animation));
        const closeStart=translate();
        for(const animation of animations){animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*.5;}
        const during={y:translate(),open:sheet.open,modal:sheet.matches(':modal'),inert:sheet.inert};
        for(const animation of animations)animation.finish();
        return {start,closeStart,during,end:translate(),height:sheet.getBoundingClientRect().height};
      },interruptEntrance);
      assert(Math.abs(exit.closeStart-exit.start)<2,'sheet dismissal must start at its current visible position');
      assert(exit.during.open && exit.during.modal && exit.during.inert,'the descending sheet remains modal and rejects duplicate input');
      assert(exit.during.y>exit.start+8 && exit.end>=exit.height-1,'settings must move downward before the modal is removed');
      await page.locator('#settings-dialog').waitFor({state:'hidden'});await settled();
      await assertHitTarget(prompt,1);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await action('settings');await page.locator('#settings-dialog').waitFor({state:'visible'});
    assert.equal(await page.getByRole('button',{name:'Close settings sheet',exact:true}).evaluate(button=>{button.click();return document.querySelector('#settings-dialog').open;}),false,'Reduce Motion closes without a spatial exit');
    await page.emulateMedia({reducedMotion:'no-preference'});await settled();

    // A real document preview uses a glass SVG close control below system chrome.
    await relay(outer,{insets:{top:47,right:12,bottom:21,left:8}});
    await page.evaluate(async()=>{
      const {openDocumentPreview}=await import('/document-preview.js');
      const card=document.createElement('div');card.id='duo-document-preview';document.body.append(card);
      window.duoPreviewDownloads=0;
      await openDocumentPreview({card,name:'Duo mobile document preview',extension:'txt',getBlob:async()=>new Blob(['Retained document preview content'],{type:'text/plain'}),download:()=>window.duoPreviewDownloads++});
    });
    const documentDialog=page.locator('#duo-document-preview .document-dialog'),previewClose=documentDialog.getByRole('button',{name:'Close preview',exact:true});
    await documentDialog.getByText('Retained document preview content',{exact:true}).waitFor();
    await assertHitTarget(previewClose);
    const previewStyle=await previewClose.evaluate(node=>({radius:getComputedStyle(node).borderRadius,blur:getComputedStyle(node).backdropFilter,svg:!!node.querySelector('svg'),top:node.getBoundingClientRect().top}));
    assert(previewStyle.svg && previewStyle.radius==='50%' && previewStyle.blur.includes('blur'),'preview Close must use the same glass circle and SVG controls as mobile chat');
    assert(previewStyle.top>=57,'preview controls must clear the native status area');
    assert(await documentDialog.getByRole('button',{name:'Download',exact:true}).isHidden(),'mobile preview omits the desktop download control');
    await previewClose.click();await documentDialog.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>duoPreviewDownloads),0);
    await page.evaluate(()=>document.querySelector('#duo-document-preview').remove());
    await relay(inner);
    assert.equal(await prompt.evaluate(node=>node.value),draft);

    // Native toolbar actions open the same live computer path as the app.
    await action('computer');
    await page.waitForFunction(()=>window.__duoFixtureRFB && !document.querySelector('#computer-panel').hidden);
    await settled();
    assert.equal((await ui()).iosComputer,'side');
    assert.equal((await ui()).iosLayout,'regular','flat Duo fits list, current chat, and computer');
    const panes=await Promise.all(['.sidebar','.conversation','#computer-panel'].map(selector=>page.locator(selector).boundingBox()));
    assert(panes[0].width>=200 && panes[1].width>=360 && panes[2].width>=280,'three panes must retain useful minimum widths');
    assert(panes[0].x+panes[0].width<=panes[1].x+1 && panes[1].x+panes[1].width<=panes[2].x+1,'three panes must not overlap');
    await page.screenshot({path:path.join(out,'flat-three-panes.png')});
    await page.evaluate(()=>window.duoExpandedRFB=window.__duoFixtureRFB);
    await page.locator('#computer-expand').click();await settled();
    assert.equal(await page.locator('#computer-panel').evaluate(node=>node.classList.contains('expanded')),true,'the inner display can explicitly expand its computer');
    await relay(outer);
    assert.equal(await page.locator('#computer-panel').evaluate(node=>node.classList.contains('expanded')),false,'closing must normalize an inherited maximize state before hiding its collapse control');
    assert.equal(await page.evaluate(()=>__duoFixtureRFB===duoExpandedRFB && __duoFixtureRFB.disconnects===0),true,'fold-time maximize normalization must preserve the transport');
    assert(await page.locator('#computer-expand').isHidden(),'closed-screen normalize leaves no maximize control');
    await relay(inner);
    await page.locator('#take-control').click();
    await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling') && !window.__duoFixtureRFB.viewOnly);
    await settled();
    await page.evaluate(()=>window.retainedDuoRFB=window.__duoFixtureRFB);
    const controlBaseline=fixtureState(),effectsBaseline=noInputEffects(),localEffectsBaseline=await localInputEffects();
    // Genuine inner capability enables handles. Drags, full hide and restore
    // retain the page and computer while remote input is guarded during resize.
    const paneLoad=(await ui()).loadID;
    await dragPane('sidebar',30);
    assert(Math.abs((await page.locator('.sidebar').boundingBox()).width-240)<2);
    await dragPane('computer',-20);
    assert(Math.abs((await page.locator('#computer-panel').boundingBox()).width-300)<2);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kindred-ios-duo-panes-v1')));
    assert.equal(saved.sidebar,240);assert.equal(saved.computer,300);
    await action('chats');await settled();
    assert(await page.locator('.sidebar').isHidden());
    assert.equal((await ui()).iosLayout,'regular','manual list hiding must preserve a fitting inner architecture');
    assert.equal((await nav()).listVisible,false);assert.equal((await nav()).listToggleAvailable,true,'native Show chat list remains available after hiding');
    await action('chats');await settled();
    assert(Math.abs((await page.locator('.sidebar').boundingBox()).width-240)<2,'restoring the list retains its chosen width');
    await dragPane('sidebar',-200);
    assert(await page.locator('.sidebar').isHidden(),'dragging the list fully closed must commit the hide');
    await action('chats');await settled();
    await dragPane('sidebar',50);await dragPane('computer',20);
    assert(Math.abs((await page.locator('.sidebar').boundingBox()).width-210)<2);
    assert(Math.abs((await page.locator('#computer-panel').boundingBox()).width-280)<2);
    assert.equal((await ui()).loadID,paneLoad);assert.equal(await prompt.evaluate(node=>node.value),draft);
    assert.deepEqual(await localInputEffects(),localEffectsBaseline,'pane gestures must not reach the controlled computer');
    assert.equal(await page.evaluate(()=>__duoFixtureRFB===retainedDuoRFB && __duoFixtureRFB.disconnects===0),true);
    const resizingHandle=page.locator('.ios-duo-resizer[data-pane="sidebar"]'),handleBox=await resizingHandle.boundingBox();
    await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
    await page.mouse.down();await page.mouse.move(handleBox.x+handleBox.width/2+18,handleBox.y+handleBox.height/2,{steps:2});
    assert.equal(await page.locator('#app').getAttribute('data-mobile-resizing'),'true','active pane dragging must deny remote input');
    await relay(outer);
    assert.equal(await page.locator('.pane-resize-shield').count(),0,'folding must remove the interrupted pane shield');
    assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('pane-resizing')),false,'folding must cancel the interrupted drag');
    await page.mouse.move(5,5);await page.mouse.up();
    assert(await page.locator('#computer-expand').isHidden(),'the closed outer screen has no maximize affordance');
    assert(await page.locator('.ios-duo-resizer[data-pane="computer"]').isHidden(),'outer capability suppresses inner pane handles');
    await relay(inner);
    assert(Math.abs((await page.locator('.sidebar').boundingBox()).width-210)<2,'a cancelled fold-time drag must restore the previous width');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kindred-ios-duo-panes-v1')).sidebar),210,'a cancelled pane drag must not save its preview');
    assert.deepEqual(await localInputEffects(),localEffectsBaseline,'fold cancellation must not synthesize remote input');
    await relay(inner,{regions:[division]});
    assert.equal((await ui()).iosComputer,'side','book mode places chat and computer on opposite halves');
    assert.equal((await ui()).iosLayout,'compact','book mode must not squeeze a third pane into one half');
    const bookComputer=await page.locator('#computer-panel').boundingBox();
    assert(Math.abs(bookComputer.x-(division.x+division.width))<2,'computer must begin after the division');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'ios-computer-input','Duo landscape remote input must remain focused');
    await relay({...inner,height:315},{regions:[{...division,height:315}]});
    assert.equal((await ui()).iosComputer,'side','remote keyboard must retain book layout');
    for(const selector of ['#desktop-paste','#take-control']) {
      const rect=await page.locator(selector).boundingBox();
      assert(rect && rect.y>=0 && rect.y+rect.height<=315,`${selector} must remain above the keyboard`);
    }
    const tabletop={kind:'division',x:0,y:300,width:inner.width,height:28};
    await relay(inner,{regions:[tabletop]});
    assert.equal(await page.locator('html').getAttribute('data-ios-duo-pose'),'tabletop','an active horizontal division selects tabletop placement');
    const tabletopScreen=await page.locator('#desktop').boundingBox();
    assert(tabletopScreen.y+tabletopScreen.height<=tabletop.y+1,'the remote display stays above the tabletop division');
    for(const selector of ['#desktop-paste','#take-control']) {
      const rect=await page.locator(selector).boundingBox();
      assert(rect && rect.y>=tabletop.y+tabletop.height && rect.y+rect.height<=inner.height,`${selector} belongs in the reachable lower half: ${JSON.stringify({rect,screen:tabletopScreen,division:tabletop})}`);
    }
    await page.screenshot({path:path.join(out,'tabletop-computer.png')});
    await relay({...inner,height:315},{regions:[tabletop]});
    for(const selector of ['#desktop-paste','#take-control']) {
      const rect=await page.locator(selector).boundingBox();
      assert(rect && rect.y>=0 && rect.y+rect.height<=315,`${selector} stays reachable when the keyboard covers the lower half`);
    }
    // On the inner display, a dialog or the other chat editor owns its focus.
    // Keyboard geometry must not redirect those keystrokes into the computer.
    await relay(inner);
    const editorEffects=await localInputEffects();
    await page.evaluate(()=>{
      const dialog=document.createElement('dialog');dialog.id='duo-control-dialog';
      dialog.innerHTML='<label>Dialog draft<input id="duo-dialog-input" value="Dialog edit"></label>';
      document.body.append(dialog);dialog.showModal();
      const input=document.querySelector('#duo-dialog-input');input.focus();input.setSelectionRange(input.value.length,input.value.length);
    });
    await relay({...inner,height:315});
    await page.evaluate(()=>window.__kindredComputerInput.focus(true));
    assert.equal(await page.evaluate(()=>document.activeElement.id),'duo-dialog-input','remote keyboard restoration must preserve a dialog editor');
    assert.equal(await page.locator('#duo-dialog-input').evaluate(node=>node.selectionStart),'Dialog edit'.length,'folding must retain the dialog caret');
    await page.keyboard.type(' retained');
    assert.equal(await page.locator('#duo-dialog-input').inputValue(),'Dialog edit retained');
    assert.deepEqual(await localInputEffects(),editorEffects,'dialog typing must not reach noVNC');
    await page.evaluate(()=>document.querySelector('#duo-control-dialog').remove());
    await relay(inner);
    await prompt.focus();
    await prompt.evaluate(node=>{
      if(node.setSelectionRange)node.setSelectionRange(node.value.length,node.value.length);
      else {const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
    });
    await page.keyboard.type(' chat');
    await relay({...inner,height:315});
    await page.evaluate(()=>window.__kindredComputerInput.focus(true));
    assert.equal(await prompt.evaluate(node=>document.activeElement===node),true,'a side-by-side chat editor must keep focus through keyboard changes');
    assert.equal(await prompt.evaluate(node=>node.value),draft+' chat');
    assert.deepEqual(await localInputEffects(),editorEffects,'chat typing must not reach the controlling side computer');
    await prompt.fill(draft);
    await prompt.evaluate(node=>node.blur());
    await relay(inner);
    await relay(outer);
    assert.equal((await ui()).iosComputer,'overlay','outer computer occupies its own page');
    await page.waitForFunction(()=>window.navigation.at(-1)?.target==='bot-chat');
    await settled();
    await action('back');
    await page.locator('#computer-panel').waitFor({state:'hidden'});
    await settled();
    assert.equal((await nav()).route,'bot-chat');
    await assertSinglePauseNotice();
    assert.equal(await prompt.evaluate(node=>node.value),draft);
    assert.equal(await page.evaluate(()=>__duoFixtureRFB===retainedDuoRFB && __duoFixtureRFB.disconnects===0),true,'native back must retain the computer connection');
    assert.equal(fixtureState().controlledBot,'vivienne','native back must not return bot control');
    assert.deepEqual(noInputEffects(),effectsBaseline,'folding and native back must not synthesize typing, pointer input or sends');
    assert.deepEqual(await localInputEffects(),localEffectsBaseline,'the live transport must receive no synthetic input');
    assert.equal(fixtureState().events.filter(event=>event.type==='takeover').length,controlBaseline.events.filter(event=>event.type==='takeover').length,'navigation must not change control ownership');
    await action('computer');
    await page.waitForFunction(()=>!document.querySelector('#computer-panel').hidden && document.querySelector('#computer-panel').classList.contains('is-controlling'));
    await settled();
    assert.equal(fixtureState().events.filter(event=>event.type==='computer-session').length,controlBaseline.events.filter(event=>event.type==='computer-session').length,'reopening must reuse the live connection');

    // Deliberately stale mapping stays blocked until the actual canvas fits.
    await page.evaluate(()=>{
      const rfb=window.__duoFixtureRFB;
      window.duoOriginalFit=rfb.fit.bind(rfb);rfb.fit=()=>{};
      rfb._display.scale*=2;
      window.dispatchEvent(new Event('kindred-native-geometry'));
    });
    await page.waitForFunction(()=>document.querySelector('#app').dataset.mobileResizing==='true');
    const blockedEffects=noInputEffects(),blockedLocalEffects=await localInputEffects();
    await page.locator('#desktop canvas:not(.desktop-glass)').dispatchEvent('pointerdown',{bubbles:true,clientX:40,clientY:120});
    await page.locator('#desktop canvas:not(.desktop-glass)').dispatchEvent('keydown',{bubbles:true,key:'a',code:'KeyA',keyCode:65,which:65});
    await action('back');
    // Legacy close animations used to hide the pane after the initial check.
    await page.waitForTimeout(350);
    assert(await page.locator('#computer-panel').isVisible(),'native back must defer while the transform is invalid');
    assert.equal(await page.evaluate(()=>__duoFixtureRFB.disconnects),0,'denied Back must not invoke the desktop close callback');
    assert.deepEqual(noInputEffects(),blockedEffects,'invalid geometry must block remote input');
    assert.deepEqual(await localInputEffects(),blockedLocalEffects,'capture-phase guards must stop real noVNC listeners');
    await page.evaluate(()=>{__duoFixtureRFB.fit=window.duoOriginalFit;__duoFixtureRFB.fit();window.dispatchEvent(new Event('kindred-native-geometry'));});
    await settled();
    assert.deepEqual(noInputEffects(),blockedEffects,'settling must not replay rejected input');
    assert.deepEqual(await localInputEffects(),blockedLocalEffects,'settling must not replay transport input');

    // A fold invalidates an in-flight native edge gesture. Its stale completion
    // must not navigate, return control, or send any input in the resized view.
    const gesture=await page.evaluate(()=>{
      getSelection().removeAllRanges();
      const message={id:crypto.randomUUID(),revision:window.navigation.at(-1).revision,phase:'begin',progress:0,x:5,y:150};
      return {message,accepted:window.__KINDRED_EDGE_BACK(message)};
    });
    assert.equal(gesture.accepted,true,'the outer computer accepts a native edge gesture');
    await relay(inner);
    assert.equal(await page.evaluate(message=>window.__KINDRED_EDGE_BACK({...message,phase:'finish',progress:1,commit:true}),gesture.message),false,'unfolding rejects the old gesture revision');
    assert(await page.locator('#computer-panel').isVisible(),'unfolding during the gesture must retain the computer pane');
    assert.equal(await page.locator('#app').evaluate(node=>node.classList.contains('ios-edge-preview')),false,'resize must remove the cancelled gesture preview');
    assert.equal(fixtureState().controlledBot,'vivienne');
    assert.deepEqual(await localInputEffects(),blockedLocalEffects);
    await action('back'); await page.locator('#computer-panel').waitFor({state:'hidden'});await settled();

    // The trusted bridge emits bounded title/route data; unknown actions do nothing.
    await page.locator('.bot-heading strong').evaluate(node=>node.textContent='D'.repeat(300));
    await page.waitForFunction(()=>window.accountRequests.filter(value=>value.action==='duo-navigation').at(-1)?.title.length===160);
    assert.equal((await nav()).title,'D'.repeat(160));
    assert((await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='duo-navigation'))).every(value=>['chat-list','bot-chat','computer','details','artifacts','artifact','marketplace'].includes(value.route) && typeof value.listVisible==='boolean' && value.title.length<=160));
    await page.locator('.bot-heading strong').evaluate(node=>node.textContent='Vivienne');
    await page.waitForFunction(()=>window.accountRequests.filter(value=>value.action==='duo-navigation').at(-1)?.title==='Vivienne');
    const unknownBefore=fixtureState().events.length;
    await action('javascript:alert(1)');
    assert.equal(fixtureState().events.length,unknownBefore,'unknown toolbar actions must not produce effects');
    await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='duo-retained-dialog';dialog.innerHTML='<input value="Retained sheet value">';document.body.append(dialog);dialog.showModal();});
    await action('computer');
    assert(await page.locator('#computer-panel').isHidden(),'a modal blocks underlying toolbar navigation');
    await relay(inner);
    assert.equal(await page.locator('#duo-retained-dialog input').inputValue(),'Retained sheet value','modal content must survive unfolding');
    await page.evaluate(()=>document.querySelector('#duo-retained-dialog').remove());
    await relay({...inner,width:900},{insets:{top:0,right:21,bottom:0,left:12}});
    assert.equal(await page.locator('#app').evaluate(node=>getComputedStyle(node).paddingLeft),'12px');
    assert.equal(await page.locator('#app').evaluate(node=>getComputedStyle(node).paddingRight),'21px','asymmetric safe areas must remain independent');
    const appearanceEvidence=[];
    for(const reducedMotion of ['no-preference','reduce'])for(const theme of ['dark','light']) {
      await page.emulateMedia({colorScheme:theme,reducedMotion});
      // Save through the real preferences form so polling cannot restore the
      // fixture's previous theme over a synthetic CSS-only change.
      await action('settings');
      const themeControl=page.locator('#settings-dialog select[aria-label="Theme"]');
      await themeControl.waitFor({state:'visible'});
      await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/api/settings') && response.request().method()==='PUT'),
        themeControl.selectOption(theme)
      ]);
      const motionControl=page.getByRole('switch',{name:'Reduce motion',exact:true});
      if(await motionControl.isChecked()!==(reducedMotion==='reduce'))await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/api/settings') && response.request().method()==='PUT'),
        motionControl.setChecked(reducedMotion==='reduce')
      ]);
      await page.waitForFunction(({theme,reducedMotion})=>document.documentElement.dataset.theme===theme && document.documentElement.dataset.motion===(reducedMotion==='reduce'?'off':'on'),{theme,reducedMotion});
      await page.getByRole('button',{name:'Close settings sheet',exact:true}).click();
      await page.locator('#settings-dialog').waitFor({state:'hidden'});await settled();
      await relay(outer);
      await action('computer');
      await page.waitForFunction(()=>!document.querySelector('#computer-panel').hidden);
      await settled();
      await relay(inner,{regions:[tabletop]});
      for(const selector of ['#desktop-paste','#take-control']) {
        const rect=await page.locator(selector).boundingBox();
        assert(rect && rect.y+rect.height<=inner.height,`${theme}/${reducedMotion}: computer controls stay reachable`);
      }
      assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches),reducedMotion==='reduce');
      assert.equal(await page.evaluate(()=>__duoFixtureRFB===retainedDuoRFB && __duoFixtureRFB.disconnects===0),true,'appearance and motion changes must retain the remote connection');
      await action('back');await page.locator('#computer-panel').waitFor({state:'hidden'});await settled();
      await assertSinglePauseNotice();
      assert.equal(await prompt.evaluate(node=>node.value),draft);
      const colors=await page.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color}));
      assert.notEqual(colors.body,colors.text,'light/dark content must have distinct foreground and background');
      appearanceEvidence.push({theme,reducedMotion,...colors});
      await page.screenshot({path:path.join(out,`${theme}-${reducedMotion}-fold-return.png`)});
    }
    assert.notEqual(appearanceEvidence[0].body,appearanceEvidence[1].body,'the light and dark backgrounds must actually change');
    // Use the same system-text event as the native host. Large text must grow
    // the tag and its measured clearance without reloading the conversation.
    const largeTextLoad=(await ui()).loadID;
    await relay(inner);
    for(const scale of [2,3.1176470588235294]) {
      await page.evaluate(scale=>{
        window.__KINDRED_SYSTEM_TEXT_SCALE=scale;
        window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}}));
      },scale);
      await settled();
      const metrics=await page.evaluate(()=>{
        const tag=document.querySelector('.bot-heading'),header=document.querySelector('.conversation-header'),conversation=document.querySelector('.conversation');
        return {font:parseFloat(getComputedStyle(tag.querySelector('strong')).fontSize),line:parseFloat(getComputedStyle(tag.querySelector('strong')).lineHeight),tag:tag.getBoundingClientRect().toJSON(),header:header.getBoundingClientRect().toJSON(),clearance:parseFloat(getComputedStyle(conversation).getPropertyValue('--ios-chat-top'))};
      });
      assert(Math.abs(metrics.font-15*scale)<.1 && Math.abs(metrics.line-20*scale)<.1,'the Duo bot tag must honor Dynamic Type once');
      assert(metrics.tag.height>=44 && metrics.header.y+metrics.header.height>=metrics.tag.y+metrics.tag.height+9,'the enlarged tag must fit inside the reserved header clearance');
      assert(metrics.clearance>=metrics.header.height-1,'message clearance must grow with the tag');
      assert.equal((await ui()).loadID,largeTextLoad,'changing Dynamic Type must not reload the conversation');
      assert.equal(await prompt.evaluate(node=>node.value),draft);
      await page.locator('#content').evaluate(area=>{area.scrollTop=area.scrollHeight;area.dispatchEvent(new Event('scroll'));});
      await settled();
      const bottom=await page.locator('#content').evaluate(area=>[...area.children].filter(node=>node.dataset.message||node.dataset.run).at(-1)?.getBoundingClientRect().bottom);
      const largeComposer=await page.locator('#composer-area').boundingBox();
      assert(bottom<=largeComposer.y-7,'large-text messages must scroll above the composer');
      await page.screenshot({path:path.join(out,`dynamic-text-${scale.toFixed(2)}.png`)});
    }
    await page.evaluate(()=>{window.__KINDRED_SYSTEM_TEXT_SCALE=1;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}}));});
    await relay(outer);
    const smallTag=await page.locator('.bot-heading').boundingBox();
    const adjacentCamera={kind:'occlusion',x:smallTag.x+smallTag.width+5,y:0,width:24,height:40};
    await relay(outer,{regions:[adjacentCamera]});
    await page.evaluate(()=>{window.__KINDRED_SYSTEM_TEXT_SCALE=2;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:2}}));});
    await settled();
    const growingTag=await page.locator('.bot-heading').boundingBox();
    assert(growingTag.x+growingTag.width<=adjacentCamera.x || growingTag.x>=adjacentCamera.x+adjacentCamera.width || growingTag.y>=adjacentCamera.y+adjacentCamera.height+7,'a live text-size change must recheck active occlusions even when native geometry is unchanged');
    await page.evaluate(()=>{window.__KINDRED_SYSTEM_TEXT_SCALE=1;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}}));});
    await relay(inner);
    // Legacy servers lack stable bot IDs and can include a badge in the heading.
    await page.evaluate(()=>{
      const badge=document.createElement('span');badge.textContent='Primary bot';badge.id='duo-legacy-heading-badge';document.querySelector('#heading').append(badge);
      document.querySelector('#queue-status').removeAttribute('data-control-bot-id');
      for(const row of document.querySelectorAll('#control-notice .control-notice-row'))row.removeAttribute('data-control-bot-id');
    });
    await settled();await assertSinglePauseNotice();
    await page.evaluate(()=>document.querySelector('#duo-legacy-heading-badge').remove());
    const releasesBefore=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length;
    await page.getByRole('button',{name:'Return control to Vivienne',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#control-notice').hidden && document.querySelector('#queue-status').hidden);
    assert.equal(fixtureState().controlledBot,null,'the surviving pause action must return control to the intended bot');
    const releases=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled);
    assert.equal(releases.length,releasesBefore+1,'the pause action must release control exactly once');
    assert.equal(releases.at(-1).botID,'vivienne');
    // Exercise a real down/up on Return while the native textarea owns focus.
    // A pointer-down blur requests keyboard restoration and can move the
    // button out from under the finger before its click. The host's keyboard
    // bounds are relayed here; actual keyboard animation is checked in iOS.
    await relay(outer);
    await action('computer');
    await page.locator('#computer-panel').waitFor({state:'visible'});await settled();
    await page.locator('#take-control').click();
    await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling') && document.activeElement.id==='ios-computer-input');
    await relay({...outer,height:315});
    const returnButton=page.locator('#take-control');
    await assertHitTarget(returnButton);
    const returnBox=await returnButton.boundingBox();
    assert(returnBox.y+returnBox.height<=315,'Return control remains above the relayed keyboard');
    const pointerReleasesBefore=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length;
    const pointerInputBefore=await localInputEffects();
    await page.evaluate(()=>{
      window.duoToolbarRFB=window.__duoFixtureRFB;
      window.duoToolbarBlurCount=0;
      document.querySelector('#ios-computer-input').addEventListener('blur',()=>window.duoToolbarBlurCount++);
      window.duoKeyboardRequestsBefore=window.accountRequests.filter(value=>value.action==='computer-keyboard').length;
    });
    const returnX=returnBox.x+returnBox.width/2,returnY=returnBox.y+returnBox.height/2;
    await page.mouse.move(returnX,returnY);await page.mouse.down();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'ios-computer-input','toolbar pointer-down must retain the native text input until its action click');
    assert.equal(await page.evaluate(()=>window.duoToolbarBlurCount),0,'toolbar pointer-down must not begin keyboard hide/restore');
    assert.equal(await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='computer-keyboard').length===window.duoKeyboardRequestsBefore),true,'pointer-down must not request a keyboard reopen');
    assert.equal(fixtureState().controlledBot,'vivienne','Return control must wait for the actual click');
    const downBox=await returnButton.boundingBox();
    assert(Math.abs(downBox.y-returnBox.y)<1,'the Return target must not move between down and up');
    await page.mouse.up();
    await page.waitForFunction(()=>!document.querySelector('#computer-panel').classList.contains('is-controlling'));
    const pointerReleases=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled);
    assert.equal(fixtureState().controlledBot,null,'the real toolbar click must release control');
    assert.equal(pointerReleases.length,pointerReleasesBefore+1,'the real toolbar click must release control exactly once');
    assert.equal(pointerReleases.at(-1).botID,'vivienne');
    assert.notEqual(await page.evaluate(()=>document.activeElement.id),'ios-computer-input','returning control must dismiss native computer input');
    await page.waitForFunction(()=>window.__duoFixtureRFB?.viewOnly && document.querySelector('#desktop-mode').textContent.includes('Watching'));
    assert.deepEqual(await page.evaluate(()=>({keys:duoToolbarRFB.keys.slice(),keyEvents:duoToolbarRFB.keyEvents.slice(),pointer:duoToolbarRFB.pointer.slice()})),pointerInputBefore,'a toolbar control tap must not type or click on the computer');

    await page.locator('#take-control').click();
    await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling') && document.activeElement.id==='ios-computer-input');
    await settled();
    const touchReleasesBefore=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length;
    const touchInputBefore=await localInputEffects();
    let touchBox=await returnButton.boundingBox(),touchPoint={x:touchBox.x+touchBox.width/2,y:touchBox.y+touchBox.height/2};
    const touchPhase=(type,overrides={})=>returnButton.evaluate((button,init)=>{
      const target=init.target?document.querySelector(init.target):button;
      const event=new PointerEvent(init.type,{pointerType:'touch',pointerId:731,isPrimary:true,button:0,bubbles:true,cancelable:true,clientX:init.x,clientY:init.y,...init});
      target.dispatchEvent(event);
      return {prevented:event.defaultPrevented,active:document.activeElement.id};
    },{type,...touchPoint,...overrides});
    // Bounded touch activation rejects a drag, cancelled touch, wrong pointer,
    // secondary finger/button and a release on a different toolbar control.
    for(const rejected of ['movement','cancel','pointer','secondary','button','target']) {
      const down=await touchPhase('pointerdown',rejected==='secondary'?{isPrimary:false}:rejected==='button'?{button:2}:{});
      if(!['secondary','button'].includes(rejected))assert(down.prevented && down.active==='ios-computer-input',`${rejected}: touch-down must keep native input focused`);
      if(rejected==='cancel')await touchPhase('pointercancel');
      await touchPhase('pointerup',rejected==='movement'?{x:touchPoint.x+12}:rejected==='pointer'?{pointerId:732}:rejected==='target'?{target:'#desktop-paste'}:{});
      assert.equal(fixtureState().controlledBot,'vivienne',`${rejected}: rejected touch must retain control`);
      assert.equal(fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length,touchReleasesBefore,`${rejected}: rejected touch must not issue Return`);
    }
    await touchPhase('pointerdown');
    await relay(inner);
    await touchPhase('pointerup');
    assert.equal(fixtureState().controlledBot,'vivienne','folding must cancel a pending toolbar touch before its stale release');
    await relay({...outer,height:315});
    touchBox=await returnButton.boundingBox();touchPoint={x:touchBox.x+touchBox.width/2,y:touchBox.y+touchBox.height/2};
    await touchPhase('pointerdown');
    await action('back');await page.locator('#computer-panel').waitFor({state:'hidden'});await settled();
    await touchPhase('pointerup');
    assert.equal(fixtureState().controlledBot,'vivienne','a hidden computer must reject a pending toolbar release');
    await action('computer');
    await page.waitForFunction(()=>!document.querySelector('#computer-panel').hidden && document.activeElement.id==='ios-computer-input');
    await settled();
    assert.equal(fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length,touchReleasesBefore,'cancelled toolbar gestures must have no deferred release');
    assert.deepEqual(await localInputEffects(),touchInputBefore,'cancelled toolbar gestures must not reach the computer');
    await page.evaluate(()=>{
      window.duoTouchTrace=[];window.duoTouchClicks=[];window.duoTouchRFB=window.__duoFixtureRFB;
      document.querySelector('#take-control').addEventListener('click',event=>window.duoTouchClicks.push({trusted:event.isTrusted,detail:event.detail}));
      for(const type of ['pointerdown','pointerup'])document.addEventListener(type,event=>{
        // Return replaces its SVG synchronously while pointer-up is bubbling;
        // the event path retains the actual button after that child is removed.
        if(event.composedPath().some(node=>node instanceof Element && node.id==='take-control'))window.duoTouchTrace.push({type:event.type,pointerType:event.pointerType,trusted:event.isTrusted,primary:event.isPrimary,prevented:event.defaultPrevented,active:document.activeElement.id,at:performance.now()});
      });
    });
    touchBox=await returnButton.boundingBox();
    await page.touchscreen.tap(touchBox.x+touchBox.width/2,touchBox.y+touchBox.height/2);
    await page.waitForFunction(()=>!document.querySelector('#computer-panel').classList.contains('is-controlling') && !document.querySelector('#take-control').disabled && window.__duoFixtureRFB?.viewOnly && document.querySelector('#desktop-mode').textContent.includes('Watching'));
    const touchTrace=await page.evaluate(()=>window.duoTouchTrace);
    assert.deepEqual(touchTrace.map(event=>[event.type,event.pointerType,event.trusted,event.primary]),[['pointerdown','touch',true,true],['pointerup','touch',true,true]],'the real touchscreen must exercise trusted touch pointer events');
    assert(touchTrace[0].prevented && touchTrace[0].active==='ios-computer-input','a trusted touch-down must preserve the native keyboard focus');
    assert.deepEqual(await page.evaluate(()=>window.duoTouchClicks),[{trusted:false,detail:0}],'touch release must activate exactly once without relying on a compatibility click');
    assert.equal(fixtureState().controlledBot,null,'a real touchscreen Return must release control');
    const touchReleases=fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled);
    assert.equal(touchReleases.length,touchReleasesBefore+1,'a real touchscreen Return must release exactly once');
    assert.equal(touchReleases.at(-1).botID,'vivienne');
    assert.notEqual(await page.evaluate(()=>document.activeElement.id),'ios-computer-input','touch Return must dismiss native computer input');
    assert.deepEqual(await page.evaluate(()=>({keys:duoTouchRFB.keys.slice(),keyEvents:duoTouchRFB.keyEvents.slice(),pointer:duoTouchRFB.pointer.slice()})),touchInputBefore,'touch Return must not type or click on the computer');
    // A trusted mouse click models a delayed compatibility click. It must be
    // swallowed before the button handler can turn Return into Take control.
    assert(await page.evaluate(()=>performance.now()-duoTouchTrace.at(-1).at<600),'the compatibility-click probe must occur within the touch suppression window');
    const compatibleBox=await returnButton.boundingBox();
    await page.mouse.click(compatibleBox.x+compatibleBox.width/2,compatibleBox.y+compatibleBox.height/2);
    await page.waitForTimeout(80);
    assert.deepEqual(await page.evaluate(()=>window.duoTouchClicks),[{trusted:false,detail:0}],'a trusted compatibility click must not reach the button handler twice');
    assert.equal(fixtureState().controlledBot,null,'a compatibility click must not retake control');
    assert.equal(fixtureState().events.filter(event=>event.type==='takeover' && !event.enabled).length,touchReleasesBefore+1,'compatibility suppression must preserve the single release');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,engine:'webkit',outer:true,innerThreePanes:true,nativeDetailsGear:true,reverseSettingsExit:true,previewSafeGlassControls:true,pointerPaneResizeHideRestore:true,foldCancelsPaneDrag:true,outerNormalizesMaximize:true,bookDivision:true,asymmetricBookCoordinates:true,tabletop:true,activeOcclusion:true,keyboardLayout:true,dialogAndChatFocusRetained:true,singlePauseNoticeAndRelease:true,controlledToolbarFocusAndReturnOnce:true,trustedTouchReturnOnce:true,touchCancellation:true,compatibilityClickSuppressed:true,selectedDraftBack:true,draftCaretAndAnchorRetained:true,computerConnectionRetained:true,invalidInputBlocked:true,interruptedGestureCancelled:true,nativeActionsBounded:true,lightDarkAndReduceMotion:true,dynamicTypeTagAndClearance:true,errors}));
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
