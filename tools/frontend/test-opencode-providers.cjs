const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;
 await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const accounts=[{id:'codex',name:'Codex',kind:'subscription'},...['opencode-go','opencode'].map(id=>({id,name:id==='opencode-go'?'OpenCode Go':'OpenCode Zen',kind:'api',auth:'opencode-key',connected:false}))],writes=[];
 await context.route(origin+'/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/providers')return route.fulfill({json:{providers:accounts}});
  if(path==='/api/composio')return route.fulfill({json:{configured:false,apps:[]}});
  if(path==='/api/codex/account')return route.fulfill({json:{account:{type:'chatgpt'}}});
  const match=path.match(/^\/api\/opencode\/(opencode(?:-go)?)\/(key|models)$/);
  if(match){if(match[2]==='key'){const body=req.postDataJSON();writes.push({id:match[1],...body});accounts.find(a=>a.id===match[1]).connected=!!body.key;return route.fulfill({json:{saved:true}});}return route.fulfill({json:{data:[{model:'kimi-k2.6',displayName:'Kimi K2.6',reasoning:true}]}});}
  return route.continue();
 });
 await page.goto(origin);await page.locator('#settings-button').click();await page.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
 const card=name=>page.locator('.ai-account').filter({has:page.locator('summary strong',{hasText:name})});
 const row=card('OpenCode');await row.waitFor();assert.equal(await row.count(),1);await row.locator(':scope > summary').click();
 assert.equal(await row.getByRole('link',{name:'Get API key'}).getAttribute('href'),'https://opencode.ai/auth');
 for(const id of ['opencode-go','opencode']){await row.getByLabel('OpenCode plan').selectOption(id);await row.getByLabel('API key',{exact:true}).fill('fixture-opencode-key');await row.getByRole('button',{name:'Save key',exact:true}).click();await row.getByPlaceholder('Saved · paste a replacement key').waitFor();}
 assert.deepEqual(writes.map(w=>w.id),['opencode-go','opencode']);
 await row.getByLabel('OpenCode plan').selectOption('opencode-go');await row.getByRole('button',{name:'Check available models'}).click();await row.getByText(/1 supported models available/).waitFor();await row.getByRole('button',{name:'Disconnect',exact:true}).click();await row.getByPlaceholder('Paste your OpenCode API key').waitFor();assert.equal(writes.at(-1).key,'');assert(accounts.find(a=>a.id==='opencode').connected);
 await row.getByLabel('API key',{exact:true}).fill('unsaved-key');await row.getByLabel('OpenCode plan').selectOption('opencode');assert.equal(await row.getByLabel('API key',{exact:true}).inputValue(),'');await row.getByRole('button',{name:'Disconnect',exact:true}).waitFor();
 await page.evaluate(()=>document.querySelector('#settings-dialog').close());await page.locator('#new-bot').click();await page.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();await page.locator('#bot-form [name=provider]').selectOption('opencode');await page.locator('#new-model-controls option[value="kimi-k2.6"]').waitFor({state:'attached'});
 console.log('PASS: single OpenCode card, independent plan keys, model discovery, selection, and disconnect');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
