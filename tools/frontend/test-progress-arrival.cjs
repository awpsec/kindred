const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-progress-arrival';fs.mkdirSync(out,{recursive:true});
 const browser=await({chromium,webkit}[engine]).launch();
 try{for(const width of [1100,390]){
  const context=await browser.newContext({viewport:{width,height:844}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);window.noteEntrances=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(options?.id==='progress-note-arrival')noteEntrances.push({seq:this.closest('[data-message]').dataset.message,frames,options});return animate.call(this,frames,options);};},token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'notes',bot_id:'piper',chat_id:chat.id,status:'running',created:now-100,progress_started:now-100,task_title:'Review records',output:''};let count=0,history=false;
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'review',work_qualified:true,task_title:run.task_title,marker:{seq:2,created:now-100,sender:'piper',run_id:run.id,task_title:run.task_title},activity:{seconds:100,completed:3,last_at:now}};
  const messages=()=>[...(history?Array.from({length:35},(_,i)=>({seq:-100+i,created:now-500+i,sender:i%2?'piper':'user',kind:'message',text:'Earlier context '+i+' — preserve this reading position while a new note arrives.'})):[]),{seq:1,created:now-101,sender:'user',kind:'message',text:'Review the records.'},{...progress.marker,kind:'task_progress',text:'',progress},...Array.from({length:count},(_,i)=>({seq:3+i,created:now-80+i*10,sender:'piper',kind:'assistant',run_id:run.id,text:'Verified record '+(i+1)+'.',progress}))];
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.noteRefresh=async(history=false)=>{while(state.refreshing)await new Promise(r=>setTimeout(r,10));if(history)conversationHistory(currentConversationId()).historyChanged=true;await refresh(true);};export {state,revealProgressNote,reconcileConversation,summaryProgress,conversationHistory};'}));
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],approvals:[],attachments:[]});if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({piper:{run_id:run.id,status:'running',shape:'read',label:'Reviewing records',server_time:now}});if(['/api/approvals','/api/questions','/api/user-tasks'].includes(n))return send([]);return r.continue();});
  const refresh=history=>p.evaluate(h=>noteRefresh(h),!!history),entrances=()=>p.evaluate(()=>noteEntrances);
  await p.goto(origin);await p.locator('.in-chat-work').waitFor();assert.equal((await entrances()).length,0);
  await p.locator('#prompt').fill('Keep this draft and caret');const caret=await p.locator('#prompt').evaluate(n=>n.value!==undefined?n.selectionStart:getSelection()?.focusOffset);
  count=1;await refresh();assert.deepEqual((await entrances()).map(a=>a.seq),['3']);
  await p.evaluate(()=>{window.firstNote=document.querySelector('[data-message="3"]');window.firstNoteTop=firstNote.offsetTop;});
  await refresh();await p.waitForTimeout(260);assert.equal((await entrances()).length,1,'Polling does not replay the entrance');assert(await p.evaluate(()=>firstNote===document.querySelector('[data-message="3"]')&&firstNote.offsetTop===firstNoteTop),'Stable measured wrapper and note identity');
  assert.equal(await p.locator('#prompt').innerText(),'Keep this draft and caret');assert.equal(await p.locator('#prompt').evaluate(n=>n.value!==undefined?n.selectionStart:getSelection()?.focusOffset),caret);
  count=3;await refresh();assert.deepEqual((await entrances()).map(a=>a.seq),['3','4','5']);
  const frames=await entrances();assert(frames.every(a=>a.options.duration===220&&!a.options.delay&&a.frames.every(f=>Object.keys(f).every(k=>['opacity','transform'].includes(k)))),'Concurrent paint-only entrances, no stagger or layout animation');
  count=4;await refresh();await p.locator('.summary-progress').waitFor();assert.equal((await entrances()).length,3,'The fourth note is born inside Gather, not animated twice');
  await p.locator('.summary-progress summary').first().click();await p.waitForTimeout(300);assert.equal((await entrances()).length,3,'Opening Gather does not replay note entrances');
  assert(await p.evaluate(()=>![...document.querySelectorAll('.task-commentary')].some(n=>n._progressArrival)),'Gather owns the notes without competing entrances');
  await p.reload();await p.locator('.summary-progress').waitFor();assert.equal((await entrances()).length,0,'Opening existing history is silent');
  count=0;await p.reload();await p.locator('.in-chat-work').waitFor();count=3;await refresh(true);assert.equal((await entrances()).length,0,'History replacement is not live arrival');
  for(const reduced of ['system','app']){count=0;await p.reload();await p.locator('.in-chat-work').waitFor();if(reduced==='system')await p.emulateMedia({reducedMotion:'reduce'});else await p.evaluate(()=>document.documentElement.dataset.motion='off');count=1;await refresh();assert.equal((await entrances()).length,0,reduced+' reduced motion');await p.emulateMedia({reducedMotion:'no-preference'});}
  // Old-history reading is anchored and new progress does not animate offscreen.
  history=true;count=0;await p.reload();await p.locator('.in-chat-work').waitFor();await p.locator('#content').evaluate(n=>{n.scrollTop=300;n.dispatchEvent(new Event('scroll'));});await p.waitForTimeout(100);
  const before=await p.locator('[data-message="-90"]').evaluate(n=>n.getBoundingClientRect().top);count=1;await refresh();await p.waitForTimeout(260);const after=await p.locator('[data-message="-90"]').evaluate(n=>n.getBoundingClientRect().top);assert(Math.abs(after-before)<2,'Older reading anchor preserved');assert.equal((await entrances()).length,0);
  // Following latest stays at the bottom during and after an entrance.
  await p.getByRole('button',{name:'Latest messages',exact:true}).click();await p.waitForTimeout(100);count=2;await refresh();await p.waitForTimeout(300);
  assert.equal((await entrances()).length,1);assert(await p.locator('#content').evaluate(n=>Math.abs(n.scrollHeight-n.scrollTop-n.clientHeight)<2),'Bottom follow survives entrance');
  // Deterministic mid-flight promotion: the real builders/reconciler take a
  // snapshot at 70ms and cancel the source effect before moving it into Gather.
  count=3;await refresh();await p.waitForTimeout(260);
  const midflight=await p.evaluate(async()=>{
   const app=await import('/app.js'),target=document.querySelector('#content'),row=target.querySelector('[data-message="5"]'),entry=app.conversationHistory('dm-piper');
   app.revealProgressNote(row,Date.now());const paint=row.querySelector(':scope > .message-row'),effect=paint.getAnimations().find(a=>a.id==='progress-note-arrival');effect.pause();effect.currentTime=70;
   const pose=getComputedStyle(paint).transform,opacity=getComputedStyle(paint).opacity;
   const items=entry.messages.filter(m=>m.progress),last={...items.at(-1),seq:6,text:'Verified record 4.'};entry.messages.push(last);const desired=document.createElement('div');desired.append(app.summaryProgress([...items,last],entry,app.state.allRuns));
   for(const n of target.querySelectorAll('.progress-commentary')){const copy=n.cloneNode(true);copy.dataset.taskCommentary='review';copy.classList.add('task-commentary');copy.hidden=true;desired.append(copy);}
   app.reconcileConversation(target,desired,true);const stopped=!row._progressArrival&&effect.playState==='idle';await new Promise(r=>requestAnimationFrame(r));
   const ghost=[...target.querySelectorAll('.progress-gather-ghost')].find(n=>n.textContent.includes('Verified record 3.')),copy=ghost?.querySelector('.message-row');return {stopped,pose,opacity,ghostPose:copy?.style.transform,ghostOpacity:copy?.style.opacity};
  });
  assert(midflight.stopped,'Promotion cancels the entering source note');assert.equal(midflight.ghostPose,midflight.pose,'Gather starts at the current painted pose');assert.equal(midflight.ghostOpacity,midflight.opacity);
  await p.waitForTimeout(360);assert.equal(await p.locator('.progress-gather-ghost').count(),0);assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine,width,entrances:true,noReplay:true,draftCaret:true,scrollAnchor:true,bottomFollow:true,midflight,reducedMotion:true}));
 }
 }finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
