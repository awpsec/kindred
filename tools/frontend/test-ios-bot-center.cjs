const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const root=path.resolve(__dirname,'../..'),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-ios-center';
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{for(const legacy of [false,true]){
  const read=name=>legacy?cp.execFileSync('git',['show','938f317:mobile/ios/KindredCompanion/Web/'+name],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'mobile/ios/KindredCompanion/Web',name),'utf8');
  const context=await browser.newContext({viewport:{width:402,height:780},hasTouch:true});
  await context.addInitScript(({token,profileID,css,js})=>{
   window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_MOBILE_PROFILE=profileID;window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;
   window.__KINDRED_IOS_LAYOUT={topInset:59,bottomInset:34,isSlab:true};window.requests=[];
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:v=>requests.push(v)},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   sessionStorage.setItem('kindred-token',token);
   document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=css;document.head.append(s);(0,eval)(js);},{once:true});
  },{token,profileID,css:read('MobileLayout.css'),js:read('MobileLayout.js')});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/chats/dm-vivienne*',async route=>{
   const response=await route.fetch(),data=await response.json();
   data.messages=[...(data.messages||[]),{seq:5000,kind:'message',sender:'vivienne',text:'Project notes are ready.',created:1700000000,attachments:[{id:'native-library-notes',kind:'file',name:'Project notes.md',mime:'text/markdown',size:50,created:1700000000}]}];
   await route.fulfill({json:data});
  });
  await page.route('**/api/deliverables/native-library-notes',route=>route.fulfill({contentType:'text/markdown',body:'# Project notes\n\nA draft for review.'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');await page.locator('#prompt').waitFor({state:'visible'});
  await page.locator('#prompt').fill('Keep this draft through Search and the bot center.');
  await page.evaluate(()=>document.querySelector('#ios-search').click());
  const search=page.locator('.navigation-search');await search.waitFor({state:'visible'});
  await search.getByRole('combobox').fill('Vivienne');assert(await search.getByRole('option',{name:/Vivienne/}).count()>0);
  await page.screenshot({path:path.join(out,(legacy?'installed':'current')+'-search.png')});
  await page.getByRole('button',{name:'Close search',exact:true}).click();await search.waitFor({state:'hidden'});
  await page.locator('#bot-details').click();
  const panel=page.locator('#details-panel');await panel.waitFor({state:'visible'});
  const close=panel.getByRole('button',{name:'Close bot center',exact:true}),box=await close.boundingBox();
  assert(box.y>=59&&box.width>=44&&box.height>=44,'center actions clear the native status area');
  await panel.getByRole('tab',{name:'Library',exact:true}).click();
  await page.locator('#bot-center-library').waitFor({state:'visible'});
  await page.locator('.bot-library-open').getByText('Project notes.md',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,(legacy?'installed':'current')+'-library.png')});
  await page.getByRole('button',{name:'Open Project notes.md',exact:true}).click();
  await page.locator('.document-dialog').waitFor({state:'visible'});
  await page.locator('.document-dialog').getByRole('button',{name:'Close preview',exact:true}).click();
  await page.locator('.document-dialog').waitFor({state:'detached'});
  await panel.getByRole('tab',{name:'Computer',exact:true}).click();
  const computer=page.locator('#computer-panel');await computer.waitFor({state:'visible'});
  assert.equal(await computer.locator(':scope>.bot-center-heading').count(),1,'center navigation stays above the native computer wrapper');
  await page.locator('#desktop canvas:not(.desktop-glass)').waitFor({state:'visible'});
  await page.evaluate(()=>window.retainedCenterRfb=window.__duoFixtureRFB);
  await computer.getByRole('tab',{name:'Details',exact:true}).click();
  await panel.getByRole('tab',{name:'Computer',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__duoFixtureRFB===window.retainedCenterRfb),true,'tabs retain the exact computer transport');
  await page.setViewportSize({width:780,height:390});
  await page.screenshot({path:path.join(out,(legacy?'installed':'current')+'-landscape-computer.png')});
  const heading=await computer.locator(':scope>.bot-center-heading').boundingBox(),screen=await page.locator('#desktop').boundingBox();
  assert(screen.y>=heading.y+heading.height-1,'landscape screen follows center navigation');
  await computer.getByRole('button',{name:'Close bot center',exact:true}).click();
  assert.equal(await page.locator('#prompt').innerText(),'Keep this draft through Search and the bot center.');
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({legacyInstalledAdapter:legacy,search:true,center:true,draft:true,landscape:true}));
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
