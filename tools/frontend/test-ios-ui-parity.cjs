// Shared transcript features must remain available in the iOS shell.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token,profileID}=require('./fixtures/duo.cjs');
const bundle=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await webkit.launch();
 try {
  const page=await browser.newPage({viewport:{width:466,height:780},hasTouch:true}),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.stack));
  // This test reads geometry directly; the general fixture selection sampler
  // assumes single text nodes and throws while clearing a multiline draft.
  await page.route('**/fixture/probe.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.addInitScript(({token,profileID,css,js,duo})=>{
   sessionStorage.setItem('kindred-token',token);
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:profileID,__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,navigation:[]});
   window.accountRequests=[];window.webkit={messageHandlers:{kindredAccounts:{postMessage:m=>accountRequests.push(m)},kindredNavigation:{postMessage:v=>navigation.push(v)},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:34,leftInset:0,rightInset:duo?84:0,railSide:'right',isDuo:duo,isDuoInner:false,usesNativeRail:duo,isPortrait:true,viewportHeight:780};
   window.__KINDRED_NATIVE_GEOMETRY={width:466,height:780,windowWidth:466,windowHeight:780,reservedRegions:[]};
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{token,profileID,duo:process.env.KINDRED_TEST_IPHONE!=='1',css:fs.readFileSync(path.join(bundle,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(bundle,'MobileLayout.js'),'utf8')});
  await page.route('**/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.renderParityFiles=renderAttachments;'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/#kindred-chat=dm-vivienne');
  await page.locator('#content [data-message="61"]').waitFor({state:'attached'});


  assert.equal(await page.evaluate(()=>KindredBotMessageStyle.get()),'bubbles');
  await page.locator('#prompt').fill('Keep this draft while changing appearance');
  await page.evaluate(()=>document.querySelector('#settings-button').click());
  const choice=page.getByRole('combobox',{name:'Bot messages',exact:true});await choice.waitFor();
  for(const scale of [1,1.5,2]){
   await page.evaluate(scale=>dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}})),scale);
   const sizes=await choice.evaluate(n=>({field:parseFloat(getComputedStyle(n).fontSize),label:parseFloat(getComputedStyle(n.closest('.setting-row').querySelector('.setting-label')).fontSize)}));
   assert.equal(sizes.field,13*scale);assert.equal(sizes.field,sizes.label,'setting value and label share Dynamic Type sizing');
   const account=page.locator('.settings-account input');assert.equal(await account.evaluate(n=>parseFloat(getComputedStyle(n).fontSize)),13*scale);
  }
  await page.evaluate(()=>dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}})));
  await choice.selectOption('prose');
  assert.equal(await page.evaluate(()=>localStorage.getItem('kindred-bot-message-style')),'prose');
  await page.evaluate(()=>document.querySelector('#settings-dialog').close());
  const answer=page.locator('#content .conversation-answer>.message-row.assistant>.message-bubble').last();
  assert.equal(await answer.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#prompt').evaluate(n=>n.value),'Keep this draft while changing appearance');
  await page.reload();await page.locator('#content [data-message="61"]').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>KindredBotMessageStyle.get()),'prose','style survives reload');
  await page.evaluate(()=>document.querySelector('#settings-button').click());
  await choice.selectOption('bubbles');await page.evaluate(()=>document.querySelector('#settings-dialog').close());
  assert.notEqual(await answer.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.route('**/api/deliverables/parity-*',r=>r.fulfill({contentType:'text/plain',body:'Attachment parity preview'}));
  await page.evaluate(()=>{
   const host=document.createElement('article');host.id='parity-files';host.className='message-group';document.querySelector('#content').append(host);
   renderParityFiles(host,[{id:'parity-single',kind:'file',name:'A long attachment name for a client review with important details.txt',size:25}]);
   renderParityFiles(host,Array.from({length:4},(_,i)=>({id:'parity-'+i,kind:'file',name:'Report '+i+'.txt',size:25})));
   document.querySelector('#content').scrollTop=1e8;
  });
  const single=page.locator('#parity-files>.deliverable-card');
  assert(await single.evaluate(n=>n.classList.contains('is-compact')));
  const group=page.locator('#parity-files>.document-stack');assert(await group.evaluate(n=>n.classList.contains('compact-file-stack')));
  await group.locator('summary').click();await group.locator('.document-stack-body').waitFor();
  for(const width of [320,390,466,951]){
   await page.setViewportSize({width,height:780});
   await page.waitForTimeout(350);
   const rows=await page.locator('#parity-files .deliverable-card').evaluateAll(nodes=>nodes.map(n=>{const box=n.getBoundingClientRect(),heading=n.querySelector('.deliverable-heading').getBoundingClientRect(),copy=n.querySelector('.deliverable-copy').getBoundingClientRect(),actions=n.querySelector('.deliverable-actions').getBoundingClientRect();return {width:box.width,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,copyRight:copy.right,actionsLeft:actions.left,headingRight:heading.right,actionsRight:actions.right,buttons:[...n.querySelectorAll('.deliverable-actions button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))};}));
   for(const row of rows){assert(row.width>0);assert(row.scrollWidth<=row.clientWidth+1,'files must not overflow');assert(row.copyRight<=row.actionsLeft+1,'filename and actions do not collide');assert(row.actionsRight<=row.headingRight+1);assert(row.buttons.every(b=>b.w>=44&&b.h>=44),'touch actions stay usable');}
  }
  await single.locator('.file-preview').click();await page.locator('.document-dialog').waitFor();
  await page.getByText('Attachment parity preview',{exact:true}).waitFor();
  await page.evaluate(()=>document.querySelector('.document-dialog').close());

  let exported=0;
  // The shared fixture predates the API's explicit artifact kind field.
  await page.route('**/api/workspace-artifacts/duo-document',async r=>{const response=await r.fetch();return r.fulfill({json:{...await response.json(),kind:'document'}});});
  await page.route('**/api/workspace-artifacts/duo-document/export',r=>{exported++;return r.fulfill({json:{filename:'Duo document.txt',content_type:'text/plain',data_base64:Buffer.from('Exported fixture document').toString('base64')}});});
  await page.route('**/api/workspace-artifacts/duo-document/preview',r=>r.fulfill({status:404,body:'No PDF preview in fixture'}));
  await page.evaluate(()=>{history.pushState({},'', '/artifacts/duo-document');dispatchEvent(new PopStateEvent('popstate'));});

  const documentAction=async title=>{
   const before=await page.evaluate(()=>accountRequests.length);
   await page.locator('.ios-artifact-document-actions').click();
   await page.waitForFunction(n=>accountRequests.slice(n).some(m=>m.action==='native-menu'&&m.title==='Document actions'),before);
   const menu=await page.evaluate(()=>accountRequests.filter(m=>m.action==='native-menu').at(-1));
   assert(menu.items.some(i=>i.title===title&&!i.disabled),title+' is present and enabled');
   await page.evaluate(id=>__kindredNativeMenus.perform(id),menu.items.find(i=>i.title===title).id);
  };
  await page.locator('.ios-artifact-document-actions').waitFor();
  for(const width of [320,466,951]){
   await page.setViewportSize({width,height:780});await page.waitForTimeout(300);
   const box=await page.locator('.ios-artifact-document-actions').boundingBox();
   assert(box&&box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1,'native document actions fit');
  }
  const savedFile=page.waitForEvent('download');await documentAction('Download');assert.equal((await savedFile).suggestedFilename(),'Duo document.txt');assert.equal(exported,1);
  await documentAction('Edit document');
  const editor=page.locator('.artifact-editor-mount [contenteditable=true]');try{await editor.waitFor();}catch(error){console.log(await page.locator('.artifact-workbench-body').innerText());throw error;}
  await editor.fill('Edited on iOS in the local fixture');
  const previousEditor=await editor.elementHandle();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.waitForFunction(n=>!n.isConnected,previousEditor);
  await page.getByRole('button',{name:'Save changes',exact:true}).waitFor();
  await page.waitForFunction(()=>!!document.querySelector('.artifact-workbench-actions [aria-label="Finish editing"]'));
  const saved=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/workspace-artifacts/duo-document',{headers:{Authorization:'Bearer '+token}})).json();
  assert(saved.source.includes('Edited on iOS in the local fixture'),'mobile edit persists through shared save handler');
  await documentAction('Finish editing');
  await page.waitForFunction(()=>!!document.querySelector('.artifact-workbench-actions [aria-label="Edit document"]'));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,iosMessageStyleVisible:true,stylePersists:true,draftPreserved:true,compactAttachments:true,groupedFiles:true,responsiveTouchTargets:true,previewWorks:true,dynamicTypeConsistent:true,nativeDocumentActions:true,artifactEditSavePreview:true,artifactExport:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
