// Representative native body-size ratios; captures are fixtures, not UIKit proof.
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let fixtureTheme='dark';
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch({headless:true});
 try{
 const p=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',hasTouch:true,isMobile:true});p.setDefaultTimeout(8000);
 await p.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_SYSTEM_TEXT_SCALE=1;localStorage.setItem('kindred-text-size','150');sessionStorage.setItem('kindred-token',t);},token);
 await p.route('**/api/settings',r=>r.fulfill({json:{name:'You',theme:fixtureTheme,reduced_motion:true,approval_mode:'ask'}}));
 await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#prompt').waitFor();
 await p.locator('#prompt').fill('Keep this draft while phone text size changes.');
 const results=[];
 for(const [category,points] of [['xS',14],['L',17],['XXXL',23],['AX3',40],['AX5',53]])for(const theme of ['dark','light']){
  fixtureTheme=theme;
  await p.evaluate(({scale,theme})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';window.__KINDRED_SYSTEM_TEXT_SCALE=scale;window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}}));const bubble=document.querySelector('.message-bubble');bubble.innerHTML='<p>Fixture phone text. <strong>Table and code</strong></p><table><tr><th>Long column</th><th>Amount</th><th>Status</th></tr><tr><td>Payment fixture only</td><td>$123</td><td>Pending</td></tr></table><pre><code>very_long_code_without_spaces_repeated_to_test_horizontal_scroll_1234567890</code></pre>';}, {scale:points/17,theme});
  await p.evaluate(async()=>(await import('/artifacts.js')).enhanceMarkdown(document.querySelector('.message-bubble')));
  assert.equal(await p.locator('#prompt').innerText(),'Keep this draft while phone text size changes.');
  await p.waitForTimeout(300);await p.screenshot({path:path.join(out,`ios-${category}-${theme}-chat.png`)});
  await p.locator('#settings-button').evaluate(b=>b.click());await p.locator('#settings-dialog[open]').waitFor();
  assert.match(await p.locator('#settings-dialog').innerText(),/Text size follows your iPhone setting/);
  assert.equal(await p.locator('#settings-dialog select[aria-label="Text size"]').count(),0);
  await p.mouse.move(389,843);await p.waitForTimeout(300);await p.screenshot({path:path.join(out,`ios-${category}-${theme}-settings.png`)});
  await p.locator('#settings-close').click();await p.locator('#mobile-menu').evaluate(b=>b.click());await p.screenshot({path:path.join(out,`ios-${category}-${theme}-sidebar.png`)});await p.locator('#mobile-menu').evaluate(b=>b.click());
  results.push({category,points,scale:points/17,theme,bodyOverflow:await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 }
 fs.writeFileSync(path.join(out,'ios-text-captures.json'),JSON.stringify({representativeFixtureRatios:true,nativeUIKitUnverified:true,results},null,2));
 console.log(JSON.stringify({passed:true,captures:30,draftRetained:true,systemExplanation:true,results}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
