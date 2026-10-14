const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/login.html');
  await page.evaluate(async()=>{
   const {openDocumentPreview}=await import('/document-preview.js');
   window.openTestPreview=async({inline=false,pending=false}={})=>{
    const card=document.createElement('article');card.id='test-file-card';document.body.append(card);
    let mount=null;if(inline){mount=document.createElement('div');card.append(mount);}
    window.previewLoad=openDocumentPreview({card,mount,name:'notes.txt',extension:'txt',getBlob:signal=>{
     window.previewSignal=signal;
     if(pending)return new Promise(resolve=>{window.resolvePreview=()=>resolve(new Blob(['Loaded after transcript update']));});
     return Promise.resolve(new Blob(['Read without interruption\n'.repeat(200)]));
    }});
    if(!pending)await window.previewLoad;
   };
   await window.openTestPreview();
  });
  await page.locator('.document-prose').waitFor();
  await page.evaluate(()=>{
   const viewer=document.querySelector('.document-dialog');window.viewer=viewer;
   viewer.querySelector('.document-body').scrollTop=120;
   window.scrollBefore=viewer.querySelector('.document-body').scrollTop;
   document.querySelector('#test-file-card').replaceWith(document.createElement('article'));
  });
  // Allow the MutationObserver checkpoint that used to dispose the viewer.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await page.locator('.document-dialog').count(),1,'Transcript replacement must not close the preview');
  assert(await page.evaluate(()=>window.viewer===document.querySelector('.document-dialog')&&window.viewer.open));
  assert.equal(await page.locator('.document-body').evaluate(n=>n.scrollTop),await page.evaluate(()=>window.scrollBefore));
  assert.equal(await page.evaluate(()=>window.previewSignal.aborted),false);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.document-dialog'));
  assert.equal(await page.evaluate(()=>window.previewSignal.aborted),true);
  await page.evaluate(()=>window.openTestPreview({pending:true}));
  await page.evaluate(()=>document.querySelector('#test-file-card').remove());
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await page.locator('.document-dialog').count(),1,'Loading preview must survive replacement');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.document-dialog'));
  assert.equal(await page.evaluate(()=>window.previewSignal.aborted),true);
  await page.evaluate(async()=>{window.resolvePreview();await window.previewLoad;});
  assert.equal(await page.locator('.document-dialog').count(),0,'Late download must not reopen a closed viewer');
  await page.evaluate(()=>window.openTestPreview({inline:true}));
  await page.evaluate(()=>document.querySelector('#test-file-card').remove());
  await page.waitForFunction(()=>window.previewSignal.aborted);
  await page.evaluate(()=>window.openTestPreview());
  await page.evaluate(()=>document.querySelector('.document-dialog').remove());
  await page.waitForFunction(()=>window.previewSignal.aborted);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',replacement:true,scroll:true,close:true,cancelLoading:true,inlineCleanup:true,externalRemovalCleanup:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
