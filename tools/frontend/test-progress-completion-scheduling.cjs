// Actual transcript builders and disclosure animation. Only completion RAFs are
// withheld/replayed to model the retained undelivered-frame boundary; timers run.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/progress-completion');fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_COMPLETION_SOURCE||path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,node,conversationHistory,reconcileConversation,summaryProgress};'}));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#content .message-group').first().waitFor();
  const results=await p.evaluate(async()=>{
   const app=await import('/app.js'),host=document.createElement('div');document.querySelector('#content').replaceChildren(host);
   const entry=app.conversationHistory('dm-piper'),pause=ms=>new Promise(r=>setTimeout(r,ms));let serial=0,run,count=0;
   const raf=window.requestAnimationFrame,held=[];
   window.requestAnimationFrame=callback=>{if((callback.toString().includes('group._progressCompletion!==pending')||callback.toString().includes('group.isConnected&&!entry.progressOpen.has(key)')||callback.toString().includes('previous.isConnected&&details.open'))){held.push(callback);return -held.length;}return raf(callback);};
   const show=()=>{app.state.allRuns=[run];const m={seq:900+serial,kind:'task_progress',sender:'piper',run_id:run.id,created:run.created,progress:{mode:'summaries',group_id:'completion-'+serial,task_title:'Guarded completion',presentation:{mode:'staged',promoted:true,stages:['Read','Verify'],current_stage:1},activity:{completed:++count,recent:[{label:'Read evidence',created:run.created}]}}};entry.messages=[m];const desired=document.createElement('div');desired.append(app.summaryProgress([m],entry,[run]));app.reconcileConversation(host,desired);};
   const reset=async()=>{serial++;run={id:'run-'+serial,bot_id:'piper',chat_id:entry.id,status:'running',created:Math.floor(Date.now()/1000)-30};show();await pause(40);const group=host.firstElementChild,details=group.querySelector('details'),summary=details.querySelector('summary'),body=details.querySelector('.summary-progress-body');let calls=0;const original=summary.onclick;summary.onclick=e=>{calls++;original(e);};return {group,details,summary,body,calls:()=>calls};};
   const finish=(status='completed')=>{run={...run,status};show();};const replay=()=>{for(const callback of held.splice(0))callback(performance.now());};const result={};
   let c=await reset();c.summary.focus();finish();await pause(380);replay();await pause(30);result.fallback={closed:!c.details.open,calls:c.calls(),focus:document.activeElement===c.summary};if(!result.fallback.closed){window.requestAnimationFrame=raf;return result;}
   c=await reset();finish();const old=c.group._progressCompletion;for(let i=0;i<4;i++)show();const deadline=c.group._progressCompletion?.deadline;replay();await pause(380);result.rapidRefresh={closed:!c.details.open,calls:c.calls(),same:host.firstElementChild===c.group,deadline:deadline===old.deadline};
   c=await reset();finish();run={...run,id:'continuation-'+serial,status:'running'};show();replay();await pause(380);result.newRun={open:c.details.open,finished:c.group.dataset.progressFinished,run:c.group._progressRunId,expected:run.id,calls:c.calls()};
   c=await reset();finish();c.group.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));replay();await pause(380);result.readingInteraction={open:c.details.open,calls:c.calls(),pending:c.group._progressCompletion===null};
   c=await reset();finish();c.summary.click();await pause(10);c.summary.click();replay();await pause(380);show();await pause(40);result.manualOpen={open:c.details.open,manual:entry.progressOpen.has(c.group.dataset.progressGroup),calls:c.calls()};
   c=await reset();finish();c.group.dataset.progressFinished='false';replay();await pause(80);result.currentState={open:c.details.open,calls:c.calls()};
   c=await reset();finish();c.group.remove();replay();await pause(80);result.detached={open:c.details.open,calls:c.calls(),pending:c.group._progressCompletion===null};
   c=await reset();finish('cancelled');await pause(380);result.cancelled={closed:!c.details.open,label:c.summary.textContent,calls:c.calls()};
   // Old callbacks cannot act on a replacement revision even before its timer.
   c=await reset();finish();const stale=held.at(-1);show();run={...run,id:'newer-'+serial,status:'running'};show();stale(performance.now());await pause(380);result.staleRevision={open:c.details.open,run:c.group._progressRunId,expected:run.id,calls:c.calls()};
   window.requestAnimationFrame=raf;return result;
  });
  fs.writeFileSync(path.join(out,engine+'-completion-observed.json'),JSON.stringify({engine,results,errors},null,2));
  assert.deepEqual(results.fallback,{closed:true,calls:1,focus:true});
  assert.deepEqual(results.rapidRefresh,{closed:true,calls:1,same:true,deadline:true});
  assert(results.newRun.open&&results.newRun.finished==='false'&&results.newRun.run===results.newRun.expected&&results.newRun.calls===0);
  assert.deepEqual(results.readingInteraction,{open:true,calls:0,pending:true});
  assert(results.manualOpen.open&&results.manualOpen.manual&&results.manualOpen.calls===2);
  assert.deepEqual(results.currentState,{open:true,calls:0});assert.deepEqual(results.detached,{open:true,calls:0,pending:true});
  assert(results.cancelled.closed&&results.cancelled.label.includes('Stopped')&&!results.cancelled.label.includes('Finished')&&results.cancelled.calls===1);
  assert(results.staleRevision.open&&results.staleRevision.run===results.staleRevision.expected&&results.staleRevision.calls===0);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,engine+'-completion.json'),JSON.stringify({engine,results,errors},null,2));console.log(JSON.stringify({passed:true,engine,results}));
 }finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
