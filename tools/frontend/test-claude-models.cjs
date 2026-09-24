const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  let failed=false,reads=0;
  const levels=['low','medium','high','xhigh','max'].map(reasoningEffort=>({reasoningEffort}));
  const models=[{model:'default',displayName:'Account default · Sonnet 5',isDefault:true,supportedReasoningEfforts:levels},{model:'sonnet',displayName:'Sonnet 5 · current',description:'Follows current Sonnet. Model ID: claude-sonnet-5.',supportedReasoningEfforts:levels},{model:'claude-sonnet-5',displayName:'Sonnet 5 · pinned',description:'Model ID: claude-sonnet-5.',supportedReasoningEfforts:levels},{model:'claude-fable-5-1[1m]',displayName:'Fable 5.1 · 1M context · pinned',description:'Requires usage credits',supportedReasoningEfforts:levels},{model:'haiku',displayName:'Haiku 4.5 · current',supportedReasoningEfforts:[]}];
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/provider-cli/claude-code/models'){reads++;return failed?route.fulfill({status:503,json:{error:'Claude catalogue unavailable'}}):send({connected:true,data:models});}
   if(name==='/bots'&&req.method()==='POST'){writes.push(req.postDataJSON());return send({id:'new-claude'});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#new-bot').click();await p.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();
  const form=p.locator('#bot-form'),controls=p.locator('#new-model-controls'),model=controls.getByRole('combobox',{name:'Model',exact:true}),effort=controls.getByRole('combobox',{name:'Thinking level',exact:true});
  await form.locator('[name=provider]').selectOption('claude-code');await model.locator('option[value="claude-sonnet-5"]').waitFor({state:'attached'});
  await model.selectOption('claude-sonnet-5');assert.deepEqual(await effort.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),['','low','medium','high','xhigh','max']);await effort.selectOption('max');
  await form.locator('[name=provider]').selectOption('codex');await form.locator('[name=provider]').selectOption('claude-code');await p.waitForFunction(()=>document.querySelector('#new-model-controls [name=model]').value==='claude-sonnet-5');assert.equal(await effort.inputValue(),'max');
  failed=true;await controls.getByRole('button',{name:'Refresh models',exact:true}).click();await controls.getByText(/Claude catalogue unavailable/).waitFor();assert.equal(await model.inputValue(),'claude-sonnet-5');assert.equal(await effort.inputValue(),'max');failed=false;
  await controls.getByRole('button',{name:'Refresh models',exact:true}).click();await model.locator('option[value=haiku]').waitFor({state:'attached'});
  await model.selectOption('haiku');assert.deepEqual(await effort.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),['']);await controls.getByText(/does not expose an adjustable thinking/).waitFor();
  await model.selectOption('claude-fable-5-1[1m]');await controls.getByText('Requires usage credits',{exact:true}).waitFor();
  await model.selectOption('claude-sonnet-5');await effort.selectOption('max');
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.screenshot({path:path.join(artifacts,engine+'-claude-models-'+theme+'.png')});}
  await form.locator('[name=name]').fill('Claude fixture');await form.getByRole('button',{name:'Create bot',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#bot-dialog').open);assert.equal(writes.length,1);assert.equal(writes[0].model,'claude-sonnet-5');assert.equal(writes[0].reasoning_effort,'max');assert(reads>=3);assert.deepEqual(errors,[]);
  await context.close();console.log(JSON.stringify({passed:true,engine,pinnedVersion:true,effortSaved:true,unsupportedCleared:true,refreshFailurePreservesDraft:true,creditNotice:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
