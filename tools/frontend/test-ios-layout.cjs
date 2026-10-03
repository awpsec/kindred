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
    const errors=[]; page.on('pageerror',error => errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-piper');
    const prompt=page.locator('#prompt'); await prompt.waitFor({state:'visible'});
    await prompt.fill('Keep the iOS draft through rotation.');
    assert(await prompt.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16),'focused composer must not trigger iOS text zoom');
    await page.locator('#mobile-menu').click();
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    assert.equal(sidebarBox.width,402,'conversations must be a separate full-width screen');
    assert(await page.locator('.conversation').evaluate(node=>node.inert));
    await page.getByRole('button',{name:'Accounts',exact:true}).click();
    assert((await page.evaluate(()=>window.accountRequests)).some(value=>value.action==='open'));
    await page.locator('.bot-link').first().click();
    assert(await page.getByRole('button',{name:'Accounts',exact:true}).isHidden());
    const avatarBox=await page.locator('#header-avatar').boundingBox();
    assert(Math.abs(avatarBox.x+avatarBox.width/2-201)<2,'bot avatar must be centered independently of side controls');
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
      assert(history.y+history.height<=composer.y+1,'messages must stop above the mobile composer');
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
    await page.setViewportSize({width:402,height:780});
    await page.locator('#show-computer').click();
    await page.locator('#computer-panel').waitFor({state:'visible'});
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
    console.log('iOS layout: separate views, avatar, compact composer, native pickers/theme, slab/foldable controls and rotation/keyboard bounds passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
