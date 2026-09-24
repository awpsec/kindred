const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const context=await browser.newContext();await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const p=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;let saved;
 await context.route(origin+'/api/bots/*/text',async r=>{saved=r.request().postDataJSON();const bots=await(await context.request.get(origin+'/api/bots')).json();return r.fulfill({json:{...bots[0],[saved.field]:saved.value}});});
 await p.goto(origin);await p.locator('#bot-details').click();await p.locator('#bot-settings').click();
 await p.locator('#details-content').getByRole('button',{name:'Instructions',exact:true}).click();const editor=p.locator('.bot-text-dialog'),input=editor.locator('textarea');
 await input.fill('é'.repeat(16000));assert(await input.evaluate(n=>n.checkValidity()));assert((await editor.textContent()).includes('32,000 / 32,000 bytes'));
 await input.fill('é'.repeat(16000)+'x');assert(!await input.evaluate(n=>n.checkValidity()));
 await input.fill('x'.repeat(32000));await editor.getByRole('button',{name:'Save',exact:true}).click();await editor.waitFor({state:'detached'});assert.equal(saved.value.length,32000);
 await p.locator('#details-content').getByRole('button',{name:'Memory',exact:true}).click();await input.fill('é'.repeat(32000));assert(await input.evaluate(n=>n.checkValidity()));assert((await editor.textContent()).includes('64,000 / 64,000 bytes'));await input.fill('é'.repeat(32000)+'x');assert(!await input.evaluate(n=>n.checkValidity()));await input.fill('x'.repeat(64000));await editor.getByRole('button',{name:'Save',exact:true}).click();await editor.waitFor({state:'detached'});assert.equal(saved.field,'memory');assert.equal(saved.value.length,64000);
 console.log('PASS: 32,000-byte instruction boundary, UTF-8 accounting, save, and 64,000-byte memory boundary');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
