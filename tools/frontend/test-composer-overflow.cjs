const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.message-row.assistant').first().waitFor();
  for(const scale of [1,1.15,1.5]){
   await page.evaluate(s=>document.documentElement.style.setProperty('--text-scale',s),scale);
   const editor=page.locator('#prompt');await editor.fill(Array.from({length:30},(_,i)=>`Line ${i}: Ordinary text with wide words and narrow iii lll.`).join('\n'));
   await editor.press('Control+End');
   await page.evaluate(()=>{
    const form=document.querySelector('#composer');window.compactResets=[];
    window.overflowObserver=new MutationObserver(records=>{for(const r of records)if(!r.oldValue.split(' ').includes('is-multiline'))window.compactResets.push(r.oldValue);});
    window.overflowObserver.observe(form,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
   });
   await editor.pressSequentially(' continued typing',{delay:15});
   const result=await editor.evaluate(n=>{
    window.overflowObserver.disconnect();const css=getComputedStyle(n),sel=getSelection(),range=sel.getRangeAt(0),caret=range.getBoundingClientRect(),box=n.getBoundingClientRect();
    return {overflow:n.scrollHeight>n.clientHeight,weight:css.fontWeight,line:parseFloat(css.lineHeight),font:parseFloat(css.fontSize),resets:window.compactResets,caretVisible:caret.bottom<=box.bottom+2&&caret.top>=box.top-2,text:n.textContent};
   });
   assert(result.overflow);assert.equal(result.weight,'400');assert(result.line>result.font*1.4);assert.deepEqual(result.resets,[],'typing a scrolling draft must preserve its expanded layout');assert(result.caretVisible);assert(result.text.endsWith(' continued typing'));
   await editor.fill('Short');assert.equal(await page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline')),false);
   await editor.fill('First line\nSecond line');assert(await page.locator('#composer').evaluate(n=>n.classList.contains('is-multiline')));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',scrollingDraft:true,caretVisible:true,stableTypography:true,scales:[100,115,150]}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
