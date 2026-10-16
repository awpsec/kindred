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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch(),records=[];let page;
 try{
  page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  if(process.env.BASELINE_MODULE)await page.route('**/document-preview.js',r=>r.fulfill({body:fs.readFileSync(process.env.BASELINE_MODULE),contentType:'text/javascript'}));
  await page.route('**/review.pdf',r=>r.fulfill({body:pdf(40),contentType:'application/pdf'}));await page.route('**/resize-end-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body></body></html>'}));await page.goto('http://127.0.0.1:'+server.address().port+'/resize-end-test');
  await page.evaluate(async()=>{const {openDocumentPreview}=await import('/document-preview.js');const card=document.createElement('article');document.body.append(card);window.handle=await openDocumentPreview({card,name:'Review.pdf',extension:'pdf',getBlob:signal=>fetch('/review.pdf',{signal}).then(r=>r.blob())});});
  const rendered=n=>page.locator(`.document-pdf-page[data-page="${n}"] canvas`);
  await rendered(1).waitFor();await page.locator('.document-pdf-page[data-page="13"]').evaluate(n=>n.scrollIntoView({block:'start'}));await rendered(13).waitFor();
  // Wait on actual fitted page dimensions; a retained canvas is not a resize receipt.
  const fitted=()=>page.waitForFunction(()=>{const v=document.querySelector('.document-pdf'),p=v.querySelector('.document-pdf-page'),css=getComputedStyle(v),w=v.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),h=v.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);const expected=document.querySelector('.document-zoom')?816*Math.min(1,w/1056,h/1056):w;return Math.abs(p.getBoundingClientRect().width-expected)<1.5;});
  await page.locator('.document-dialog').evaluate(n=>n.style.width='350px');await fitted();
  await page.locator('.document-pdf-page[data-page="40"]').evaluate(n=>n.scrollIntoView({block:'start'}));await rendered(40).waitFor();await page.waitForFunction(()=>document.querySelector('.document-footer').textContent.startsWith('Page 40 of 40'));
  const facts=()=>page.evaluate(()=>{const v=document.querySelector('.document-pdf'),p=v.querySelector('[data-page="40"]'),b=v.getBoundingClientRect();return{footer:document.querySelector('.document-footer').textContent,scroll:v.scrollTop,maxScroll:v.scrollHeight-v.clientHeight,height:v.clientHeight,lastTop:p.getBoundingClientRect().top-b.top,lastBottom:p.getBoundingClientRect().bottom-b.top,zoom:document.querySelector('.document-zoom-value')?.textContent,canvasCount:v.querySelectorAll('canvas').length};});
  records.push({phase:'narrow-end',facts:await facts()});
  for(const width of [850,350]){
   // A last-page navigation arrives during the actual deferred resize fit.
   await page.locator('.document-dialog').evaluate((dialog,width)=>{dialog.style.width=width+'px';const v=dialog.querySelector('.document-pdf');v.scrollTop=v.scrollHeight;},width);
   records.push({phase:'end-request-before-fit',width,facts:await facts()});await fitted();await rendered(40).waitFor();
   const state=await facts();records.push({phase:'settled-after-fit',width,facts:state});
   assert(state.maxScroll-state.scroll<=2,'Resize fit must retain the last-page navigation at the document end');
   await page.waitForFunction(()=>document.querySelector('.document-footer').textContent.startsWith('Page 40 of 40'));assert(state.canvasCount<=6);
  }
  await page.evaluate(()=>window.handle.dispose());await page.waitForFunction(()=>!document.querySelector('.document-dialog'));
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);console.log(JSON.stringify({passed:true,records,errors,consoleErrors}));
 }catch(error){console.error(JSON.stringify({passed:false,error:String(error),records}));throw error;}
 finally{const out=process.env.KINDRED_TEST_ARTIFACTS;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'resize-end-results.json'),JSON.stringify(records,null,2));}await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
