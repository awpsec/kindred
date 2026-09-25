const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Exercise the invisible completion boundary without manufacturing visible messages.
const vm=require('node:vm'),source=fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function quietCompletionMarker('),source.indexOf('function visibleRunPreview('))+source.slice(source.indexOf('function connectorBatches('),source.indexOf('function connectorMessage(')),context);
const routineCalls=Array.from({length:5},(_,i)=>({seq:i*2+1,sender:'piper',run_id:'routine-'+i,created:i*3600,text:'Called Gmail',connector_artifact:{status:'completed'}}));
const quietHistory=routineCalls.flatMap(m=>[m,{seq:m.seq+1,sender:'piper',run_id:m.run_id,kind:'result',text:'<finish_quietly/>'}]);
assert.equal(context.connectorBatches(quietHistory).get(1).length,5);
assert.equal(context.connectorBatches(quietHistory,{after:4,through:10}).get(1).length,5,'Receipt read cursors do not split a quiet stack');
assert.equal(context.connectorBatches(quietHistory,null,[{id:'routine-1',error:'Connection failed'}]).get(5).length,3,'failed runs remain a boundary');
assert.equal(context.connectorBatches([...routineCalls.slice(0,2),{seq:4.5,sender:'piper',text:'New mail found'},...routineCalls.slice(2)]).get(5).length,3,'actual messages divide stacks');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 const folder=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/connector-stacks');fs.mkdirSync(folder,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:1000}});page.setDefaultTimeout(12000);const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  let unread=false;const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
  const card=(seq,status='completed',sender='piper',run='review')=>({seq,sender,run_id:run,created:now+12*3600+seq,kind:'connector_artifact',text:'Review record '+seq,connector_artifact:{id:'card-'+seq,bot_id:sender,kind:'task',connection:seq%2?'Google Drive':'Asana',connector:seq%2?'googledrive':'asana',source:seq%2?'Codex':'Kindred',tool:'read_record',title:'Review record '+seq,status,read_only:status==='interrupted',revision:1,records:[{title:'Review record '+seq,fields:{Owner:'Example owner',Description:'Verified source content for receipt '+seq}}]}});
  const messages=[{seq:1,sender:'user',kind:'message',text:'Review these records',created:now},...Array.from({length:12},(_,i)=>({...card(i+2,'completed','piper','routine-'+i),created:now+i*3600})),card(14,'pending'),card(15,'failed'),card(16,'interrupted'),{seq:17,sender:'user',kind:'message',text:'Keep this separate',created:now+12*3600+17},card(18),card(19,'completed','piper','another-run'),card(20,'completed','other','another-run')];
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/api/**',async route=>{
   const request=route.request(),name=new URL(request.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/runs')return send([]);
   if(name==='/attention')return send({bots:{},chats:unread?{'dm-piper':{unread:true,read_cursor:6,cursor:22,first_unread_seq:7}}:{}});
   if(name.startsWith('/chats/dm-piper'))return send({chat,messages,page:{has_before:false,has_after:false}});
   if(name.startsWith('/connector-artifacts/')){writes.push(request.postDataJSON());return send({});}
   return route.continue();
  });
  await page.goto(origin);const stack=page.locator('.connector-stack');await stack.waitFor();assert.equal(await stack.count(),1);
  assert.equal(await stack.getAttribute('open'),null);assert.equal(await stack.locator('.connector-message').count(),11);
  assert.match(await stack.locator(':scope > summary').innerText(),/12 tool calls/);
  assert.equal(await page.locator('[data-connector-artifact="card-2"]').isVisible(),false);
  for(const seq of [14,15])assert(await page.locator('[data-connector-artifact="card-'+seq+'"]').isVisible());for(const seq of [13,16,18,19,20])assert(await page.locator('.connector-message[data-message="'+seq+'"] > .connector-call > summary').isVisible());
  assert.match(await page.locator('.connector-message[data-message="16"] > .connector-call > summary').innerText(),/Interrupted/);assert.equal(await page.locator('[data-connector-artifact="card-16"]').isVisible(),false);
  const interrupted=page.locator('.connector-message[data-message="16"] > .connector-call > summary');await interrupted.click();assert.equal(await page.locator('[data-connector-artifact="card-16"] .connector-outcome-warning').innerText(),'This lookup did not finish.');await interrupted.click();
  assert((await stack.boundingBox()).height<130,'collapsed stack stays compact');
  await stack.locator(':scope > summary').focus();await page.keyboard.press('Enter');await stack.locator('.connector-call > summary').first().click();await page.locator('[data-connector-artifact="card-2"]').waitFor({state:'visible'});
  // A live update must retain nested reading state, focus and scroll position.
  const reading=await stack.evaluate(s=>{const card=s.querySelector('.connector-message'),record=card.querySelector('.connector-record');record.open=false;window.fixtureReceipt=card;const body=s.querySelector('.connector-stack-body');body.scrollTop=120;s.querySelector('summary').focus();return body.scrollTop;});
  const appended=card(22);appended.created=now+13;messages.splice(13,0,appended);await page.waitForFunction(()=>document.querySelector('.connector-stack summary')?.textContent.includes('13 tool calls'));
  assert.notEqual(await stack.getAttribute('open'),null);assert.equal(await stack.locator('.connector-message').count(),12);
  assert(await stack.evaluate(s=>s.querySelector('.connector-message')===window.fixtureReceipt&&!s.querySelector('.connector-record').open&&document.activeElement===s.querySelector('summary')));
  assert.equal(await stack.locator('.connector-stack-body').evaluate(b=>b.scrollTop),reading);
  await stack.locator(':scope > summary').click();
  // Quoting a receipt must reveal the collapsed stack and its exact original card.
  messages.push({seq:21,sender:'user',kind:'message',text:'Explain the earlier record',created:now+21,reply_to:{seq:4,author:'Piper',text:'Review record 4'}});
  const quote=page.getByRole('button',{name:'View message from Piper'});await quote.waitFor();await quote.click();
  assert.notEqual(await stack.getAttribute('open'),null);assert(await page.locator('[data-connector-artifact="card-4"]').isVisible());
  await stack.locator(':scope > summary').click();
  for(const width of [1320,900,390])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(250);await page.mouse.move(1,1);await stack.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow at '+width);
   const metrics=await stack.locator(':scope > summary').evaluate(s=>{const r=s.getBoundingClientRect();return [...s.children].map(c=>{const b=c.getBoundingClientRect();return {visible:b.width>0,left:b.left,right:b.right,top:b.top,bottom:b.bottom,within:b.left>=r.left&&b.right<=r.right};});});
   assert(metrics.every(m=>!m.visible||m.within),'summary items fit at '+width);
   await page.screenshot({path:path.join(folder,`${engine}-${width}-${theme}-collapsed.png`)});
  }
  await stack.locator(':scope > summary').click();await page.locator('[data-connector-artifact="card-2"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(folder,`${engine}-mobile-expanded.png`)});
  // Older attention payloads may still point at receipts; these must not insert
  // a New divider or split the activity into separate groups.
  unread=true;await page.setViewportSize({width:1320,height:900});await page.reload();await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();
  await page.locator('.connector-stack').waitFor();
  assert.equal(await page.locator('.connector-stack').count(),1,'Receipt cursors do not split call groups');
  assert.equal(await page.locator('.unread-divider').count(),0);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,thirteenReceiptsOneStack:true,approvalAndFailureVisibleInterruptionExpandable:true,crossRoutineAndLongGapStacking:true,senderAndMessageBoundaries:true,receiptCursorsStayGrouped:true,keyboardExpansion:true,refreshPreservesNestedReadingState:true,quoteOpensExactReceipt:true,sixLayouts:true,noConnectorWrites:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
