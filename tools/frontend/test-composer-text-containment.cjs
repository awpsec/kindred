const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:Number(process.env.KINDRED_TEST_DPR||1)}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#prompt').waitFor();await p.evaluate(()=>document.fonts.ready);if(process.env.KINDRED_TEST_TEXT_SCALE)await p.evaluate(scale=>{document.documentElement.style.setProperty('--text-scale',scale);},process.env.KINDRED_TEST_TEXT_SCALE);await p.waitForTimeout(350);await p.locator('#prompt').focus();const results=[];
 for(const scenario of ['first-wrap','first-newline','more-lines','shrink']){
  const data=await p.evaluate(async scenario=>{
   const editor=document.querySelector('#prompt'),form=document.querySelector('#composer'),surface=document.querySelector('.composer-resize-surface');
   const set=value=>{editor.value=value;editor.dispatchEvent(new InputEvent('input',{bubbles:true}));};
   set(scenario==='more-lines'||scenario==='shrink'?'First answer\nSecond answer\nThird answer':'');await new Promise(r=>setTimeout(r,250));
   let text;
   if(scenario==='first-wrap'){
    const c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(editor).font;
    let prefix='';while(c.measureText(prefix+'the answer ').width<editor.clientWidth-16)prefix+='the answer ';
    set(prefix);await new Promise(r=>setTimeout(r,250));if(form.classList.contains('is-multiline'))throw Error('Setup must start compact');text=prefix+'and some more details';
   }else text=scenario==='shrink'?'Short':scenario==='more-lines'?'First answer\nSecond answer\nThird answer\nFourth answer\nFifth answer':'First answer\nSecond answer';
   const before=editor.getBoundingClientRect();let resizes=0;const observer=new ResizeObserver(()=>resizes++);observer.observe(form);
   set(text);let animation;for(let i=0;i<30&&!animation;i++){await new Promise(requestAnimationFrame);animation=surface.getAnimations()[0];}if(!animation)throw Error('Expected resize motion');animation.pause();const frames=[];
   for(const time of [0,15,30,45,90,135,180]){
    animation.currentTime=time;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const e=editor.getBoundingClientRect(),s=surface.getBoundingClientRect(),style=getComputedStyle(editor),clip=style.clipPath==='none'?[0,0,0,0]:style.clipPath.match(/[-\d.]+/g).map(Number);
    // inset shorthand repeats values: 1 => all; 2 => vertical/horizontal.
    const top=clip[0]||0,bottom=clip.length>2?clip[2]:clip[0]||0;
    const range=document.createRange();range.selectNodeContents(editor);const glyphs=[...range.getClientRects()];
    frames.push({time,editorTop:e.top,visibleTop:e.top+top,visibleBottom:e.bottom-bottom,surfaceTop:s.top,surfaceBottom:s.bottom,transform:style.transform,glyphTop:Math.min(...glyphs.map(r=>r.top)),paddingTop:parseFloat(style.paddingTop),value:editor.value});
   }
   animation.finish();await new Promise(r=>setTimeout(r,50));observer.disconnect();return {beforeTop:before.top,frames,text,resizes,focused:document.activeElement===editor};
  },scenario);
  for(const f of data.frames){assert(f.visibleTop>=f.surfaceTop-1,`${scenario}: text must never lead above the composer: ${JSON.stringify(data)}`);assert(f.visibleBottom<=f.surfaceBottom+1,`${scenario}: new lines must stay inside the growing surface: ${JSON.stringify(data)}`);assert.equal(f.value,data.text);assert.equal(f.transform,'none');}
  assert(Math.abs(data.frames[0].editorTop-data.beforeTop)<2,`${scenario}: text starts at its previous visible position: ${JSON.stringify(data)}`);assert(data.resizes<=3,'No resize feedback loop');assert(data.focused);results.push({scenario,...data});
 }
 // Check actual running frames through interrupted growth and shrink, not only paused samples.
 const live=await p.evaluate(async()=>{
  const e=document.querySelector('#prompt'),s=document.querySelector('.composer-resize-surface'),samples=[];
  for(const text of ['One\nTwo\nThree','Short','One\nTwo','One\nTwo\nThree\nFour','Short']){
   e.value=text;e.dispatchEvent(new InputEvent('input',{bubbles:true}));
   for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);await new Promise(r=>setTimeout(r,0));const er=e.getBoundingClientRect(),sr=s.getBoundingClientRect();samples.push({top:er.top,surface:sr.top});}
  }
  await new Promise(r=>setTimeout(r,250));return samples;
 });assert(live.every(f=>f.top>=f.surface-1),'Rapidly reversing text must remain inside the surface: '+JSON.stringify(live));
 // IME takes ownership immediately and must not retain animated offsets or clips.
 await p.locator('#prompt').fill('One\nTwo\nThree');await p.waitForTimeout(35);await p.locator('#prompt').dispatchEvent('compositionstart');assert.equal(await p.locator('#prompt').evaluate(n=>n.style.top),'');assert.equal(await p.locator('#prompt').evaluate(n=>n.style.clipPath),'');await p.locator('#prompt').dispatchEvent('compositionend');
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#prompt').fill('One\nTwo\nThree');await p.waitForTimeout(50);assert.equal(await p.locator('#prompt').evaluate(n=>n.style.top),'');assert.equal(await p.locator('#prompt').evaluate(n=>n.style.clipPath),'');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',results}));
 }finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
