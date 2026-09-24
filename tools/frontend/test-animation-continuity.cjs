const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),run={id:'motion-run',bot_id:'piper',chat_id:'dm-piper',prompt:'Check the files',status:'running',output:'',error:'',created:now-12};let step=now-7,shape='think';
  await context.route(origin+'/api/**',route=>{const name=new URL(route.request().url()).pathname.slice(4);if(name==='/runs')return route.fulfill({json:[run]});if(name==='/runs/motion-run')return route.fulfill({json:{run,events:[],approvals:[],attachments:[]}});if(name==='/activity')return route.fulfill({json:{piper:{run_id:run.id,status:'running',shape,label:shape==='think'?'Thinking it through':'Reading files',started_at:step,run_created_at:run.created,server_time:Math.floor(Date.now()/1000)}}});return route.continue();});
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('.work-line .character[data-action="working"]').waitFor();await p.waitForTimeout(1700);
  const start=await p.locator('.work-line .character').evaluate(b=>{window.originalWorker=b;return b._character.workStartedAt;});assert.equal(start,run.created*1000);
  shape='read';step+=5;await p.locator('.work-label').filter({hasText:'Reading files'}).waitFor();
  assert.equal(await p.locator('.work-line .character').evaluate(b=>b===window.originalWorker),true);assert.equal(await p.locator('.work-line .character').evaluate(b=>b._character.workStartedAt),start,'Step updates must not restart the working phase');
  const continuity=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),box=mod.character({shape:'cloud'},84);document.body.append(box);mod.setActivity(box,'working',{immediate:true,startedAt:1000000});
   mod.renderCharacterMotion(box,1009510);const before=box._character.motion.getAttribute('transform');mod.setActivity(box,'think',{startedAt:1009500});mod.renderCharacterMotion(box,1009510);const after=box._character.motion.getAttribute('transform');
   mod.setActivity(box,'terminal');await new Promise(r=>setTimeout(r,650));const neutral=box._character.motion.getAttribute('transform'),settled=getComputedStyle(box._character.motion).transform;box.remove();return {before,after,neutral,settled};
  });assert.equal(continuity.after,continuity.before);assert.equal(continuity.neutral,null);assert.equal(continuity.settled,'none','The monitor must not retain the working turn');
  await context.route(origin+'/motion-polish',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><link rel="stylesheet" href="/style.css"><style>body{height:auto;overflow:auto;padding:24px;background:var(--bg);color:var(--fg)}#samples{display:grid;grid-template-columns:repeat(6,1fr);gap:18px;max-width:1060px}.sample{text-align:center;font-size:12px}.sample>div{margin-bottom:10px}</style><body><h2>Command rhythm</h2><div id="samples"></div></body></html>'}));await p.goto(origin+'/motion-polish');await p.setViewportSize({width:1150,height:400});
  const terminal=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),frames=[],samples=document.querySelector('#samples');
   for(const ms of [0,500,1000,1700,2750,3100]){
    const cell=document.createElement('div');cell.className='sample';const label=document.createElement('div');label.textContent=ms+' ms';cell.append(label);samples.append(cell);
    for(const size of [36,84]){const box=mod.character({color:'#f24d93'},size);cell.append(box);mod.setActivity(box,'terminal',{immediate:true});box._character.loopStartedAt=0;mod.renderCharacterMotion(box,ms);const c=box._character;frames.push({ms,size,stroke:c.terminalOutput.getAttribute('stroke-dasharray'),opacity:Number(c.terminalOutput.getAttribute('opacity')),cursor:Number(c.terminalCursor.getAttribute('opacity'))});box.classList.remove('animated');box._character=null;}
   }
   return frames;
  });
  assert(terminal.find(f=>f.ms===1000).opacity>.5);assert.equal(terminal.find(f=>f.ms===3100).opacity,0);assert.equal(terminal.find(f=>f.ms===0).opacity,0);
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(300);await p.screenshot({path:path.join(artifacts,engine+'-command-rhythm-'+theme+'.png')});}
  const motion=await p.evaluate(async()=>{
   const mod=await import('/characters.js'),box=mod.character({},84);document.body.append(box);mod.setActivity(box,'terminal',{immediate:true});const c=box._character;c.loopStartedAt=0;mod.renderCharacterMotion(box,1199);const a=Number(c.terminalOutput.getAttribute('stroke-dasharray').split(' ')[0]);mod.renderCharacterMotion(box,1201);const b=Number(c.terminalOutput.getAttribute('stroke-dasharray').split(' ')[0]);
   document.documentElement.dataset.motion='off';mod.renderCharacterMotion(box,400);const before=[c.terminalOutput.outerHTML,c.terminalCursor.outerHTML];mod.renderCharacterMotion(box,1700);const after=[c.terminalOutput.outerHTML,c.terminalCursor.outerHTML];box.remove();return {change:b-a,before,after};
  });assert(motion.change>0&&motion.change<.01);assert.deepEqual(motion.before,motion.after);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,workingClockSurvivesStepUpdates:true,workerNodePreserved:true,sameStateDoesNotJump:true,toolPoseSettles:true,smoothTyping:true,quietLoopReset:true,reducedMotion:true}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
