const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-disclosure-performance';fs.mkdirSync(out,{recursive:true});
 const engine=process.env.WEBKIT?'webkit':'chromium',rate=Number(process.env.KINDRED_CPU_RATE||4),browser=await({chromium,webkit}[engine]).launch();const results=[];
 try{for(const count of [20,120]){
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=engine==='chromium'?await page.context().newCDPSession(page):null;if(cdp){await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate});}
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:interval(fn,ms,...args);},token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'long',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-600,progress_started:now-600,task_title:'Review the project',output:'The review is ready.',error:''};
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'project',work_qualified:true,presentation:{mode:'staged',promoted:true,stages:['Inspect files','Review project'],current_stage:1},activity:{completed:count,recent:[{label:'Review project files',created:now-10}]}};
  const messages=[{seq:1,sender:'user',kind:'message',created:now-605,text:'Review the project.'},{seq:2,sender:'piper',kind:'task_progress',created:now-600,run_id:run.id,text:'',progress},...Array.from({length:count},(_,i)=>({seq:i+3,sender:'piper',kind:'assistant',created:now-590+i*3,run_id:run.id,progress,text:`Update ${i+1}: I checked this part of the project and its supporting files.\n\n- The saved records match the expected result.\n- I am checking the remaining details before finishing.\n\nThe next step is to compare the result with the source.`})),{seq:count+3,sender:'piper',kind:'result',run_id:run.id,created:now,text:run.output}];
  await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  if(process.env.KINDRED_TEST_APP_OVERRIDE)await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_TEST_APP_OVERRIDE,'utf8')}));
  await page.goto(origin);const disclosure=page.locator('.summary-progress-disclosure');await disclosure.waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);
  assert.equal(await page.locator('[data-task-commentary="project"]').count(),count);
  const firstUpdate=page.locator('[data-task-commentary="project"] .message-text-content').first();assert.equal(await firstUpdate.locator(':scope>p').count(),2,'Fixture uses actual Markdown paragraphs');assert.equal(await firstUpdate.locator('li').count(),2,'Fixture uses an actual Markdown list');
  async function metrics(){return cdp?Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value])):{LayoutCount:0,LayoutDuration:0,RecalcStyleCount:0};}
  for(const expanded of [true,false]){
   const before=await metrics();
   const timing=await disclosure.locator('summary').evaluate(n=>{const start=performance.now();n.click();const handlerMs=performance.now()-start,blocks=[...document.querySelectorAll('[data-task-commentary-block]')],blockAnimations=blocks.reduce((sum,b)=>sum+b.getAnimations().length,0),rowAnimations=[...document.querySelectorAll('.task-commentary')].reduce((sum,b)=>sum+b.getAnimations().length,0);for(const a of document.getAnimations())a.pause();void document.body.offsetHeight;return {handlerMs,layoutReadyMs:performance.now()-start,blocks:blocks.length,blockAnimations,rowAnimations};});
   assert.equal(timing.blocks,1,'Adjacent prose shares one reveal surface');
   assert.equal(timing.blockAnimations,1,'Disclosure uses one block animation regardless of update count');
   assert.equal(timing.rowAnimations,0,'Ordinary updates do not each create a height animation');
   const after=await metrics(),sample={engine,cpuRate:cdp?rate:1,count,expanded,...timing,layouts:cdp?after.LayoutCount-before.LayoutCount:null,layoutMs:cdp?(after.LayoutDuration-before.LayoutDuration)*1000:null,styleRecalculations:cdp?after.RecalcStyleCount-before.RecalcStyleCount:null};results.push(sample);
   await page.evaluate(()=>{for(const a of document.getAnimations())a.finish();});await page.waitForTimeout(350);
   assert.equal(await disclosure.evaluate(n=>n.open),expanded);assert.equal(await page.locator('[data-task-commentary="project"]:visible').count(),expanded?count:0);
  }
  if(count===120){
   const before=await metrics();
   const frames=await disclosure.locator('summary').evaluate(async n=>{
    const gaps=[];await new Promise(requestAnimationFrame);let last=performance.now();const start=last;
    n.click();const handlerMs=performance.now()-start;
    await new Promise(resolve=>{function step(t){gaps.push(t-last);last=t;if(t-start<600)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
    return {handlerMs,maxFrameGap:Math.max(...gaps),frames:gaps.length};
   });const after=await metrics();results.push({engine,cpuRate:cdp?rate:1,count,natural:true,...frames,layouts:cdp?after.LayoutCount-before.LayoutCount:null,layoutMs:cdp?(after.LayoutDuration-before.LayoutDuration)*1000:null});
  }
  if(count===120){
   const summary=disclosure.locator('summary');
   await page.locator('[data-task-commentary="project"] .progress-update-time-toggle').first().focus();
   await summary.evaluate(n=>n.click());assert(await summary.evaluate(n=>document.activeElement===n),'Collapse returns focus from a hidden update to its header');
   await page.waitForTimeout(60);await summary.evaluate(n=>n.click());await page.waitForTimeout(350);
   assert(await disclosure.evaluate(n=>n.open),'Rapid reversal of a large job keeps the latest intent');
   assert.equal(await page.locator('[data-task-commentary="project"]:visible').count(),count);
   assert(await page.locator('[data-task-commentary="project"]').evaluateAll(rows=>rows.every(n=>!n.finishTaskCommentary&&!n.refreshTaskCommentary&&!n.style.overflow)),'Reversal clears all row motion state');
   await page.emulateMedia({reducedMotion:'reduce'});await summary.evaluate(n=>n.click());
   assert.equal(await page.locator('[data-task-commentary="project"]:visible').count(),0);
   assert.equal(await disclosure.evaluate(n=>n.open),false,'Reduced motion settles a large job immediately');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 assert(results.filter(r=>r.engine==='chromium'&&!r.natural).every(r=>r.layouts<20),'Disclosure must batch geometry work instead of forcing layout for every update');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1;});
