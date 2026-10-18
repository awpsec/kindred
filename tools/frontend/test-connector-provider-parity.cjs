const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-connector-parity';fs.mkdirSync(out,{recursive:true});let cases=0;
 try{for(const width of [1100,390])for(const source of ['Kindred','Codex','Claude']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../../ui/app.js'),'utf8')+'\nexport {approvalCard,connectorMessage};'}));
  await page.route(origin+'/api/approvals/*',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}})});
  await page.goto(origin);await page.locator('#prompt').waitFor();
  await page.evaluate(async source=>{
   const {approvalCard,connectorMessage}=await import('/app.js'),run={id:'run-screenshot',bot_id:'piper',chat_id:'dm-piper'};
   const provider=source==='Kindred'?'connector_execute':source==='Codex'?'codex_connector':'claude_connector',tool=source==='Kindred'?'GMAIL_GET_MESSAGE':'gmail__get_message';
   const args={toolkit:'gmail',connection:'Gmail',tool_name:tool,tool_slug:tool,forced:true,[source==='Kindred'?'arguments':'input']:{message_id:'message-42',include_body:true}};
   const cards=['pending','completed','failed'].map(status=>connectorMessage({seq:status,connector_artifact:{id:status,bot_id:'piper',kind:'email',connection:'Gmail',connector:'gmail',source,tool,title:'Read message',status,revision:1,input:args.input||args.arguments,records:[]}},run.chat_id));
   const email=connectorMessage({seq:'email',connector_artifact:{id:'email',bot_id:'piper',kind:'email',email_send:true,connection:'Gmail',connector:'gmail',source,tool:'send_email',title:'Review email',status:'pending',revision:1,forced:true,input:{to:'recipient@example.invalid',body:'Draft for review'},email:{to:{key:'to',text:'recipient@example.invalid'},body:{key:'body',text:'Draft for review'},subject:{key:'subject',text:'Review email'}}}},run.chat_id);
   const legacy=approvalCard({id:'legacy',tool:provider,status:'pending',args},run);
   const config=approvalCard({id:'config',tool:'connector_configure',status:'pending',args:{request:'source_preference',duplicates:[{name:'Gmail',sources:[source.toLowerCase(),'kindred']}]}},run);
   const missing=approvalCard({id:'missing',tool:provider,status:'pending',args:{artifact_id:'unavailable'}},run);
   document.querySelector('#content').replaceChildren(...cards,email,legacy,config,missing);
  },source);
  // An email lookup without draft fields is still an ordinary action request.
  const current=page.locator('[data-connector-artifact="pending"]');assert(await current.evaluate(n=>n.classList.contains('connector-request')));
  for(const selector of ['[data-connector-artifact="pending"]','[data-approval="legacy"]','[data-approval="config"]','[data-approval="missing"]']){
   const card=page.locator(selector);for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const style=await card.evaluate(n=>{const s=getComputedStyle(n);return {fill:s.backgroundColor,radius:s.borderRadius,shadow:s.boxShadow}});assert.deepEqual(style,{fill:'rgba(0, 0, 0, 0)',radius:'0px',shadow:'none'},source+' '+selector);}
  }
  const legacy=page.locator('[data-approval="legacy"]');await legacy.getByText('Action details',{exact:true}).click();assert((await legacy.locator('pre').innerText()).includes('message-42'),source+' must show exact action input');assert.equal(await legacy.getByRole('button',{name:/always allow/i}).count(),0);
  const email=page.locator('[data-connector-artifact="email"]');assert(await email.evaluate(n=>n.classList.contains('email-notice')));await email.getByRole('button',{name:'Review',exact:true}).click();assert(await email.getByRole('button',{name:'Send email',exact:true}).isVisible());assert.equal(writes.length,0);
  for(const status of ['completed','failed']){const call=page.locator('.connector-call').filter({has:page.locator('[data-connector-artifact="'+status+'"]')});await call.locator(':scope>summary').click();const card=call.locator('[data-connector-artifact]');assert.equal(await card.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await card.getByRole('button',{name:'Allow',exact:true}).count(),0);}
  await legacy.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await legacy.screenshot({path:path.join(out,engine+'-'+source+'-'+width+'.png')});
  const response=page.waitForResponse(r=>r.url().endsWith('/api/approvals/legacy'));await legacy.getByRole('button',{name:'Allow',exact:true}).click();await response;assert.deepEqual(writes,[{approved:true,choice:''}]);assert.deepEqual(errors,[]);cases++;await page.close();
 }
 console.log(JSON.stringify({passed:true,engine,cases,providers:['Kindred/Composio','Codex','Claude'],scope:'synthetic UI and approval HTTP; no live connector changes'}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
