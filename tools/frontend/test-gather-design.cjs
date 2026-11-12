const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',out=process.env.KINDRED_TEST_ARTIFACTS;
 if(out)fs.mkdirSync(out,{recursive:true});
 const browser=await({chromium,webkit}[engine]).launch();let passed=0;
 try{for(const [width,touch,theme] of [[1100,false,'dark'],[1100,false,'light'],[390,true,'light'],[320,true,'dark']]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,isMobile:touch}),page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({token,theme})=>{sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-theme',theme);},{token,theme});
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};let status='running',long=false,cancels=0;
  const title=()=>long?'Review '+('a very long client handoff title '.repeat(20)):'Prepare the client handoff';
  const run=()=>({id:'gather-work',bot_id:'piper',chat_id:chat.id,status,created:now-100,progress_started:now-100,task_title:title(),output:'',error:''});
  const progress=()=>({mode:'summaries',phase:'commentary',run_id:'gather-work',group_id:'gather-design',work_qualified:true,task_title:title(),commentary_count:4,marker:{seq:2,created:now-90,sender:'piper',run_id:'gather-work',task_title:title()},activity:{seconds:70,completed:2,last_at:now}});
  const updates=['Checking the latest notes.','Matching files to the checklist.','Reviewing the remaining questions.','Cross-checking the final attachments.'];
  const messages=()=>[{seq:1,sender:'user',kind:'message',created:now-100,text:'Prepare the client handoff.'},{seq:2,sender:'piper',kind:'task_progress',run_id:'gather-work',created:now-90,text:'',progress:progress()},...updates.map((text,i)=>({seq:3+i,sender:'piper',kind:'assistant',run_id:'gather-work',created:now-70+i*10,text,progress:progress()})),...(status==='completed'?[{seq:10,sender:'piper',kind:'result',run_id:'gather-work',created:now,text:'The handoff is ready.',progress:{...progress(),phase:'final_answer'}}]:[])];
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.designRefresh=()=>refresh(true);'}));
  await page.route(origin+'/api/**',r=>{const p=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(p==='/api/settings')return send({name:'You',theme,reduced_motion:false,approval_mode:'auto'});if(p==='/api/runs/gather-work/cancel'){cancels++;status='cancelled';return send({});}if(p==='/api/runs')return send([run()]);if(p==='/api/runs/gather-work')return send({run:run(),events:[],attachments:[],approvals:[]});if(p==='/api/chats')return send([chat]);if(p==='/api/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});if(['/api/approvals','/api/questions','/api/user-tasks'].includes(p))return send([]);if(p==='/api/activity')return send({});return r.continue();});
  await page.emulateMedia({reducedMotion:touch?'reduce':'no-preference'});await page.goto(origin);const card=page.locator('.task-gather'),summary=card.locator('summary'),stop=card.locator(':scope>.work-stop');await card.waitFor();
  assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'0','Stop is hidden at rest');
  assert.equal(await card.locator('.summary-progress-live-status').textContent(),updates[3]);passed++;
  if(!touch){await summary.hover();await page.waitForTimeout(180);assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'1');await page.mouse.move(0,0);await page.waitForTimeout(180);assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'0');await page.keyboard.press('Tab');await stop.focus();await page.waitForTimeout(180);assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'1','Keyboard focus reveals Stop');await stop.press('Shift+Tab');await page.locator('#prompt').focus();passed++;}
  await summary.click();await page.locator('[data-task-commentary="gather-design"]').first().waitFor();await page.waitForTimeout(260);
  if(touch)assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'1','Touch reveals Stop after expansion');
  const bubble=page.locator('.task-commentary .message-bubble').first();assert.equal(await bubble.evaluate(n=>getComputedStyle(n).borderRadius),'0px');passed++;
  await page.mouse.move(0,0);await page.waitForTimeout(180);if(out)await page.screenshot({path:path.join(out,`${engine}-${width}-${theme}-expanded.png`)});
  await summary.click();await page.waitForTimeout(350);await page.mouse.move(0,0);await page.waitForTimeout(180);assert.equal(await stop.evaluate(n=>getComputedStyle(n).opacity),'0','Pointer focus must not leave Stop visible');passed++;
  if(out)await page.screenshot({path:path.join(out,`${engine}-${width}-${theme}-collapsed.png`)});
  long=true;await page.evaluate(()=>designRefresh());
  const fits=await card.evaluate(n=>{const h=n.querySelector('summary'),t=n.querySelector('.summary-progress-task'),s=n.querySelector('.summary-progress-live-status'),r=h.getBoundingClientRect(),tr=t.getBoundingClientRect(),sr=s.getBoundingClientRect();return {fits:r.right<=innerWidth&&tr.right<=r.right&&sr.right<=r.right,rows:sr.top>=tr.bottom-1,overflow:document.documentElement.scrollWidth<=innerWidth};});assert(fits.fits&&fits.rows&&fits.overflow,JSON.stringify(fits));passed++;
  long=false;await page.evaluate(()=>designRefresh());await page.locator('#prompt').fill('Keep this draft');
  // Rapid pointer toggles converge to the latest intent without stranded history.
  await summary.click();await summary.click();await page.waitForTimeout(450);assert.equal(await card.locator('details').getAttribute('open'),null);assert.equal(await page.locator('.task-commentary:visible').count(),0);passed++;
  await page.evaluate(()=>{window.settlementFrames=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('gather-settlement-ghost'))window.settlementFrames.push(frames);return animate.call(this,frames,options);};});
  status='completed';await page.evaluate(()=>designRefresh());await page.waitForFunction(()=>document.querySelector('.task-gather')?.dataset.progressFinished==='true');assert.equal(await card.locator('.work-stop').count(),0);assert.equal(await card.locator('.summary-progress-live-status').textContent(),'Finished');assert.equal(await card.locator('.summary-progress-avatar').getAttribute('data-bot-id'),null);assert.equal(await card.locator('.summary-progress-avatar').evaluate(n=>getComputedStyle(n).filter),'grayscale(1)');assert.equal(await page.locator('#prompt').innerText(),'Keep this draft');assert.equal(await page.locator('[data-message="10"]').getAttribute('data-task-commentary'),null);passed++;
  await page.waitForTimeout(400);
  const receipt=await summary.evaluate(n=>({height:n.getBoundingClientRect().height,shadow:getComputedStyle(n).boxShadow,background:getComputedStyle(n).backgroundColor}));assert(receipt.height>=60&&receipt.height<110,'Finished job keeps the stable deck geometry');assert.notEqual(receipt.shadow,'none');assert.notEqual(receipt.background,'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('.gather-settlement-ghost').count(),0,'Transient chrome is removed');
  const frames=await page.evaluate(()=>window.settlementFrames);if(touch)assert.equal(frames.length,0,'Reduced motion skips the completion effect');else for(const sequence of frames)assert(sequence.every(frame=>Object.keys(frame).every(k=>['opacity','transform'].includes(k))),'Completion cannot animate layout properties');passed++;
  const answer=page.locator('[data-message="10"] .message-bubble');assert.equal(await answer.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','Desktop outcome is readable prose');
  await page.evaluate(()=>document.documentElement.dataset.mobile='ios');assert.notEqual(await answer.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)','Native mobile keeps its message surface');await page.evaluate(()=>delete document.documentElement.dataset.mobile);
  await page.evaluate(()=>designRefresh());assert.equal(await page.locator('.gather-settlement-ghost').count(),0,'Refresh cannot replay completion');
  await summary.click();await page.waitForTimeout(300);assert(await page.locator('.task-commentary').first().isVisible(),'Finished history remains accessible');await summary.click();await page.waitForTimeout(300);passed+=4;
  if(out)await page.screenshot({path:path.join(out,`${engine}-${width}-${theme}-finished.png`)});
  status='running';await page.reload();await card.waitFor();if(touch)await summary.click();else await summary.hover();await stop.click();await page.waitForFunction(()=>document.querySelector('.task-gather')?.dataset.progressFinished==='true');assert.equal(cancels,1);assert.equal(await card.locator('.summary-progress-live-status').textContent(),'Stopped');passed++;
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({engine,passed}));}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
