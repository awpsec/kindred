const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:small'}));window.__KINDRED_DICTATION_MODELS=true;window.__TAURI__={core:{invoke:async()=>({phase:'ready',enabled:true,model:'small',models:[]})}};},token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,resizeComposer};'}));
  await page.route('**/api/uploads',r=>r.fulfill({json:{id:'preview-file',name:'project-notes.txt'}}));
  await page.route('**/api/uploads/preview-file',r=>r.fulfill({json:{ok:true}}));
  await page.goto(origin);const editor=page.locator('#prompt');await editor.waitFor();
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-compact-composer';fs.mkdirSync(out,{recursive:true});
  const settle=()=>page.waitForTimeout(250),expanded=()=>page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline'));
  const bounds=()=>page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {form:r('#composer'),text:r('#prompt'),plus:r('#composer-actions'),send:r('#send'),hint:r('#composer-hint')};});
  const compact=async()=>{await settle();const b=await bounds();assert(b.form.height<70,JSON.stringify(b));assert(b.text.x>=b.plus.right&&b.text.right<=b.hint.x,'editor stays between controls');assert(Math.abs(b.text.y+b.text.height/2-b.plus.y-b.plus.height/2)<2,'inline alignment');assert.equal(await expanded(),false);};
  const capture=async label=>{await settle();await page.locator('#composer-area').screenshot({path:path.join(out,`${engine}-${label}.png`)});};
  for(const theme of ['dark','light']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await editor.fill('');await compact();await capture(theme+'-empty');
   await editor.fill('Can you check this for me?');await compact();await capture(theme+'-short');
   await editor.fill('Please review the updated proposal and prepare a draft response with the remaining questions. '.repeat(4));await settle();assert(await expanded());let b=await bounds();assert(b.text.bottom<=b.plus.y);await capture(theme+'-wrapped');
   await editor.fill('Short again');assert(await expanded(),'expanded draft remains stable until empty');await editor.fill('');await compact();
   await page.locator('input[type="file"]').setInputFiles({name:'project-notes.txt',mimeType:'text/plain',buffer:Buffer.from('Notes for the proposal')});await page.getByRole('button',{name:'Remove project-notes.txt',exact:true}).waitFor();await editor.fill('Please review these notes.');await capture(theme+'-attachment');b=await bounds();assert(b.text.bottom<=b.plus.y);await page.getByRole('button',{name:'Remove project-notes.txt',exact:true}).click();await compact();await editor.fill('');await compact();
  }
  await editor.fill('\n');assert(await expanded(),'explicit newline expands even without text');await editor.fill('');await compact();
  await editor.dispatchEvent('compositionstart');await editor.evaluate(n=>{n.textContent='Composing a long draft '.repeat(30);n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});assert.equal(await expanded(),false,'IME defers layout state');await editor.dispatchEvent('compositionend');assert(await expanded());
  await editor.fill('short');await page.evaluate(async()=>{const m=await import('/app.js');window.originalChat=m.state.chat;m.state.chat={id:'other-chat'};m.resizeComposer();});await compact();await page.evaluate(async()=>{const m=await import('/app.js');m.state.chat=window.originalChat;m.resizeComposer();});
  await editor.fill('');await editor.fill('A draft that fits comfortably at this window width');await compact();await page.setViewportSize({width:500,height:800});await settle();assert(await expanded(),'narrowing expands wrapped draft');await page.setViewportSize({width:1100,height:800});await settle();assert(await expanded(),'widening preserves draft layout');await editor.fill('');await compact();
  await editor.fill('https://github.com/awpsec/kindred');await page.waitForFunction(()=>[...CSS.highlights.get('kindred-composer-link')].some(r=>r.toString().includes('github.com')));await editor.focus();await editor.press('ControlOrMeta+End');await page.keyboard.insertText(' notes');await editor.press('ControlOrMeta+z');assert.equal(await editor.innerText(),'https://github.com/awpsec/kindred','native undo preserved');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,inline:true,wrapped:true,sticky:true,emptyReset:true,chatReset:true,ime:true,attachments:true,narrowing:true,undo:true,screenshots:8}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
