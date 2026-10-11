const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  for(const ios of [true,false]){
   const p=await browser.newPage({viewport:{width:390,height:844}});
   await p.addInitScript(({ios,token})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-text-size','100');if(ios){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_SYSTEM_TEXT_SCALE=1;}},{ios,token});
   await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.KindredReadingSize);
   await p.evaluate(()=>{const sample=document.createElement('div');sample.id='type-sample';sample.innerHTML='<div class="message-row"><div class="message-bubble">A long chat message with readable text.</div></div><div class="request-tray"><h3 class="request-tray-heading">Choose an option</h3><div class="question-context">Supporting context</div><button class="question-option">Run the task tonight</button><details class="question-details"><summary>Details</summary></details></div>';document.body.append(sample)});
   for(const scale of ios?[1,1.35,2.1]:[1]){
    await p.evaluate(scale=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}})),scale);
    const sizes=await p.evaluate(()=>Object.fromEntries(['.message-bubble','.request-tray-heading','.question-option','.question-context','.question-details'].map(s=>[s,parseFloat(getComputedStyle(document.querySelector('#type-sample '+s)).fontSize)])));
    assert.ok(Math.abs(sizes['.message-bubble']-(ios?16*scale:15))<.02);
    if(ios){assert.equal(sizes['.message-bubble'],sizes['.question-option']);assert.equal(sizes['.message-bubble'],sizes['.request-tray-heading']);assert.ok(Math.abs(sizes['.question-details']-14*scale)<.02);assert.equal(sizes['.question-context'],sizes['.question-details']);}
    else assert.equal(sizes['.question-option'],13);
   }
   await p.close();
  }
  console.log('PASS iOS chat/choice/title sizing, live Dynamic Type, secondary text scaling and unchanged desktop sizes');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
