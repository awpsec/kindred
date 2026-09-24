const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');
fs.mkdirSync(artifacts,{recursive:true});

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],calls=new Map();
  p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));
  const custom='custom-11111111-2222-4333-8444-555555555555',empty='custom-22222222-3333-4444-8555-666666666666';
  const providers=[
   {id:'codex',name:'Codex',kind:'subscription'},
   {id:'claude-code',name:'Claude Code',kind:'subscription'},
   {id:'kimi-code',name:'Kimi Code',kind:'subscription'},
   {id:'openrouter',name:'OpenRouter',kind:'api',connected:true,has_usage:true},
   {id:custom,name:'Retired custom',kind:'api',connected:false,has_usage:true},
   {id:empty,name:'New custom',kind:'api',connected:true,has_usage:false},
  ];
  // Costs, token categories, request counts and dates intentionally rank differently.
  // Historical identities are absent from the live /bots fixture.
  const names=['Astra','Birch','Cobalt','Delta','Ember','Finch','Grove','Hazel','Indigo'];
  const shapes=['round','pebble','square','capsule','triangle','hexagon','cloud','drop','round'];
  const colors=['#21b3ff','#2475ff','#7960ff','#b24cf2','#f24d93','#ff6952','#ff9638','#ffbe16','#14bfc7'];
  const statuses=['active','archived','deleted','active','archived','active','deleted','archived','active'];
  const input=[800,1400,300,1700,500,1100,1900,200,0],output=[190,90,610,310,1110,410,710,1510,0];
  const cached=[500,90,130,800,210,400,900,150,0],requests=[8,3,12,5,7,11,4,10,6],recency=[4,7,1,8,3,2,5,6,9];
  const bots=names.map((name,i)=>({
   bot_id:'history-'+i,name,status:statuses[i],profile:{shape:shapes[i],color:colors[i],eyes:['curious','happy','sleepy','wide'][i%4],animated:false},
   input_tokens:input[i],output_tokens:output[i],cached_tokens:cached[i],requests:requests[i],
   reported_requests:i===8||i===1?0:i===0?6:requests[i],reported_cost:i===8||i===1?0:i===0?6:9-i,
   estimated_requests:i===0?1:i===1?3:0,estimated_cost:i===0?3:i===1?8:0,
   unpriced_requests:i===8?6:i===0?1:0,unreported_tokens:i===8?6:i===0?1:0,
   since:1700000000+i*100,first_used_at:1700000000+i*100,last_used_at:1700100000+recency[i]*100,
  }));
  const retired={...bots[2],bot_id:'retired-only',name:'Retired helper',status:'deleted'};
  const scope='Recorded Kindred requests only. Provider totals may include activity outside Kindred.';
  let releaseInitialAccount,delayNextCatalog=false,releaseCatalog,claudeConnected=true,delayNextClaude=false,releaseClaude;
  const initialAccountWait=new Promise(resolve=>{releaseInitialAccount=resolve;});
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   calls.set(name,(calls.get(name)||0)+1);
   if(name==='/providers'){
    const snapshot=structuredClone(providers);
    if(delayNextCatalog){delayNextCatalog=false;await new Promise(resolve=>{releaseCatalog=resolve;});}
    return send({providers:snapshot});
   }
   if(name==='/connections/openrouter'){
    assert.equal(req.postDataJSON().key,'');providers.find(provider=>provider.id==='openrouter').connected=false;
    return send({configured:false});
   }
   if(name==='/composio')return send({configured:false,apps:[]});
   if(name==='/codex/account'){
    if(calls.get(name)===1)await initialAccountWait;
    return send({account:{type:'chatgpt',email:'fixture@example.test'}});
   }
   if(name==='/codex/usage')return send({account:{type:'chatgpt',planType:'plus'},limits:{rateLimits:{primary:{usedPercent:23,windowDurationMins:300},secondary:{usedPercent:41,windowDurationMins:10080}}}});
   if(name.startsWith('/provider-cli/')){
    const connected=name.includes('claude-code')&&claudeConnected;
    if(name==='/provider-cli/claude-code/account'&&delayNextClaude){delayNextClaude=false;await new Promise(resolve=>{releaseClaude=resolve;});}
    return send({connected,installed:true,message:'Fixture account',usage_message:'Quota is not exposed; use provider usage.',windows:[]});
   }
   if(name==='/providers/openrouter/usage')return send({bots:calls.get(name)>1?bots.map(b=>b.name==='Birch'?{...b,requests:b.requests+1,estimated_requests:b.estimated_requests+1}:b):bots,scope});
   if(name==='/providers/'+custom+'/usage')return send({bots:[retired],scope});
   if(name==='/providers/'+empty+'/usage')return send({bots:[],scope});
   if(name.endsWith('/usage'))return send({bots:[],scope});
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#identity-button').waitFor();
  const statusPaths=['/providers','/codex/account','/provider-cli/claude-code/account','/provider-cli/kimi-code/account'];
  const deadline=Date.now()+12000;
  while(!statusPaths.every(key=>calls.get(key))&&Date.now()<deadline)await p.waitForTimeout(30);
  assert(statusPaths.every(key=>calls.get(key)),'Provider status must be prefetched before opening Usage.');
  // Reload the catalog while one prefetched account is still pending. A cache
  // entry with pending data must remain safe for Settings and the Usage catalog.
  await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
  await p.locator('.ai-account').nth(6).waitFor();assert((calls.get('/providers')||0)>=2);
  assert.equal(calls.get('/codex/account'),1,'Settings reuses an account check already in flight.');
  releaseInitialAccount();
  await p.waitForFunction(()=>[...document.querySelectorAll('.ai-account')].find(n=>n.querySelector('summary strong')?.textContent==='Codex')?.querySelector('.account-check')?.textContent==='✓');
  await p.evaluate(()=>document.querySelector('#settings-dialog').close());
  await p.waitForTimeout(150);
  const statusCounts=()=>Object.fromEntries(statusPaths.map(key=>[key,calls.get(key)||0]));
  const openUsage=async()=>{
   if(await p.locator('#identity-menu').count()===0)await p.locator('#identity-button').click();
   await p.locator('#identity-menu').getByRole('button',{name:'Usage',exact:true}).hover();
   await p.locator('.provider-usage-list').getByRole('button',{name:'OpenRouter',exact:true}).waitFor();
  };
  const knownCost=b=>b.reported_cost+b.estimated_cost;
  const sorted=(key,direction='desc')=>[...bots].sort((a,b)=>{
   if(key==='cost'){
    const aKnown=a.reported_requests+a.estimated_requests>0,bKnown=b.reported_requests+b.estimated_requests>0;
    if(aKnown!==bKnown)return aKnown?-1:1;
   }
   const value=b=>({cost:knownCost(b),tokens:b.input_tokens+b.output_tokens,input:b.input_tokens,output:b.output_tokens,cached:b.cached_tokens,requests:b.requests,recent:b.last_used_at,name:b.name})[key];
   const av=value(a),bv=value(b),result=typeof av==='string'?av.localeCompare(bv):av-bv;
   return (direction==='asc'?1:-1)*result;
  }).map(b=>b.name);
  const rowNames=async rows=>(await rows.allTextContents()).map(text=>names.find(name=>text.includes(name))||text.trim());
  const assertAvatars=async(rows,records)=>{
   for(const bot of records){
    const row=rows.filter({hasText:bot.name}),avatar=row.locator('.usage-bot-identity .character');
    assert.equal(await avatar.locator('svg').count(),1,bot.name+' has its own avatar');
    assert.equal(await avatar.getAttribute('data-shape'),bot.profile.shape,bot.name+' shape');
    assert.equal((await avatar.evaluate(n=>n.style.getPropertyValue('--bot-fill'))).toLowerCase(),bot.profile.color,bot.name+' color');
   }
  };
  const assertBounds=async(locator,width,height)=>{
   const rect=await locator.boundingBox();assert(rect&&rect.width>0&&rect.height>0);
   assert(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1,JSON.stringify(rect));
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The popup must not create page overflow.');
  };

  // Opening the already-warmed submenu has no account side effects or loading flash.
  await p.evaluate(()=>{
   window.__usageCheckingFlash=false;
   new MutationObserver(()=>{if(document.querySelector('#identity-menu')?.textContent.includes('Checking providers'))window.__usageCheckingFlash=true;}).observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  const beforeMenu=statusCounts();
  for(let i=0;i<3;i++){
   await openUsage();
   assert.equal(await p.locator('.provider-usage-list').getByRole('button',{name:'Kimi Code',exact:true}).count(),0);
   assert.equal(await p.locator('.provider-usage-list').getByRole('button',{name:'Retired custom',exact:true}).count(),1);
   await p.locator('#identity-button').click();
  }
  assert.deepEqual(statusCounts(),beforeMenu,'Opening Usage must reuse prefetched account status.');
  assert.equal(await p.evaluate(()=>window.__usageCheckingFlash),false);

  await openUsage();
  const apiButton=p.locator('.provider-usage-list').getByRole('button',{name:'OpenRouter',exact:true});
  await apiButton.hover();
  const preview=p.locator('.provider-usage-detail:not([hidden])'),previewRows=preview.locator('.bot-usage-table tbody tr');
  await previewRows.nth(4).waitFor();assert.equal(await previewRows.count(),5);
  assert.deepEqual(await rowNames(previewRows),sorted('cost').slice(0,5));
  await assertAvatars(previewRows,bots.slice(0,5));
  assert.match(await preview.textContent(),/reported/);assert.match(await preview.textContent(),/est\./);assert.match(await preview.textContent(),/unpriced/);assert.match(await preview.textContent(),/unknown/);
  await preview.hover();await assertBounds(preview,1320,900);
  await p.screenshot({path:path.join(artifacts,engine+'-usage-preview.png')});
  await preview.getByRole('button',{name:'View all 9 bots',exact:true}).click();
  const dialog=p.getByRole('dialog',{name:'OpenRouter usage',exact:true}),rows=dialog.locator('.usage-history-table tbody tr');
  await dialog.waitFor();assert.equal(await dialog.getAttribute('id'),'provider-usage-dialog');
  await rows.nth(8).waitFor();assert.equal(await rows.count(),bots.length);
  assert.deepEqual(await rowNames(rows),sorted('cost'));
  await assertAvatars(rows,bots);
  for(const bot of bots){
   const row=rows.filter({hasText:bot.name});assert.equal(await row.getAttribute('data-status'),bot.status);
   if(bot.status!=='active')assert.match(await row.textContent(),new RegExp(bot.status,'i'));
  }
  assert.match(await rows.filter({hasText:'Astra'}).textContent(),/reported/);
  assert.match(await rows.filter({hasText:'Astra'}).textContent(),/est\./);
  const unknownText=await rows.filter({hasText:'Indigo'}).textContent();assert.match(unknownText,/unpriced/);assert.match(unknownText,/unknown/);assert.doesNotMatch(unknownText,/\$0(?:\.00)?(?:\s|$)/);
  const summary=await dialog.locator('.usage-history-summary').textContent();assert.match(summary,/reported/i);assert.match(summary,/estimated/i);assert.match(summary,/unpriced/);assert.match(summary,/unknown/);
  assert.match(await dialog.locator('.usage-history-count').textContent(),/9/);
  assert((await dialog.textContent()).includes(scope));

  const sort=dialog.getByRole('combobox',{name:'Sort by',exact:true}),status=dialog.getByRole('combobox',{name:'Bot status',exact:true}),search=dialog.getByRole('searchbox',{name:'Search bots',exact:true});
  const setDirection=async direction=>{
   const action=dialog.getByRole('button',{name:direction==='asc'?'Sort ascending':'Sort descending',exact:true});
   if(await action.count())await action.click();
  };
  for(const key of ['cost','tokens','input','output','cached','requests','recent','name']){
   await sort.selectOption(key);await setDirection('desc');
   assert.deepEqual(await rowNames(rows),sorted(key),'Descending '+key);
   await setDirection('asc');assert.deepEqual(await rowNames(rows),sorted(key,'asc'),'Ascending '+key);
  }
  await sort.selectOption('cost');await setDirection('desc');
  for(const value of ['active','archived','deleted']){
   await status.selectOption(value);
   assert.deepEqual(await rowNames(rows),sorted('cost').filter(name=>bots.find(b=>b.name===name).status===value),value+' retains historical rows');
  }
  await status.selectOption('all');await search.fill('  hAzEl  ');
  assert.deepEqual(await rowNames(rows),['Hazel']);assert.match(await dialog.locator('.usage-history-count').textContent(),/1/);
  await search.fill('No matching bot');assert.equal(await rows.count(),0);assert.match(await dialog.textContent(),/no .*match/i);
  await search.fill('');assert.equal(await rows.count(),9);
  await status.selectOption('archived');await search.fill('Birch');
  const usageBeforeRefresh=calls.get('/providers/openrouter/usage')||0;
  const statusBeforeRefresh=statusCounts();
  assert.match(await rows.textContent(),/3 requests/);
  await dialog.getByRole('button',{name:'Refresh usage',exact:true}).click();
  const refreshDeadline=Date.now()+12000;
  while((calls.get('/providers/openrouter/usage')||0)===usageBeforeRefresh&&Date.now()<refreshDeadline)await p.waitForTimeout(30);
  assert.equal(calls.get('/providers/openrouter/usage'),usageBeforeRefresh+1);
  await rows.getByText('4 requests',{exact:true}).waitFor();
  assert.deepEqual(statusCounts(),statusBeforeRefresh,'Refresh usage only refreshes this provider usage.');
  assert.equal(await status.inputValue(),'archived');assert.equal(await search.inputValue(),'Birch');assert.deepEqual(await rowNames(rows),['Birch']);
  await status.selectOption('all');await search.fill('');

  for(const theme of ['dark','light']){
   await p.evaluate(value=>document.documentElement.dataset.theme=value,theme);await p.waitForTimeout(120);
   await assertBounds(dialog,1320,900);
   await p.screenshot({path:path.join(artifacts,engine+'-usage-history-'+theme+'.png')});
  }
  await search.focus();await p.keyboard.press('Shift+Tab');assert(await dialog.evaluate(n=>n.contains(document.activeElement)));
  const focusable=dialog.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]');
  await focusable.last().focus();await p.keyboard.press('Tab');assert(await dialog.evaluate(n=>n.contains(document.activeElement)),'Tab stays within the dialog.');
  await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert(await p.evaluate(()=>{const n=document.activeElement;return n?.isConnected&&n.getBoundingClientRect().width>0&&(n.id==='identity-button'||!!n.closest('#identity-menu'));}),'Escape returns focus to a visible Usage trigger.');

  // Clicking the API provider itself opens the full history, including disconnected custom history.
  await openUsage();await p.locator('.provider-usage-list').getByRole('button',{name:'Retired custom',exact:true}).click();
  const retiredDialog=p.getByRole('dialog',{name:'Retired custom usage',exact:true});await retiredDialog.waitFor();
  const retiredRows=retiredDialog.locator('.usage-history-table tbody tr');assert.equal(await retiredRows.count(),1);assert.match(await retiredRows.textContent(),/Retired helper/);assert.match(await retiredRows.textContent(),/deleted/i);await assertAvatars(retiredRows,[retired]);
  await p.keyboard.press('Escape');await retiredDialog.waitFor({state:'hidden'});
  await openUsage();await p.locator('.provider-usage-list').getByRole('button',{name:'New custom',exact:true}).click();
  const emptyDialog=p.getByRole('dialog',{name:'New custom usage',exact:true});await emptyDialog.waitFor();assert.equal(await emptyDialog.locator('.usage-history-table tbody tr').count(),0);assert.match(await emptyDialog.textContent(),/no recorded Kindred usage/i);
  await p.keyboard.press('Escape');await emptyDialog.waitFor({state:'hidden'});

  await p.setViewportSize({width:390,height:844});
  if(!await p.locator('#identity-button').isVisible())await p.locator('#mobile-menu').click();
  await p.locator('#identity-button').click();await p.locator('#identity-menu').getByRole('button',{name:'Usage',exact:true}).click();
  await p.locator('.provider-usage-list').getByRole('button',{name:'OpenRouter',exact:true}).click();await dialog.waitFor();await rows.nth(8).waitFor();
  for(const theme of ['dark','light']){
   await p.evaluate(value=>document.documentElement.dataset.theme=value,theme);await p.waitForTimeout(120);await assertBounds(dialog,390,844);
   await p.screenshot({path:path.join(artifacts,engine+'-usage-history-mobile-'+theme+'.png')});
  }
  await search.fill('Indigo');assert.deepEqual(await rowNames(rows),['Indigo']);
  await search.fill('');
  for(const viewport of [{width:844,height:390},{width:390,height:500}]){
   await p.setViewportSize(viewport);await assertBounds(dialog,viewport.width,viewport.height);
   const geometry=await dialog.evaluate(n=>({height:n.clientHeight,scrollHeight:n.scrollHeight,overflowY:getComputedStyle(n).overflowY}));
   assert(geometry.scrollHeight<=geometry.height+1||['auto','scroll'].includes(geometry.overflowY),'Short dialogs must scroll instead of clipping controls: '+JSON.stringify(geometry));
   const refresh=dialog.getByRole('button',{name:'Refresh usage',exact:true});await refresh.scrollIntoViewIfNeeded();
   const control=await refresh.boundingBox(),popup=await dialog.boundingBox();
   assert(control.y>=popup.y-1&&control.y+control.height<=popup.y+popup.height+1,'Refresh usage remains reachable at '+viewport.width+'x'+viewport.height);
   await p.screenshot({path:path.join(artifacts,engine+'-usage-history-'+viewport.width+'x'+viewport.height+'.png')});
  }
  // Chromium uses Escape in a search input to clear its value before dismissing
  // a native dialog. Move to a button to exercise the dialog's keyboard dismissal.
  await dialog.getByRole('button',{name:'Close usage',exact:true}).focus();
  await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  // A visibility refresh after the cache age expires prefetches status again.
  // Advance only the synthetic browser clock so this does not need a minute wait.
  const beforeBackground=statusCounts();
  await p.evaluate(()=>{const realNow=Date.now;Date.now=()=>realNow()+61000;document.dispatchEvent(new Event('visibilitychange'));});
  const backgroundDeadline=Date.now()+12000;
  while(!statusPaths.every(key=>(calls.get(key)||0)>beforeBackground[key])&&Date.now()<backgroundDeadline)await p.waitForTimeout(30);
  for(const key of statusPaths)assert.equal(calls.get(key),beforeBackground[key]+1,'Background prefetch '+key);
  await p.waitForTimeout(100);await p.setViewportSize({width:1320,height:900});
  const afterBackground=statusCounts();await openUsage();await p.locator('#identity-button').click();
  assert.deepEqual(statusCounts(),afterBackground,'Usage reuses the refreshed background snapshot.');

  // A connection change must outrun an older catalog snapshot already in flight.
  await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
  const openrouterCard=p.locator('.ai-account').filter({has:p.locator('summary strong',{hasText:'OpenRouter'})});
  await openrouterCard.waitFor();assert.equal(await openrouterCard.locator('.account-check').textContent(),'✓');
  const catalogBeforeDisconnect=calls.get('/providers')||0;
  delayNextCatalog=true;
  await p.evaluate(()=>{const realNow=Date.now;Date.now=()=>realNow()+61000;document.dispatchEvent(new Event('visibilitychange'));});
  const catalogDeadline=Date.now()+12000;
  while(!releaseCatalog&&Date.now()<catalogDeadline)await p.waitForTimeout(30);
  assert(releaseCatalog,'A delayed background catalog request started.');
  await openrouterCard.locator('summary').click();p.once('dialog',event=>event.accept());
  await openrouterCard.getByRole('button',{name:'Disconnect',exact:true}).click();
  const disconnectDeadline=Date.now()+12000;
  while(!calls.get('/connections/openrouter')&&Date.now()<disconnectDeadline)await p.waitForTimeout(30);
  assert.equal(calls.get('/connections/openrouter'),1);releaseCatalog();
  await p.waitForFunction(()=>[...document.querySelectorAll('.ai-account')].find(n=>n.querySelector('summary strong')?.textContent==='OpenRouter')?.classList.contains('disconnected'));
  assert.equal(await openrouterCard.locator('.account-state').textContent(),'Not connected');
  assert((calls.get('/providers')||0)>=catalogBeforeDisconnect+2,'Connection change requests a fresh catalog after the old response.');
  await p.evaluate(()=>document.querySelector('#settings-dialog').close());await openUsage();
  assert.equal(await p.locator('.provider-usage-list').getByRole('button',{name:'OpenRouter',exact:true}).count(),1,'Disconnected API history stays available.');
  await p.locator('#identity-button').click();

  // Updating a subscription while an API item has keyboard focus must preserve
  // that item and its expanded preview until the user leaves the submenu.
  await p.waitForTimeout(100);await openUsage();
  const focusedApi=p.locator('.provider-usage-list').getByRole('button',{name:'OpenRouter',exact:true});
  await focusedApi.focus();await p.locator('.provider-usage-detail:not([hidden]) .bot-usage-table').waitFor();
  await p.evaluate(()=>{window.__focusedApiButton=document.activeElement;});
  claudeConnected=false;delayNextClaude=true;
  await p.evaluate(()=>{const realNow=Date.now;Date.now=()=>realNow()+61000;document.dispatchEvent(new Event('visibilitychange'));});
  const claudeDeadline=Date.now()+12000;
  while(!releaseClaude&&Date.now()<claudeDeadline)await p.waitForTimeout(30);
  assert(releaseClaude,'A delayed subscription status request started.');
  const completedClaude=p.waitForResponse(response=>new URL(response.url()).pathname==='/api/provider-cli/claude-code/account');
  releaseClaude();await completedClaude;await p.waitForTimeout(100);
  assert(await p.evaluate(()=>window.__focusedApiButton?.isConnected&&document.activeElement===window.__focusedApiButton),'Subscription refresh preserves the focused API element.');
  assert.equal(await focusedApi.getAttribute('aria-expanded'),'true');
  assert(await p.locator('.provider-usage-detail:not([hidden]) .bot-usage-table').isVisible());
  await p.locator('#identity-button').click();await openUsage();
  assert.equal(await p.locator('.provider-usage-list').getByRole('button',{name:'Claude Code',exact:true}).count(),0,'Reopening shows the updated subscription status.');
  await p.locator('#identity-button').click();
  assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>window.__usageCheckingFlash),false);
  await context.close();
  console.log(JSON.stringify({passed:true,engine,cachedProviderStatus:true,backgroundStatusRefresh:true,connectionChangeRace:true,statusRefreshFocus:true,previewTopFive:true,allHistoricalStatuses:true,identityAvatars:true,allSorts:true,filtersAndSearch:true,uncertainty:true,manualRefresh:true,disconnectedCustom:true,emptyState:true,keyboard:true,darkLightMobile:true,shortViewport:true,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
