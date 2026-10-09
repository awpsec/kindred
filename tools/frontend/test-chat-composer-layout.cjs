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
   assert(await page.locator('#composer').evaluate(n=>{const form=n.getBoundingClientRect(),editor=n.querySelector('#prompt').getBoundingClientRect(),controls=n.querySelector('#composer-actions').getBoundingClientRect();return form.height>=108&&editor.bottom<=controls.top&&editor.left<controls.right&&editor.right>n.querySelector('#send').getBoundingClientRect().left;}),'Even short drafts write above the controls at every size');
   await page.locator('#prompt').fill(Array.from({length:60},(_,i)=>'Line '+i+' of a long draft.').join('\n'));await settle();
   const bounds=await page.evaluate(()=>{
    const rect=id=>document.querySelector(id).getBoundingClientRect().toJSON();
    return {form:rect('#composer'),editor:rect('#prompt'),send:rect('#send'),provider:rect('#composer-hint'),mic:rect('.dictation-button'),actions:rect('#composer-actions'),scrolls:document.querySelector('#prompt').scrollHeight>document.querySelector('#prompt').clientHeight};
   });
   assert(bounds.scrolls);assert(bounds.form.right-bounds.editor.right<=13,JSON.stringify(bounds));
   assert(bounds.editor.right>bounds.provider.right);assert(bounds.editor.bottom<=bounds.send.top+1,JSON.stringify(bounds));
   const bottoms=[bounds.send,bounds.mic,bounds.actions,bounds.provider].map(r=>r.bottom);assert(Math.max(...bottoms)-Math.min(...bottoms)<=1);
   await page.locator('#prompt').press('Control+End');await page.locator('#prompt').press('q');assert((await page.locator('#prompt').innerText()).endsWith('q'));
   await page.locator('#prompt').fill('');await settle();assert(!await page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline')));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,minimumHeight:108,textSizes:[100,150],widths:[390,850,1050,1320],promptAboveControls:true,longDraftScroll:true,dictationAligned:true}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
