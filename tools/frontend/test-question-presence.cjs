const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true,...(!process.env.WEBKIT&&process.env.KINDRED_TEST_BROWSER_CHANNEL?{channel:process.env.KINDRED_TEST_BROWSER_CHANNEL}:{})});
 try{
  const p=await browser.newPage({viewport:{width:1320,height:900}});p.setDefaultTimeout(12000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bot={id:'leet',name:'Leet',provider:'claude-code',profile:{shape:'round',color:'#f24d93'}},chat={id:'dm-leet',name:'Leet',members:['leet'],archived:false};
  const original={id:'question-turn',bot_id:bot.id,chat_id:chat.id,status:'running',prompt:'Find my workflows.',output:'',error:'',created:now};
  const runs=[original],details=new Map([[original.id,[]]]),messages=[{seq:1,sender:'user',kind:'message',text:original.prompt,created:now}];
  let label='Thinking it through',question,dismissWrites=0,rejectDismiss=false,heldDismiss=null,sharedQuestion=null,sharedDismissWrites=0;
  await p.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send([bot]);if(name==='/chats')return send([chat]);if(name==='/runs')return send(runs);
   if(name==='/chats/'+chat.id)return send({chat,messages});
   if(name.startsWith('/runs/')){const run=runs.find(r=>r.id===name.slice(6));return send({run,events:details.get(run.id)||[],approvals:[],attachments:[]});}
   if(name==='/activity'){const run=runs[0];return send({leet:{run_id:run.id,status:run.status,shape:label==='Searching'?'investigate':'think',label,started_at:now}});}
   if(name==='/questions/stale/dismiss'){
    dismissWrites++;assert.deepEqual(req.postDataJSON(),{dismiss:true});
    if(rejectDismiss)return route.fulfill({status:503,json:{error:'Could not dismiss this question. Try again.'}});
    if(heldDismiss)await heldDismiss;
    const stale=messages.find(m=>m.question?.id==='stale').question;stale.status='dismissed';stale.answer='';stale.selected=null;return send(stale);
   }
   if(name==='/server-chats/server-origin/questions/42/answer'){
    sharedDismissWrites++;assert.deepEqual(req.postDataJSON(),{dismiss:true});sharedQuestion.status='dismissed';return send(sharedQuestion);
   }
   if(name==='/questions/choice/answer'){
    question.status='answered';question.selected=0;question.answer=question.options[0];
    runs.unshift({...original,id:'continuation',status:'running',output:'',created:now+2});label='Searching';
    return send(question);
   }
   return route.continue();
  });
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const workers=p.locator('#content .work-line');await workers.waitFor();
  // This turn intentionally has no final result bubble. Its output can even
  // contain prose: question_wait, not output text, owns the handoff.
  original.status='completed';original.output='Please choose how to continue.';
  details.set(original.id,[{seq:3,kind:'question_wait',body:{id:'choice'},created:now+1}]);
  question={id:'choice',bot_id:bot.id,run_id:original.id,question:'How should I find your workflows?',context:'Choose a source.',options:['Scan local files','Use an attachment'],status:'pending',selected:null};
  messages.push({seq:2,sender:'leet',kind:'question',question,run_id:original.id,text:question.question,created:now+1});
  const card=p.locator('[data-question-id="choice"]');await card.waitFor();
  await p.waitForFunction(()=>document.querySelectorAll('#content .work-line').length===0);
  await card.getByRole('button',{name:/Scan local files/}).click();await card.locator('.decision-receipt-summary').waitFor();assert.equal(await card.locator('.decision-receipt-outcome').innerText(),'Answered');
  await p.waitForFunction(()=>document.querySelectorAll('#content .work-line').length===1&&document.querySelector('#content .work-label > span')?.textContent==='Searching');
  await p.waitForTimeout(3200);assert.equal(await workers.count(),1,'Polling must not revive the question turn');
  await workers.hover();await p.screenshot({path:path.join(artifacts,engine+'-question-continuation.png')});
  label='Reviewing search results';await p.waitForFunction(()=>document.querySelector('#content .work-label > span')?.textContent==='Reviewing search results');
  await p.setViewportSize({width:390,height:844});await workers.scrollIntoViewIfNeeded();await workers.focus();await p.screenshot({path:path.join(artifacts,engine+'-question-continuation-mobile.png')});
  assert(await workers.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  // Empty and explicit quiet completions also deliberately omit a result.
  runs[0].status='completed';await p.waitForFunction(()=>document.querySelectorAll('#content .work-line').length===0);
  const quiet={...original,id:'quiet',status:'running',output:''};runs.unshift(quiet);await workers.waitFor();
  quiet.status='completed';quiet.output='No new findings.';details.set(quiet.id,[{seq:4,kind:'tool_result',body:{tool:'finish_quietly',failed:false},created:now+3}]);
  await p.waitForFunction(()=>document.querySelectorAll('#content .work-line').length===0);
  await p.waitForTimeout(1600);assert.equal(await workers.count(),0);
  const countBefore=runs.length;
  messages.push({seq:3,sender:'leet',kind:'question',question:{...question,id:'stale',status:'pending',answer:'',selected:null,options:Array.from({length:6},(_,i)=>'Plan '+(i+1)+': Review the existing project files and prepare a careful comparison of the available options before continuing.')},run_id:original.id,text:question.question,created:now+4});
  const stale=p.locator('[data-question-id="stale"]');await stale.waitFor();
  const custom=stale.locator('.question-choices > .question-option').last(),dismiss=p.locator('.request-tray-header').getByRole('button',{name:'Dismiss question',exact:true});
  assert(await custom.evaluate(el=>el.classList.contains('question-custom')),'Custom response is the final answer row');
  assert.equal(await stale.locator('.question-actions').count(),0,'No separate action footer');
  await custom.scrollIntoViewIfNeeded();
  assert(await dismiss.evaluate(el=>{const r=el.getBoundingClientRect(),tray=el.closest('.request-tray').getBoundingClientRect();return r.top>=tray.top&&r.bottom<=tray.bottom&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Dismiss stays reachable while the answer list scrolls');
  await p.screenshot({path:path.join(artifacts,engine+'-question-choices-mobile.png')});
  await p.locator('#prompt').fill('Keep my unsent normal message.');await custom.click();
  assert.equal(dismissWrites,0,'Choosing the custom row only opens the composer');
  await p.locator('#prompt').fill('Unsubmitted draft');
  rejectDismiss=true;await dismiss.click();await p.getByText('Could not dismiss this question. Try again.',{exact:true}).waitFor();
  assert(await dismiss.isEnabled(),'Failed dismissal leaves the control retryable');assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Unsubmitted draft');
  rejectDismiss=false;let release;heldDismiss=new Promise(resolve=>release=resolve);await dismiss.click();
  assert(await dismiss.isDisabled(),'Disable the header control while saving');await dismiss.evaluate(el=>el.click());release();heldDismiss=null;
  await p.waitForFunction(()=>document.querySelector('[data-question-id="stale"] .decision-receipt-outcome')?.textContent==='Dismissed');
  assert.equal(dismissWrites,2,'One failed request and one successful dismissal, with no duplicate request');assert.equal(runs.length,countBefore,'Dismiss must not start a continuation');assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my unsent normal message.','Normal draft is restored; the unsubmitted answer is not sent');
  assert.equal(await workers.count(),0);assert.equal(await stale.getByRole('textbox').count(),0);
  await stale.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(artifacts,engine+'-question-dismissed-mobile.png')});
  // Legacy shared questions use the same quiet dismiss action, never a custom answer.
  sharedQuestion={...question,id:'shared-stale',shared_seq:42,chat_id:'server-origin',delivery_chat_id:chat.id,status:'pending',answer:'',selected:null};
  messages.push({seq:4,sender:'leet',kind:'question',question:sharedQuestion,text:sharedQuestion.question,created:now+5});await dismiss.waitFor();await dismiss.click();
  await p.waitForFunction(()=>document.querySelector('[data-question-id="shared-stale"] .decision-receipt-outcome')?.textContent==='Dismissed');
  assert.equal(sharedDismissWrites,1);assert.equal(runs.length,countBefore);assert.equal(await workers.count(),0);assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Keep my unsent normal message.');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,questionHandoff:true,singleContinuationAvatar:true,liveActivityLabels:true,emptyCompletion:true,quietCompletion:true,mobile:true,customAnswerRow:true,dismissalRetry:true,sharedDismissal:true,normalDraftPreserved:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
