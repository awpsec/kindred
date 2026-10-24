// Exercise the application router and actual artifact controls, not open() directly.
const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
let diagnosticPage,diagnosticErrors;
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[],writes=[];
  diagnosticPage=page;diagnosticErrors=errors;page.on('console',m=>{if(m.type()==='error')console.error('BROWSER_CONSOLE',m.text());});page.on('response',r=>{if(r.status()>=400)console.error('HTTP',r.status(),new URL(r.url()).pathname);});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_DESKTOP={platform:'macos'};window.__KINDRED_MAC_OVERLAY=true;window.__TAURI__={core:{invoke:async()=>null}};},token);
  const origin='http://127.0.0.1:'+server.address().port;
  const records=[{id:'back-doc',title:'Back report',kind:'document',language:'markdown',source:'# Report',state:{},revision:1,updated:Date.now()/1000,path:'/artifacts/back-doc'},
   {id:'back-app',title:'Back app',kind:'app',language:'html',source:'<h1>Original application</h1>',state:{},revision:1,updated:Date.now()/1000,path:'/artifacts/back-app'}];
  await page.route('**/identity/meta',r=>r.fulfill({json:{profiles:true,registration:true}}));
  await page.route('**/identity/profiles',r=>r.fulfill({json:{active:'personal',profiles:[{id:'personal',name:'Alex',active:true}],directory:[]}}));
  await page.route(origin+'/artifacts**',r=>new URL(r.request().url()).pathname.endsWith('.js')?r.continue():r.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'))}));
  await page.route(origin+'/api/workspace-artifacts**',r=>{
   const id=new URL(r.request().url()).pathname.split('/')[3];if(!id)return r.fulfill({json:records});
   const value=records.find(v=>v.id===id);if(!value)return r.fulfill({status:404,json:{error:'Not found'}});
   if(r.request().method()==='PATCH'){const delta=r.request().postDataJSON();writes.push(delta);Object.assign(value,delta,{revision:value.revision+1});}
   return r.fulfill({json:value});
  });
  const profileItem=async name=>{await page.locator('#identity-button').click();await page.locator('#identity-menu').getByRole('menuitem',{name,exact:true}).click();};
  const library=async()=>{if(!await page.locator('.artifact-studio').evaluate(n=>n.classList.contains('sidebar-open')||n.classList.contains('sidebar-pinned')))await page.locator('.artifact-library-reveal').click();await page.waitForFunction(()=>document.querySelector('.artifact-studio-library').getBoundingClientRect().left>=0);};
  const open=async id=>{await library();await page.locator('[data-artifact-id="'+id+'"]').click();await page.getByLabel('Document title',{exact:true}).waitFor();};
  const empty=async()=>{await page.locator('.artifact-starter-grid').waitFor();assert.equal(await page.locator('.artifact-starter-grid button').count(),4);assert.equal(await page.locator('.artifact-workbench-error').count(),0);assert.equal(await page.locator('.artifact-studio-library-item.selected').count(),0);};
  await page.goto(origin);await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).waitFor();await profileItem('Artifacts');await empty();
  await open('back-doc');assert.equal(await page.getByLabel('Document title',{exact:true}).inputValue(),'Back report');
  // Real browser history transition /artifacts/id -> /artifacts invokes the public router.
  await page.goBack();assert.equal(new URL(page.url()).pathname,'/artifacts');
  try{await empty();}catch(e){console.error('BACK_ROUTE_DIAGNOSTIC',JSON.stringify(await page.locator('.artifact-studio-main').allTextContents()),JSON.stringify(await page.getByRole('alert').allTextContents()));throw e;}
  await page.goForward();await page.getByLabel('Document title',{exact:true}).waitFor();assert.equal(await page.getByLabel('Document title',{exact:true}).inputValue(),'Back report');
  await page.getByRole('button',{name:'Edit document',exact:true}).click();
  const content=page.getByRole('textbox',{name:'Document content',exact:true});await content.fill('Unsaved Back draft');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Back to chat',exact:true}).click();
  assert.equal((await content.innerText()).trim(),'Unsaved Back draft');assert.equal(new URL(page.url()).pathname,'/artifacts/back-doc');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Back to chat',exact:true}).click();await page.locator('.artifact-studio').waitFor({state:'detached'});assert.equal(new URL(page.url()).pathname,'/');
  await profileItem('Artifacts');await empty();
  // With no selection, use the actual shared navigation to leave/reopen safely.
  await library();await profileItem('Chats');await page.locator('.artifact-studio').waitFor({state:'detached'});
  await profileItem('Artifacts');await empty();await open('back-app');
  await page.getByRole('button',{name:'Edit source',exact:true}).click();const source=page.getByLabel('Artifact source',{exact:true});assert.equal(await source.inputValue(),records[1].source);assert.equal(await source.evaluate(n=>n.spellcheck),false);
  await page.getByRole('button',{name:'Finish editing',exact:true}).click();await page.goBack();await empty();await open('back-doc');await page.getByRole('button',{name:'Edit document',exact:true}).click();await content.waitFor();
  assert.equal((await content.innerText()).trim(),'Report','declined unsaved draft was discarded only after confirmation');
  assert.deepEqual(writes,[],'Back must not save or rewrite artifact content');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',historyBackAndForward:true,visibleBackFromDocument:true,unsavedDismissPreservesDraft:true,unsavedAcceptLeaves:true,emptySelectionExitReopen:true,htmlLanguagePreserved:true,markdownReopen:true,writes:0,errors}));
 }catch(e){console.error('FIXTURE_DIAGNOSTIC',JSON.stringify({errors:diagnosticErrors,body:await diagnosticPage?.locator('body').innerText().catch(()=>''),url:diagnosticPage?.url()}));throw e;}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
