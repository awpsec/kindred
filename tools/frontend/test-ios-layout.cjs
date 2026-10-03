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
    await page.getByRole('button',{name:'Accounts',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.accountRequests),[{action:'interface-ready'},{action:'open'}]);
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
        assert(await page.locator('.sidebar .bot-info').first().isVisible(),'landscape drawer must show names rather than desktop rail icons');
        assert(!(await page.locator('.sidebar').evaluate(node=>node.inert)));
        await page.getByRole('button',{name:'Close conversations'}).click({position:{x:size.width-10,y:100}});
        assert(await page.locator('.sidebar').evaluate(node=>node.inert));
      }
    }
    // Older servers use a textarea instead of the current contenteditable.
    await page.evaluate(()=>{const old=document.querySelector('#prompt');const textarea=document.createElement('textarea');textarea.id='prompt';old.replaceWith(textarea);});
    assert(await page.locator('#prompt').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
    assert.deepEqual(errors.filter(error=>!error.startsWith('ResizeObserver loop')),[]);
    console.log('iOS layout: account bridge, drawer, touch targets, legacy text sizing and rotation/keyboard bounds passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
