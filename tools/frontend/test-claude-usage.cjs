const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  for(const scenario of ['empty','recorded','quota-error']){
   const context=await browser.newContext({viewport:{width:1320,height:860}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
   await context.route(origin+'/api/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(4);
    if(name==='/providers')return route.fulfill({json:{providers:[{id:'claude-code',name:'Claude Code',kind:'subscription'}]}});
    if(name==='/codex/account')return route.fulfill({json:{account:null}});
    if(name==='/provider-cli/claude-code/account')return route.fulfill({json:{connected:true,installed:true}});
    if(name==='/provider-cli/claude-code/usage')return route.fulfill(scenario==='quota-error'?{status:503,json:{error:'offline'}}:{json:{windows:[],usage_message:'Claude Code does not expose an account-wide quota query here. Check your Claude usage page.',usage_url:'https://claude.ai/settings/usage'}});
    if(name==='/providers/claude-code/usage')return route.fulfill({json:{bots:scenario==='empty'?[]:[{bot_id:'piper',name:'Piper',input_tokens:1000,output_tokens:500,cached_tokens:200,requests:2}],scope:'Recorded Kindred requests only.'}});
    return route.continue();
   });
   await page.goto(origin);await page.locator('#identity-button').click();await page.getByRole('button',{name:'Usage',exact:true}).hover();await page.locator('.provider-usage-list').getByRole('button',{name:'Claude Code',exact:true}).hover();
   const detail=page.locator('.provider-usage-detail:not([hidden])');await detail.locator('.usage-recorded').waitFor();
   const text=await detail.textContent();assert(!text.includes('account-wide quota query'));assert(!text.includes('Recorded Kindred requests.'));
   if(scenario==='empty'){assert(text.includes('No requests recorded yet.'));assert.equal(await detail.locator('.usage-recorded p').count(),1);assert.equal(await detail.locator('button').count(),0);}
   else {await detail.getByText('1,500',{exact:true}).waitFor();assert.equal(await detail.getByRole('button',{name:'View usage details',exact:true}).count(),1);}
   if(scenario!=='quota-error'){const link=detail.getByRole('link',{name:'View Claude usage',exact:true});assert.equal(await link.getAttribute('href'),'https://claude.ai/settings/usage');assert.equal(await link.getAttribute('target'),'_blank');}
   else assert(text.includes('temporarily unavailable'));
   await detail.hover();const box=await detail.boundingBox();assert(box.width<=331&&box.x>=0&&box.y>=0&&box.x+box.width<=1320);
   await page.screenshot({path:path.join(artifacts,engine+'-claude-'+scenario+'.png')});
   if(scenario==='recorded'){await detail.getByRole('button',{name:'View usage details',exact:true}).click();const history=page.locator('#provider-usage-dialog');await history.locator('.usage-history-table').waitFor();assert.equal(await history.getByRole('combobox',{name:'Sort by',exact:true}).inputValue(),'tokens');assert.equal(await history.getByText('Reported cost',{exact:true}).count(),0);assert.equal(await history.locator('option[value="cost"]').count(),0);}
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({passed:true,engine,compactEmptyState:true,providerLink:true,recordedHistory:true,quotaFailureKeepsHistory:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
