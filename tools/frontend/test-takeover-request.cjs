const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Takeover requests render as quiet notices: one per state, light/dark, desktop/390/320.
const LONG='Complete the CAPTCHA in the browser. If the site asks you to confirm the device, approve it from your phone first, then come back here. Once the results page is visible, return control so I can continue the search and summarise what I find.';
const CASES={
 pending:{title:'Complete browser verification',instructions:'Complete the CAPTCHA in the browser, then return control.',status:'pending'},
 long:{title:'Complete browser verification',instructions:LONG,status:'pending'},
 code:{title:'Sign in',instructions:'Enter the code sent to your phone.',status:'pending',authentication:{method:'sms',service:'Example Bank',destination:'Sent to •••• 4821',code_length:6}},
 signin:{title:'Sign in',instructions:'Sign in to continue checking the order.',status:'pending',authentication:{method:'signin',service:'Example Store'}},
 done:{title:'Complete browser verification',instructions:'Complete the CAPTCHA in the browser, then return control.',status:'resumed',outcome:'done'},
 skipped:{title:'Complete browser verification',instructions:'Complete the CAPTCHA in the browser, then return control.',status:'resumed',outcome:'skipped'},
 expired:{title:'Complete browser verification',instructions:'Complete the CAPTCHA in the browser, then return control.',status:'expired'},
};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-takeover-request',engine=process.env.WEBKIT?'webkit':'chromium';fs.mkdirSync(out,{recursive:true});
const origin='http://127.0.0.1:'+server.address().port;
try{for(const [name,spec] of Object.entries(CASES)){
 const page=await browser.newPage({viewport:{width:1000,height:760},hasTouch:!!process.env.TOUCH}),now=Math.floor(Date.now()/1000);page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pending=spec.status==='pending',writes=[],codes=[];let taskReads=0,codeFails=1;
 const run={id:'human-run',bot_id:'piper',chat_id:'dm-piper',status:pending?'awaiting_user':'completed',prompt:'Search the web.',output:pending?'':'Verified the page after your help.',created:now-10};
 const task={id:'human-step',run_id:'human-run',bot_id:'piper',created:now-5,outcome:'',...spec};
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route('**/api/**',async r=>{const req=r.request(),n=new URL(req.url()).pathname,send=json=>r.fulfill({json});
  if(n==='/api/runs')return send([run]);
  if(n==='/api/runs/human-run')return send({run,events:[],approvals:[]});
  if(n==='/api/user-tasks'){taskReads++;return send([task]);}
  if(n==='/api/user-tasks/human-step/code'){codes.push(req.postDataJSON());if(codeFails-->0)return r.fulfill({status:400,json:{error:'That code was not accepted. Try again.'}});return send({ok:true});}
  if(n==='/api/status')return send({screen_bot_id:'piper',takeover:false,vm_enabled:true});
  if(n==='/api/takeover'){writes.push(req.postDataJSON());return send({ok:true});}
  if(n==='/api/computer/session')return send({ticket:'fixture'});
  if(n==='/api/activity')return send({});
  if(n==='/api/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[
   {seq:1,sender:'user',kind:'message',text:'Search the web for the order status.',created:now-10},
   {seq:2,sender:'piper',kind:'assistant',text:'The browser needs your help.',run_id:'human-run',created:now-6},
   ...(pending?[]:[{seq:3,sender:'piper',kind:'result',text:run.output,run_id:'human-run',created:now-2}])],page:{has_before:false,has_after:false}});
  return r.continue();});
 await page.goto(origin);const card=page.locator('[data-message="human-task-human-step"]');await card.waitFor();
 if(pending){
  const take=card.getByRole('button',{name:'Take over',exact:true});await take.waitFor();
  const box=await take.boundingBox();if(process.env.TOUCH)assert(box.height>=44,'Take over is a 44px touch target');
  if(name!=='code')assert(await take.evaluate(n=>n.classList.contains('notice-primary')),'Take over is the obvious action');if(name!=='code')assert(await card.getByRole('button',{name:'Skip this step',exact:true}).isVisible());
  if(name==='code'){assert(await card.getByRole('button',{name:'Submit code',exact:true}).evaluate(n=>n.classList.contains('notice-primary')),'Code entry keeps Submit code as the primary action');assert(await card.getByRole('textbox',{name:/Verification code for Example Bank/}).isVisible());assert(await card.getByRole('button',{name:'Submit code',exact:true}).isVisible());}
 }
 if(name==='pending')for(const [label,size] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844}]]){await page.setViewportSize(size);await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForTimeout(300);await card.evaluate(n=>n.scrollIntoView({block:'center'}));await page.waitForTimeout(150);await page.screenshot({path:path.join(out,`${engine}-app-pending-dark-${label}.png`)});}
 for(const theme of ['light','dark'])for(const width of [1000,390,320]){
  await page.setViewportSize({width,height:760});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(200);
  assert(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),name+' fits at '+width);
  await card.evaluate(n=>n.scrollIntoView({block:'center'}));await page.waitForTimeout(100);await card.screenshot({path:path.join(out,`${engine}-${name}-${theme}-${width}.png`)});
 }
 if(name==='long'){await page.setViewportSize({width:1000,height:760});const more=card.locator('.human-task-details summary');assert.equal(await more.count(),1,'Long instructions fold');{await more.click();assert.equal(await more.innerText(),'Show less');const reads=taskReads;await page.waitForFunction(()=>true);for(let i=0;taskReads<reads+2&&i<120;i++)await page.waitForTimeout(100);assert(taskReads>=reads+2,'App refreshed the card');assert.equal(await card.locator('.human-task-details summary').innerText(),'Show less','Expanded instructions survive a refresh');assert(!await card.locator('.task-instructions').evaluate(n=>n.classList.contains('is-clamped')));await page.waitForTimeout(350);await card.screenshot({path:path.join(out,`${engine}-long-expanded-dark-1000.png`)});}}
 if(name==='code'){await page.setViewportSize({width:1000,height:760});await page.evaluate(()=>document.documentElement.dataset.theme='light');
  const input=card.getByRole('textbox',{name:/Verification code for Example Bank/}),submit=card.getByRole('button',{name:'Submit code',exact:true});
  await input.fill('482913');await submit.click();await page.getByText('That code was not accepted. Try again.').first().waitFor();
  assert.equal(codes.length,1);assert.deepEqual(codes[0],{bot_id:'piper',run_id:'human-run',code:'482913'});
  assert.equal(await input.inputValue(),'','A rejected one-time code is not kept on screen');assert(!await submit.isDisabled(),'Submit is available again after a failure');
  assert(await card.getByRole('button',{name:'Take over',exact:true}).isVisible(),'Takeover remains available after a failed code');
  await card.screenshot({path:path.join(out,engine+'-code-rejected-light-1000.png')});
  await input.fill('482914');await submit.click();await card.getByText('Code submitted. Verifying sign-in…').waitFor();assert.equal(codes.length,2);assert.equal(codes[1].code,'482914');}
 if(name==='long'){
  const summary=card.locator('.human-task-details summary');
  await summary.click();await page.waitForTimeout(40);await summary.click();await page.waitForTimeout(40);await summary.click();await page.waitForTimeout(350);
  assert.equal(await summary.getAttribute('aria-expanded'),'false');assert(await card.locator('.task-instructions').evaluate(n=>n.classList.contains('is-clamped')));
  await page.emulateMedia({reducedMotion:'reduce'});await summary.click();assert.equal(await summary.getAttribute('aria-expanded'),'true');
  assert(await card.locator('.task-instructions').evaluate(n=>n.getAnimations().length===0),'Reduced motion opens instructions without animation');
 }
 if(name==='pending'){await card.getByRole('button',{name:'Take over',exact:true}).click();for(let i=0;!writes.length&&i<100;i++)await page.waitForTimeout(50);assert(writes.some(w=>w.enabled===true&&w.bot_id==='piper'),'Take over still enables takeover');}
 if(!pending){const line=card.locator('.decision-receipt-summary');assert(await line.isVisible());assert((await line.boundingBox()).height<=40,'Finished steps collapse to one line');}
 assert.deepEqual(errors,[]);await page.close();
}
console.log('Takeover request notices render in every state, theme and width; actions keep their semantics.');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
