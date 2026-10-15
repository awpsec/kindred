const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function pdf(count){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${count} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<count;i++){
  const landscape=i===12,stream=`BT /F1 24 Tf 50 ${landscape?520:710} Td (Review document - page ${i+1}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${landscape?'792 612':'612 792'}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 let text='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=text.length;
 text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text);
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const page=await browser.newPage({viewport:{width:1260,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/review.pdf',r=>r.fulfill({body:pdf(40),contentType:'application/pdf'}));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const {openDocumentPreview}=await import('/document-preview.js');
   window.openPages=async(inline=false)=>{
    const card=document.createElement('article');card.id='reading-card';document.body.append(card);let mount=null;
    if(inline){card.style.cssText='position:fixed;inset:0;z-index:9999;background:var(--surface)';mount=document.createElement('div');mount.style.height='100%';card.append(mount);}
    window.handle=await openDocumentPreview({card,mount,name:'Review.pdf',extension:'pdf',getBlob:signal=>fetch('/review.pdf',{signal}).then(r=>r.blob())});
   };await window.openPages();
  });
  const rendered=n=>page.locator(`.document-pdf-page[data-page="${n}"] canvas`);
  const jump=async n=>{await page.locator(`.document-pdf-page[data-page="${n}"]`).evaluate(node=>node.scrollIntoView({block:'start'}));await rendered(n).waitFor();};
  await rendered(1).waitFor().catch(async error=>{console.error(await page.evaluate(()=>({body:document.body.innerText,html:document.querySelector('.document-dialog')?.outerHTML})));throw error;});assert.equal(await page.locator('.document-pdf-page').count(),40);assert.equal(await page.getByRole('button',{name:/Previous page|Next page/}).count(),0);
  await jump(13);assert(await page.locator('.document-pdf-page[data-page="13"]').evaluate(n=>n.clientWidth>n.clientHeight),'Landscape page preserves its dimensions');
  await jump(40);await page.waitForFunction(()=>document.querySelector('.document-footer').textContent.startsWith('Page 40 of 40'));
  assert(await page.locator('.document-pdf canvas').count()<=6,'Only nearby page canvases are retained');assert.equal(await rendered(1).count(),0,'Distant first page canvas released');
  await jump(1);assert(await rendered(1).evaluate(c=>c.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v<100)),'Returning to a freed page renders its actual content');
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/artifact-scroll-20261015';fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,`continuous-document-${process.env.WEBKIT?'webkit':'chromium'}.png`)});
  await page.locator('.document-pdf').evaluate(n=>n.scrollTop=n.querySelector('.document-pdf-page').clientHeight-280);await rendered(2).waitFor();
  await page.screenshot({path:path.join(out,`continuous-page-boundary-${process.env.WEBKIT?'webkit':'chromium'}.png`)});
  for(const width of [390,900]){
   await page.setViewportSize({width,height:860});await jump(20);await page.waitForFunction(()=>document.querySelector('.document-pdf').scrollWidth<=document.querySelector('.document-pdf').clientWidth+1);
   assert(await page.locator('.document-pdf canvas').count()<=6);await jump(40);await page.waitForFunction(()=>document.querySelector('.document-footer').textContent.startsWith('Page 40 of 40'));await jump(20);
  }
  await page.evaluate(()=>document.querySelector('#reading-card').remove());await rendered(20).waitFor();assert.equal(await page.locator('.document-dialog').count(),1,'Replacing transcript card keeps reading session');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.document-dialog'));
  await page.evaluate(()=>window.openPages(true));await rendered(1).waitFor();await jump(40);assert(await page.locator('.document-inline .document-pdf').evaluate(n=>n.scrollTop>0));
  await page.evaluate(()=>window.handle.dispose());await page.waitForFunction(()=>!document.querySelector('.document-inline'));await page.waitForTimeout(150);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',continuous:true,mixedOrientation:true,boundedCanvases:true,responsive:true,inline:true,lifecycle:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
