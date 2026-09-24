const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],writes=[],reads=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const existing='custom-11111111-2222-4333-8444-555555555555';let count=0,fail=false;
  const model=id=>({model:id,display_name:'Discovered '+id,context_window:32768,input_cost:null,output_cost:null});
  const info=()=>({checked_at:Math.floor(Date.now()/1000),updated_at:Math.floor(Date.now()/1000),error:null});
  const providers=[{id:'codex',name:'Codex',kind:'subscription'},{id:'claude-code',name:'Claude Code',kind:'subscription'},{id:'kimi-code',name:'Kimi Code',kind:'subscription'},{id:'openrouter',name:'OpenRouter',kind:'api',connected:false},{id:existing,name:'Existing custom',kind:'api',connected:true,no_auth:true,base_url:'http://localhost:1234/v1',models:[model('legacy')],revision:'one',catalog:info()}];
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),body=req.method()==='GET'?null:req.postDataJSON(),send=json=>route.fulfill({json});
   if(name==='/providers'){
    if(!body)return send({providers});writes.push(body);assert.equal(body.provider.models,undefined);
    let saved=providers.find(p=>p.id===body.provider.id);
    if(saved)Object.assign(saved,body.provider);
    else{saved={...body.provider,id:'custom-22222222-3333-4444-8555-'+String(++count).padStart(12,'0'),kind:'api',models:[],revision:'new-'+count,catalog:{}};providers.push(saved);}
    saved.connected=saved.no_auth||!!body.key||saved.connected;return send({id:saved.id});
   }
   const match=name.match(/^\/providers\/([^/]+)\/models$/);
   if(match){
    reads.push({id:match[1],method:req.method(),startup:body?.startup===true});const saved=providers.find(p=>p.id===match[1]);
    await new Promise(r=>setTimeout(r,80));
    if(fail){saved.catalog={...saved.catalog,error:'Model catalogue returned HTTP 503. Try again.'};}
    else{saved.models=[model('alpha'),model('beta'),...(body&&!body.startup?[model('gamma')]:[])];saved.catalog=info();}
    return send({models:saved.models,catalog:saved.catalog,revision:saved.revision,data:saved.models.map(m=>({model:m.model,displayName:m.display_name,reasoning:false}))});
   }
   if(name.startsWith('/provider-cli/'))return send({connected:false,installed:true});
   if(name==='/codex/account')return send({account:{type:'chatgpt'}});
   if(name.endsWith('/usage'))return send({bots:[],scope:'Fixture usage only.'});
   if(name==='/composio')return send({configured:false,apps:[]});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
  const cards=p.locator('.ai-account'),card=name=>cards.filter({has:p.locator('.ai-account-summary strong',{hasText:name})});
  await cards.nth(5).waitFor();await card('Existing custom').locator(':scope > summary').click();
  await card('Existing custom').getByText('2 models available',{exact:true}).waitFor();assert.equal(reads.filter(r=>r.id===existing&&r.startup).length,1);
  assert.equal(await p.getByLabel('Model ID',{exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Add model',exact:true}).count(),0);
  await card('Existing custom').getByRole('button',{name:'Refresh models',exact:true}).click();await card('Existing custom').getByText('3 models available',{exact:true}).waitFor();
  fail=true;await card('Existing custom').getByRole('button',{name:'Refresh models',exact:true}).click();await card('Existing custom').getByText(/Using the saved catalogue.*503/).waitFor();assert.match(await card('Existing custom').textContent(),/3 models available/);fail=false;
  const beforeDraft=reads.length;await card('Existing custom').getByLabel('Base URL',{exact:true}).fill('http://localhost:9999/v1');await card('Existing custom').getByRole('button',{name:'Refresh models',exact:true}).click();assert.equal(reads.length,beforeDraft);await card('Existing custom').getByLabel('Base URL',{exact:true}).fill('http://localhost:1234/v1');
  await card('Existing custom').locator(':scope > summary').click();
  for(const [name,url,keyless] of [['Example provider','https://api.example.com/v1',false],['Local inference','http://localhost:1234/v1',true]]){
    const add=card('Add custom provider');await add.locator(':scope > summary').click();await add.getByLabel('Name',{exact:true}).fill(name);await add.getByLabel('Base URL',{exact:true}).fill(url);
    if(keyless)await add.getByLabel('No API key required',{exact:true}).check();else await add.getByLabel('API key',{exact:true}).fill('fixture-provider-key');
    await add.getByRole('button',{name:'Save provider',exact:true}).click();await card(name).waitFor();assert.equal(await card('Add custom provider').count(),1);assert.equal(await card('Add custom provider').getByLabel('Name',{exact:true}).inputValue(),'');
    await card(name).locator(':scope > summary').click();await card(name).getByText('2 models available',{exact:true}).waitFor();await card(name).locator(':scope > summary').click();
  }
  assert.equal(await cards.count(),8);assert.deepEqual(writes.map(w=>w.provider.name),['Example provider','Local inference']);
  await card('Example provider').locator(':scope > summary').click();await card('Example provider').getByLabel('Name',{exact:true}).fill('Example models');await card('Example provider').getByRole('button',{name:'Save provider',exact:true}).click();await card('Example models').waitFor();assert.equal(await cards.count(),8);assert.equal(writes.at(-1).key,undefined);
  assert.deepEqual(await cards.locator(':scope > summary strong').allTextContents(),['Codex','Claude Code','Kimi Code','OpenRouter','Existing custom','Example models','Local inference','Add custom provider']);
  await card('Example models').locator(':scope > summary').click();await card('Example models').getByText('2 models available',{exact:true}).click();
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(220);await p.screenshot({path:path.join(artifacts,engine+'-provider-catalogue-'+theme+'.png')});}
  const initialWarm=reads.filter(r=>r.startup).length;
  await p.locator('#settings-dialog').getByRole('button',{name:'General',exact:true}).click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();await cards.nth(7).waitFor();assert.equal(reads.filter(r=>r.startup).length,initialWarm);
  await p.evaluate(()=>document.querySelector('#settings-dialog').close());await p.locator('#new-bot').click();await p.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();
  await p.locator('#bot-form [name=provider]').selectOption(providers.find(p=>p.name==='Example models').id);await p.locator('#new-model-controls [name=model] option[value=alpha]').waitFor({state:'attached'});assert.equal(await p.locator('#new-model-controls [name=model] option[value=beta]').count(),1);
  const beforeRefresh=reads.length;await p.locator('#new-model-controls').getByRole('button',{name:'Refresh models',exact:true}).click();await p.locator('#new-model-controls [name=model] option[value=gamma]').waitFor({state:'attached'});assert(reads.slice(beforeRefresh).some(r=>r.method==='POST'&&!r.startup));
  await p.evaluate(()=>document.querySelector('#bot-dialog').close());await p.setViewportSize({width:390,height:844});await p.locator('#mobile-menu').click();await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();await card('Local inference').locator(':scope > summary').click();
  const row=await card('Local inference').boundingBox();assert(row.width<=390);assert(await p.locator('#settings-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  const tabs=await p.locator('#settings-nav button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));assert(tabs.length>=5);assert(tabs.every(r=>r.left>=0&&r.right<=390),'Every settings tab fits on mobile');
  await p.locator('#settings-nav').getByRole('button',{name:'Computer',exact:true}).click();await p.locator('#settings-nav').getByRole('button',{name:'Connections',exact:true}).click();await card('Local inference').locator(':scope > summary').click();
  await p.waitForTimeout(200);await p.screenshot({path:path.join(artifacts,engine+'-provider-catalogue-mobile.png')});
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine,automaticDiscovery:true,startupOnce:true,manualRefresh:true,failureRetainsCatalogue:true,multipleNamedCards:true,renameAndOrder:true,botPickerRefresh:true,darkLightMobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
