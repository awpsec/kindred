const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try {
  for(const platform of ['linux','windows','macos']) {
   const context=await browser.newContext({viewport:{width:1100,height:800}}),p=await context.newPage(),errors=[],sent=[];
   p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(({token,platform})=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform};window.__KINDRED_NATIVE_FRAME=platform==='linux';window.__TAURI__={core:{invoke:async()=>null}};Object.defineProperty(navigator,'platform',{value:platform==='linux'?'Linux x86_64':platform==='windows'?'Win32':'MacIntel'});},{token,platform});
   await context.route(origin+'/api/chats/dm-piper/messages',async route=>{const body=route.request().postDataJSON();sent.push(body);await route.fulfill({json:{runs:[]}});});
   await context.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,route=>route.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:sent.map((s,i)=>({seq:i+1,sender:'user',text:s.prompt,kind:'message',created:100+i})),page:{has_before:false,has_after:false}}}));
   await p.goto(origin);await p.locator('#composer-area').waitFor({state:'visible'});const editor=p.locator('#prompt');
   assert.equal(await p.evaluate(()=>window.KindredReadingSize.get()),platform==='linux'?115:100);
   await p.evaluate(()=>window.KindredReadingSize.set(125));await p.reload();await editor.waitFor();assert.equal(await p.evaluate(()=>window.KindredReadingSize.get()),125,'Explicit reading preference survives reload');
   await p.evaluate(()=>window.KindredReadingSize.set(window.__KINDRED_DESKTOP.platform==='linux'?115:100));
   // Native DOM shapes previously introduced trailing lines or joined lines.
   const cases=[['Hello<div>world</div>','Hello\nworld'],['<div>Hello</div><div>world</div>','Hello\nworld'],['<p>Hello</p><p>world</p>','Hello\nworld'],['Hello<br>','Hello'],['Hello<br><br>','Hello\n'],['<div>Hello</div><div><br></div><div>world</div>','Hello\n\nworld'],['<br>',''],['<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>','- One\n- Two\n  - Nested']];
   for(const [html,expected] of cases)assert.equal(await editor.evaluate((n,html)=>{n.innerHTML=html;return n.value;},html),expected,html);
   await editor.evaluate(n=>{n.value='';});await editor.fill('One line');await editor.press('Enter');await p.waitForFunction(()=>document.querySelector('.message-row.user .message-bubble')?.textContent.trim()==='One line');
   const geometry=await p.locator('.message-row.user .message-bubble').last().evaluate(n=>{const s=getComputedStyle(n);return {height:n.getBoundingClientRect().height,line:parseFloat(s.lineHeight),padding:parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)};});
   assert(Math.abs(geometry.height-geometry.line-geometry.padding)<2,JSON.stringify({platform,geometry}));
   assert.equal(sent.at(-1).prompt,'One line');
   await editor.fill('First');await editor.press('Shift+Enter');await p.keyboard.insertText('Second');await editor.press('Shift+Enter');await editor.press('Shift+Enter');await p.keyboard.insertText('Fourth');
   assert.equal(await editor.evaluate(n=>n.value),'First\nSecond\n\nFourth');await editor.press('Enter');await p.waitForFunction(()=>document.querySelectorAll('.message-row.user').length===2);assert.equal(sent.at(-1).prompt,'First\nSecond\n\nFourth');
   assert.equal(await p.locator('.message-row.user .message-bubble').last().locator('br').count(),1,'Soft line break is displayed; the intentional blank line creates a paragraph');
   // The menu contains actions; lists format directly in the editor.
   await editor.fill('First item\nSecond item');await editor.press('ControlOrMeta+a');await p.locator('#composer-actions').click();assert.equal(await p.getByRole('menuitem',{name:'Bulleted list',exact:true}).count(),0);await p.locator('#composer-actions').click();await editor.press('Control+Shift+Digit8');
   assert.equal(await editor.locator('li').count(),2);assert.equal(await editor.evaluate(n=>n.value),'- First item\n- Second item');
   await editor.press('ArrowRight');await editor.press('End');await editor.press('Shift+Enter');await p.keyboard.insertText('Third item');
   assert.equal(await editor.evaluate(n=>n.value),'- First item\n- Second item\n- Third item');
   await editor.press('Shift+Enter');await editor.press('Shift+Enter');await p.keyboard.insertText('After the list');
   assert.equal(await editor.evaluate(n=>n.value),'- First item\n- Second item\n- Third item\n\nAfter the list');
   await editor.press('Enter');await p.waitForFunction(()=>document.querySelectorAll('.message-row.user').length===3);assert.equal(sent.at(-1).prompt,'- First item\n- Second item\n- Third item\n\nAfter the list');
   assert.equal(await p.locator('.message-row.user .message-bubble').last().locator('li').count(),3);
   assert.equal(await p.locator('.message-row.user .message-bubble').last().locator(':scope > p').innerText(),'After the list');
   // Typed markers start a real list; Enter continues it, Tab nests, Shift+Tab outdents.
   await editor.fill('');await editor.press('-');await editor.press('Space');assert.equal(await editor.locator('li').count(),1);
   await p.keyboard.insertText('Parent');await editor.press('Enter');await p.keyboard.insertText('Child');await editor.press('Tab');
   assert.equal(await editor.evaluate(n=>n.value),'- Parent\n  - Child',await editor.innerHTML());await editor.press('Tab');assert.equal(await editor.evaluate(n=>n.value),'- Parent\n    - Child');await editor.press('Shift+Tab');await editor.press('Shift+Tab');assert.equal(await editor.evaluate(n=>n.value),'- Parent\n- Child');
   await editor.press('Enter');await editor.press('Enter');await p.keyboard.insertText('Normal again');assert.equal(await editor.evaluate(n=>n.value),'- Parent\n- Child\n\nNormal again');
   assert.equal(sent.length,3,'Enter in a list must not submit a message');
   // Shortcut, undo, and mention preservation exercise native editing history.
   await editor.evaluate(n=>{n.value='';});await editor.fill('Undo me');await editor.press('Control+Shift+Digit8');assert.equal(await editor.locator('li').count(),1);await editor.press('ControlOrMeta+z');assert.equal(await editor.locator('li').count(),0);assert.equal(await editor.evaluate(n=>n.value),'Undo me');
   await editor.evaluate(n=>{n.value='';});await editor.focus();await p.keyboard.insertText('@Piper');await p.keyboard.insertText('check this');await editor.press('ControlOrMeta+a');
   await editor.press(platform==='macos'?'Meta+Shift+Digit8':'Control+Shift+Digit8');assert.equal(await editor.locator('[data-mention="piper"]').count(),1);assert.equal(await editor.evaluate(n=>n.value),'- @Piper check this');assert.equal(await editor.locator('[data-mention="piper"] .character').count(),1);
   await editor.press('ControlOrMeta+z');assert.equal(await editor.evaluate(n=>n.value),'@Piper check this');assert.equal(await editor.locator('[data-mention="piper"]').getAttribute('contenteditable'),'false');assert.equal(await editor.locator('[data-mention="piper"] .character').count(),1);
   await editor.press('ControlOrMeta+Shift+z');assert.equal(await editor.evaluate(n=>n.value),'- @Piper check this');assert.equal(await editor.locator('[data-mention="piper"]').getAttribute('contenteditable'),'false');assert.equal(await editor.locator('[data-mention="piper"] .character').count(),1);
   await editor.evaluate(n=>{n.value='';});await editor.focus();await editor.press('Control+Shift+Digit8');await p.keyboard.insertText('New list');assert.equal(await editor.evaluate(n=>n.value),'- New list');
   const beforeIme=sent.length;await editor.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(sent.length,beforeIme);assert.equal(await editor.evaluate(n=>n.value),'- New list');
   // Plain Markdown, restored drafts, and pasted bullets also continue and exit.
   await editor.evaluate(n=>{n.value='- Pasted bullet';});await editor.focus();await editor.press('ControlOrMeta+End');await editor.press('Tab');assert.equal(await editor.evaluate(n=>n.value),'  - Pasted bullet');await editor.press('Shift+Tab');assert.equal(await editor.evaluate(n=>n.value),'- Pasted bullet');await editor.press('Enter');await p.keyboard.insertText('Next bullet');
   assert.equal(await editor.evaluate(n=>n.value),'- Pasted bullet\n- Next bullet');await editor.press('Shift+Enter');await editor.press('Shift+Enter');await p.keyboard.insertText('Done');assert.equal(await editor.evaluate(n=>n.value),'- Pasted bullet\n- Next bullet\n\nDone');
   await editor.evaluate(n=>{const data=new DataTransfer();data.setData('text/plain','\n\nPasted paragraph');n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
   assert.equal(await editor.evaluate(n=>n.value),'- Pasted bullet\n- Next bullet\n\nDone\n\nPasted paragraph');
   await editor.press('ControlOrMeta+a');await editor.press('Backspace');await p.keyboard.insertText('An ordinary message');await editor.press('Enter');await p.waitForFunction(()=>document.querySelectorAll('.message-row.user').length===4);assert.equal(sent.at(-1).prompt,'An ordinary message');
   await editor.evaluate(n=>{n.value='';});await editor.focus();await editor.press('Control+Shift+Digit8');await p.keyboard.insertText('Keep this draft');await editor.press('Shift+Enter');await p.keyboard.insertText('And this bullet');
   await p.reload();await editor.waitFor();assert.equal(await editor.evaluate(n=>n.value),'- Keep this draft\n- And this bullet');await editor.focus();await editor.press('ControlOrMeta+End');await editor.press('Shift+Enter');await p.keyboard.insertText('Continue after reload');assert.equal(await editor.evaluate(n=>n.value),'- Keep this draft\n- And this bullet\n- Continue after reload');
   const out=path.resolve(__dirname,'../../test-results/composer-lists');fs.mkdirSync(out,{recursive:true});await p.setViewportSize({width:800,height:650});await p.screenshot({path:path.join(out,engine+'-'+platform+'.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await p.locator('#notice.error:not([hidden])').count(),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,platform,typedLineBreaks:true,listEditing:true,undo:true,mentions:true,paste:true,cleanSingleLineGeometry:geometry,readingPreference:true}));await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
