// A corner camera can make the shared safe rectangle shorter than the cover.
// The native list uses individual row clearance and must retain its full height.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {webkit} = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const {server, token, profileID} = require('./fixtures/duo.cjs');
const contours = require('./fixtures/duo-display-contours.json');
const bundle = path.resolve(__dirname, '../../mobile/ios/KindredCompanion/Web');
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await webkit.launch(), reports = [];
  try {
    const page = await browser.newPage({viewport:{width:466,height:678},hasTouch:true}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/bots', async route => {
      const response = await route.fetch(), bots = await response.json();
      return route.fulfill({response,json:[...bots,...Array.from({length:3}, (_,i) => ({...bots[0],id:'extra-'+i,name:['Seneca','Orion','Cersei'][i]}))]});
    });
    await page.route('**/api/chats', async route => {
      const response = await route.fetch(), chats = await response.json();
      return route.fulfill({response,json:[...chats,...Array.from({length:8}, (_,i) => ({id:'bot-chat-'+i,name:'Coordination '+i,members:['piper','vivienne'],bot_only:true,archived:false}))]});
    });
    await page.route('**/api/settings', async route => {
      const response = await route.fetch(); return route.fulfill({response,json:{...await response.json(),separate_bot_chats:true}});
    });
    await page.addInitScript(({token,profileID,css,js,closed}) => {
      sessionStorage.setItem('kindred-token',token);
      Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
      window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
      window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:84,railSide:'right',isDuo:true,isDuoInner:false,usesNativeRail:true,isSlab:false,isPortrait:true,viewportHeight:678};
      window.__KINDRED_IOS_TOOLBAR={x:382,y:208,width:64,height:180};
      window.__KINDRED_NATIVE_GEOMETRY={width:466,height:678,windowWidth:466,windowHeight:678,...closed,reservedRegions:[{kind:'occlusion',active:true,x:382,y:30,width:84,height:84}]};
      document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
    },{token,profileID,closed:contours.closed,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
    await page.goto('http://127.0.0.1:'+server.address().port, {waitUntil:'domcontentloaded'});
    await page.locator('#startup-status').waitFor({state:'hidden'});
    await page.locator('#mobile-menu').evaluate(node=>node.click());
    await page.locator('.sidebar').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.documentElement.dataset.iosLayout==='compact'&&!document.querySelector('#app').dataset.mobileResizing);
    const summary=page.locator('.bot-chat-section>summary');
    const before=await page.evaluate(()=>{
      const list=document.querySelector('#bots'),summary=list.querySelector('.bot-chat-section>summary');
      return {safeHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ios-safe-height')),list:list.getBoundingClientRect().toJSON(),sidebar:document.querySelector('.sidebar').getBoundingClientRect().toJSON(),summary:summary.getBoundingClientRect().toJSON(),scrollTop:list.scrollTop};
    });
    assert(before.safeHeight<678,'fixture must exercise a genuinely shortened shared safe rectangle');
    assert.equal(before.sidebar.height,678,'camera safe rectangle must not shorten the native cover list');
    assert(before.list.bottom>=630,'the list fills the display down to its normal bottom inset');
    assert(before.summary.bottom<=before.list.bottom,'six bots, group, and Bot conversations fit before any scrolling');
    assert.equal(before.scrollTop,0);
    if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'closed-list-six-rows-fixed.png')});
    await summary.click();
    await page.locator('#bots').evaluate(node=>node.scrollTop=node.scrollHeight);
    await page.waitForTimeout(260);
    const last=page.locator('.bot-chat-list .bot-link').last();
    assert(await last.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+60,r.y+r.height/2));}),'last expanded bot conversation remains visible and tappable');
    for(const pose of ['closedLandscape','closedRotated','open','closed']) {
      const {width,height}=contours[pose],inner=pose==='open';
      await page.setViewportSize({width,height});
      await page.evaluate(({geometry,width,height,inner})=>{
        Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:inner,isPortrait:height>width,viewportHeight:height});
        Object.assign(__KINDRED_NATIVE_GEOMETRY,geometry,{windowWidth:width,windowHeight:height,reservedRegions:inner?[{kind:'division',active:false,x:width/2,y:0,width:0,height}]:[{kind:'occlusion',active:true,x:width-84,y:30,width:84,height:84}]});
        dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
      },{geometry:contours[pose],width,height,inner});
      await page.waitForTimeout(350);
      if(!inner&&!await page.locator('.sidebar').isVisible())await page.locator('#mobile-menu').evaluate(node=>node.click());
      await page.locator('.sidebar').waitFor({state:'visible'});
      const report=await page.locator('.sidebar').evaluate(node=>({height:node.getBoundingClientRect().height,listBottom:node.querySelector('#bots').getBoundingClientRect().bottom}));
      assert(Math.abs(report.height-height)<1,pose+' restores full list height after a pose change');
      assert(await page.locator('.bot-chat-section').evaluate(node=>node.open),'expansion survives folding');
      reports.push({pose,...report});
    }
    assert.deepEqual(errors,[]);
    if(process.env.KINDRED_TEST_ARTIFACTS)await page.screenshot({path:path.join(process.env.KINDRED_TEST_ARTIFACTS,'closed-list-fixed.png')});
    console.log(JSON.stringify({passed:true,sixRowsWithoutDeadSpace:true,expandedConversationsReachable:true,reports}));
  } finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
