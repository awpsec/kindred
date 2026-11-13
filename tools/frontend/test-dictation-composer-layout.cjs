const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);
   localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'native'}));
   window.__KINDRED_DESKTOP={platform:'macos'};window.__KINDRED_NATIVE_DICTATION=true;
   window.__TAURI__={core:{invoke:async command=>{if(command==='start_native_dictation')window.dictationFocused=document.activeElement.id;return {supported:true,phase:'ready',models:[]};}}};
  },token);
  await p.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages:Array.from({length:20},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Please check these details before replying. '.repeat(8),created:1790000000+i})),page:{has_before:false,has_after:false}}}));
  await p.goto('http://127.0.0.1:'+server.address().port);
  await p.locator('[data-message="20"]').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
  const geometry=()=>p.evaluate(()=>{
   const form=document.querySelector('#composer'),editor=document.querySelector('#prompt'),area=document.querySelector('#composer-area'),content=document.querySelector('#content'),send=document.querySelector('#send');
   const f=form.getBoundingClientRect(),e=editor.getBoundingClientRect(),s=send.getBoundingClientRect();
   return {height:f.height,top:f.top,editorTop:e.top,editorBottom:e.bottom,sendTop:s.top,padding:parseFloat(getComputedStyle(content).paddingBottom),areaHeight:area.getBoundingClientRect().height,last:content.querySelector('[data-message="20"]').getBoundingClientRect().bottom,text:editor.value,scrollHeight:editor.scrollHeight,clientHeight:editor.clientHeight,multiline:form.classList.contains('is-multiline'),composing:editor.dataset.composing,selection:editor.contains(getSelection().anchorNode),markup:editor.innerHTML};
  });
  const samples=[];
  for(const hardBreaks of [true,false])for(const reduced of [false,true]){
   await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
   await p.locator('#prompt').fill('');await p.waitForTimeout(250);
   const before=await geometry();
   await p.getByRole('button',{name:'Dictate',exact:true}).click();
   await p.waitForFunction(()=>window.dictationFocused==='prompt');
   // AppKit owns the marked text until commit. Reproduce composition input,
   // without a keyboard event, and retain the same marked DOM node and caret.
   await p.evaluate(hardBreaks=>{
    const editor=document.querySelector('#prompt');editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    window.marked=document.createElement('span');marked.textContent=hardBreaks?'First dictated line\nSecond dictated line\nThird dictated line\nFourth dictated line':'Please review the account and check all the details before preparing the report. '.repeat(8);editor.replaceChildren(marked);
    const range=document.createRange();range.selectNodeContents(marked);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
    editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',isComposing:true,data:marked.textContent}));
   },hardBreaks);
   await p.waitForTimeout(250);const during=await geometry();
   assert(during.multiline&&during.height>before.height+40,'Dictation must grow the composer before commit: '+JSON.stringify({before,during}));
   assert(during.editorTop>=during.top&&during.editorBottom<=during.sendTop,'Dictation must stay above controls');
   assert(during.padding>=during.areaHeight&&during.last<=during.top,'Chat must make room for dictated lines');
   assert(during.selection&&await p.evaluate(()=>marked.isConnected&&marked.parentNode===document.querySelector('#prompt')),'Keep marked text and caret intact: '+JSON.stringify(during));
   // Speech normally wraps without explicit newlines. It must keep growing
   // up to the editor's cap, then scroll internally rather than cover controls.
   await p.evaluate(()=>{marked.textContent='A dictated sentence with enough detail to wrap naturally. '.repeat(80);document.querySelector('#prompt').dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));});
   await p.waitForTimeout(250);const capped=await geometry();
   assert(capped.scrollHeight>capped.clientHeight&&capped.clientHeight<=280,'Long dictation must use bounded editor scrolling');
   assert(capped.editorBottom<=capped.sendTop&&capped.last<=capped.top,'Long dictation must not cover controls or the latest message');
   // A corrected phrase can shrink, but must not bounce the grid between rows
   // while AppKit still owns composition. Commit then returns to compact mode.
   await p.evaluate(()=>{marked.textContent='Corrected';document.querySelector('#prompt').dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));});
   await p.waitForTimeout(50);assert((await geometry()).multiline);
   await p.evaluate(()=>document.querySelector('#prompt').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'Corrected'})));
   await p.waitForTimeout(250);const after=await geometry();assert(!after.multiline,JSON.stringify(after));assert.equal(after.text,'Corrected');assert(after.height<=before.height+1);
   samples.push({hardBreaks,reduced,before,during,after});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,samples}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
