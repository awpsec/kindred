const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch();
 try{for(const deviceScaleFactor of [1,2]){
  const context=await browser.newContext({viewport:{width:1320,height:900},deviceScaleFactor}),p=await context.newPage(),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(t=>{
   sessionStorage.setItem('kindred-token',t);localStorage.setItem('kindred-text-size','100');
   const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);
  },token);
  const messages=Array.from({length:35},(_,i)=>({seq:i+1,chat_id:'dm-piper',sender:i%3?'piper':'user',kind:'message',created:1700000000+i,text:'This paragraph should stay still when another message arrives. Keep the reading position through a refresh, including wrapped lines and **bold text**. '.repeat(2)}));
  await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
  await p.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {revealReply,chatScroll,captureChatAnchor,restoreChatPosition,renderChat};'}));
  await p.goto(origin);await p.locator('[data-message="35"]').waitFor();await p.evaluate(()=>document.fonts.ready);
  await p.locator('#prompt').fill('Preserve my draft while the reply settles.');
  const cases=[];
  for(const size of [100,115,150]){
   await p.evaluate(size=>KindredReadingSize.set(size),size);await p.waitForTimeout(300);
   // Sample both authors and several points in the real entrance. A user can
   // start reading while it is moving, then a resize/refresh restores that
   // position after the entrance ends. Neighbouring text must not move with it.
   for(const seq of [20,22])for(const at of [0,65,120]){
    const result=await p.evaluate(async({seq,at})=>{
     const app=await import('/app.js'),area=document.getElementById('content'),target=area.querySelector(`[data-message="${seq}"]`),neighbour=area.querySelector(`[data-message="${seq+1}"]`);
     const frame=()=>new Promise(requestAnimationFrame);
     app.chatScroll.follow=false;area.scrollTop+=target.getBoundingClientRect().top-area.getBoundingClientRect().top-2;
     await frame();await frame();app.chatScroll.gestureUntil=0;
     const top=()=>{const r=document.createRange();r.selectNodeContents(neighbour.querySelector('.message-text-content'));return r.getClientRects()[0].top;};
     const baseline={scroll:area.scrollTop,text:top()};
     app.revealReply(target,Date.now());
     const effect=target.getAnimations({subtree:true}).find(a=>a.effect?.getKeyframes().some(f=>f.transform?.startsWith('translateY')));
     effect.pause();effect.currentTime=at;app.captureChatAnchor();
     const anchor=app.chatScroll.anchor.key;
     effect.currentTime=160;app.restoreChatPosition();
     const during={scroll:area.scrollTop,text:top()};
     effect.finish();await effect.finished;await frame();app.restoreChatPosition();
     const after={scroll:area.scrollTop,text:top()};
     const refresh=[];for(let i=0;i<4;i++){app.renderChat(true,'cached');await frame();refresh.push({scroll:area.scrollTop,text:top(),same:target===area.querySelector(`[data-message="${seq}"]`)});}
     return {seq,at,anchor,baseline,during,after,refresh};
    },{seq,at});
    assert.equal(result.anchor,String(seq),'Exercise the animated message as the reading anchor');
    for(const snapshot of [result.during,result.after,...result.refresh]){
     assert(Math.abs(snapshot.scroll-result.baseline.scroll)<1,'Entrance must not feed a painted offset into scrolling: '+JSON.stringify(result));
     assert(Math.abs(snapshot.text-result.baseline.text)<1,'Already-visible characters must remain still: '+JSON.stringify(result));
    }
    assert(result.refresh.every(s=>s.same),'Background refresh retains message DOM');cases.push({size,seq,at,drift:result.after.scroll-result.baseline.scroll});
   }
  }
  assert.equal(await p.locator('#prompt').innerText(),'Preserve my draft while the reply settles.');
  for(const reduced of ['system','app']){
   if(reduced==='system')await p.emulateMedia({reducedMotion:'reduce'});else await p.evaluate(()=>document.documentElement.dataset.motion='off');
   assert.equal(await p.evaluate(async()=>{const app=await import('/app.js'),n=document.querySelector('[data-message="20"]');app.revealReply(n,Date.now());return n.getAnimations({subtree:true}).length;}),0);
   await p.emulateMedia({reducedMotion:'no-preference'});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,deviceScaleFactor,cases,draft:true,reducedMotion:true}));await context.close();
 }}finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
