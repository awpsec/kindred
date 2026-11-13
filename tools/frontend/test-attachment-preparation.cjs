const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.KINDRED_TEST_BROWSER||'chromium',browser=await({chromium,webkit}[engine].launch());
 try{
  const p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],writes=[],deletes=[],reads=[],sends=[];let fail=true,gate=null,held=false,id=0;
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.attachmentProbe={queueFiles,renderPendingFiles,pendingFiles,snapshot:conversationSnapshot,setToken:t=>{state.token=t;renderPendingFiles();}};'}));
  await p.route(origin+'/api/uploads',async r=>{const body=r.request().postDataJSON();writes.push(body);if(held)await new Promise(resolve=>gate=resolve);if(fail)return r.fulfill({status:503,json:{error:'Network interrupted'}});return r.fulfill({json:{id:'file-'+(++id),name:body.name,size:Buffer.from(body.data,'base64').length,mime:body.name.endsWith('.png')?'image/png':'text/plain'}});});
  await p.route(origin+'/api/uploads/*',r=>{if(r.request().method()==='DELETE'){deletes.push(r.request().url());return r.fulfill({json:{ok:true}});}reads.push(r.request().url());return r.fulfill({body:'Draft preview contents',contentType:'text/plain'});});
  await p.route(origin+'/api/chats/dm-piper/messages',r=>{sends.push(r.request().postDataJSON());return r.fulfill({json:{runs:[]}});});
  await p.goto(origin);await p.locator('#heading').filter({hasText:'Piper'}).waitFor();await p.locator('#prompt').fill('Keep this draft.');
  await p.evaluate(()=>attachmentProbe.queueFiles([new File(['sample'],'Brief.txt',{type:'text/plain'})]));
  assert.equal(await p.locator('[data-attachment-state=failed]').count(),1);assert(await p.locator('#send').isDisabled());assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep this draft.');assert.equal(await p.evaluate(()=>attachmentProbe.snapshot().files.flatMap(([,f])=>f).length),0);
  fail=false;held=true;await p.getByRole('button',{name:'Retry',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-attachment-state=uploading]'));assert(await p.locator('#send').isDisabled());await p.locator('#prompt').fill('Keep this draft, edited.');assert(await p.locator('#send').isDisabled());for(let i=0;!gate&&i<50;i++)await p.waitForTimeout(20);assert(gate);gate();held=false;await p.locator('[data-attachment-state=ready]').waitFor();assert(!await p.locator('#send').isDisabled());assert.equal(writes.length,2);assert.equal(writes[1].data,writes[0].data);
  await p.getByRole('button',{name:'Preview Brief.txt'}).click();await p.getByRole('dialog').filter({hasText:'Draft preview contents'}).waitFor();await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep this draft, edited.');
  await p.locator('#send').click();await p.locator('.composer-file').waitFor({state:'hidden'});assert.equal(sends.length,1);assert.deepEqual(sends[0].files,['file-1']);
  // Removing an in-flight upload never lets its late response reattach it.
  held=true;gate=null;await p.evaluate(()=>{void attachmentProbe.queueFiles([new File(['later'],'Later.txt')]);});await p.locator('[data-attachment-state=uploading]').waitFor();await p.getByRole('button',{name:'Remove Later.txt'}).focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.composer-file').count(),0);for(let i=0;!gate&&i<50;i++)await p.waitForTimeout(20);assert(gate);gate();held=false;await p.waitForTimeout(150);assert.equal(await p.locator('.composer-file').count(),0);assert(deletes.some(v=>v.endsWith('/file-2')));
  fail=true;await p.evaluate(()=>attachmentProbe.queueFiles([new File(['x'],'Extremely long attachment filename with several words.txt')]));
  await p.setViewportSize({width:390,height:844});const row=await p.locator('.composer-file').boundingBox();assert(row.x>=0&&row.x+row.width<=391);await p.getByRole('button',{name:/Remove Extremely/}).focus();await p.keyboard.press('Enter');assert(!await p.locator('#send').isDisabled());

  // Upload completion must not replace the Remove control between mouse down/up.
  fail=false;held=true;gate=null;await p.setViewportSize({width:1100,height:900});await p.evaluate(()=>{void attachmentProbe.queueFiles([new File(['race'],'Pointer.txt')]);});await p.locator('[data-attachment-state=uploading]').waitFor();for(let i=0;!gate&&i<50;i++)await p.waitForTimeout(20);
  const remove=p.getByRole('button',{name:'Remove Pointer.txt'});await remove.hover();const point=await remove.boundingBox();await p.mouse.move(point.x+point.width/2,point.y+point.height/2);await p.mouse.down();gate();held=false;await p.locator('[data-attachment-state=ready]').waitFor();await p.mouse.up();await p.locator('.composer-file').waitFor({state:'hidden'});
  // Restoring a queued message replaces the collection but reuses draft file objects.
  held=true;gate=null;await p.evaluate(()=>{void attachmentProbe.queueFiles([new File(['merged'],'Merged.txt')]);});await p.locator('[data-attachment-state=uploading]').waitFor();for(let i=0;!gate&&i<50;i++)await p.waitForTimeout(20);
  await p.evaluate(()=>{const files=attachmentProbe.pendingFiles.get('dm-piper');attachmentProbe.pendingFiles.set('dm-piper',[...files]);attachmentProbe.renderPendingFiles();});gate();held=false;await p.locator('[data-attachment-state=ready]').waitFor();
  await p.evaluate(()=>{const files=attachmentProbe.pendingFiles.get('dm-piper');attachmentProbe.pendingFiles.set('dm-piper',[...files]);attachmentProbe.renderPendingFiles();window.staleAttachmentControls=[...document.querySelectorAll('.composer-file button')];});
  await p.getByRole('button',{name:'Remove Merged.txt'}).focus();await p.keyboard.press('Enter');await p.locator('.composer-file').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>attachmentProbe.pendingFiles.get('dm-piper').length),0);
  // Ready files are a horizontal tray: images are thumbnails, documents are compact cards.
  await p.evaluate(()=>attachmentProbe.queueFiles([
    new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Q5sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'Screenshot.png',{type:'image/png'}),
    new File(['brief'],'Client brief.docx'),new File(['notes'],'Notes.txt')
  ]));
  await p.locator('#prompt').fill('Keep the attachments together.');await p.mouse.move(2,2);await p.waitForTimeout(150);
  assert.equal(await p.locator('.composer-files-status').count(),0);
  assert.equal(await p.locator('.composer-file-status:visible').count(),0);
  assert.equal(await p.locator('.composer-file-image').count(),1);
  assert.equal(await p.locator('.composer-file-image .composer-file-name:visible').count(),0);
  const boxes=await p.locator('.composer-file').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
  assert(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1&&b.height===76));assert.equal(boxes[0].width,76);assert(boxes[1].width<=220);
  assert.equal(await p.getByRole('button',{name:'Remove Screenshot.png'}).evaluate(n=>getComputedStyle(n).opacity),'0');
  await p.locator('.composer-file-image').hover();await p.waitForTimeout(150);assert.equal(await p.getByRole('button',{name:'Remove Screenshot.png'}).evaluate(n=>getComputedStyle(n).opacity),'1');
  if(process.env.KINDRED_ATTACHMENT_SCREENSHOT)await p.screenshot({path:process.env.KINDRED_ATTACHMENT_SCREENSHOT});
  await p.setViewportSize({width:390,height:844});
  assert(await p.locator('.composer-files').evaluate(n=>n.scrollWidth>n.clientWidth));
  assert(await p.locator('#composer').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  await p.getByRole('button',{name:'Preview Notes.txt'}).click();await p.getByRole('dialog').filter({hasText:'Draft preview contents'}).waitFor();await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  for(const name of ['Screenshot.png','Client brief.docx','Notes.txt']){await p.getByRole('button',{name:'Remove '+name}).focus();await p.keyboard.press('Enter');}
  await p.setViewportSize({width:1100,height:900});
  // A response from the previous account cannot appear in this account's draft.
  held=true;gate=null;await p.evaluate(()=>{void attachmentProbe.queueFiles([new File(['private'],'Private.txt')]);});await p.locator('[data-attachment-state=uploading]').waitFor();for(let i=0;!gate&&i<50;i++)await p.waitForTimeout(20);const deletedBeforeSwitch=deletes.length,readsBeforeSwitch=reads.length;await p.evaluate(()=>{attachmentProbe.setToken('new-account');for(const control of window.staleAttachmentControls)control.click();});gate();held=false;await p.waitForTimeout(150);assert.equal(await p.locator('.composer-file').count(),0);assert.equal(await p.evaluate(()=>attachmentProbe.pendingFiles.size),0);assert.equal(deletes.length,deletedBeforeSwitch);assert.equal(reads.length,readsBeforeSwitch);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,retryExactBytes:true,retainedDraft:true,preview:true,sendReadiness:true,removedLateUpload:true,pointerContinuity:true,replacedCollection:true,staleControls:true,accountIsolation:true,mobileFit:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
