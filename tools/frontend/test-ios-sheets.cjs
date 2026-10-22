// Exercise the real shared dialogs through the installed iOS adapter. The
// native toolbar/keyboard rectangles are replayed; form and search state stay live.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'mobile/ios/KindredCompanion/Web');
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-sheets';
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{for(const side of ['right','left']){
  const page=await browser.newPage({viewport:{width:466,height:780},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Native QA telemetry is not part of this isolated layout test; avoid its
  // diagnostic POST racing the deliberate reload into the server-chat variant.
  await page.route('**/fixture/probe.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.addInitScript(({token,profileID,css,js,side})=>{
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});sessionStorage.setItem('kindred-token',token);
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:24,bottomInset:34,leftInset:side==='left'?84:0,rightInset:side==='right'?84:0,railSide:side,isDuo:true,isDuoInner:false,isSlab:true,usesNativeRail:true,isPortrait:true,viewportHeight:780};
   window.__KINDRED_IOS_TOOLBAR={x:side==='right'?382:0,y:195,width:84,height:250};
   window.__KINDRED_NATIVE_GEOMETRY={width:466,height:780,windowWidth:466,windowHeight:780,reservedRegions:[{kind:'occlusion',active:true,x:side==='right'?382:0,y:0,width:84,height:170}]};
   document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
  },{token,profileID,css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8'),side});
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');await page.locator('#prompt').waitFor();await page.locator('#prompt').fill('Retained behind native sheets.');
  const action=name=>page.evaluate(name=>__kindredDuoActions.perform(name),name);
  const settle=async()=>{
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.waitForFunction(()=>[...document.querySelectorAll('dialog[open],dialog[open] *')].every(n=>{n.getBoundingClientRect();return n.getAnimations().every(a=>a.playState!=='running');}));
  };
  const pose=async(width,height,inner,portrait,regions=[])=>{
   await page.setViewportSize({width,height});await page.evaluate(({width,height,inner,portrait,regions})=>{
    Object.assign(__KINDRED_IOS_LAYOUT,{isDuoInner:inner,isSlab:!inner,isPortrait:portrait,viewportHeight:height});
    Object.assign(__KINDRED_NATIVE_GEOMETRY,{width,height,windowWidth:width,windowHeight:height,reservedRegions:regions});
    __KINDRED_IOS_TOOLBAR={x:__KINDRED_IOS_LAYOUT.railSide==='right'?width-84:0,y:195,width:84,height:250};
    dispatchEvent(new CustomEvent('kindred-ios-layout',{detail:__KINDRED_IOS_LAYOUT}));dispatchEvent(new Event('kindred-native-geometry'));
   },{width,height,inner,portrait,regions});await settle();
  };
  const sheet=page.locator('dialog[data-ios-sheet][open]');
  const bounds=async()=>{
   const r=await sheet.boundingBox(),v=page.viewportSize();assert(r.width>=280&&r.x>=0&&r.y>=0&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height-30,'sheet stays inside usable viewport');
   assert(await sheet.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'sheet has no horizontal overflow');return r;
  };
  await action('settings');await page.locator('#settings-dialog[data-ios-sheet][open]').waitFor();await settle();
  const preferences=page.locator('#settings-dialog');
  const settingsBounds=async()=>{
   const r=await bounds(),v=page.viewportSize();
   const left=side==='left'?84:0,right=v.width-(side==='right'?84:0),top=24,bottom=v.height-34;
   assert(Math.abs(r.x+r.width/2-(left+right)/2)<1,'Settings is horizontally centered in its usable lane');
   assert(Math.abs(r.y+r.height/2-(top+bottom)/2)<1,'Settings is vertically centered in its usable lane');
   const close=await preferences.getByRole('button',{name:'Close settings sheet',exact:true}).boundingBox();
   assert(close.x>=r.x&&close.y>=r.y&&close.x+close.width<=r.x+r.width&&close.y+close.height<=r.y+r.height,'Settings close stays inside the sheet');
   const content=await preferences.locator('#settings-content').boundingBox();
   assert(content.height>60&&content.y+content.height<=r.y+r.height+1,'Settings body has a bounded scroll viewport');
   assert(await preferences.locator('#settings-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Settings content cannot overflow horizontally');
  };
  await settingsBounds();await pose(951,669,true,false);await settingsBounds();
  assert.equal((await bounds()).width,760,'open Settings uses the wider preferences layout');
  await pose(951,669,true,false,[{kind:'division',active:true,x:460,y:0,width:28,height:669}]);
  assert((await bounds()).x>=488,'Settings stays inside one book region');
  await pose(951,669,true,false,[{kind:'division',active:true,x:0,y:330,width:951,height:28}]);
  const tableSettings=await bounds();assert(tableSettings.y+tableSettings.height<=330,'Settings stays above an active tabletop fold');
  await pose(951,669,true,false);
  await preferences.locator('[data-settings-page=connections]').click();await settle();
  await pose(669,951,true,true);await settingsBounds();
  assert.equal(await preferences.locator('[aria-current=page]').getAttribute('data-settings-page'),'connections','selected Settings tab survives rotation');
  await pose(466,780,false,true);await settingsBounds();
  await pose(780,466,false,false);await settingsBounds();
  await pose(466,430,false,true);await settingsBounds();
  await page.screenshot({path:path.join(out,side+'-settings-keyboard.png')});
  await preferences.getByRole('button',{name:'Close settings sheet',exact:true}).click();await preferences.waitFor({state:'hidden'});
  assert.equal(await preferences.getAttribute('inert'),null,'closing Settings releases its interaction guard');
  await page.emulateMedia({reducedMotion:'reduce'});await action('settings');await settle();
  assert.equal(await preferences.evaluate(n=>n.getAnimations().length),0,'Settings respects Reduce Motion');
  await preferences.getByRole('button',{name:'Close settings sheet',exact:true}).click();await preferences.waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await pose(466,780,false,true,[{kind:'occlusion',active:true,x:side==='right'?382:0,y:0,width:84,height:170}]);
  await action('search');await page.locator('.navigation-search[data-ios-sheet]').waitFor();await settle();await bounds();
  const assertFlow=async()=>{
   const rows=await page.locator('.navigation-search-heading,.navigation-search-results>*').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};}));
   for(const r of rows.filter(r=>r.bottom>0&&r.top<740)){
    const beside=r.top<457&&r.bottom>183||r.top<182;
    if(beside)assert(side==='right'?r.right<=370.1:r.left>=95.9,'search items stay clear of status/camera and dock: '+JSON.stringify(rows));
   }
   const upper=rows.find(r=>r.top>183&&r.bottom<457),lower=rows.find(r=>r.top>457&&r.bottom<740);
   assert(upper&&lower&&lower.width>upper.width+50,'rows below dock reclaim the full width: '+JSON.stringify(rows));
  };
  await assertFlow();await page.screenshot({path:path.join(out,side+'-outer-search.png')});
  await page.locator('.navigation-search-results').evaluate(n=>n.scrollTop=130);await settle();await assertFlow();
  await sheet.getByRole('combobox').fill('Vivienne');await sheet.getByRole('option',{name:/^Vivienne/}).waitFor();
  await pose(951,669,true,false);const wide=await bounds();assert(wide.width===680&&wide.x>50,'open Search is centered at a useful width');assert.equal(await sheet.getByRole('combobox').inputValue(),'Vivienne');
  await page.screenshot({path:path.join(out,side+'-inner-search.png')});
  await sheet.getByRole('button',{name:'Close search',exact:true}).click();await sheet.waitFor({state:'hidden'});
  await action('newBot');await page.locator('#bot-dialog[data-ios-sheet]').waitFor();await settle();const bot=page.locator('#bot-dialog');
  const creation=await bounds();assert.equal(creation.width,600,'open creation has room for form fields');
  const createBot=await bot.getByRole('button',{name:'Create bot',exact:true}).boundingBox();assert(createBot.y+createBot.height<=creation.y+creation.height,'Create bot is fully visible without scrolling');
  await bot.locator('input[name=name]').fill('Kept through folding');
  const provider=await bot.locator('select[name=provider]').boundingBox(),name=await bot.locator('input[name=name]').boundingBox();assert(Math.abs(provider.width-name.width)<2,'single provider fills the form column');
  await page.screenshot({path:path.join(out,side+'-inner-bot.png')});
  await pose(951,669,true,false,[{kind:'division',active:true,x:460,y:0,width:28,height:669}]);const book=await bounds();assert(book.x>=488,'book form stays on one side of the active fold');
  await pose(951,669,true,false,[{kind:'division',active:true,x:0,y:330,width:951,height:28}]);const table=await bounds();assert(table.y+table.height<=330,'tabletop form remains above the active fold');
  await pose(466,780,false,true);await bounds();assert.equal(await bot.locator('input[name=name]').inputValue(),'Kept through folding');
  await pose(466,430,false,true);await bounds();
  await bot.getByRole('button',{name:'Create bot',exact:true}).scrollIntoViewIfNeeded();const create=await bot.getByRole('button',{name:'Create bot',exact:true}).boundingBox();assert(create.y+create.height<400,'submit remains reachable above the keyboard');
  const close=bot.getByRole('button',{name:'Close new bot',exact:true});const closeBox=await close.boundingBox();assert(closeBox.y>=24&&closeBox.y+closeBox.height<430,'sticky close remains visible after scrolling');await close.click();
  await pose(951,669,true,false);await action('newConversation');await sheet.waitFor();await settle();await bounds();
  const chatBox=await bounds(),createChat=await sheet.getByRole('button',{name:'Create chat',exact:true}).boundingBox();assert(createChat.y+createChat.height<=chatBox.y+chatBox.height,'Create chat is fully visible without scrolling');
  await sheet.getByLabel('Chat name',{exact:true}).fill('Preserved chat draft');await sheet.locator('.member-option').first().click();
  await pose(466,780,false,true);assert.equal(await sheet.getByLabel('Chat name',{exact:true}).inputValue(),'Preserved chat draft');assert.equal(await sheet.locator('.member-option input:checked').count(),1);await bounds();
  await sheet.getByRole('button',{name:'Create chat',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,side+'-outer-chat.png')});await sheet.getByRole('button',{name:'Close',exact:true}).click();
  await pose(951,669,true,false);await action('botDetails');const summary=page.locator('.bot-center-preferences>summary');await summary.waitFor();assert.equal(await summary.evaluate(n=>getComputedStyle(n).alignItems),'center');assert((await summary.boundingBox()).height>=44);
  const glyph=await summary.evaluate(n=>{const s=getComputedStyle(n,'::before');return {position:s.position,mask:s.webkitMaskImage,background:s.backgroundColor};});assert.deepEqual(glyph,{position:'static',mask:'none',background:'rgba(0, 0, 0, 0)'},'the glyph participates in the same aligned row, without the shared absolute marker');
  await summary.click();assert.equal(await summary.locator('..').getAttribute('open'),'');await summary.click();
  assert.equal(await page.locator('#prompt').innerText(),'Retained behind native sheets.');
  if(side==='right'){
   await page.route('**/identity/meta',route=>route.fulfill({json:{profiles:true,server_chats:true}}));
   await page.route('**/api/server-chats',route=>route.fulfill({json:[]}));
   await page.route('**/api/server-chats/directory?*',route=>route.fulfill({json:{items:[{id:'person:test',kind:'person',name:'Test person',owner_name:'Preview'}],recent:[]}}));
   await page.reload();await page.locator('#prompt').waitFor();await pose(951,669,true,false);await action('newConversation');await page.locator('.server-chat-dialog[data-ios-sheet]').waitFor();await settle();await bounds();
   await sheet.getByRole('button',{name:'Test person · Person',exact:true}).click();assert(await sheet.getByRole('button',{name:'Start chat',exact:true}).isEnabled(),'server chat submit is usable after participant selection');
   await pose(466,780,false,true);await bounds();assert(await sheet.getByRole('button',{name:'Remove Test person',exact:true}).isVisible(),'server participant survives folding');
   await sheet.getByRole('button',{name:'Start chat',exact:true}).scrollIntoViewIfNeeded();await sheet.getByRole('button',{name:'Close',exact:true}).click();
  }
  assert.deepEqual(errors,[]);await page.close();console.log(JSON.stringify({side,settings:true,searchFlow:true,creation:true,drafts:true,keyboard:true,folds:true,disclosure:true}));
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
