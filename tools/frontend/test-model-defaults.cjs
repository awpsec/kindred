const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/model-defaults');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const context=await browser.newContext(),page=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;
 page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let settings={name:'You',identity:'',theme:'dark',default_provider:'codex',model_defaults:{}};
 await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await context.route(origin+'/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/settings'){if(req.method()==='PUT')settings={...settings,...req.postDataJSON()};return route.fulfill({json:settings});}
  if(path==='/api/providers')return route.fulfill({json:{providers:[{id:'codex',name:'Codex',kind:'subscription'},{id:'openrouter',name:'OpenRouter',kind:'api'}]}});
  if(['/api/codex/models','/api/openrouter/models'].includes(path))return route.fulfill({json:{data:[{model:'model-a',displayName:'Model A',isDefault:true,reasoning:true},{model:'model-b',displayName:'Model B',reasoning:true},...(path.includes('openrouter')?[...Array.from({length:2000},(_,i)=>({model:'vendor/model-'+i,displayName:'Other model '+i})),{model:'z-ai/glm-5.3-flash',displayName:'Z.ai: GLM 5.3 Flash',reasoning:true}]:[])]}});
  return route.continue();
 });
 await page.goto(origin);await page.locator('#settings-button').click();
 const provider=page.getByLabel('Default provider'),form=provider.locator('xpath=ancestor::form');await provider.waitFor();
 await form.getByLabel('Model',{exact:true}).selectOption('model-b');await form.getByLabel('Thinking level',{exact:true}).selectOption('high');
 await form.getByRole('button',{name:'Save default',exact:true}).click();await form.getByText(/Default saved/).waitFor();
 assert.equal(settings.model_defaults.codex.model,'model-b');
 await provider.selectOption('openrouter');assert.equal(await form.getByText(/Default saved/).count(),0);
 assert.equal(await form.getByText(/New bots start/).count(),0);
 const pick=form.getByLabel('Model',{exact:true});await pick.locator('option[value="z-ai/glm-5.3-flash"]').waitFor({state:'attached'});
 const beforeSearch=await pick.inputValue();await pick.click();const search=page.getByRole('combobox',{name:'Search models',exact:true});await search.fill('GLM 5.3');
 assert.equal(await page.locator('.themed-select-option:visible').count(),1);assert.equal(await pick.inputValue(),beforeSearch);await page.waitForTimeout(800);assert.equal(await search.inputValue(),'GLM 5.3');await page.locator('.themed-select-menu').screenshot({path:path.join(artifacts,'model-search-picker.png')});
 await search.press('Enter');assert.equal(await pick.inputValue(),'z-ai/glm-5.3-flash');
 await pick.click();await search.fill('does not exist');await page.getByText('No matching models',{exact:true}).waitFor();await search.press('Enter');assert.equal(await pick.inputValue(),'z-ai/glm-5.3-flash');await search.press('Escape');assert.equal(await page.locator('.themed-select-menu').count(),0);
 await pick.click();await search.press('Tab');assert.equal(await page.locator('.themed-select-menu').count(),0);assert(await form.getByLabel('Thinking level',{exact:true}).evaluate(n=>document.activeElement===n));
 for(const width of [1200,390]){await page.setViewportSize({width,height:900});const modelBox=await pick.boundingBox(),saveBox=await form.getByRole('button',{name:'Save default',exact:true}).boundingBox();assert(saveBox.y>modelBox.y+modelBox.height+12);assert(modelBox.x>=0&&modelBox.x+modelBox.width<=width);}
 await page.setViewportSize({width:1200,height:900});await form.locator('xpath=ancestor::section[1]').screenshot({path:path.join(artifacts,'default-model-layout.png')});await form.getByLabel('Model',{exact:true}).selectOption('model-a');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='PUT'),form.getByRole('button',{name:'Save default',exact:true}).click()]);
 assert.equal(settings.default_provider,'openrouter');assert.equal(settings.model_defaults.codex.reasoning_effort,'high');
 await page.reload();await page.locator('#new-bot').click();await page.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();
 assert.equal(await page.locator('#bot-form [name=provider]').inputValue(),'openrouter');
 const model=page.locator('#new-model-controls [name=model]');await model.locator('option',{hasText:'Default · Model A'}).waitFor({state:'attached'});assert.equal(await model.inputValue(),'');
 await model.click();await search.fill('z-ai/glm-5.3');assert.equal(await page.locator('.themed-select-option:visible').count(),1);await search.press('ArrowDown');await search.press('Enter');assert.equal(await model.inputValue(),'z-ai/glm-5.3-flash');
 await page.locator('#bot-form [name=provider]').selectOption('codex');await model.locator('option',{hasText:'Default · Model B'}).waitFor({state:'attached'});
 assert.deepEqual(errors,[]);console.log('PASS: model defaults, 2003-option search in settings and bots, keyboard selection, no matches, Escape and responsive spacing');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
