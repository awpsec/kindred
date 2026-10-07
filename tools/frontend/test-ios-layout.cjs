const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {webkit} = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const {server,token} = require('./fixtures/desktop.cjs');
const resources = path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({viewport:{width:402,height:780},hasTouch:true});
    await context.addInitScript(({token,css,js}) => {
      window.__KINDRED_MOBILE = true;
      window.__KINDRED_MOBILE_PLATFORM = 'ios';
      window.__KINDRED_IOS_APP_VERSION = 'iOS 0.1 (1)';
      window.__KINDRED_IOS_LAYOUT = {bottomInset:0,isSlab:true};
      window.__KINDRED_MOBILE_PROFILE = 'ios-fixture';
      window.__KINDRED_NATIVE_SESSION_BOOTSTRAP = true;
      window.accountRequests = [];
      window.webkit = {messageHandlers:{kindredAccounts:{postMessage:value => window.accountRequests.push(value)},kindredNavigation:{postMessage:()=>{}}}};
      sessionStorage.setItem('kindred-token',token);
      document.addEventListener('DOMContentLoaded',() => {
        const style = document.createElement('style');
        style.textContent = css; document.head.append(style);
        (0,eval)(js);
      },{once:true});
    },{token,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
    const page = await context.newPage();
    const openNativeMenu = async trigger => {
      const count = await page.evaluate(()=>window.accountRequests.length);
      await trigger.click();
      await page.waitForFunction(count=>window.accountRequests.slice(count).some(value=>value.action==='native-menu'),count);
      return page.evaluate(()=>window.accountRequests.filter(value=>value.action==='native-menu').at(-1));
    };
    const chooseNative = async (menu,title) => {
      const item=menu.items.find(item=>item.title===title);
      assert(item?.id,`native action ${title} must exist`);
      await page.evaluate(id=>window.__kindredNativeMenus.perform(id),item.id);
    };
    await page.route('**/api/composio', route => route.fulfill({json:{configured:false,apps:[]}}));
    const artifact = {id:'mobile-document',title:'Mobile notes',kind:'document',language:'markdown',source:'# Mobile notes\n\nA document for the iOS navigation check.',state:{},revision:1,updated:Math.floor(Date.now()/1000),created:Math.floor(Date.now()/1000),path:'/artifacts/mobile-document',chat_id:'dm-piper',created_by:'user'};
    const artifacts = [artifact];
    let artifactLoadGate = null;
    await page.route('**/api/workspace-artifact-folders', route => route.fulfill({json:[]}));
    await page.route('**/api/workspace-artifacts', route => {
      if (route.request().method()==='POST') {
        const next={...artifact,...route.request().postDataJSON(),id:'created-mobile-document',path:'/artifacts/created-mobile-document'};
        artifacts.unshift(next); return route.fulfill({json:next});
      }
      return route.fulfill({json:artifacts});
    });
    await page.route('**/api/workspace-artifacts/*', async route => {
      const item=artifacts.find(item=>route.request().url().endsWith('/'+item.id));
      if (!item) return route.fulfill({status:404,json:{error:'Missing fixture'}});
      if (artifactLoadGate && route.request().method()==='GET') await artifactLoadGate;
      if (route.request().method()==='PATCH') Object.assign(item,route.request().postDataJSON(),{revision:item.revision+1});
      return route.fulfill({json:item});
    });
    await page.route('**/api/chats', async route => {
      const response=await route.fetch();
      const chats=await response.json();
      return route.fulfill({json:[...chats,{id:'group-fixture',name:'Test group',members:['piper'],archived:false}]});
    });
    let computerControlled = false;
    await page.route('**/api/status*', route => route.fulfill({json:{version:'0.12.1',screen_bot_id:'piper',takeover:computerControlled,vm_enabled:true,control_pauses:computerControlled?[{bot_id:'piper',name:'Piper',control_id:'ios-pause',reason:'manual'}]:[]}}));
    await page.route('**/api/takeover', route => {
      computerControlled = route.request().postDataJSON().enabled;
      return route.fulfill({json:{enabled:computerControlled}});
    });
    await page.route('**/api/computer/session', route => route.fulfill({json:{ticket:'ios-fixture'}}));
    await page.route('**/vendor.js', route => {
      const real=fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'),'utf8').replace('et as RFB','FixtureRFB as RFB');
      const fixture=`class FixtureRFB extends EventTarget {
        constructor(host){super();this.host=host;const c=document.createElement('canvas');c.width=1600;c.height=1000;host.append(c);this._display={scale:1,_viewportLoc:{w:1600,h:1000}};setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}
        set scaleViewport(value){const c=this.host.querySelector('canvas:not(.desktop-glass)'),scale=Math.min(this.host.clientWidth/1600,this.host.clientHeight/1000);this._display.scale=scale;c.style.width=1600*scale+'px';c.style.height=1000*scale+'px';}
        sendKey(){} disconnect(){this.host.remove();}
      }\n`;
      return route.fulfill({contentType:'text/javascript',body:fixture+real});
    });
    const errors=[]; page.on('pageerror',error => errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
    const prompt=page.locator('#prompt'); await prompt.waitFor({state:'visible'});
    const viewport=await page.locator('meta[name=viewport]').getAttribute('content');
    assert(viewport.includes('minimum-scale=1, maximum-scale=1, user-scalable=no'),'the iOS app prevents double-tap and pinch page zoom');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{topInset:62,bottomInset:34,isSlab:true}})));
    const statusBlur=page.locator('#ios-status-blur');
    assert.equal((await statusBlur.boundingBox()).y,0,'status material covers the actual top of the viewport');
    assert.equal((await statusBlur.boundingBox()).height,80,'status blur fades below the hardware inset');
    assert(await statusBlur.evaluate(node=>getComputedStyle(node).backdropFilter.includes('blur')));
    for (const control of ['#mobile-menu','.bot-heading','#show-computer']) assert((await page.locator(control).boundingBox()).y>=62,'chat controls clear the status bar and notch');
    assert.equal((await page.locator('.conversation').boundingBox()).y,0,'chat extends behind status chrome');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{topInset:0,bottomInset:0,isSlab:true}})));
    assert.equal(await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='launch-ready').length),1,'cold-launch readiness waits for loaded conversations and signals once');
    // Exercise actual WebKit selection on a card's nested name/preview text,
    // alongside ordinary message text that must still be selectable.
    await page.evaluate(()=>{
      const probe=document.createElement('div');probe.id='ios-selection-probe';
      probe.style.cssText='position:fixed;left:20px;top:160px;width:350px;z-index:99999;background:white;color:black;';
      probe.innerHTML='<div class="sidebar" style="display:block;position:static;width:100%"><div class="nav-entry"><strong id="selection-card-name">Conversation title</strong><p id="selection-card-preview">Latest message preview</p></div><div class="pinned-entry"><span id="selection-pin-name">Pinned conversation</span></div></div><p id="selection-message">Selectable message content</p>';
      document.body.append(probe);
    });
    for(const id of ['selection-card-name','selection-card-preview','selection-pin-name']) {
      const text=page.locator('#'+id),box=await text.boundingBox();
      await page.mouse.dblclick(box.x+Math.min(30,box.width/2),box.y+box.height/2);
      assert.equal(await page.evaluate(()=>getSelection().toString()),'','conversation card text must not select during a press');
    }
    const messageBox=await page.locator('#selection-message').boundingBox();
    await page.mouse.dblclick(messageBox.x+30,messageBox.y+messageBox.height/2);
    assert((await page.evaluate(()=>getSelection().toString())).length>0,'message text must remain selectable');
    await page.evaluate(()=>{getSelection().removeAllRanges();document.querySelector('#ios-selection-probe').remove();});

    await prompt.fill('Keep the iOS draft through rotation.');
    assert(await prompt.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16),'focused composer must not trigger iOS text zoom');
    await page.locator('#mobile-menu').click();
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    assert.equal(sidebarBox.width,402,'conversations must be a separate full-width screen');
    assert(await page.locator('.conversation').evaluate(node=>node.inert));
    const newConversationMenu=await openNativeMenu(page.locator('#new-bot'));
    assert.deepEqual(newConversationMenu.items.map(item=>item.title),['New bot','New chat']);
    assert(await page.locator('#new-menu').isHidden());
    await page.evaluate(key=>window.__kindredNativeMenus.cancel(key),newConversationMenu.key);
    // UIKit asks for the current server menu, then invokes only the chosen
    // opaque action. Describing it must not pin, mute or archive anything.
    const conversationRequests=[];
    await page.route('**/api/bots/piper/pin', route => {
      conversationRequests.push({path:'pin',body:route.request().postDataJSON()});
      return route.fulfill({json:{}});
    });
    await page.route('**/api/notification-mutes/bot/piper', route => {
      conversationRequests.push({path:'mute',body:route.request().postDataJSON()});
      return route.fulfill({json:{}});
    });
    assert(await page.locator('.nav-pin').first().isHidden());
    assert(await page.locator('.nav-more').first().isHidden());
    await page.locator('.bot-link').first().dispatchEvent('pointerdown',{button:0});
    assert((await page.evaluate(()=>window.accountRequests)).some(value=>value.action==='conversation-target' && value.rect.length===4));
    const describe=()=>page.evaluate(()=>window.__kindredConversationMenu.describe('bots:piper'));
    const botMenu=await describe();
    assert.deepEqual(botMenu.items.map(item=>item.title),['Edit bot','Pin','Mute conversation','Instructions','Memory','Archive bot']);
    assert.deepEqual(botMenu.items[2].children.map(item=>item.title),['For 1 hour','For 24 hours','Indefinitely']);
    assert.equal(conversationRequests.length,0,'menu construction must never invoke server actions');
    assert.equal(await page.locator('body>.chat-context-menu').count(),0,'no duplicate desktop menu may remain');
    await describe();
    await page.evaluate(id=>window.__kindredConversationMenu.perform(id),botMenu.items[1].id);
    assert.equal(conversationRequests.length,0,'an expired menu must not invoke an action');
    const pinMenu=await describe();
    await Promise.all([
      page.waitForResponse(response=>response.url().includes('/bots/piper/pin')),
      page.evaluate(id=>window.__kindredConversationMenu.perform(id),pinMenu.items[1].id)
    ]);
    await page.waitForTimeout(150);
    assert.deepEqual(conversationRequests[0],{path:'pin',body:{pinned:true}});
    const muteMenu=await describe();
    await Promise.all([
      page.waitForResponse(response=>response.url().includes('/notification-mutes/bot/piper')),
      page.evaluate(id=>window.__kindredConversationMenu.perform(id),muteMenu.items[2].children[0].id)
    ]);
    await page.waitForTimeout(150);
    assert.deepEqual(conversationRequests[1],{path:'mute',body:{seconds:3600}});
    const chatKey=await page.locator('.nav-entry [data-sidebar-kind="chats"]').first().getAttribute('data-sidebar-id');
    const chatMenu=await page.evaluate(key=>window.__kindredConversationMenu.describe(key),'chats:'+chatKey);
    assert(chatMenu.items.some(item=>item.title==='Chat settings'),'group conversations must keep their own actions');
    const profileBox=await page.locator('#ios-accounts').boundingBox(),moreBox=await page.locator('#ios-library-more').boundingBox(),searchBox=await page.locator('#ios-search').boundingBox();
    assert(moreBox.x>=profileBox.x+profileBox.width && moreBox.x+moreBox.width<=searchBox.x,'More belongs immediately to the right of the profile, before search');
    assert(await page.locator('.sidebar-bottom #artifacts-button').isHidden());
    assert(await page.locator('.sidebar-bottom #marketplace-button').isHidden());
    const libraryMenu=await openNativeMenu(page.getByRole('button',{name:'More',exact:true}));
    assert.equal(libraryMenu.title,'','library menu shows only its destination buttons');
    assert.equal(libraryMenu.items.length,2);
    assert(await page.getByRole('menu',{name:'More',exact:true}).isHidden(),'desktop More popover is suppressed');
    await chooseNative(libraryMenu,'Marketplace');
    await page.locator('#marketplace-dialog').waitFor({state:'visible'});
    assert(await page.locator('#ios-library-menu').isHidden(),'selecting a destination dismisses the menu');
    await page.locator('#marketplace-dialog').getByRole('button',{name:'Close',exact:true}).click();
    await chooseNative(await openNativeMenu(page.getByRole('button',{name:'More',exact:true})),'Artifacts');
    await page.waitForURL('**/artifacts');
    await page.locator('.artifact-studio').waitFor({state:'visible'});
    assert(await page.locator('#ios-library-menu').isHidden());
    const library=page.locator('.artifact-studio-library'),workbench=page.locator('.artifact-workbench');
    await page.locator('[data-artifact-id="mobile-document"]').waitFor({state:'visible'});
    const menuCount=await page.evaluate(()=>window.accountRequests.length);
    await page.locator('[data-artifact-id="mobile-document"]').dispatchEvent('contextmenu',{bubbles:true,clientX:50,clientY:160});
    await page.waitForFunction(count=>window.accountRequests.slice(count).some(value=>value.action==='native-menu'),menuCount);
    const artifactActions=await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='native-menu').at(-1));
    assert(artifactActions.items.some(item=>item.title==='Rename'));
    assert(!artifactActions.items.some(item=>/library$/.test(item.title)),'mobile menus omit desktop pane pinning');
    assert(await page.locator('.artifact-context-menu').isHidden());
    await page.evaluate(key=>window.__kindredNativeMenus.cancel(key),artifactActions.key);
    const beforeArtifactPress=await page.evaluate(()=>window.accountRequests.length);
    const artifactPress=await page.evaluate(()=>window.__kindredNativeMenus.describeArtifact('mobile-document'));
    assert(artifactPress.items.some(item=>item.title==='Pin artifact'));
    assert.equal(await page.evaluate(count=>window.accountRequests.slice(count).filter(value=>value.action==='native-menu').length,beforeArtifactPress),0,'native press menu must not also open a tap action sheet');
    await chooseNative(artifactPress,'Pin artifact');
    assert(await page.locator('[data-artifact-id="mobile-document"] .artifact-item-pin').isVisible(),'native artifact action preserves the server callback');
    assert.equal((await library.boundingBox()).width,402,'artifact list occupies a complete page');
    assert(await workbench.isHidden());
    assert(await workbench.evaluate(node=>node.inert));
    assert(await page.locator('.artifact-studio-library-brand').isHidden());
    assert.equal(await library.evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px');
    const artifactChats=page.getByRole('button',{name:'Back to chats',exact:true});
    const artifactSearch=page.getByRole('button',{name:'Search artifacts',exact:true});
    const artifactAdd=page.getByRole('button',{name:'Add artifact',exact:true});
    const a=await artifactChats.boundingBox(),s=await artifactSearch.boundingBox(),c=await artifactAdd.boundingBox();
    assert(a.x<s.x && s.x<c.x && c.width===44,'artifact navigation: chats left, search then add right');
    await artifactSearch.click();
    await page.getByRole('searchbox',{name:'Search artifacts',exact:true}).fill('no matching item');
    await page.getByText('No matching artifacts.',{exact:true}).waitFor({state:'visible'});
    await artifactSearch.click();
    await page.locator('[data-artifact-id="mobile-document"]').click();
    await page.waitForURL('**/artifacts/mobile-document');
    await page.getByRole('textbox',{name:'Document title',exact:true}).waitFor({state:'visible'});
    assert(await library.isHidden());
    assert(await library.evaluate(node=>node.inert));
    assert.equal((await workbench.boundingBox()).width,402,'document uses the entire page without a drawer gutter');
    assert(await page.locator('.artifact-workbench-actions [aria-label="Download"]').isHidden(),'iOS artifacts do not offer Download');
    for (const label of ['Refresh document']) {
      const button=page.getByRole('button',{name:label,exact:true});
      const style=await button.evaluate(node=>({radius:getComputedStyle(node).borderRadius,blur:getComputedStyle(node).backdropFilter,border:getComputedStyle(node).borderTopWidth}));
      assert.equal(style.radius,'50%'); assert.equal(style.border,'1px'); assert(style.blur.includes('blur'),'document actions share the glass circle styling');
      const box=await button.boundingBox(); assert(box.width===44 && box.height===44);
    }
    assert(await page.locator('.artifact-workbench-actions [aria-label="Edit document"]').isHidden(),'source editing belongs to desktop');
    await page.locator('.artifact-workbench-actions [aria-label="Edit document"]').evaluate(button=>button.click());
    assert.equal(await page.locator('.artifact-source-editor').count(),0,'hidden source editing cannot be invoked programmatically');
    assert(await page.locator('.workspace-artifact-actions>button:first-child').isHidden(),'inline artifact Edit also belongs to desktop');
    const documentPreview=await page.locator('.workspace-artifact-stage').innerText();
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    await page.waitForURL('**/artifacts');
    assert(await workbench.isHidden());
    await page.locator('[data-artifact-id="mobile-document"]').click();
    assert.equal(await page.locator('.workspace-artifact-stage').innerText(),documentPreview,'returning through the list retains the preview');
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    const createMenu=await openNativeMenu(artifactAdd);
    assert.deepEqual(createMenu.items.map(item=>item.title),['New doc','New sheet','New slides','New app','New folder']);
    await chooseNative(createMenu,'New doc');
    await page.getByRole('textbox',{name:'Artifact title',exact:true}).fill('Created on mobile');
    await page.locator('.artifact-new-dialog').getByRole('button',{name:'Create',exact:true}).click();
    await page.waitForURL('**/artifacts/created-mobile-document');
    await page.waitForFunction(()=>document.querySelector('.artifact-title-input')?.value==='Created on mobile');
    await page.setViewportSize({width:874,height:350});
    assert.equal((await workbench.boundingBox()).width,874);
    assert(await library.isHidden());
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    assert.equal((await library.boundingBox()).width,874,'rotation keeps the list as a separate page');
    await page.setViewportSize({width:402,height:780});
    let releaseArtifact;
    artifactLoadGate = new Promise(resolve=>releaseArtifact=resolve);
    await page.locator('[data-artifact-id="mobile-document"]').click();
    await page.waitForURL('**/artifacts/mobile-document');
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    artifactLoadGate = null; releaseArtifact();
    await page.waitForFunction(()=>document.querySelector('.artifact-title-input')?.value==='Mobile notes');
    assert(new URL(page.url()).pathname==='/artifacts' && await workbench.isHidden(),'a delayed document load must not reopen a page after Back');
    await artifactChats.click();
    await page.locator('.artifact-studio').waitFor({state:'detached'});
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.keyboard.press('Escape');
    await page.locator('#ios-library-menu').waitFor({state:'hidden'});
    await page.locator('#ios-accounts').click();
    await page.locator('#settings-dialog').waitFor({state:'visible'});
    await page.waitForTimeout(280);
    const settingsBox=await page.locator('#settings-dialog').boundingBox();
    assert(settingsBox.y>0 && Math.abs(settingsBox.y+settingsBox.height-780)<2,'settings must rise from the bottom while leaving the list behind');
    assert(await page.locator('#settings-button').isHidden(),'settings entry belongs to the profile circle');
    assert(await page.locator('#ios-settings-account').isVisible());
    await page.locator('[data-client-version]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-client-version]').innerText(),'iOS 0.1 (1)');
    assert(await page.getByText('iOS app on this device',{exact:true}).isVisible());
    assert(await page.locator('[data-server-version]').isVisible());
    assert(await page.locator('.version-actions').isHidden(),'iOS must not expose the browser/server updater');
    assert(await page.locator('.dictation-settings').isHidden(),'iPhone speech input belongs to the system keyboard');
    await page.getByRole('button',{name:'Manage accounts',exact:true}).click();
    assert((await page.evaluate(()=>window.accountRequests)).some(value=>value.action==='open'));
    await page.getByRole('button',{name:'Close settings sheet',exact:true}).click();
    await page.locator('.bot-link').first().click();
    assert(await page.locator('#ios-accounts').isHidden());
    const composerMenu=await openNativeMenu(page.locator('#composer-actions'));
    assert.deepEqual(composerMenu.items.map(item=>item.title),['Attach files'],'mobile omits teaching from the composer too');
    assert(await page.locator('#composer-menu').isHidden(),'desktop attachment/teaching menu is suppressed');
    const chooser=page.waitForEvent('filechooser');
    await chooseNative(composerMenu,'Attach files');
    assert((await chooser).isMultiple(),'native action must still invoke the existing file chooser');
    await page.evaluate(id=>window.__kindredNativeMenus.perform(id),composerMenu.items[0].id);
    assert(await page.locator('#computer-panel').isHidden(),'an expired composer action must not open another screen');
    const queuedEditMenu=await page.evaluate(()=>{
      const group=document.querySelector('#content .message-group[data-message]');
      const button=document.createElement('button');button.dataset.messageAction='edit';button.textContent='Edit queued message';
      button.onclick=()=>window.iosQueuedEditOpened=true;group.querySelector('.message-actions').append(button);
      group.querySelector('.message-bubble').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'touch'}));
      const menu=window.__kindredMobileMessages.describe(group.dataset.mobileMessageKey);
      button.click();button.remove();return menu;
    });
    assert(!queuedEditMenu.items.some(item=>item.title==='Edit queued message'),'native message menus omit queued editing');
    assert.equal(await page.evaluate(()=>window.iosQueuedEditOpened),undefined,'queued editing cannot open its desktop composer from iOS');
    await page.evaluate(async()=>{
      const {fileCard}=await import('/artifacts.js');
      window.fileMenuReads=0;
      const card=fileCard({id:'ios-file-menu',name:'mobile-menu.txt',source_url:'https://drive.google.com/file/d/fixture'},
        {getBlob:async()=>{window.fileMenuReads++;return new Blob(['Mobile file preview'],{type:'text/plain'});},notice:()=>{},renderMarkdown:text=>text});
      card.id='ios-file-menu-probe';
      card.style.cssText='position:fixed;top:100px;left:12px;right:12px;z-index:20';
      document.body.append(card);
    });
    const fileMenu=await openNativeMenu(page.locator('#ios-file-menu-probe .deliverable-more'));
    assert.deepEqual(fileMenu.items.map(item=>item.title),['Preview','Open in Google Drive']);
    assert(await page.locator('#ios-file-menu-probe .deliverable-menu').isHidden());
    await chooseNative(fileMenu,'Preview');
    await page.waitForFunction(()=>window.fileMenuReads===1);
    await page.locator('.document-dialog').getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(()=>document.querySelector('#ios-file-menu-probe').remove());
    const avatarBox=await page.locator('#header-avatar').boundingBox();
    const headingBox=await page.locator('.bot-heading').boundingBox(),backBox=await page.locator('#mobile-menu').boundingBox();
    assert(Math.abs(headingBox.x+headingBox.width/2-201)<2,'avatar/name tag must be centered independently of side controls');
    const nameBox=await page.locator('.bot-heading strong').boundingBox();
    assert(avatarBox.x+avatarBox.width<=nameBox.x,'avatar belongs to the left of the name inside the tag');
    assert(Math.abs(headingBox.y-backBox.y)<2 && Math.abs(headingBox.height-backBox.height)<2,'tag and corner buttons share the same height and alignment');
    await prompt.fill('');
    await prompt.dispatchEvent('input');
    await page.waitForTimeout(200);
    assert((await page.locator('#composer').boundingBox()).height<=48,'default composer should stay compact');
    assert(await page.locator('#composer-hint').isHidden(),'iOS composer omits the provider logo');
    assert.equal(await page.locator('#composer').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),3,'provider column must be reclaimed for the message field');
    await prompt.fill('Keep the iOS draft through rotation.');
    // Keep native select defaults, without running desktop picker listeners.
    await page.evaluate(()=>{const select=document.createElement('select');select.id='ios-picker-test';select.innerHTML='<option>A</option><option>B</option>';document.body.append(select);});
    await page.waitForFunction(()=>document.querySelector('#ios-picker-test').dataset.themedSelect);
    await page.evaluate(()=>document.querySelector('#ios-picker-test').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0})));
    assert.equal(await page.locator('.themed-select-menu').count(),0);
    await page.evaluate(()=>document.querySelector('#ios-picker-test').remove());
    await page.evaluate(()=>{
      const select=document.createElement('select');select.id='ios-theme-test';
      select.innerHTML='<option value="system">Follow System</option><option value="dark">Dark</option><option value="light">Light</option>';
      document.body.append(select);select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    assert.equal(await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='appearance').at(-1).followsSystem),true,'Follow System must not force a native color scheme');
    await page.evaluate(()=>{const select=document.querySelector('#ios-theme-test');select.value='dark';select.dispatchEvent(new Event('change',{bubbles:true}));select.remove();});
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      await page.waitForTimeout(50);
      const appearance=await page.evaluate(()=>window.accountRequests.filter(value=>value.action==='appearance').at(-1));
      assert.equal(appearance.rgb[0]<128,theme==='dark','native safe areas must follow the page theme');
    }
    for (const size of [{width:402,height:780},{width:874,height:350},{width:874,height:120},{width:840,height:720},{width:402,height:460}]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(100);
      assert.equal(await prompt.innerText(),'Keep the iOS draft through rotation.');
      const box=await prompt.boundingBox();
      assert(box.x>=0 && box.x+box.width<=size.width+1 && box.y>=0 && box.y+box.height<=size.height+1,'composer must fit even with the landscape keyboard');
      const send=await page.locator('#send').boundingBox();
      assert(send.width>=44 && send.height>=44 && send.x+send.width<=size.width+1 && send.y+send.height<=size.height+1 && (send.x>=box.x+box.width-1 || send.y>=box.y+box.height-1),'send target must fit without overlapping the draft');
      const history=await page.locator('.conversation-history').boundingBox(),composer=await page.locator('#composer-area').boundingBox();
      assert(history.y<composer.y && history.y+history.height>=composer.y+composer.height-1,'messages should scroll behind the floating composer');
      const clearance=await page.locator('.messages').evaluate(node=>({bottom:parseFloat(getComputedStyle(node).paddingBottom),top:parseFloat(getComputedStyle(node).paddingTop)}));
      assert(clearance.bottom>=composer.height+10,'last message needs clearance above the floating composer');
      const header=await page.locator('.conversation-header').boundingBox();
      assert(clearance.top>=(header?.height||0),'first message needs clearance below the floating header');
      assert.equal(await page.locator('.conversation-header').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
      assert.equal(await page.locator('#composer-area').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
      if (size.height>180 && (size.width<=760 || size.height<=500)) {
        assert(await page.locator('.sidebar').evaluate(node=>node.inert));
        await page.locator('#mobile-menu').click();
        assert(await page.locator('.sidebar .bot-info').first().isVisible(),'landscape list must show conversation names');
        assert(!(await page.locator('.sidebar').evaluate(node=>node.inert)));
        assert(await page.locator('.conversation').isHidden());
        await page.locator('.bot-link').first().click();
        assert(await page.locator('.sidebar').evaluate(node=>node.inert));
      }
    }
    // iOS can shrink only visualViewport when the native host stays full size.
    await page.setViewportSize({width:874,height:350});
    await page.evaluate(()=>{
      Object.defineProperty(window.visualViewport,'height',{configurable:true,value:120});
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    assert(await page.locator('.conversation-header').isHidden());
    const keyboardComposer=await page.locator('#composer-area').boundingBox();
    assert(Math.abs(keyboardComposer.y+keyboardComposer.height-120)<2,'composer must stop at the visible keyboard boundary, without a second inset');
    await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
    // The physical app receives UIKit's actual height above the keyboard.
    // Transient focus/animation heights in visualViewport must not shrink it a
    // second time, or leave the composer stranded after dismissal/refocus.
    await page.setViewportSize({width:402,height:780});
    for (const height of [490,780,490,780]) {
      await page.evaluate(height=>{
        Object.defineProperty(window.visualViewport,'height',{configurable:true,value:180});
        window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{topInset:62,bottomInset:height===780?34:0,isSlab:true,viewportHeight:height,isPortrait:true}}));
        window.visualViewport.dispatchEvent(new Event('resize'));
      },height);
      const box=await page.locator('#composer-area').boundingBox();
      assert(Math.abs(box.y+box.height-height)<2,'native keyboard geometry wins over transient WebKit height');
    }
    await page.evaluate(()=>{delete window.visualViewport.height;window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{bottomInset:0,isSlab:true}}));});
    await page.setViewportSize({width:840,height:720});
    await page.locator('#ios-accounts').click();
    await page.locator('#settings-dialog').waitFor({state:'visible'});
    assert(await page.getByRole('button',{name:'Manage accounts',exact:true}).isVisible(),'Accounts entry must remain reachable on wider mobile screens');
    await page.getByRole('button',{name:'Close settings sheet',exact:true}).click();
    await page.setViewportSize({width:402,height:780});
    await page.locator('#bot-details').click();
    await page.locator('#details-panel').waitFor({state:'visible'});
    const avatarMenu=await openNativeMenu(page.locator('#details-panel .avatar-customize'));
    assert.deepEqual(avatarMenu.items.map(item=>item.title),['Shape','Color']);
    assert(avatarMenu.items.every(item=>item.children.some(child=>child.selected)),'avatar choices retain the selected shape/color');
    assert(await page.locator('#details-panel .avatar-popover').isHidden(),'desktop avatar flyout is suppressed');
    await page.evaluate(key=>window.__kindredNativeMenus.cancel(key),avatarMenu.key);
    assert.equal(await page.locator('#details-panel').evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px','bot details has no desktop divider');
    assert(Math.abs((await page.locator('#details-panel').boundingBox()).width-402)<1);
    await page.locator('#details-close').click();
    await page.locator('#show-computer').click();
    await page.locator('#computer-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#computer-panel').evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px','computer has no desktop divider');
    assert(Math.abs((await page.locator('#computer-panel').boundingBox()).width-402)<1);
    assert(await page.locator('#desktop-reconnect').isHidden());
    assert(await page.locator('#computer-settings-link').isHidden());
    assert(await page.locator('#desktop-paste').evaluate(node=>node.parentElement.matches('.desktop-toolbar')),'Paste belongs alongside control below the screen');
    assert(await page.locator('#ios-computer-input').evaluate(node=>node!==document.activeElement),'view-only screens do not raise the keyboard');
    await page.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='Watching live'&&!!document.querySelector('.desktop-canvas canvas:not(.desktop-glass)')&&!document.querySelector('#app').dataset.mobileResizing);
    await page.evaluate(()=>{
      const canvas=document.querySelector('.desktop-canvas canvas:not(.desktop-glass)');
      window.iosRemotePointerEvents=0;canvas.addEventListener('pointerdown',()=>window.iosRemotePointerEvents++);
    });
    await page.locator('.desktop-canvas canvas:not(.desktop-glass)').dispatchEvent('pointerdown',{button:0});
    assert.equal(await page.evaluate(()=>window.iosRemotePointerEvents),0,'watching screen taps cannot reach desktop expand/input');
    assert(!(await page.locator('#computer-panel').evaluate(node=>node.classList.contains('expanded'))),'watching screen taps do not expand');
    await page.locator('#take-control').click();
    await page.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('is-controlling')&&document.querySelector('#desktop-mode').textContent==='You have control'&&!!document.querySelector('.desktop-canvas canvas:not(.desktop-glass)')&&!document.querySelector('#app').dataset.mobileResizing);
    await page.evaluate(()=>{
      const canvas=document.querySelector('.desktop-canvas canvas:not(.desktop-glass)');
      window.iosRemoteKeys=[];canvas.addEventListener('keydown',event=>window.iosRemoteKeys.push(event.key));
      canvas.addEventListener('pointerdown',()=>window.iosRemotePointerEvents++);
    });
    assert(await page.locator('#ios-computer-input').evaluate(node=>node===document.activeElement));
    await page.locator('.desktop-canvas canvas:not(.desktop-glass)').dispatchEvent('pointerdown',{button:0});
    assert.equal(await page.evaluate(()=>window.iosRemotePointerEvents),1,'controlled taps reach the actual canvas');
    assert(!(await page.locator('#computer-panel').evaluate(node=>node.classList.contains('expanded'))),'controlled taps do not trigger desktop expansion');
    await page.setViewportSize({width:874,height:350});
    await page.evaluate(()=>{
      document.querySelector('#ios-computer-input').blur();
      window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{viewportHeight:350,isSlab:true,isPortrait:false}}));
      window.__kindredComputerInput.focus(true);
    });
    assert(await page.locator('#ios-computer-input').evaluate(node=>node!==document.activeElement),'remote keyboard is never focused in landscape');
    await page.setViewportSize({width:402,height:780});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{viewportHeight:780,isSlab:true,isPortrait:true}})));
    await page.waitForFunction(()=>document.querySelector('#ios-computer-input')===document.activeElement);
    assert(await page.locator('#ios-computer-input').evaluate(node=>node===document.activeElement),'portrait rotation restores remote typing');
    await page.evaluate(()=>{document.querySelector('#ios-computer-input').blur();window.__kindredComputerInput.focus(true);});
    assert(await page.locator('#ios-computer-input').evaluate(node=>node===document.activeElement),'dismissed keyboard can be restored while controlling');
    await page.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing);
    await page.evaluate(()=>{
      const input=document.querySelector('#ios-computer-input');input.value+='Hi é';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
      input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      input.dispatchEvent(new CompositionEvent('compositionstart'));input.value+='中';input.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText'}));input.dispatchEvent(new CompositionEvent('compositionend'));
    });
    assert.deepEqual(await page.evaluate(()=>window.iosRemoteKeys),['H','i',' ','é','Backspace','Enter','中'],'native text, delete, return and composed characters reach the remote keyboard');
    await page.setViewportSize({width:402,height:490});
    const portraitScreen=await page.locator('#desktop').boundingBox(),portraitActions=await page.locator('.desktop-toolbar').boundingBox();
    assert(portraitActions.y>=portraitScreen.y+portraitScreen.height-1,'actions remain below the top-aligned screen');
    assert(portraitActions.y+portraitActions.height<=490,'computer actions remain above the software keyboard');
    assert(await page.locator('#teach-task').isHidden(),'teaching is a desktop workflow');
    for (const id of ['desktop-paste','take-control']) {
      const action=page.locator('#'+id),bounds=await action.boundingBox();
      assert(Math.abs(bounds.height-44)<0.01); assert(Math.abs(bounds.width-44)<0.01,'computer actions are compact circular targets');
      assert(await action.getAttribute('aria-label'),'icon-only actions retain accessible names');
    }
    await page.locator('#take-control').click();
    await page.waitForFunction(()=>!document.querySelector('#computer-panel').classList.contains('is-controlling'));
    assert(await page.locator('#ios-computer-input').evaluate(node=>node!==document.activeElement),'returning control dismisses native entry');
    await page.setViewportSize({width:402,height:780});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{isSlab:true,bottomInset:0}})));
    assert(await page.locator('#computer-expand').isHidden(),'slab computer already occupies its own screen');
    assert.equal(await page.locator('#screen-picker span').first().evaluate(node=>getComputedStyle(node).webkitUserSelect),'none','screen picker label must not select text');
    const screens=await openNativeMenu(page.locator('#screen-picker'));
    assert(screens.items.some(item=>item.selected),'native screen menu retains the selected bot');
    assert(await page.locator('#screen-picker-menu').isHidden(),'desktop screen menu is suppressed');
    await page.evaluate(key=>window.__kindredNativeMenus.cancel(key),screens.key);
    await page.setViewportSize({width:874,height:350});
    await page.waitForTimeout(350);
    const desktop=await page.locator('#desktop').boundingBox(),computerActions=await page.locator('.desktop-toolbar').boundingBox();
    assert(desktop.x+desktop.width<=computerActions.x+1,'landscape resources and actions belong to the right of the computer');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{bottomInset:0,isSlab:false}})));
    assert(await page.locator('#computer-expand').isVisible(),'foldable/tablet computer retains expansion');
    await page.locator('#ios-computer-back').click();
    // Older servers use a textarea instead of the current contenteditable.
    await page.evaluate(()=>{const old=document.querySelector('#prompt');const textarea=document.createElement('textarea');textarea.id='prompt';old.replaceWith(textarea);});
    assert(await page.locator('#prompt').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
    // Exercise the actual server pause state, including the desktop UI's three
    // reminders. iOS presents one location and preserves the return API action.
    let paused=true,returnRequest;
    await page.route('**/api/status?*',route=>route.fulfill({json:{version:'0.12.1',screen_bot_id:'piper',takeover:paused,vm_enabled:true,control_pauses:paused?[{bot_id:'piper',name:'Piper',control_id:'ios-test-pause',reason:'manual',queued:0}]:[]}}));
    await page.route('**/api/takeover',route=>{returnRequest=route.request().postDataJSON();paused=false;return route.fulfill({json:{takeover:false}});});
    await page.setViewportSize({width:402,height:780});
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
    await page.locator('#queue-status.ios-control-paused').waitFor({state:'visible'});
    assert(await page.locator('#composer-caption').isHidden(),'pause warning below input is suppressed');
    assert.equal(await page.locator('#queue-status button svg').count(),1,'fallback reminder has a return icon');
    await page.locator('#show-computer').click();
    await page.locator('#ios-computer-back').click();
    await page.locator('#control-notice').waitFor({state:'visible'});
    assert(await page.locator('#queue-status').isHidden(),'same pause is not repeated above input');
    assert(await page.locator('.control-notice-heading').isHidden());
    assert(await page.locator('.control-notice-copy p').isHidden(),'desktop explanation is replaced by a compact paused label');
    const reminder=await page.locator('#control-notice').boundingBox(),composerBounds=await page.locator('#composer').boundingBox();
    assert(reminder.y>500 && reminder.y+reminder.height<=composerBounds.y,'pause reminder sits immediately above the composer');
    const returnAction=page.getByRole('button',{name:'Return control to Piper',exact:true});
    assert(Math.abs((await returnAction.boundingBox()).width-44)<0.01);
    await returnAction.click();
    await page.locator('#control-notice').waitFor({state:'hidden'});
    assert.deepEqual(returnRequest,{enabled:false,bot_id:'piper',control_id:'ios-test-pause'},'mobile action returns the correct bot and pause');
    assert(await page.locator('#queue-status').isHidden());
    // Real running-task UI: the first tap only reveals, outside taps hide, and
    // the second tap preserves the server's cancellation request.
    let cancellations=0;
    const run={id:'ios-working',bot_id:'piper',chat_id:'dm-piper',status:'running',created:Math.floor(Date.now()/1000),prompt:'Mobile interruption check',output:''};
    await page.route('**/api/runs',route=>route.fulfill({json:[run]}));
    await page.route('**/api/runs/ios-working',route=>route.fulfill({json:{run,events:[],attachments:[],approvals:[]}}));
    await page.route('**/api/activity',route=>route.fulfill({json:{piper:{status:'running',run_id:run.id,shape:'working',started_at:run.created,server_time:run.created}}}));
    await page.route('**/api/runs/ios-working/cancel',route=>{cancellations++;return route.fulfill({json:{}});});
    await page.reload();
    const work=page.locator('.work-line'),stop=work.locator('.work-stop');
    await work.waitFor({state:'visible'});
    assert.equal(await stop.evaluate(node=>getComputedStyle(node).pointerEvents),'none');
    assert.equal(await stop.getAttribute('tabindex'),'-1');
    await work.locator('.work-label').click();
    assert.equal(cancellations,0,'status tap does not cancel');
    assert.equal(await stop.getAttribute('tabindex'),'0');
    await page.locator('#prompt').click();
    assert.equal(await stop.evaluate(node=>getComputedStyle(node).pointerEvents),'none','outside tap hides the stop action');
    await work.locator('.work-label').click();
    await stop.click();
    assert.equal(cancellations,1,'revealed stop invokes exactly one cancellation');
    // The bundled iOS adapter also covers older servers, preserving the
    // preference save while replacing the browser-only warning.
    await page.locator('#mobile-menu').click();
    await page.locator('#ios-accounts').click();
    const notifications=page.locator('#settings-content select[aria-label="Notifications"]');
    await notifications.waitFor({state:'visible'});
    await notifications.selectOption('none');
    await notifications.selectOption('all');
    await page.waitForFunction(()=>window.accountRequests.some(value=>value.action==='notification-settings'));
    assert((await page.locator('#notice').innerText()).includes('Personal Team'),'iOS explains the real signing limitation');
    assert(!(await page.locator('#notice').innerText()).includes('Use the desktop app'));
    assert.deepEqual(errors.filter(error=>!error.startsWith('ResizeObserver loop')),[]);
    console.log('iOS layout: native composer/file/avatar/screen/new/library/artifact menus and actions, conversation pin/mute, artifact navigation/drafts, native selects/theme and rotation/keyboard bounds passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
