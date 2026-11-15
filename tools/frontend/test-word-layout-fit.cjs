// Exercise real Word fallback layout without wrapping or filtering ResizeObserver.
const {server}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;
(async()=>{
 const fixtureName=process.env.KINDRED_WORD_FIXTURE||'original-v1.docx';
 const bytes=fs.readFileSync(path.join(__dirname,'fixtures/document-originals',fixtureName)).toString('base64');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();const receipts=[];
 try{for(const width of [1000,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route(origin+'/word-fit-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/style.css"></head><body><main id="mount" style="height:100dvh;max-width:760px;display:flex;flex-direction:column"></main></body></html>'}));
  await page.goto(origin+'/word-fit-test');
  await page.evaluate(bytes=>{
   window.wordFixture=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));
   window.openWord=async()=>{const {openDocumentPreview}=await import('/document-preview.js');const mount=document.querySelector('#mount');window.wordHandle=await openDocumentPreview({card:mount,mount,name:'Original document',extension:'docx',getBlob:async()=>new Blob([wordFixture]),getPagePreview:async()=>{throw Error('Synthetic conversion unavailable');},download:()=>{}});};
  },bytes);
  const geometries=[];
  for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>openWord());await page.locator('.document-word').getByText('Original Word revision one',{exact:true}).waitFor();
   if(fixtureName==='twenty-page-touch.docx')assert.equal(await page.locator('.document-word section.docx').count(),20,'the native reproduction uses twenty actual Word pages');
   await page.getByRole('button',{name:'Fit width',exact:true}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('.document-zoom button')].some(n=>n.textContent==='Fit width'&&n.getAttribute('aria-pressed')==='true'));
   await page.getByRole('button',{name:'Fit page',exact:true}).click();
   for(const nextWidth of [width,320,900,width]){
    await page.setViewportSize({width:nextWidth,height:900});
    await page.waitForFunction(()=>{const n=document.querySelector('.document-word'),paper=n?.shadowRoot.querySelector('section.docx');if(!paper)return false;const css=getComputedStyle(n),available=n.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);return paper.getBoundingClientRect().width>0&&paper.getBoundingClientRect().width<=available+2;});
    const samples=await page.evaluate(async()=>{const n=document.querySelector('.document-word'),content=n.shadowRoot.querySelector('.paper'),paper=n.shadowRoot.querySelector('section.docx'),rows=[];for(let i=0;i<6;i++){await new Promise(requestAnimationFrame);rows.push({zoom:content.style.zoom,paper:paper.getBoundingClientRect().width,available:n.clientWidth});}return rows;});
    assert(new Set(samples.slice(-3).map(x=>x.zoom)).size===1,'paper fit settles after resize');geometries.push({cycle,width:nextWidth,samples});
   }

   if(width===390&&cycle===0){
    const gesture=await page.evaluate(async()=>{
     const n=document.querySelector('.document-word'),paper=n.shadowRoot.querySelector('.paper'),r=n.getBoundingClientRect(),start=Number(paper.style.zoom);
     const fire=(type,touches)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:touches});n.dispatchEvent(e);return e.defaultPrevented;};
     const points=d=>[{clientX:r.left+r.width/2-d/2,clientY:r.top+100},{clientX:r.left+r.width/2+d/2,clientY:r.top+100}];
     const oneFinger=fire('touchstart',[points(100)[0]]);
     fire('touchstart',points(100));fire('touchmove',points(200));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
     const scaled=Number(paper.style.zoom);fire('touchcancel',[]);n.scrollLeft=40;
     return {oneFinger,start,scaled,panning:n.scrollLeft>0,ended:!n.hasAttribute('data-document-pinching')};
    });
    assert.equal(gesture.oneFinger,false,'one-finger pan remains native');assert(Math.abs(gesture.scaled-gesture.start*2)<.02,'pinch scales actual Word paper');assert(gesture.panning&&gesture.ended,'zoomed Word surface pans and cancellation releases the gesture');
   }
   const cleanup=await page.evaluate(async()=>{const n=document.querySelector('.document-word'),paper=n.shadowRoot.querySelector('.paper');window.wordHandle.dispose();const zoom=paper.style.zoom;for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);return {removed:!document.querySelector('.document-inline'),zoomUnchanged:paper.style.zoom===zoom};});
   assert.deepEqual(cleanup,{removed:true,zoomUnchanged:true});
  }
  assert.deepEqual(errors,[],'No page error is ignored, including ResizeObserver delivery errors');
  receipts.push({width,cycles:3,geometries,errors});await context.close();
 }
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,engine+'-word-fit-results.json'),JSON.stringify({passed:true,engine,receipts},null,2));}
 console.log(JSON.stringify({passed:true,engine,fixture:fixtureName,contexts:receipts.length,cyclesEach:3}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
