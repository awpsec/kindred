const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/progress-collapse';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const run={id:'summary-run',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-240,prompt:'Review the report and its supporting evidence.',output:'The report is ready. I checked the supporting evidence and marked two items for review.',error:'',progress_started:now-240};
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now-245},...[2,3,4,5].map((seq,i)=>({seq,sender:'piper',kind:'assistant',run_id:run.id,created:now-230+i*50,text:['I am comparing the report with the source material.','The first set of findings matches the supporting evidence.','I found two items that need a closer check before delivery.','The final checks are complete. I am preparing the summary.'][i]+' Here are the notes from this part of the review.',progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'phase-review'}})),{seq:6,sender:'piper',kind:'result',run_id:run.id,created:now,text:run.output}];
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);const disclosure=p.locator('.summary-progress-disclosure');await disclosure.waitFor();
  for(const width of [1100,390])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:900});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await disclosure.locator('summary').click();await p.waitForTimeout(260);
   assert(await disclosure.evaluate(n=>n.open));
   await disclosure.scrollIntoViewIfNeeded();
   const frames=await disclosure.evaluate(async details=>{
    const body=details.querySelector('.summary-progress-body'),next=document.querySelector('#content>[data-message="6"]'),summary=details.querySelector('summary');
    const sample=()=>{const b=body.getBoundingClientRect(),d=details.getBoundingClientRect(),n=next.getBoundingClientRect();let leaked=0;
     for(const y of [b.bottom+2,b.bottom+12,b.bottom+28])if(y>0&&y<innerHeight)for(const x of [b.left+20,b.left+b.width*.5])if(document.elementsFromPoint(x,y).some(el=>el!==body&&body.contains(el)))leaked++;
     return {height:b.height,details:d.height,bottom:b.bottom,next:n.top,leaked};};
    const frames=[sample()];summary.click();const tween=body.getAnimations()[0];if(!tween)throw new Error('No collapse animation');tween.pause();
    for(const time of [20,60,100,150,199]){tween.currentTime=time;frames.push(sample());}
    tween.finish();await new Promise(requestAnimationFrame);frames.push(sample());return frames;
   });
   fs.writeFileSync(path.join(out,`${engine}-${width}-${theme}-frames.json`),JSON.stringify(frames,null,2));
   assert(frames.slice(1,-1).some(f=>f.height>0&&f.height<frames[0].height),'Must animate intermediate height');
   assert(frames.slice(1,-1).every(f=>f.leaked===0),'Progress text must not paint below the shrinking body: '+JSON.stringify(frames));
   for(let i=1;i<frames.length;i++)assert(frames[i].next<=frames[i-1].next+1,'Following message moves upward monotonically');
   assert(Math.abs(frames.at(-2).next-frames.at(-1).next)<2,'No padding jump at the end');
   assert.equal(await disclosure.evaluate(n=>n.open),false);
   await p.screenshot({path:path.join(out,`${engine}-${width}-${theme}-closed.png`)});
  }
  await disclosure.locator('summary').focus();await p.keyboard.press('Enter');await p.waitForTimeout(50);await p.keyboard.press('Space');await p.waitForTimeout(260);assert.equal(await disclosure.evaluate(n=>n.open),false,'Rapid reversal settles closed');
  await p.emulateMedia({reducedMotion:'reduce'});await p.keyboard.press('Enter');assert(await disclosure.evaluate(n=>n.open&&n.querySelector('.summary-progress-body').getAnimations().length===0));await p.keyboard.press('Enter');assert.equal(await disclosure.evaluate(n=>n.open),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,clippedAtEveryFrame:true,noOverlap:true,noFinalJump:true,lightDark:true,desktopMobile:true,rapidReversal:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
