const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const messages=Array.from({length:30},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Please check the account, date, reviewer, supporting notes and report folder.\n\n'+'These questions should remain visible as you compose the reply. '.repeat(3),created:1790000000+i}));
 await p.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
 await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('[data-message="30"]').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(350);
 const draft='First answer\nSecond answer\nThird answer\nFourth answer\nFifth answer';const results=[];
 for(const history of [false,true]){
  if(history){await p.locator('#content').evaluate(c=>{c.dispatchEvent(new WheelEvent('wheel',{deltaY:-300}));c.scrollTop-=300;});await p.waitForTimeout(200);}
  for(const text of [draft,'Short']){
   const frames=await p.evaluate(async text=>{
    const c=document.querySelector('#content'),surface=document.querySelector('.composer-resize-surface'),editor=document.querySelector('#prompt'),message=c.querySelector('[data-message="30"]');
    const measure=()=>({top:c.scrollTop,gap:surface.getBoundingClientRect().top-message.getBoundingClientRect().bottom,padding:c.style.paddingBottom,contentTransform:getComputedStyle(c).transform,editorTransform:getComputedStyle(editor).transform});
    const before=measure();editor.value=text;editor.dispatchEvent(new InputEvent('input',{bubbles:true}));
    let animation;for(let i=0;i<30&&!animation;i++){await new Promise(requestAnimationFrame);animation=surface.getAnimations()[0];}
    if(!animation)throw Error('Expected composer resize motion');animation.pause();
    const samples=[];
    for(const time of [0,45,90,180]){animation.currentTime=time;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);samples.push({time,...measure()});}
    animation.finish();return {before,samples};
   },text);
   assert(frames.samples.some(f=>Math.abs(f.top-frames.before.top)>5),'The transcript must move during the animation');
   for(const f of frames.samples){assert(Math.abs(f.gap-frames.before.gap)<2,`Chat and surface must share the same motion: ${JSON.stringify({history,text,frames})}`);assert.equal(f.contentTransform,'none');assert.equal(f.editorTransform,'none');}
   assert.notEqual(frames.samples[1].top,frames.samples[3].top,'Chat must not jump to its destination before the surface');
   assert(new Set(frames.samples.map(f=>f.padding)).size<=2,'Reserve space once, then release after shrinking');results.push({history,frames});await p.waitForTimeout(80);
  }
 }
 // Reverse mid-flight repeatedly, preserving the draft and ending at the reading edge.
 const start=await p.locator('#content').evaluate(c=>c.scrollTop);
 for(const text of [draft,'Short',draft,'Short']){await p.locator('#prompt').fill(text);await p.waitForTimeout(45);}
 await p.waitForTimeout(250);assert(Math.abs(await p.locator('#content').evaluate(c=>c.scrollTop)-start)<2);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Short');
 // A reader's gesture takes over immediately, without a delayed automatic scroll.
 await p.locator('#prompt').fill(draft);await p.waitForTimeout(40);
 const stopped=await p.locator('#content').evaluate(c=>{c.dispatchEvent(new WheelEvent('wheel',{deltaY:-150}));c.scrollTop-=150;return c.scrollTop;});await p.waitForTimeout(250);assert(Math.abs(await p.locator('#content').evaluate(c=>c.scrollTop)-stopped)<2,'Wheel scrolling must cancel composer tracking');
 // Switching reduced motion on during a resize settles both surfaces together.
 await p.locator('#prompt').fill('Short');await p.waitForTimeout(250);
 await p.locator('#prompt').fill(draft);await p.waitForTimeout(40);
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#prompt').fill('Short');await p.waitForTimeout(80);assert.equal(await p.locator('.composer-resize-surface').evaluate(n=>n.getAnimations().length),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',results,reversal:true,gestureCancellation:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
