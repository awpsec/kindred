const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/disclosure-follow';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),messages=Array.from({length:20},(_,i)=>({seq:i+1,sender:'piper',kind:i===19?'result':'message',run_id:i===19?'done-run':'',text:'Earlier conversation '+i+'. We checked the report and saved the findings.',created:now-100+i}));
  await p.route(url=>url.pathname==='/api/runs',r=>r.fulfill({json:[{id:'done-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Sign in to Gmail',output:'Signed in.',error:'',depth:0,created:now-40}]}));
  await p.route(origin+'/api/runs/done-run',r=>r.fulfill({json:{run:{id:'done-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Sign in to Gmail',output:'Signed in.',error:'',depth:0,created:now-40},events:[],approvals:[]}}));
  await p.route(url=>url.pathname==='/api/user-tasks',r=>r.fulfill({json:[{id:'signin',run_id:'done-run',bot_id:'piper',title:'Sign in to Gmail',instructions:'Complete the sign-in in the browser, then return control.\n\n'+'Your browser session is ready. '.repeat(12),status:'resumed',outcome:'done',created:now}]}));
  await p.route(url=>url.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}));
  await p.goto(origin);await p.bringToFront();const receipt=p.locator('.decision-receipt').last(),summary=receipt.locator('summary').first(),area=p.locator('#content');await summary.waitFor().catch(async e=>{console.log({errors,content:await p.locator('#content').innerText(),tasks:await p.evaluate(async()=>await(await fetch('/api/user-tasks')).json())});await p.screenshot({path:path.join(out,engine+'-failure.png')});throw e;});await p.locator('#chat-loading').waitFor({state:'detached'});
  const bottom=async()=>{await area.evaluate(n=>n.scrollTop=n.scrollHeight);await p.waitForTimeout(100);};
  const gap=()=>area.evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight);
  const evidence=[];
  for(const width of [1100,390]){
   await p.setViewportSize({width,height:850});await bottom();
   for(const open of [true,false]){
    // Observe after the app's ResizeObserver has corrected this frame, before paint.
    await p.evaluate(()=>{window.followFrames=[];const n=document.querySelector('#content'),r=n.querySelector('.decision-receipt');window.followObserver=new ResizeObserver(()=>window.followFrames.push({top:n.scrollTop,gap:n.scrollHeight-n.scrollTop-n.clientHeight,height:r.getBoundingClientRect().height}));window.followObserver.observe(r);});
    await summary.click();await p.waitForTimeout(450);const frames=await p.evaluate(()=>{window.followObserver.disconnect();return window.followFrames;});
    assert.equal(await receipt.locator('details').evaluate(n=>n.open),open);
    assert(await gap()<3,`Must follow ${open?'expansion':'collapse'} at ${width}px: gap ${await gap()}`);
    assert(frames.every(f=>f.gap<4),'Viewport must follow animated height, not jump afterward: '+JSON.stringify(frames));
    assert(Math.abs(frames.at(-1).top-frames[0].top)>50,'Fixture must change scroll position');
    evidence.push({width,open,frames});
   }
  }
  await p.setViewportSize({width:1100,height:850});await bottom();
  // A reader above the bottom must not be pulled down by a disclosure.
  await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,bubbles:true}));n.scrollTop-=180;});await p.waitForTimeout(100);
  const reading=await area.evaluate(n=>n.scrollTop);await summary.evaluate(n=>n.click());await p.waitForTimeout(400);assert(Math.abs(await area.evaluate(n=>n.scrollTop)-reading)<2,'Keep reader position');
  await summary.evaluate(n=>n.click());await p.waitForTimeout(400);await bottom();
  // Wheel input during expansion cancels bottom-follow immediately.
  await summary.click();await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,bubbles:true}));n.scrollTop-=180;});await p.waitForTimeout(400);assert(await gap()>100,'User scroll must override following');
  await summary.evaluate(n=>n.click());await p.waitForTimeout(400);await bottom();
  await p.emulateMedia({reducedMotion:'reduce'});await summary.focus();await p.keyboard.press('Enter');await p.waitForTimeout(100);assert(await gap()<3);assert.equal(await receipt.evaluate(n=>n.getAnimations().length),0);await p.keyboard.press('Enter');await p.waitForTimeout(100);assert(await gap()<3);
  fs.writeFileSync(path.join(out,engine+'-frames.json'),JSON.stringify(evidence,null,2));await p.screenshot({path:path.join(out,engine+'-collapsed.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,bottomFollowsBothWays:true,readerPositionPreserved:true,wheelInterrupts:true,reducedMotion:true,desktopAndMobile:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
