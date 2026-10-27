// Exercise the actual transcript builder across block splits, merges and polls.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 try{for(const width of [1100,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{if(window!==top)return;sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);},token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.blockReplay=async messages=>{const e=conversationHistory("dm-piper");e.messages=messages;state.chatKey="";await renderChat(true,"cached");};'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},run={id:'review',bot_id:'piper',chat_id:chat.id,status:'completed',created:now-600,progress_started:now-600,task_title:'Review the project',output:'Ready for review.',error:''};
  const progress={mode:'summaries',phase:'commentary',run_id:run.id,group_id:'project',work_qualified:true,presentation:{mode:'staged',promoted:true,stages:['Inspect','Verify'],current_stage:1},activity:{completed:24,recent:[{label:'Review files',created:now-10}]}};
  const update=(seq,text)=>({seq,sender:'piper',kind:'assistant',created:now-590+seq*3,run_id:run.id,progress,text:text||`Update ${seq}: Checking the saved project records.\n\nThe next step is to verify the source.`});
  const messages=[{seq:1,sender:'user',kind:'message',created:now-605,text:'Review the project.'},{seq:2,sender:'piper',kind:'task_progress',created:now-600,run_id:run.id,text:'',progress},...Array.from({length:24},(_,i)=>update(i+3)),{seq:27,sender:'piper',kind:'result',run_id:run.id,created:now,text:run.output}];
  await page.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run]);if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await page.goto(origin);const heading=page.locator('.summary-progress-heading');await heading.waitFor();await heading.evaluate(n=>n.click());await page.waitForTimeout(350);
  assert.equal(await page.locator('[data-task-commentary-block]').count(),1);
  await page.evaluate(()=>{window.savedUpdates=new Map([...document.querySelectorAll('.task-commentary')].map(n=>[n.dataset.message,n]));const text=document.querySelector('[data-message="4"] .message-text-content>p').firstChild;getSelection().setBaseAndExtent(text,0,text,8);});
  const retained=()=>page.evaluate(()=>[...window.savedUpdates].every(([id,n])=>n===document.querySelector('[data-message="'+id+'"]')));
  const replay=async()=>{await page.evaluate(m=>window.blockReplay(m),messages);assert(await retained(),'Refresh keeps every existing update mounted: '+JSON.stringify(await page.evaluate(()=>[...window.savedUpdates].filter(([id,n])=>n!==document.querySelector('[data-message="'+id+'"]')).map(([id])=>id))));assert.equal(await page.evaluate(()=>getSelection().toString()),'Update 4','Refresh preserves selected prose');};
  messages.find(m=>m.seq===5).text+=' Additional evidence is ready.';await replay();
  // Reparenting a retained row must also retain its keyboard focus.
  await page.locator('[data-message="20"] .progress-update-time-toggle').focus();
  await page.evaluate(()=>{window.savedControl=document.activeElement;const text=document.querySelector('[data-message="4"] .message-text-content>p').firstChild;getSelection().setBaseAndExtent(text,0,text,8);});
  assert(await page.evaluate(()=>document.activeElement===window.savedControl),'Fixture starts with the commentary clock focused');
  // A newly inserted user message splits the block without moving its updates.
  messages.splice(messages.findIndex(m=>m.seq===11),0,{seq:10.5,sender:'user',kind:'message',text:'Please also check this.',created:now-590+10.5*3});await replay();
  assert.equal(await page.locator('[data-task-commentary-block]').count(),2);
  assert(await page.evaluate(()=>document.activeElement===window.savedControl),'Split preserves keyboard focus in the second half');
  assert(await page.evaluate(()=>{const row=id=>document.querySelector('[data-message="'+id+'"]');return !!(row(10).compareDocumentPosition(row(10.5))&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(row(10.5).compareDocumentPosition(row(11))&Node.DOCUMENT_POSITION_FOLLOWING);}), 'Intervening message keeps chronological position');
  messages.splice(messages.findIndex(m=>m.seq===10.5),1);await replay();assert.equal(await page.locator('[data-task-commentary-block]').count(),1);
  assert(await page.evaluate(()=>document.activeElement===window.savedControl),'Merge preserves keyboard focus in the second half');
  messages.splice(2,0,update(2.5));await replay();assert(await page.locator('[data-message="2.5"]').isVisible(),'Paging into the same block retains its open state');
  // Long prose retains its own folding and mounted content inside task history.
  const long=update(26.5,Array.from({length:70},(_,i)=>`Paragraph ${i+1}: Detailed supporting evidence for this review.`).join('\n\n'));messages.splice(-1,0,long);await replay();
  const row=page.locator('[data-message="26.5"]'),more=row.getByRole('button',{name:'Show more',exact:true});await more.waitFor();await more.click();await row.getByRole('button',{name:'Show less',exact:true}).waitFor();
  await page.evaluate(()=>getSelection().removeAllRanges());await page.evaluate(m=>window.blockReplay(m),messages);assert(await row.getByRole('button',{name:'Show less',exact:true}).isVisible(),'Polling preserves the expanded long update');
  await row.getByRole('button',{name:'Show less',exact:true}).focus();await page.evaluate(()=>window.savedLongControl=document.activeElement);
  // Stateful previews stay outside blocks; grouping must not reparent frames.
  messages.splice(messages.findIndex(m=>m.seq===26.5),0,update(26.25,'```shard-html\n<button onclick="this.textContent=\'Kept\'">Remember choice</button>\n```'));
  await page.evaluate(m=>window.blockReplay(m),messages);
  assert(await page.evaluate(()=>document.activeElement===window.savedLongControl),'Splitting a long update preserves Show less focus');
  const widget=page.locator('[data-message="26.25"]');await widget.locator('.inline-shard[data-state=ready]').waitFor();
  assert.equal(await widget.evaluate(n=>n.parentElement.hasAttribute('data-task-commentary-block')),false,'Live previews retain their own transcript parent');
  const frame=widget.frameLocator('iframe');await frame.getByRole('button',{name:'Remember choice'}).click();
  messages.splice(messages.findIndex(m=>m.seq===11),0,{seq:10.5,sender:'user',kind:'message',text:'Keep that choice.',created:now-590+10.5*3});await page.evaluate(m=>window.blockReplay(m),messages);await frame.getByRole('button',{name:'Kept',exact:true}).waitFor();
  messages.splice(messages.findIndex(m=>m.seq===10.5),1);await page.evaluate(m=>window.blockReplay(m),messages);await frame.getByRole('button',{name:'Kept',exact:true}).waitFor();
  // A poll during reversal must not revive the earlier animation or leak text.
  await heading.evaluate(n=>n.click());await page.waitForTimeout(40);await heading.evaluate(n=>n.click());await page.evaluate(m=>window.blockReplay(m),messages);await page.waitForTimeout(350);
  assert.equal(await page.locator('.task-commentary:visible').count(),27);assert(await retained());
  assert(await page.locator('[data-task-commentary-block]').evaluateAll(nodes=>nodes.every(n=>!n.finishTaskCommentary&&!n.refreshTaskCommentary&&!n.style.overflow)),'Transition cleans up block motion state');
  await row.getByRole('button',{name:'Show less',exact:true}).focus();await heading.evaluate(n=>n.click());assert(await heading.evaluate(n=>n===document.activeElement),'Collapse returns focus from nested content to the header');await page.waitForTimeout(350);assert.equal(await page.locator('.task-commentary:visible').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({passed:true,engine,desktopMobile:true,stableUpdates:true,splitMerge:true,paging:true,selection:true,longMessageFolding:true,widgetState:true,rapidReversalWithPoll:true,focus:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1;});
