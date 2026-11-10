const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;if(out)fs.mkdirSync(out,{recursive:true});
 const browser=await({chromium,webkit}[engine]).launch();let passed=0;
 try{for(const width of [1100,390]){
  const context=await browser.newContext({viewport:{width,height:844},...(out&&width===1100?{recordVideo:{dir:out,size:{width,height:844}}}:{})}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.gatherAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.progress-gather-ghost,.summary-progress'))window.gatherAnimations.push({ghost:this.matches('.progress-gather-ghost'),frames});return animate.call(this,frames,options);};},token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};let count=3,backendCount=0,partial=false,omitMarker=false,visibleOffset=0,finished=false,attention=false,unrelated=false,otherCount=1,mode='summaries',history=false;
  const run=()=>({id:'work',bot_id:'piper',chat_id:chat.id,status:finished?'completed':attention?'awaiting_user':'running',created:now-100,progress_started:now-100,task_title:'Review client records',output:'',error:''});
  const marker={seq:2,created:now-90,sender:'piper',run_id:'work',task_title:'Review client records'};
  const progress=()=>({mode,phase:'commentary',run_id:'work',group_id:'client-review',work_qualified:true,task_title:'Review client records',marker,...(backendCount?{commentary_count:backendCount}:{}),activity:{seconds:70,completed:2,last_at:now}});
  const texts=['Checking the client records.','The contact details are current.','Comparing the final attachments.','The remaining records are consistent.','Verifying the last reference.'];
  const approval={id:'review-approval',run_id:'work',bot_id:'piper',chat_id:chat.id,task_group_id:'client-review',status:'pending',tool:'guest_exec',args:{command:'echo fixture'},created:now-5};
  const handoff={id:'review-login',run_id:'work',bot_id:'piper',title:'Sign in to the client portal',instructions:'Please sign in on the bot computer.',authentication:{method:'signin',service:'the client portal'},status:'pending',created:now-3};
  const messages=()=>[
   ...(history?Array.from({length:24},(_,i)=>({seq:-50+i,created:now-500+i,sender:i%2?'piper':'user',kind:'message',text:'Earlier conversation context '+i+' — kept in place while current work progresses.'})):[]),
   {seq:1,sender:'user',kind:'message',created:now-100,text:'Review the client records and keep me posted.'},
   ...(!partial&&!omitMarker?[{...marker,text:'',kind:'task_progress',progress:progress()}]:[]),
   ...Array.from({length:count},(_,i)=>({seq:3+i,sender:'piper',kind:'assistant',run_id:'work',created:now-70+i*10,text:texts[i]||'Update '+i,progress:progress()})).filter((m,i)=>(!partial||i===count-1)&&i>=visibleOffset),
   ...(unrelated?Array.from({length:otherCount},(_,i)=>({seq:18+i,sender:'piper',kind:'assistant',run_id:'other',created:now-7,text:'A separate task update.',progress:{...progress(),run_id:'other',group_id:'separate',marker:{...marker,seq:17,run_id:'other'},commentary_count:otherCount}})):[]),
   ...(attention?[{seq:22,sender:'piper',kind:'approval',run_id:'work',created:now-5,text:'Approve action',approval}]:[]),
   ...(finished?[{seq:25,sender:'piper',kind:'result',run_id:'work',created:now,text:'Review complete. All records checked.',progress:{...progress(),phase:'final_answer'}}]:[])
  ];
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.gatherRefresh=()=>refresh(true);window.gatherHistoryRefresh=()=>{conversationHistory(currentConversationId()).historyChanged=true;return refresh(true)};'}));
  await page.route(origin+'/api/**',r=>{const p=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(p==='/api/runs')return send([run()]);if(p==='/api/runs/other')return send({run:{...run(),id:'other',status:'completed'},events:[],attachments:[],approvals:[]});if(p==='/api/runs/work')return send({run:run(),events:attention?[{seq:10,kind:'user_action',body:{id:handoff.id},created:handoff.created}]:[],attachments:[],approvals:[]});if(p==='/api/chats')return send([chat]);if(p==='/api/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});if(p==='/api/approvals')return send(attention?[approval]:[]);if(p==='/api/questions')return send([]);if(p==='/api/user-tasks')return send(attention?[handoff]:[]);if(p==='/api/activity')return send({});return r.continue();});
  await page.goto(origin);await page.getByText(texts[2],{exact:false}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);assert.equal(await page.locator('.progress-commentary:visible').count(),3);passed++;
  if(out)await page.screenshot({path:path.join(out,engine+'-'+width+'-inline.png')});
  unrelated=true;otherCount=3;await page.evaluate(()=>window.gatherRefresh());assert.equal(await page.locator('.summary-progress').count(),0,'Separate tasks never combine their counts');passed++;otherCount=1;unrelated=false;await page.evaluate(()=>window.gatherRefresh());
  await page.locator('#prompt').fill('Keep this unsent draft');await page.evaluate(()=>{window.originalUpdates=[...document.querySelectorAll('.progress-commentary[data-progress-candidate="client-review"]')];window.gatherAnimations=[];});
  count=4;await page.evaluate(()=>window.gatherRefresh());await page.locator('[data-progress-group="client-review"]').waitFor();await page.waitForTimeout(300);
  if(out)await page.screenshot({path:path.join(out,engine+'-'+width+'-gathered.png')});
  attention=true;unrelated=true;await page.evaluate(()=>window.gatherRefresh());
  assert.equal(await page.locator('.summary-progress').count(),1);assert.equal(await page.locator('[data-task-commentary="client-review"]:visible').count(),0);assert(await page.getByText('A separate task update.',{exact:false}).isVisible());assert(await page.locator('[data-message="22"]').isVisible());assert(await page.locator('[data-message="human-task-review-login"]').getByRole('button',{name:'Take over',exact:true}).isVisible());assert.equal(await page.locator('#prompt').innerText(),'Keep this unsent draft');assert(await page.locator('#prompt').evaluate(n=>n===document.activeElement));
  assert(await page.evaluate(()=>originalUpdates.every(n=>n.isConnected)),'Existing commentary nodes survive gathering');
  const animations=await page.evaluate(()=>gatherAnimations);assert(animations.length>0,'Live promotion animates');assert(animations.every(a=>a.frames.every(f=>Object.keys(f).every(k=>['opacity','transform'].includes(k)))),'Only compositor properties animate');passed++;
  if(out)await page.screenshot({path:path.join(out,engine+'-'+width+'-attention.png')});
  await page.locator('[data-progress-group="client-review"] summary').click();await page.getByText(texts[0],{exact:false}).waitFor();assert.equal(await page.locator('[data-task-commentary="client-review"]:visible').count(),4);passed++;
  await page.evaluate(()=>gatherAnimations=[]);count=5;await page.evaluate(()=>window.gatherRefresh());await page.locator('.task-commentary').getByText(texts[4],{exact:false}).waitFor();assert.equal(await page.evaluate(()=>gatherAnimations.length),0);passed++;
  await page.locator('[data-progress-group="client-review"] summary').click();await page.waitForTimeout(260);finished=true;await page.evaluate(()=>window.gatherRefresh());await page.getByText('Review complete. All records checked.',{exact:true}).waitFor();assert.equal(await page.locator('[data-message="25"]').getAttribute('data-task-commentary'),null);passed++;
  // History and reconnect reconstruct grouping without replaying the gather.
  await page.reload();await page.locator('.summary-progress').waitFor();assert.equal(await page.evaluate(()=>gatherAnimations.length),0);passed++;
  partial=true;backendCount=4;await page.reload();await page.locator('.summary-progress').waitFor();assert.equal(await page.evaluate(()=>gatherAnimations.length),0);passed++;
  partial=false;backendCount=0;finished=false;attention=false;unrelated=false;count=4;omitMarker=true;visibleOffset=1;await page.reload();await page.getByText(texts[3],{exact:false}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);assert.equal(await page.locator('.progress-commentary:visible').count(),3);omitMarker=false;visibleOffset=0;await page.evaluate(()=>window.gatherHistoryRefresh());await page.locator('.summary-progress').waitFor();await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>gatherAnimations.length),0,'Prepending the older fourth update groups silently on older backends');passed++;
  count=3;await page.reload();await page.getByText(texts[2],{exact:false}).waitFor();count=4;await page.evaluate(()=>window.gatherHistoryRefresh());await page.locator('.summary-progress').waitFor();await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>gatherAnimations.length),0);passed++;
  for(const reduced of ['system','kindred']){
   count=3;await page.reload();await page.getByText(texts[2],{exact:false}).waitFor();if(reduced==='system')await page.emulateMedia({reducedMotion:'reduce'});else await page.evaluate(()=>document.documentElement.dataset.motion='off');count=4;await page.evaluate(()=>window.gatherRefresh());await page.locator('.summary-progress').waitFor();await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>gatherAnimations.length),0);passed++;
   await page.emulateMedia({reducedMotion:'no-preference'});
  }
  // Reading old history retains its visible anchor; the composer stays untouched.
  history=true;count=3;await page.reload();await page.getByText(texts[2],{exact:false}).waitFor();await page.locator('#content').evaluate(n=>{n.scrollTop=300;n.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(100);const before=await page.locator('[data-message="-40"]').evaluate(n=>n.getBoundingClientRect().top);count=4;await page.evaluate(()=>window.gatherRefresh());await page.waitForTimeout(300);const after=await page.locator('[data-message="-40"]').evaluate(n=>n.getBoundingClientRect().top);assert(Math.abs(before-after)<2,'Reading position retained');passed++;
  mode='balanced';await page.reload();await page.getByText(texts[3],{exact:false}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);passed++;
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({passed,engine}));}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
