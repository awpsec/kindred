const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const engine=process.env.WEBKIT?'webkit':'chromium';
const output=process.env.KINDRED_TEST_OUTPUT;
const messages=Array.from({length:40},(_,i)=>({seq:i+1,sender:i%2?'user':'piper',kind:'message',text:(i%2?'Can you check the remaining items and draft an update?':'I checked the results. The remaining items are ready for review. ' .repeat(5)),created:1700000000+i}));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await({chromium,webkit}[engine]).launch({ignoreDefaultArgs:['--hide-scrollbars']});
 const results=[];
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
  await page.goto(origin);await page.locator('[data-message="40"]').waitFor();
  const measure=()=>page.evaluate(()=>{
   const content=document.querySelector('#content'),composer=document.querySelector('#composer').getBoundingClientRect(),css=getComputedStyle(content),rect=content.getBoundingClientRect();
   const row=document.querySelector('[data-message="40"] .message-row').getBoundingClientRect();
   const assistant=document.querySelector('[data-message="39"] .message-bubble').getBoundingClientRect(),user=document.querySelector('[data-message="40"] .message-bubble').getBoundingClientRect();
   return {composer:{left:composer.left,right:composer.right,width:composer.width},column:{left:rect.left+parseFloat(css.paddingLeft),right:rect.left+content.clientWidth-parseFloat(css.paddingRight)},row:{left:row.left,right:row.right},assistantLeft:assistant.left,userRight:user.right,gutter:content.offsetWidth-content.clientWidth,gap:content.scrollHeight-content.clientHeight-content.scrollTop,overflow:content.scrollWidth-content.clientWidth};
  });
  for(const scrollbar of [5,12]){
   // Force classic scrollbar allocation, including a wider accessibility gutter.
   const style=await page.addStyleTag({content:`#content{overflow-y:scroll;scrollbar-gutter:stable}#content::-webkit-scrollbar{width:${scrollbar}px}`});
   for(const width of [1920,1600,1280,900,760]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(350);
    for(const pane of [false,true]){
     if(pane){await page.locator('#bot-details').click();await page.waitForTimeout(450);}
     const m=await measure();
     for(const edge of ['left','right']){
      assert(Math.abs(m.column[edge]-m.composer[edge])<1,`${engine} ${width} pane=${pane}: column ${edge} ${JSON.stringify(m)}`);
      assert(Math.abs(m.row[edge]-m.composer[edge])<1,`message row ${edge}: ${width} pane=${pane} ${JSON.stringify(m)}`);
     }
     assert(Math.abs(m.assistantLeft-m.composer.left)<1,'assistant left aligns');
     assert(Math.abs(m.userRight-m.composer.right)<1,'user right aligns');
     assert(m.composer.width<=960.1&&m.overflow<1,'bounded column without horizontal overflow');
     assert(m.gap<2,'stays at newest messages');
     if(width>=1600&&!pane)assert(Math.abs(m.composer.width-960)<1,'full Grok width');
     results.push({width,pane,scrollbar,...m});
     if(output&&scrollbar===5&&width===1600)await page.screenshot({path:path.join(output,`${engine}-desktop${pane?'-pane':''}.png`)});
     if(pane){await page.getByRole('button',{name:'Close bot center',exact:true}).click();await page.waitForTimeout(450);}
    }
   }
   await style.evaluate(n=>n.remove());
  }
  assert.deepEqual(errors,[]);await page.close();
  // Compare the new sheet against the previous sheet on phone and wide Duo.
  const css=fs.readFileSync(path.resolve(__dirname,'../../ui/shell-polish.css'),'utf8');
  const previous=css.replace(/\/\* A shared desktop reading column:[\s\S]*?(?=\/\* Desktop identity)/,'');
  for(const width of [390,600,1280]){
   const samples=[];
   for(const baseline of [true,false]){
    const p=await browser.newPage({viewport:{width,height:900}});
    await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';},token);
    if(baseline)await p.route(origin+'/shell-polish.css',r=>r.fulfill({contentType:'text/css',body:previous}));
    await p.goto(origin);await p.locator('#composer').waitFor();await p.waitForTimeout(350);
    samples.push(await p.evaluate(()=>['#content','#composer','#bot-details'].map(selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:r.x,width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight};})));
    await p.close();
   }
   assert.deepEqual(samples[0],samples[1],`native iOS layout unchanged at ${width}`);
  }
  console.log(JSON.stringify({engine,passed:true,cases:results,nativeIOSUnchanged:[390,600,1280]}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
