const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/connector-compact');fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const card=i=>({seq:i+2,sender:'piper',kind:'connector_artifact',text:'Read connected source',run_id:'review',created:now+i,connector_artifact:{id:'call-'+i,bot_id:'piper',connection:i%2?'Atlassian':'Slack',source:'Claude',kind:'task',tool:i%2?'confluence_read_page':'slack_read_channel',title:'Read connected source',status:'completed',revision:1,input:i%2?{page_id:'123123123',secret:'never show this'}:{channel_id:'C0C0J4KAUUX',limit:50},records:[]}});
  const messages=[{seq:1,sender:'user',kind:'message',text:'Check the Slack discussion and the project notes, then summarize what changed.',created:now},card(0),card(1)];messages.at(-1).connector_artifact.status='executing';
  await page.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat,messages,page:{has_before:false,has_after:false}}}));
  const refresh=async()=>page.evaluate(async()=>{const app=await import('/app.js');await app.refresh(true);});
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh};'}));
  await page.goto(origin);await page.locator('.connector-call').nth(1).waitFor();
  assert.equal(await page.locator('.connector-stack').count(),0);
  assert.equal(await page.locator('.connector-call-summary:visible').count(),2);
  assert.match(await page.locator('.connector-call-summary').last().innerText(),/Calling Confluence.*confluence_read_page.*123123123/);
  assert.equal(await page.locator('.connector-call-dots').count(),1);assert.equal(await page.locator('.connector-call-summary').first().locator('.connector-logo svg').count(),1);
  for(const row of await page.locator('.connector-call').all())assert((await row.boundingBox()).height<40);
  assert(!(await page.locator('.connector-call-summary').allTextContents()).join('').includes('never show this'));
  await page.screenshot({path:path.join(out,engine+'-two-calls.png')});
  messages.at(-1).connector_artifact.status='completed';for(let i=2;i<17;i++)messages.push(card(i));messages.at(-1).connector_artifact.status='executing';await refresh();
  const group=page.locator('.connector-stack-group'),stack=group.locator('.connector-stack');await stack.waitFor();await page.waitForFunction(()=>!document.querySelector('.connector-stack-group')?.classList.contains('is-forming'));
  assert.match(await stack.locator(':scope > summary').innerText(),/17 tool calls/);
  assert.equal(await page.locator('.connector-call-summary:visible').count(),1);assert((await group.boundingBox()).height<85);
  assert.match(await group.locator('.connector-stack-current').innerText(),/Calling Slack/);
  await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.mouse.move(1,1);
  await group.screenshot({path:path.join(out,engine+'-compact-running.png')});
  messages.at(-1).connector_artifact.status='completed';messages.at(-2).connector_artifact.status='executing';await refresh();
  assert.match(await group.locator('.connector-stack-current').innerText(),/Called Slack/,'the newest call stays visible even when an older call is running');
  messages.at(-2).connector_artifact.status='completed';messages.at(-1).connector_artifact.status='executing';await refresh();
  const summary=stack.locator(':scope > summary');await summary.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);
  assert.equal(await page.locator('.connector-call-summary:visible').count(),17);
  const first=stack.locator('.connector-call').first();await first.locator(':scope > summary').click();await first.getByRole('button',{name:'Chat about this'}).waitFor();
  assert(await first.getByText('C0C0J4KAUUX',{exact:true}).isVisible());
  messages.at(-1).connector_artifact.status='completed';await refresh();assert(await first.evaluate(n=>n.open));assert.equal(await page.locator('.connector-call-dots').count(),0);
  await summary.click();await page.waitForTimeout(300);
  for(const width of [1100,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:800});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await group.scrollIntoViewIfNeeded();await page.mouse.move(1,1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,`${engine}-${width}-${theme}.png`)});
  }
  messages.at(-1).connector_artifact.status='executing';await refresh();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  assert.equal(await page.locator('.connector-call-dots>span').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  messages.at(-1).connector_artifact.status='failed';await refresh();const failed=page.locator('[data-connector-artifact="call-16"]');await failed.getByText('Check outcome',{exact:true}).waitFor();assert(await failed.getByText(/final external state is unconfirmed/).isVisible());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,twoInlineRows:true,seventeenCallsCollapsed:true,latestCallVisible:true,receiptAccess:true,liveStatus:true,reducedMotion:true,mobile:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
