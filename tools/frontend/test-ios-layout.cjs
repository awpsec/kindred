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
      window.__KINDRED_IOS_APP_VERSION = 'iOS 0.1 (1)';
      window.__KINDRED_IOS_LAYOUT = {bottomInset:0,isSlab:true};
      window.__KINDRED_MOBILE_PROFILE = 'ios-fixture';
      window.__KINDRED_NATIVE_SESSION_BOOTSTRAP = true;
      window.accountRequests = [];
      window.webkit = {messageHandlers:{kindredAccounts:{postMessage:value => window.accountRequests.push(value)}}};
      sessionStorage.setItem('kindred-token',token);
      document.addEventListener('DOMContentLoaded',() => {
        const style = document.createElement('style');
        style.textContent = css; document.head.append(style);
        (0,eval)(js);
      },{once:true});
    },{token,css:fs.readFileSync(path.join(resources,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(resources,'MobileLayout.js'),'utf8')});
    const page = await context.newPage();
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
    const errors=[]; page.on('pageerror',error => errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
    const prompt=page.locator('#prompt'); await prompt.waitFor({state:'visible'});
    const viewport=await page.locator('meta[name=viewport]').getAttribute('content');
    assert(viewport.includes('minimum-scale=1, maximum-scale=1, user-scalable=no'),'the iOS app prevents double-tap and pinch page zoom');
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
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('menu',{name:'More',exact:true}).waitFor({state:'visible'});
    assert.equal(await page.getByRole('menuitem').count(),2);
    await page.getByRole('menuitem',{name:'Marketplace',exact:true}).click();
    await page.locator('#marketplace-dialog').waitFor({state:'visible'});
    assert(await page.locator('#ios-library-menu').isHidden(),'selecting a destination dismisses the menu');
    await page.locator('#marketplace-dialog').getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('menuitem',{name:'Artifacts',exact:true}).click();
    await page.waitForURL('**/artifacts');
    await page.locator('.artifact-studio').waitFor({state:'visible'});
    assert(await page.locator('#ios-library-menu').isHidden());
    const library=page.locator('.artifact-studio-library'),workbench=page.locator('.artifact-workbench');
    await page.locator('[data-artifact-id="mobile-document"]').waitFor({state:'visible'});
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
    for (const label of ['Refresh document','Edit document']) {
      const button=page.getByRole('button',{name:label,exact:true});
      const style=await button.evaluate(node=>({radius:getComputedStyle(node).borderRadius,blur:getComputedStyle(node).backdropFilter,border:getComputedStyle(node).borderTopWidth}));
      assert.equal(style.radius,'50%'); assert.equal(style.border,'1px'); assert(style.blur.includes('blur'),'document actions share the glass circle styling');
      const box=await button.boundingBox(); assert(box.width===44 && box.height===44);
    }
    await page.getByRole('button',{name:'Edit document',exact:true}).click();
    const sourceEditor=page.getByRole('textbox',{name:'Document',exact:true});
    await sourceEditor.fill('Unsaved mobile draft');
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    await page.waitForURL('**/artifacts');
    assert(await workbench.isHidden());
    await page.locator('[data-artifact-id="mobile-document"]').click();
    assert.equal(await sourceEditor.inputValue(),'Unsaved mobile draft','returning through the list preserves the editor and unsaved text');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByRole('button',{name:'Back to artifacts',exact:true}).click();
    await artifactAdd.click();
    await page.getByRole('menuitem',{name:'New doc',exact:true}).click();
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
    await page.setViewportSize({width:840,height:720});
    await page.locator('#ios-accounts').click();
    await page.locator('#settings-dialog').waitFor({state:'visible'});
    assert(await page.getByRole('button',{name:'Manage accounts',exact:true}).isVisible(),'Accounts entry must remain reachable on wider mobile screens');
    await page.getByRole('button',{name:'Close settings sheet',exact:true}).click();
    await page.setViewportSize({width:402,height:780});
    await page.locator('#bot-details').click();
    await page.locator('#details-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#details-panel').evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px','bot details has no desktop divider');
    assert(Math.abs((await page.locator('#details-panel').boundingBox()).width-402)<1);
    await page.locator('#details-close').click();
    await page.locator('#show-computer').click();
    await page.locator('#computer-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#computer-panel').evaluate(node=>getComputedStyle(node).borderLeftWidth),'0px','computer has no desktop divider');
    assert(Math.abs((await page.locator('#computer-panel').boundingBox()).width-402)<1);
    assert((await page.locator('#desktop').boundingBox()).height>390,'portrait computer should use available vertical space');
    assert(await page.locator('#computer-expand').isHidden(),'slab computer already occupies its own screen');
    await page.setViewportSize({width:874,height:350});
    await page.waitForTimeout(350);
    const desktop=await page.locator('#desktop').boundingBox(),footer=await page.locator('.desktop-footer').boundingBox();
    assert(desktop.x+desktop.width<=footer.x+1,'landscape resources and actions belong to the right of the computer');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:{bottomInset:0,isSlab:false}})));
    assert(await page.locator('#computer-expand').isVisible(),'foldable/tablet computer retains expansion');
    await page.locator('#ios-computer-back').click();
    // Older servers use a textarea instead of the current contenteditable.
    await page.evaluate(()=>{const old=document.querySelector('#prompt');const textarea=document.createElement('textarea');textarea.id='prompt';old.replaceWith(textarea);});
    assert(await page.locator('#prompt').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
    assert.deepEqual(errors.filter(error=>!error.startsWith('ResizeObserver loop')),[]);
    console.log('iOS layout: artifact pages/search/create/draft preservation/delayed loads, pane dividers, native conversation menus/pin/mute, library destinations, avatar/composer, native pickers/theme and rotation/keyboard bounds passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
