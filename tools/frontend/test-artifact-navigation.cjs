const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const fs=require('node:fs'),path=require('node:path');const screenshots=process.env.KINDRED_TEST_ARTIFACTS;if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{for(const platform of ['macos','linux','windows','browser']){
  const p=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);if(platform!=='browser')window.__KINDRED_DESKTOP={platform};window.__KINDRED_MAC_OVERLAY=platform==='macos';window.__TAURI__={core:{invoke:async()=>null}};}, {token,platform});
  const doc={id:'nav-doc',title:'A document title',kind:'document',language:'markdown',source:'# Report',state:{},revision:1,updated:Date.now()/1000};
  await p.route('**/api/workspace-artifacts**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/workspace-artifacts')?[doc]:doc}));
  await p.route('**/identity/meta',r=>r.fulfill({json:{profiles:true,registration:true}}));
  await p.route('**/identity/profiles',r=>r.fulfill({json:{active:'personal',profiles:[{id:'personal',name:'Alex',active:true}],directory:[]}}));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#artifacts-button').click();
  await p.locator('.artifact-library-reveal').click();const library=p.locator('.artifact-studio-library');
  await library.getByRole('button',{name:'Chats',exact:true}).waitFor();
  for(const id of ['settings-button','marketplace-button','identity-button','switch-profiles'])assert.equal(await p.locator('#'+id).count(),1,id+' remains unique');
  await library.locator('#settings-button').click();await p.locator('#settings-dialog').waitFor({state:'visible'});await p.locator('#settings-close').click();
  await library.locator('#marketplace-button').click();await p.getByRole('dialog').filter({has:p.getByRole('heading',{name:'Marketplace',exact:true})}).waitFor();await p.keyboard.press('Escape');
  await library.locator('#identity-button').click();await p.locator('#identity-menu').waitFor();await library.locator('#identity-button').click();
  await library.locator('#switch-profiles').click();await p.locator('#profile-menu').waitFor();await p.keyboard.press('Escape');
  await library.locator('[data-artifact-id="nav-doc"]').click();await p.getByLabel('Document title',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Edit document',exact:true}).click();await p.getByLabel('Document',{exact:true}).fill('Unsaved report');
  p.once('dialog',d=>d.dismiss());await library.getByRole('button',{name:'Chats',exact:true}).click();assert.equal(await p.getByLabel('Document',{exact:true}).inputValue(),'Unsaved report','Chats preserves edits when discard is declined');
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Finish editing',exact:true}).click();
  await p.locator('.artifact-library-pin').click();await p.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().right<=1);
  if(platform==='macos'){
   const chrome=await p.locator('.desktop-titlebar').evaluate(n=>({background:getComputedStyle(n).backgroundColor,pointer:getComputedStyle(n).pointerEvents}));assert.equal(chrome.background,'rgba(0, 0, 0, 0)');assert.equal(chrome.pointer,'none');
   assert((await p.getByLabel('Document title',{exact:true}).boundingBox()).x>=104,'Title clears traffic lights');
   if(screenshots)await p.screenshot({path:path.join(screenshots,'artifact-macos-unpinned.png')});
   await p.mouse.move(2,30);assert.equal(await p.locator('.artifact-studio').evaluate(n=>n.classList.contains('sidebar-open')),false,'Traffic light edge must not reveal library');
   await p.mouse.move(2,780);assert.equal(await p.locator('.artifact-studio').evaluate(n=>n.classList.contains('sidebar-open')),false,'Bottom pin remains reachable');
  }
  await p.locator('.artifact-library-reveal').click();if(screenshots&&platform==='macos'){await p.waitForTimeout(250);await p.screenshot({path:path.join(screenshots,'artifact-macos-navigation.png')});}await library.getByRole('button',{name:'Chats',exact:true}).click();await p.locator('.artifact-studio').waitFor({state:'detached'});
  assert.equal(new URL(p.url()).pathname,'/');assert.equal(await p.locator('.sidebar-bottom').count(),1);assert.equal(await p.locator('#artifacts-button').textContent(),'Artifacts');assert(await p.locator('#settings-button').isVisible());
  await p.locator('#artifacts-button').click();await p.locator('.artifact-studio').waitFor();assert.equal(await p.locator('.sidebar-bottom').count(),1,'Reopening does not duplicate controls');
  await p.setViewportSize({width:390,height:780});await p.locator('.artifact-library-reveal').click();await library.getByRole('button',{name:'Chats',exact:true}).waitFor();assert((await library.locator('#identity-button').boundingBox()).y<780,'Profile is reachable on mobile');
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS artifact shared navigation and Mac traffic-light clearance across desktop bridges and browser, including narrow layouts');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
