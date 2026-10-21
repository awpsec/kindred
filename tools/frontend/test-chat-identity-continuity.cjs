// Production transcript builders/reconciler: selection, keyed activity/history,
// code scroll, expanded prose, reversals and preference changes during motion.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/opt/kindred/testing/ui-continuity-20261021/chat';fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,node,markdown,foldLongMessage,messageActions,conversationHistory,reconcileConversation,summaryProgress,taskRecoveryHistory,setTaskCommentaryExpanded};'}));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#content .message-group').first().waitFor();
  await p.evaluate(async()=>{
   window.app=await import('/app.js');window.host=document.createElement('div');document.querySelector('#content').replaceChildren(host);
   window.entry=app.conversationHistory('dm-piper');window.pause=ms=>new Promise(r=>setTimeout(r,ms));
   window.prose=(id,text)=>{const group=app.node('article','message-group');group.dataset.message=String(id);group.tabIndex=0;const row=app.node('div','message-row assistant has-message-actions'),bubble=app.markdown(text);app.foldLongMessage(bubble,String(id),entry);row.append(bubble,app.messageActions(entry.id,{seq:id,text,created:1}));group.append(row);return group;};
   window.show=nodes=>{const desired=document.createElement('div');desired.append(...nodes);app.reconcileConversation(host,desired);};
   window.selectText=(el,text)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const offset=n.data.indexOf(text);if(offset>=0){getSelection().setBaseAndExtent(n,offset,n,offset+text.length);return;}}throw new Error('Missing selection text '+text);};
   window.longText='A selected phrase stays here.\n\n```text\n'+('long_code '.repeat(160))+'\n```\n\n'+Array.from({length:38},(_,i)=>'Paragraph '+i+' for the expanded long message.').join('\n\n');
   show([prose(20,longText)]);
  });
  await p.waitForTimeout(100);
  const prose=await p.evaluate(async()=>{
   const row=host.firstElementChild,body=row.querySelector('.message-text-content'),pre=row.querySelector('pre');
   row.querySelector('.message-expand').click();pre.scrollLeft=180;const scrolled=pre.scrollLeft;
   selectText(body,'selected phrase');const selection=getSelection().toString();
   show([prose(20,longText+'\n\nA new final paragraph.')]);await pause(30);
   const result={row:row===host.firstElementChild,body:body===row.querySelector('.message-text-content'),pre:pre===row.querySelector('pre'),scroll:pre.scrollLeft,scrolled,selection:getSelection().toString(),expected:selection,expanded:row.querySelector('.message-expand').getAttribute('aria-expanded')};
   getSelection().removeAllRanges();return result;
  });
  assert(prose.row&&prose.body&&prose.pre,'Changed prose must retain row/body/code identity: '+JSON.stringify(prose));
  assert.equal(prose.selection,prose.expected);assert.equal(prose.expanded,'true');assert.equal(prose.scroll,prose.scrolled);assert(prose.scrolled>0);
  const editing=await p.evaluate(async()=>{
   // Prefix edits move an unchanged selected suffix without resetting selection.
   show([prose(20,'Old prefix. The selected suffix remains.'),prose(21,'Another message.')]);
   selectText(host.firstElementChild,'selected suffix');show([prose(20,'A much longer prefix. The selected suffix remains.'),prose(21,'Another message.')]);
   const suffix=getSelection().toString();
   const first=host.firstElementChild.querySelector('p').firstChild,last=host.lastElementChild.querySelector('p').firstChild;
   getSelection().setBaseAndExtent(last,7,first,first.data.indexOf('selected'));
   show([prose(20,'A much longer prefix. The selected suffix remains.'),prose(21,'Another message. New ending.')]);
   const spanning=getSelection().toString(),backward=getSelection().anchorNode.parentElement.closest('[data-message]').dataset.message;
   getSelection().removeAllRanges();
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied=text}});
   show([prose(20,'Updated text to copy.')]);host.querySelector('[data-message-action="copy"]').click();await pause(20);
   const copiedMessage=copied;show([prose(20,'```text\nold value\n```')]);const pre=host.querySelector('pre');host.querySelector('.code-toolbar button').focus();show([prose(20,'```text\nnew value\n```')]);const codeFocus=document.activeElement===host.querySelector('.code-toolbar button');host.querySelector('.code-toolbar button').click();await pause(20);return {suffix,spanning,backward,copied:copiedMessage,codeCopied:copied,codeFocus,codeIdentity:pre===host.querySelector('pre')};
  });
  assert.equal(editing.suffix,'selected suffix');assert(editing.spanning.includes('selected suffix remains.')&&editing.spanning.endsWith('Another'));assert.equal(editing.backward,'21');assert.equal(editing.copied,'Updated text to copy.');assert.equal(editing.codeCopied.trim(),'new value');assert(editing.codeFocus&&editing.codeIdentity);
  const folded=await p.evaluate(async()=>{
   const text=Array.from({length:40},(_,i)=>'Line '+i+' in a folded message.').join('\n\n');
   show([prose(25,text+'\n\n[Hidden link](https://example.test/old)')]);await pause(30);const group=host.firstElementChild,viewport=group.querySelector('.message-text-viewport');const initial=group.querySelector('a').tabIndex;
   show([prose(25,text+'\n\n[Hidden link](https://example.test/new)')]);const link=group.querySelector('a');return {same:group===host.firstElementChild,collapsed:viewport.classList.contains('is-truncated'),initial,updated:link.tabIndex,href:link.getAttribute('href')};
  });
  assert(folded.same&&folded.collapsed&&folded.initial===-1&&folded.updated===-1&&folded.href.endsWith('/new'),'Same-size folded edits must keep clipped links out of keyboard focus: '+JSON.stringify(folded));
  await p.evaluate(()=>{
   window.run={id:'job-stable',bot_id:'piper',chat_id:entry.id,status:'running',created:Math.floor(Date.now()/1000)-120,progress_started:Math.floor(Date.now()/1000)-120,task_title:'Review the evidence'};
   window.updateJob=(count,finished=false)=>{run={...run,status:finished?'completed':'running'};app.state.allRuns=[run];const m={seq:30,kind:'task_progress',sender:'piper',run_id:run.id,created:run.created,progress:{mode:'summaries',group_id:'stable-group',task_title:run.task_title,presentation:{mode:'staged',promoted:true,stages:['Read evidence','Verify findings'],current_stage:count>1?1:0},activity:{completed:count,recent:Array.from({length:count},(_,i)=>({label:'Checked evidence '+i,created:run.created+i}))}}};entry.messages=[m];show([app.summaryProgress([m],entry,[run])]);};
   updateJob(1);
  });
  const job=await p.evaluate(async()=>{
   const group=host.firstElementChild,details=group.querySelector('details'),summary=details.querySelector('summary'),body=details.querySelector('.summary-progress-body');summary.focus();updateJob(3);
   const stable={group:group===host.firstElementChild,details:details===host.querySelector('details'),body:body===host.querySelector('.summary-progress-body'),focus:document.activeElement===summary,open:details.open,updated:body.textContent.includes('3 completed calls')};
   summary.click();await pause(65);const mid=body.getBoundingClientRect().height;updateJob(4);const afterUpdate=body.getBoundingClientRect().height;summary.click();const afterReverse=body.getBoundingClientRect().height;await pause(380);
   const reversed={mid,afterUpdate,afterReverse,open:details.open,effects:body.getAnimations().length};
   summary.click();await pause(40);document.documentElement.dataset.motion='off';await pause(20);const reduced={open:details.open,effects:body.getAnimations().length,collapsing:details.classList.contains('is-collapsing')};delete document.documentElement.dataset.motion;
   summary.click();await pause(260);updateJob(5,true);await pause(400);const completed={same:group===host.firstElementChild,closed:!details.open,status:summary.textContent};
   summary.click();await pause(260);updateJob(6,true);const reopened={same:group===host.firstElementChild,open:details.open};
   return {stable,reversed,reduced,completed,reopened};
  });
  assert(Object.values(job.stable).every(Boolean),'Job refresh must preserve card/control identity: '+JSON.stringify(job));
  assert(Math.abs(job.reversed.mid-job.reversed.afterUpdate)<2&&Math.abs(job.reversed.afterUpdate-job.reversed.afterReverse)<2,'Refresh and reversal continue from measured height: '+JSON.stringify(job));
  assert(job.reversed.open&&job.reversed.effects===0);assert.deepEqual(job.reduced,{open:false,effects:0,collapsing:false});
  assert(job.completed.same&&job.completed.closed&&job.completed.status.includes('Finished'));assert(job.reopened.same&&job.reopened.open);
  await p.screenshot({path:path.join(out,engine+'-retained-job.png')});
  const commentary=await p.evaluate(async()=>{
   const row=(text,hidden=false)=>{const n=prose(35,text);n.dataset.taskCommentary='test-commentary';n.classList.add('task-commentary');n.hidden=hidden;return n;};
   show([row('Commentary that is collapsing.\n\nMore evidence here.')]);const old=host.firstElementChild;app.setTaskCommentaryExpanded('test-commentary',false);await pause(55);const height=old.getBoundingClientRect().height;show([row('Commentary that is collapsing.\n\nMore evidence here. A live edit.',true)]);const after=old.getBoundingClientRect().height;await pause(350);return {same:old===host.firstElementChild,height,after,hidden:old.hidden,effects:old.getAnimations().length};
  });
  assert(commentary.same&&commentary.hidden&&commentary.effects===0&&Math.abs(commentary.height-commentary.after)<2,'Commentary refresh must retain its in-flight collapse: '+JSON.stringify(commentary));

  const recovery=await p.evaluate(async()=>{
   const history=(ids)=>{const g=app.node('article','chat-status-group');g.dataset.message=String(ids[0]);g.dataset.recovery='prior-run';const d=app.taskRecoveryHistory();for(const id of ids){const row=app.node('div','recovery-message','Retained attempt '+id);row.dataset.message=String(id);d.querySelector('.task-recovery-body').append(row);}g.append(d);return g;};
   show([history([40,41])]);const group=host.firstElementChild,d=group.querySelector('details'),summary=d.querySelector('summary');summary.click();await pause(260);summary.focus();const member=d.querySelector('[data-message="41"]');show([history([41,42])]);
   return {group:group===host.firstElementChild,detail:d===host.querySelector('details'),member:member===d.querySelector('[data-message="41"]'),open:d.open,focus:document.activeElement===summary};
  });
  assert(Object.values(recovery).every(Boolean),'History regrouping must preserve disclosure, surviving member, and focus: '+JSON.stringify(recovery));
  // OS preference changes settle an already running disclosure too.
  await p.locator('.task-recovery-history>summary').click();await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  await p.waitForTimeout(30);assert.equal(await p.locator('.task-recovery-history').evaluate(d=>d.open||d.querySelector('.task-recovery-body').getAnimations().length>0),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,prose,editing,folded,job,commentary,recovery}));
 }finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
