const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:!process.env.KINDRED_HEADED});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:small'}));
   window.__KINDRED_DICTATION_MODELS=true;window.__TAURI__={core:{invoke:async()=>({phase:'ready',enabled:true,model:'small',models:[]})}};
  },token);
  await page.route(origin+'/app.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,setComputerExpanded,updateDesktopState,hidePane};'}));
  await page.goto(origin);await page.locator('#prompt').waitFor();
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const width of [1320,1050,850,390])for(const size of [100,150]){
   await page.setViewportSize({width,height:900});await page.evaluate(size=>KindredReadingSize.set(size),size);
   await page.locator('#prompt').fill('Short');await settle();
   assert(!await page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline')));
   await page.locator('#prompt').fill(Array.from({length:60},(_,i)=>'Line '+i+' of a long draft.').join('\n'));await settle();
   const bounds=await page.evaluate(()=>{
    const rect=id=>document.querySelector(id).getBoundingClientRect().toJSON();
    return {form:rect('#composer'),editor:rect('#prompt'),send:rect('#send'),provider:rect('#composer-hint'),mic:rect('.dictation-button'),actions:rect('#composer-actions'),scrolls:document.querySelector('#prompt').scrollHeight>document.querySelector('#prompt').clientHeight};
   });
   assert(bounds.scrolls);assert(bounds.form.right-bounds.editor.right<=9,JSON.stringify(bounds));
   assert(bounds.editor.right>bounds.provider.right);assert(bounds.editor.bottom<=bounds.send.top+1,JSON.stringify(bounds));
   const bottoms=[bounds.send,bounds.mic,bounds.actions,bounds.provider].map(r=>r.bottom);assert(Math.max(...bottoms)-Math.min(...bottoms)<=1);
   await page.locator('#prompt').press('Control+End');await page.locator('#prompt').press('q');assert((await page.locator('#prompt').innerText()).endsWith('q'));
   await page.locator('#prompt').fill('');await settle();assert(!await page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline')));
  }
  await page.setViewportSize({width:1100,height:900});await page.evaluate(()=>KindredReadingSize.set(100));
  await page.evaluate(async()=>{
   const m=await import('/app.js');window.fixture=m;m.state.desktopConnected=true;
   const panel=document.querySelector('#computer-panel'),screen=document.querySelector('#desktop');panel.hidden=false;m.updateDesktopState();
   const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;canvas.dataset.fixture='screen';screen.append(canvas);window.fixtureCanvas=canvas;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#305874';ctx.fillRect(0,0,1440,900);ctx.fillStyle='white';ctx.font='48px sans-serif';ctx.fillText('Live screen',60,90);
   m.state.rfb={set scaleViewport(value){const box=screen.getBoundingClientRect(),scale=Math.min(box.width/1440,box.height/900);canvas.style.width=1440*scale+'px';canvas.style.height=900*scale+'px';}};m.state.rfb.scaleViewport=true;
  });await settle();
  for(const width of [850,1100,1320]){
   await page.setViewportSize({width,height:900});await settle();
   const controls=await page.evaluate(()=>['teach-task','take-control'].map(id=>{const n=document.getElementById(id);return {rect:n.getBoundingClientRect().toJSON(),label:n.getAttribute('aria-label'),title:n.title,icon:!!n.querySelector('svg'),compact:getComputedStyle(n.querySelector('span')).display==='none'};}));
   assert(controls.every(c=>c.icon&&c.compact&&c.label===c.title));assert(Math.abs(controls[0].rect.y-controls[1].rect.y)<1);
  }
  const sample=expand=>page.evaluate(async expand=>{
   const panel=document.querySelector('#computer-panel'),screen=document.querySelector('#desktop'),rows=[];
   const read=()=>{const p=panel.getBoundingClientRect(),s=screen.getBoundingClientRect();return {x:p.x,width:p.width,height:s.height,transform:getComputedStyle(panel).transform,canvasSame:screen.contains(window.fixtureCanvas)};};
   rows.push(read());window.fixture.setComputerExpanded(expand);rows.push(read());
   const start=performance.now();while(performance.now()-start<380){await new Promise(requestAnimationFrame);rows.push(read());}
   return rows;
  },expand);
  for(const expanded of [true,false]){
   const rows=await sample(expanded);assert(rows.length>4);assert(Math.abs(rows[0].x-rows[1].x)<2,JSON.stringify(rows.slice(0,2)));
   assert(rows.every(r=>r.transform==='none'&&r.canvasSame));
   for(let i=1;i<rows.length;i++){assert(expanded?rows[i].width>=rows[i-1].width-1:rows[i].width<=rows[i-1].width+1);assert(expanded?rows[i].height>=rows[i-1].height-1:rows[i].height<=rows[i-1].height+1);}
  }
  const reversed=await page.evaluate(async()=>{
   const panel=document.querySelector('#computer-panel');window.fixture.setComputerExpanded(true);await new Promise(r=>setTimeout(r,80));const before=panel.getBoundingClientRect();window.fixture.setComputerExpanded(false);const after=panel.getBoundingClientRect();return Math.abs(before.x-after.x)+Math.abs(before.width-after.width);
  });assert(reversed<3,'Reversal jumped '+reversed);await page.waitForTimeout(400);
  await page.evaluate(()=>window.fixture.setComputerExpanded(true));await page.setViewportSize({width:1000,height:800});await settle();assert.equal(await page.locator('#computer-panel').getAttribute('style'),'');
  await page.evaluate(()=>{window.fixture.state.general.reduced_motion=true;window.fixture.setComputerExpanded(false);});
  assert.equal(await page.locator('#computer-panel').evaluate(n=>n.getAnimations().length),0);
  await page.evaluate(()=>{window.fixture.state.general.reduced_motion=false;window.fixture.setComputerExpanded(true);window.fixture.hidePane(document.querySelector('#computer-panel'));});await page.waitForTimeout(250);
  assert(await page.locator('#computer-panel').isHidden());assert.equal(await page.locator('#desktop').getAttribute('style'),'');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,longComposerRightScrollbar:true,dictationAligned:true,textSizes:[100,150],widths:[390,850,1050,1320],compactIcons:true,smoothBothDirections:true,reversal:true,resize:true,reducedMotion:true,liveCanvasPreserved:true}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
