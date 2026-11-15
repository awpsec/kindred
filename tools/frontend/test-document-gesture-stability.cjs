// WebKit regression for stable Word text while gestures preview a new scale.
// Constructed DOM events exercise rendering; genuine touch tests run separately.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await webkit.launch();
 try{
  const page=await browser.newPage({viewport:{width:466,height:678},hasTouch:true}),errors=[];
  await page.emulateMedia({reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.addInitScript(()=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';});
  await page.route('**/gesture.docx',r=>r.fulfill({body:fs.readFileSync(path.join(__dirname,'fixtures/document-originals/original-v1.docx')),contentType:'application/octet-stream'}));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const {openDocumentPreview}=await import('/document-preview.js');
   window.preview=await openDocumentPreview({card:document.body,name:'Gesture review.docx',extension:'docx',getBlob:signal=>fetch('/gesture.docx',{signal}).then(r=>r.blob())});
   window.sample=()=>{const s=document.querySelector('.document-word'),p=s.shadowRoot.querySelector('.paper'),section=p.querySelector('section.docx'),r=section.getBoundingClientRect();return {committed:Number(p.style.zoom),transform:p.style.transform,width:r.width,natural:[section.offsetWidth,section.offsetHeight],viewport:[s.clientWidth,s.clientHeight],active:s.hasAttribute('data-document-pinching'),mode:document.querySelector('.document-zoom button[aria-pressed=true]')?.textContent||'',rootScale:visualViewport.scale};};
   window.frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   window.doubleTap=()=>{const s=document.querySelector('.document-word'),r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+120}));};
   window.touch=(type,distance)=>{const s=document.querySelector('.document-word'),r=s.getBoundingClientRect(),e=new Event(type,{bubbles:true,cancelable:true}),x=r.x+r.width/2,y=r.y+150;Object.defineProperty(e,'touches',{value:distance?[{clientX:x-distance/2,clientY:y},{clientX:x+distance/2,clientY:y}]:[]});s.dispatchEvent(e);};
  });
  await page.waitForFunction(()=>document.querySelector('.document-word')?.shadowRoot?.querySelector('section.docx')&&document.querySelector('.document-zoom-value')?.textContent.endsWith('%'));
  const initial=await page.evaluate(async()=>{
   document.documentElement.dataset.motion='on';await document.fonts.ready;
   let previous='',stable=0;
   for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);const s=sample(),key=JSON.stringify([s.committed,s.natural,s.viewport]);stable=key===previous?stable+1:0;previous=key;if(stable>=3)return s;}
   throw Error('Word fit did not settle before the gesture');
  });
  const moving=await page.evaluate(async()=>{doubleTap();await frames();return sample();});
  assert(moving.active&&moving.transform,'Word has a visual gesture preview: '+JSON.stringify({initial,moving}));
  assert.equal(moving.committed,initial.committed,'Live text keeps its rasterization scale during animation');
  assert(Math.abs(moving.width-initial.width)>0.5,'Retaining text does not freeze the visible zoom');
  await page.waitForFunction(()=>!sample().active);
  const fitted=await page.evaluate(()=>sample());assert.equal(fitted.mode,'Fit width');assert.equal(fitted.transform,'');
  await page.evaluate(()=>doubleTap());await page.waitForFunction(()=>!sample().active);
  let restored=await page.evaluate(()=>sample());assert.equal(restored.mode,initial.mode);assert(Math.abs(restored.committed-initial.committed)<0.0001,'Previous fit scale is restored: '+JSON.stringify({initial,moving,fitted,restored}));
  const pinch=await page.evaluate(async()=>{touch('touchstart',100);const rows=[];for(const d of [115,135,160,185]){touch('touchmove',d);await frames();rows.push(sample());}touch('touchend',0);await frames();return {rows,settled:sample()};});
  assert(pinch.rows.every(r=>r.committed===initial.committed&&r.transform),'Pinch never repeatedly changes Word glyph layout scale');
  assert(pinch.rows.at(-1).width>pinch.rows[0].width*1.4,'The preview tracks actual finger-distance changes');
  assert.equal(pinch.settled.transform,'');assert(!pinch.settled.active);assert(pinch.settled.committed>initial.committed*1.8);
  const manual=pinch.settled.committed;
  await page.evaluate(()=>doubleTap());await page.waitForFunction(()=>!sample().active);assert.equal((await page.evaluate(()=>sample())).mode,'Fit width');
  await page.evaluate(()=>doubleTap());await page.waitForFunction(()=>!sample().active);
  restored=await page.evaluate(()=>sample());assert.equal(restored.mode,'');assert(Math.abs(restored.committed-manual)<0.0001,'Second double-tap restores an arbitrary manual zoom');
  for(const reduction of ['system','app']){
   await page.emulateMedia({reducedMotion:reduction==='system'?'reduce':'no-preference'});
   await page.evaluate(reduction=>document.documentElement.dataset.motion=reduction==='app'?'off':'on',reduction);
   const r=await page.evaluate(async()=>{doubleTap();await frames();return sample();});
   assert(!r.active&&!r.transform&&r.mode==='Fit width',reduction+' reduction settles directly at Fit Width');
   await page.evaluate(()=>doubleTap());await page.waitForFunction(()=>!sample().active);
   assert(Math.abs((await page.evaluate(()=>sample())).committed-manual)<0.0001);
  }
  assert.equal((await page.evaluate(()=>sample())).rootScale,1);assert.deepEqual(errors,[]);
  await page.evaluate(()=>preview.dispose());assert.equal(await page.locator('.document-dialog').count(),0);
  console.log(JSON.stringify({passed:true,engine:'webkit',retainedWordText:true,liveVisualZoom:true,fitWidthToggle:true,manualRestore:true,reducedMotion:true,constructedDOMTouches:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
