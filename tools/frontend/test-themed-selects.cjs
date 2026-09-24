const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_TEST_BROWSER==='edge'?'edge':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:!process.env.KINDRED_HEADED}:{headless:!process.env.KINDRED_HEADED,...(engine==='edge'?{channel:'msedge'}:{})});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/themed-selects');fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:980}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#app').waitFor();
  await p.locator('#settings-button').click();const theme=p.getByRole('combobox',{name:'Theme',exact:true});await theme.click();
  const menu=p.getByRole('listbox');await menu.waitFor();assert.equal(await theme.getAttribute('aria-expanded'),'true');
  assert.equal(await menu.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(19, 19, 19)');
  await menu.getByRole('option',{name:'Light',exact:true}).click();assert.equal(await theme.inputValue(),'light');await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await theme.focus();await theme.press('ArrowDown');await menu.waitFor();await theme.press('Home');await theme.press('Enter');assert.equal(await theme.inputValue(),'system');
  await theme.click();await theme.press('Escape');assert(await menu.isHidden());assert(await p.locator('#settings-dialog').isVisible());
  await theme.click();await menu.getByRole('option',{name:'Dark',exact:true}).click();await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await theme.click();await p.screenshot({path:path.join(out,engine+'-themed-dropdown.png')});await theme.press('Tab');assert(await menu.isHidden());
  await p.locator('#settings-close').click();
  // Long bubbles must cross the conversation's center from both sides.
  await p.locator('.message-row.user .message-bubble').first().evaluate(n=>n.textContent='A longer message with enough words to test the conversation width. '.repeat(25));
  await p.locator('.message-row.assistant .message-bubble').first().evaluate(n=>n.textContent='A longer answer with enough words to test the conversation width. '.repeat(25));
  const user=await p.locator('.message-row.user .message-bubble').first().boundingBox(),bot=await p.locator('.message-row.assistant .message-bubble').first().boundingBox();
  assert(bot.x+bot.width>user.x+100,JSON.stringify({user,bot}));
  await p.screenshot({path:path.join(out,engine+'-overlapping-widths.png')});
  await p.locator('#settings-button').click();await p.setViewportSize({width:390,height:844});await theme.click();await menu.waitFor();const bounds=await menu.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);await theme.press('Escape');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,themedPointerSelection:true,keyboardSelection:true,escapePreservesSettings:true,tabDismisses:true,longBubbleOverlap:true,mobilePickerBounds:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
