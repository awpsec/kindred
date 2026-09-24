const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{for(const platform of ['linux','macos','windows']){
  const page=await browser.newPage();
  await page.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.__KINDRED_EXTERNAL_LINKS=true;window.nativeCalls=[];window.externalCalls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='window_action')nativeCalls.push(args.action);if(command==='open_external_url')externalCalls.push(args.url);return null;}}};},{token,platform});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('.desktop-titlebar').waitFor();
  await page.evaluate(async()=>{
   const {artifactStudio}=await import('/workspace-artifacts.js');
   const doc={id:'drag-doc',title:'Editable title',kind:'document',source:'# Document',state:{},revision:1,updated:Date.now()/1000};
   window.studio=artifactStudio({api:async p=>p==='/workspace-artifacts'?[doc]:doc,markdown:text=>{const n=document.createElement('div');n.textContent=text;return n;},baseUrl:location.origin});
   document.querySelector('#app').append(studio.root);await studio.open(doc.id);
  });
  await page.getByLabel('Document title',{exact:true}).waitFor();
  const reveal=page.locator('.artifact-library-reveal'),viewport=page.viewportSize();
  const box=await reveal.boundingBox();assert(box);
  if(platform==='macos'){
   assert(box.x<20&&box.y>viewport.height-60,'Mac page pin belongs in the bottom left');
   await page.mouse.move(3,viewport.height-25);await page.waitForTimeout(250);
   assert.equal(await page.locator('.artifact-studio').evaluate(n=>n.classList.contains('sidebar-open')),false,'Bottom corner must not reveal the pane over the pin');
  }else assert(box.y<100,platform+' keeps the page pin at the top');
  await reveal.click();assert(await page.locator('.artifact-studio').evaluate(n=>n.classList.contains('sidebar-pinned')));
  assert.equal(await reveal.isVisible(),false);
  await page.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().left>=0);
  const pin=page.locator('.artifact-library-pin'),pinBox=await pin.boundingBox();assert(pinBox.y<130&&pinBox.x>180,'Pane pin remains at its top right');
  await pin.click();await page.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().right<=1);
  await page.mouse.move(3,300);await page.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().left>=0);
  await page.mouse.move(700,400);await page.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().right<=1);
  const actions=await page.evaluate(()=>{
   const header=document.querySelector('.artifact-workbench-header');
   const fire=(target,type,button=0)=>target.dispatchEvent(new MouseEvent(type,{bubbles:true,button,detail:type==='dblclick'?2:1}));
   nativeCalls.length=0;fire(header,'mousedown');fire(header.querySelector('.artifact-revision'),'mousedown');fire(header,'dblclick');fire(document.querySelector('.artifact-library-brand-row'),'mousedown');
   const drag=nativeCalls.slice();nativeCalls.length=0;
   for(const target of document.querySelectorAll('.artifact-workbench-header input,.artifact-workbench-header button,.artifact-workbench-header a,.artifact-library-brand-row button')){fire(target,'mousedown');fire(target,'dblclick');}
   fire(header,'mousedown',2);fire(document.querySelector('.artifact-workbench-body'),'mousedown');
   return {drag,interactive:nativeCalls.slice()};
  });
  assert.deepEqual(actions.drag,['drag','drag','maximize','drag'],platform);assert.deepEqual(actions.interactive,[],platform+' preserves controls and document interactions');
  await page.getByLabel('Document title',{exact:true}).click();assert(await page.getByLabel('Document title',{exact:true}).evaluate(n=>n===document.activeElement));
  assert(await page.getByLabel('Document title',{exact:true}).evaluate(n=>n.getBoundingClientRect().width<=360));
  await page.evaluate(()=>{const sidebar=document.querySelector('.artifact-studio-library');const top=sidebar.getBoundingClientRect().top;nativeCalls.length=0;sidebar.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,detail:1,clientY:top+2}));sidebar.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,detail:1,clientY:sidebar.getBoundingClientRect().bottom-5}));});
  assert.deepEqual(await page.evaluate(()=>nativeCalls),['drag'],'Sidebar top padding only');
  await page.route('**/api/workspace-artifacts**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/workspace-artifacts')?[]:{id:'click-doc',title:'Click document',kind:'document',language:'markdown',source:'# Report',state:{},revision:1,updated:Date.now()/1000,path:'/artifacts/click-doc'}}));
  await page.evaluate(async()=>{studio.dispose();const {workspaceArtifactCard}=await import('/workspace-artifacts.js');const card=workspaceArtifactCard({id:'click-doc',title:'Click document',kind:'document',path:'/artifacts/click-doc'},{api:async()=>({}),markdown:()=>document.createElement('div'),baseUrl:location.origin});document.querySelector('#app').append(card);});
  const link=page.locator('.workspace-artifact-link').last();
  await link.click({modifiers:['Control']});assert.equal((await page.evaluate(()=>externalCalls)).length,1);assert(!new URL(page.url()).pathname.includes('/artifacts/'));
  await link.click({modifiers:['Meta']});assert.equal((await page.evaluate(()=>externalCalls)).length,2);
  await link.click();await page.getByLabel('Document title',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/artifacts/click-doc');assert.equal((await page.evaluate(()=>externalCalls)).length,2);
  await page.close();
 }
 console.log('PASS artifact header/sidebar dragging, bounded title, in-app clicks and browser modifiers on Linux, macOS, Windows bridges');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
