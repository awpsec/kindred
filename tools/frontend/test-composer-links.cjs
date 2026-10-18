const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[],sent=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/api/chats/dm-piper/messages',r=>{sent.push(r.request().postDataJSON());return r.fulfill({json:{runs:[]}});});
  await page.goto(origin,{waitUntil:'domcontentloaded'});const editor=page.locator('#prompt');await editor.waitFor();
  const marked=()=>page.evaluate(()=>[...CSS.highlights.get('kindred-composer-link')].map(r=>r.toString()));
  const waitLinks=expected=>page.waitForFunction(expected=>JSON.stringify([...CSS.highlights.get('kindred-composer-link')].map(r=>r.toString()))===JSON.stringify(expected),expected);
  await editor.fill('Review https://example.test/report_(draft), then www.example.org.');
  await waitLinks(['https://example.test/report_(draft)','www.example.org']);
  assert.equal(await editor.locator('a').count(),0,'Styling must not insert navigable anchors into editable text');
  const draft=await editor.evaluate(n=>n.value);await editor.focus();await editor.press('ControlOrMeta+End');await page.keyboard.insertText(' More');await editor.press('ControlOrMeta+z');assert.equal(await editor.evaluate(n=>n.value),draft,'Link styling preserves native undo');
  await editor.evaluate(n=>{n.innerHTML='<ul><li>See <span>https://exam</span>ple.test/a?x=1&amp;y=2</li><li><span data-mention="piper" data-name="Piper" contenteditable="false">www.mention.test</span> www.example.org</li></ul>';});
  await waitLinks(['https://example.test/a?x=1&y=2','www.example.org']);
  assert.equal(await editor.evaluate(n=>n.value),'- See https://example.test/a?x=1&y=2\n- @Piper www.example.org');
  await editor.evaluate(n=>{n.value='No links here';});await waitLinks([]);
  await editor.fill('Go ');await editor.press('ControlOrMeta+End');
  await editor.evaluate(n=>{const data=new DataTransfer();data.setData('text/plain','https://example.test/path?q=one#two');n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await waitLinks(['https://example.test/path?q=one#two']);assert.equal(await editor.evaluate(n=>n.value),'Go https://example.test/path?q=one#two');
  await editor.dispatchEvent('compositionstart');await waitLinks([]);await editor.dispatchEvent('compositionend');await waitLinks(['https://example.test/path?q=one#two']);
  await editor.evaluate(n=>{n.value='[Report](https://example.test/report) and (http://127.0.0.1:8080/v1).';});
  await waitLinks(['https://example.test/report','http://127.0.0.1:8080/v1']);
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-composer-links';fs.mkdirSync(out,{recursive:true});
  for(const theme of ['dark','light'])for(const width of [1100,390]){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:800});
   assert(await editor.evaluate(n=>getComputedStyle(n,'::highlight(kindred-composer-link)').textDecorationLine.includes('underline')));
   await page.locator('#composer').screenshot({path:path.join(out,`${engine}-${theme}-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const outgoing=await editor.evaluate(n=>n.value);await editor.press('Enter');await page.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(sent.at(-1).prompt,outgoing);await waitLinks([]);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,paste:true,undo:true,lists:true,mentions:true,ime:true,exactSentText:true,themes:2,widths:2}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
