const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/numbered-lists');fs.mkdirSync(out,{recursive:true});
 try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:Number(process.env.KINDRED_TEST_DPR||1.25)});
 await context.addInitScript(token=>{sessionStorage.setItem('kindred-token',token);window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_NATIVE_FRAME=true;window.__TAURI__={core:{invoke:async()=>null}};Object.defineProperty(navigator,'platform',{value:'Linux x86_64'});},token);
 const p=await context.newPage();await p.goto(origin);const editor=p.locator('#prompt');await editor.waitFor();
 // Actual sent-message render and folding, not a replacement markdown renderer.
 const text='1. One\n2. Two\n3. Three\n4. Four\n\nSeparate start list\n\n98. Long wrapping item '+('words '.repeat(35))+'\n99. Next\n100. Hundred\n101. Last\n     1. Nested\n        - Mixed bullet\n\n- [ ] Task';
 await context.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,route=>route.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[{seq:91,sender:'user',text,kind:'message',created:100},{seq:92,sender:'piper',text,kind:'message',created:101}],page:{has_before:false,has_after:false}}}));
 await p.reload();await editor.waitFor();await p.locator('.message-text-viewport ol').first().waitFor();
 for(const width of (process.env.EDITING_ONLY?[]:[1920,2560,390]))for(const scale of [1.5,1,1.15,1.25])for(const theme of ['dark','light'])for(const zoom of [1,1.25,1.5]){
  await p.setViewportSize({width,height:width===390?844:1080});await p.evaluate(({scale,theme,zoom})=>{document.documentElement.style.zoom=zoom;document.documentElement.style.setProperty('--text-scale',scale);document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';},{scale,theme,zoom});
  const gutters=await p.locator('.message-text-viewport ol').evaluateAll(lists=>lists.map(ol=>{const s=getComputedStyle(ol),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;const last=(Number(ol.getAttribute('start'))||1)+ol.children.length-1;return {gutter:parseFloat(s.paddingInlineStart),needed:ctx.measureText(last+'. ').width,first:ol.children[0].getBoundingClientRect().left,clip:ol.closest('.message-text-viewport').getBoundingClientRect().left};}));
  await p.screenshot({path:path.join(out,`${engine}-${width}-${scale}-${theme}-zoom${zoom}.png`)});
  assert(gutters.every(g=>g.gutter>=g.needed+2),JSON.stringify({width,scale,theme,gutters}));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Body overflow');
 }
 await p.evaluate(()=>document.documentElement.style.zoom=1);await p.setViewportSize({width:1100,height:800});
 for(const start of [1,3,98]){
  await editor.evaluate(n=>{n.value='';});await editor.focus();await p.keyboard.type(''+start);await editor.press('.');await editor.press('Space');assert.equal(await editor.locator('ol').count(),1,'Typed numbered marker must autoformat');
  await p.keyboard.insertText('First');await p.screenshot({path:path.join(out,engine+'-composer-start'+start+'.png')});assert.equal(await editor.evaluate(n=>n.value),`${start}. First`);
  await editor.press('Enter');await p.keyboard.insertText('Second');assert.equal(await editor.evaluate(n=>n.value),`${start}. First\n${start+1}. Second`);
  await editor.press('Enter');await editor.press('Enter');await p.keyboard.insertText('After');assert.equal(await editor.evaluate(n=>n.value),`${start}. First\n${start+1}. Second\n\nAfter`);
 }
 await editor.evaluate(n=>{n.value='';});await editor.focus();await p.keyboard.type('2024. ');assert.equal(await editor.locator('ol').count(),0);await p.screenshot({path:path.join(out,engine+'-composer-year.png')});
 await editor.evaluate(n=>{n.value='';});await editor.focus();await p.keyboard.type('1. ');await editor.press('ControlOrMeta+z');await p.screenshot({path:path.join(out,engine+'-composer-undo.png')});assert.equal(await editor.locator('ol').count(),0);assert.equal(await editor.evaluate(n=>n.value),'1.');await p.keyboard.type(' ');assert.equal(await editor.locator('ol').count(),0,'Space after Undo must allow literal prefix');assert.equal(await editor.evaluate(n=>n.value),'1. ');
 await editor.evaluate(n=>{n.value='7. Restored';});await editor.focus();await editor.press('ControlOrMeta+End');await editor.press('Enter');await p.keyboard.insertText('Next');assert.equal(await editor.evaluate(n=>n.value),'7. Restored\n8. Next');
 await editor.press('Enter');await editor.press('Enter');await p.keyboard.insertText('Prose');assert.equal(await editor.evaluate(n=>n.value),'7. Restored\n8. Next\n\nProse');
 await editor.evaluate(n=>{n.value='';});await editor.focus();await editor.focus();await editor.press('Control+Shift+Digit7');await p.keyboard.insertText('Shortcut');assert.equal(await editor.evaluate(n=>n.value),'1. Shortcut');
 await editor.dispatchEvent('beforeinput',{inputType:'insertText',data:' ',isComposing:true});assert.equal(await editor.locator('ol').count(),1);
 await editor.evaluate(n=>n.value='100. Parent\n101. Child');await editor.focus();await editor.press('ControlOrMeta+End');await editor.press('Tab');assert.equal(await editor.evaluate(n=>n.value),'100. Parent\n     101. Child');await editor.press('Shift+Tab');assert.equal(await editor.evaluate(n=>n.value),'100. Parent\n101. Child');
 let sent=[];await context.route(origin+'/api/chats/dm-piper/messages',async route=>{sent.push(route.request().postDataJSON());return route.fulfill({json:{runs:[]}});});
 await context.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,route=>route.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:sent.length?[{seq:110,sender:'user',text:sent.at(-1).prompt,kind:'message',created:200},{seq:111,sender:'piper',text:sent.at(-1).prompt,kind:'message',created:201}]:[],page:{has_before:false,has_after:false}}}));
 for(const start of [10,100]){await editor.evaluate(n=>n.value='');await editor.focus();await p.keyboard.type(start+'. ');await p.keyboard.insertText('Parent');await editor.press('Enter');await p.keyboard.insertText('Child');await editor.press('Tab');const serialized=await editor.evaluate(n=>n.value);assert(new RegExp('\\n {'+(String(start).length+2)+'}\\d+\\. Child').test(serialized),serialized);await p.screenshot({path:path.join(out,engine+'-composer-nested-'+start+'.png')});await p.locator('#send').click();await p.waitForFunction(()=>document.querySelectorAll('.message-bubble ol ol').length===2);assert.equal(sent.at(-1).prompt,serialized);await p.screenshot({path:path.join(out,engine+'-sent-nested-'+start+'.png')});}
 await context.close();console.log(JSON.stringify({passed:true,engine,renderMatrix:process.env.EDITING_ONLY?0:72,dpr:Number(process.env.KINDRED_TEST_DPR||1.25),cssZoom:[1,1.25,1.5],textScale:[1,1.15,1.25,1.5],orderedEditing:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
