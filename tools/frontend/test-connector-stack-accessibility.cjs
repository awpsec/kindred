const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 const folder=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/workflow-ui-v107');fs.mkdirSync(folder,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(15000);
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const pending={id:'pending-edit',bot_id:'piper',kind:'email',connection:'Gmail',connector:'gmail',source:'Kindred',tool:'send_email',title:'Review draft',status:'pending',revision:1,email_send:true,account:'casey@example.invalid',email:{to:{key:'to',text:'jordan@example.invalid',editable:true},subject:{key:'subject',text:'Accessibility review',editable:true},body:{key:'body',text:'Draft body for review',editable:true}}};
  const cards={
   'receipt-1':{id:'receipt-1',bot_id:'piper',kind:'task',connection:'Asana',connector:'asana',source:'Kindred',tool:'read_record',title:'First receipt',status:'completed',revision:1,records:[{title:'First receipt',fields:{Result:'Initial completed state'}}]},
   'receipt-2':{id:'receipt-2',bot_id:'piper',kind:'task',connection:'Google Drive',connector:'googledrive',source:'Kindred',tool:'read_record',title:'Second receipt',status:'completed',revision:1,records:[{title:'Second receipt',fields:{Result:'Sibling receipt'}}]},
   [pending.id]:pending
  };
  const messages=()=>[
   {seq:1,sender:'piper',kind:'connector_artifact',text:'First receipt',run_id:'run-a',created:now,connector_artifact:cards['receipt-1']},
   {seq:2,sender:'piper',kind:'connector_artifact',text:'Second receipt',run_id:'run-a',created:now+1,connector_artifact:cards['receipt-2']},
   {seq:3,sender:'piper',kind:'connector_artifact',text:'Review draft',run_id:'run-a',created:now+2,connector_artifact:cards[pending.id]}
  ];
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/api/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/runs')return send([]);
   if(name==='/attention')return send({bots:{},chats:{}});
   if(name.startsWith('/chats/dm-piper'))return send({chat,messages:messages(),page:{has_before:false,has_after:false}});
   if(name.startsWith('/connector-artifacts/')){writes.push(request.postDataJSON());return send(cards[pending.id]);}
   return route.continue();
  });
  await page.goto(origin);const stack=page.locator('.connector-call').first();await stack.waitFor();
  assert.equal(await stack.count(),1);assert.equal(await page.locator('.connector-call').count(),2);
  // Keyboard interaction must expand the stack and expose every receipt.
  await stack.locator('summary').focus();await page.keyboard.press('Enter');await page.locator('[data-connector-artifact="receipt-1"]').waitFor({state:'visible'});
  assert.notEqual(await stack.getAttribute('open'),null);
  // A completed receipt corrected live to FAILED must expose the state and warning.
  cards['receipt-1'].status='failed';cards['receipt-1'].error='Connector timed out';
  await page.waitForFunction(()=>document.querySelector('[data-connector-artifact="receipt-1"] .status-failed'));
  const failed=page.locator('[data-connector-artifact="receipt-1"]');assert.match(await failed.innerText(),/Check outcome/);assert.match(await failed.innerText(),/final external state is unconfirmed/i);
  // Keep an open editor and its focused draft while a sibling receipt completes.
  const draft=page.locator('[data-connector-artifact="pending-edit"]');await draft.getByRole('button',{name:'Edit draft'}).click();const form=draft.getByRole('form',{name:'Edit email draft'});const body=form.getByLabel('Message',{exact:true});await body.fill('A longer draft retained during refresh.');await body.focus();
  cards['receipt-2'].status='failed';cards['receipt-2'].error='Sibling correction';
  await page.waitForFunction(()=>document.querySelector('[data-connector-artifact="receipt-2"] .status-failed'));
  assert.equal(await body.inputValue(),'A longer draft retained during refresh.');assert(await form.isVisible());
  assert.equal(await body.evaluate(e=>document.activeElement===e),true,'live sibling receipt update steals editor focus');
  cards['receipt-1'].status='completed';cards['receipt-2'].status='completed';
  await page.waitForFunction(()=>document.querySelector('.connector-call'));
  const activeStack=page.locator('.connector-call').first();
  // Text scaling and narrow layouts must remain usable and free of page overflow.
  for(const width of [320,390,900])for(const scale of [1.4,1.6]){
   await page.setViewportSize({width,height:900});await page.evaluate(s=>document.documentElement.style.setProperty('--text-scale',String(s)),scale);await page.waitForTimeout(150);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow at '+width+'px scale '+scale);
   const rect=await activeStack.locator('summary').evaluate(s=>{const r=s.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:innerWidth};});
   assert(rect.left>=0&&rect.right<=rect.viewport,'summary escapes viewport at '+width+'px scale '+scale);
   await activeStack.locator('summary').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(folder,`${engine}-connector-stack-${width}-scale-${String(scale).replace('.','')}.png`)});
   const save=form.getByRole('button',{name:'Save draft changes',exact:true});await save.scrollIntoViewIfNeeded();
   const controls=await form.locator('.connector-card-actions button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth};}));
   assert(controls.every(r=>r.left>=0&&r.right<=r.width),'editor actions fit the viewport');
   assert(controls[0].right<=controls[1].left||controls[0].bottom<=controls[1].top,'editor actions do not overlap');
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const result={passed:true,engine,widths:[320,390,900],textScales:[1.4,1.6],keyboardExpansion:true,liveCompletedToFailedVisible:true,failedOutcomeWarning:true,pendingDraftFocusPreserved:true,siblingReceiptCorrectionPreservedEditor:true,noPageOverflow:true,noConnectorWrites:true};
  fs.writeFileSync(path.join(folder,`${engine}-connector-stack-accessibility.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
