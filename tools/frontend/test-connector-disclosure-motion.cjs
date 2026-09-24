const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {renderChat,followChatLatest};'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const messages=[{seq:1,sender:'user',kind:'message',text:'Review my files.\n\n'+'Background information.\n\n'.repeat(30),created:now},...[2,3,4,5].map(seq=>({seq,sender:'piper',kind:'connector_artifact',text:'File reviewed',run_id:'review',created:now,connector_artifact:{id:'receipt-'+seq,bot_id:'piper',kind:'task',connection:'Google Drive',connector:'googledrive',source:'Kindred',tool:'read_record',title:'File reviewed',status:'completed',revision:1,records:[{title:'Report',fields:{Result:'Reviewed the supplied report. '.repeat(20)}}]}})),{seq:6,sender:'piper',kind:'assistant',text:'Both files have been reviewed.',created:now}];
  await p.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await p.route(url=>url.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat,messages,page:{has_before:false,has_after:false}}}));
  await p.goto(origin);await p.locator('.connector-stack').waitFor();
  for(const selector of ['.connector-stack','.connector-stack-current .connector-call'])for(const width of [1200,390]){
   await p.setViewportSize({width,height:900});
   await p.evaluate(async()=>{const app=await import('/app.js');app.followChatLatest();await app.renderChat(true,'cached');});
   await p.locator(selector+'>summary').scrollIntoViewIfNeeded();
   for(const opening of [true,false]){
    const frames=await p.evaluate(async selector=>{
     const app=await import('/app.js'),details=document.querySelector(selector),summary=details.querySelector('summary'),next=document.querySelector('#content>[data-message="6"]');
     const sample=()=>({top:summary.getBoundingClientRect().top,next:next.getBoundingClientRect().top,height:details.getBoundingClientRect().height});
     const frames=[sample()];summary.click();
     // Inspect the actual animation at fixed offsets; overloaded headless
     // compositors can skip all intermediate requestAnimationFrame callbacks.
     const tween=details.querySelector('.chat-disclosure-body').getAnimations()[0];
     if(!tween)throw new Error('Disclosure did not start an animation');
     tween.pause();for(const time of [40,80,120,160]){tween.currentTime=time;frames.push(sample());}
     await app.renderChat(true,'cached');tween.play();const start=performance.now();
     while(performance.now()-start<360){await new Promise(requestAnimationFrame);frames.push(sample());}
     if(details!==document.querySelector(selector))throw new Error('Refresh replaced the animated stack');
     return frames;
    },selector);
    assert(Math.max(...frames.map(f=>f.top))-Math.min(...frames.map(f=>f.top))<2,'Stack header should stay anchored');
    const low=Math.min(frames[0].height,frames.at(-1).height),high=Math.max(frames[0].height,frames.at(-1).height);
    assert(frames.some(f=>f.height>low+1&&f.height<high-1),'Stack must animate intermediate heights: '+JSON.stringify({width,opening,frames}));
    for(let i=1;i<frames.length;i++)assert(opening?frames[i].next>=frames[i-1].next-1:frames[i].next<=frames[i-1].next+1,'Messages below the stack must not bounce');
    assert.equal(await p.locator(selector).evaluate(n=>n.open),opening);
   }
  }
  const summary=p.locator('.connector-stack>summary');await summary.focus();await p.keyboard.press('Enter');await p.waitForTimeout(60);await p.keyboard.press('Space');await p.waitForTimeout(350);
  assert.equal(await p.locator('.connector-stack').evaluate(n=>n.open),false,'Rapid reversal should settle closed');
  await p.emulateMedia({reducedMotion:'reduce'});await p.keyboard.press('Enter');
  assert(await p.locator('.connector-stack').evaluate(n=>n.open&&n.querySelector('.chat-disclosure-body').getAnimations().length===0));
  await p.keyboard.press('Enter');assert.equal(await p.locator('.connector-stack').evaluate(n=>n.open),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,anchoredStack:true,smoothOpenAndClose:true,refreshContinuity:true,rapidReversal:true,keyboard:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
