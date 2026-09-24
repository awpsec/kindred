const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
 const context=await browser.newContext();await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const p=await context.newPage(),origin='http://127.0.0.1:'+server.address().port;let removed=false;
 await context.route(origin+'/api/providers',r=>r.fulfill({json:{providers:[{id:'codex',name:'Codex',kind:'subscription'},...removed?[]:[{id:'custom-test',name:'Local model',kind:'api',connected:true,no_auth:true,base_url:'http://localhost:8000/v1',models:[],catalog:{checked_at:1}}]]}}));
 await context.route(origin+'/api/providers/custom-test',r=>{assert.equal(r.request().method(),'DELETE');removed=true;return r.fulfill({json:{removed:'custom-test'}});});
 await context.route(origin+'/api/composio',r=>r.fulfill({json:{configured:false,apps:[]}}));
 await context.route(origin+'/api/codex/account',r=>r.fulfill({json:{account:{type:'chatgpt'}}}));
 await context.route(origin+'/api/providers/*/usage',r=>r.fulfill({json:{bots:[]}}));
 await p.goto(origin);await p.locator('#new-bot').click();await p.locator('#new-menu').getByRole('button',{name:'New bot',exact:true}).click();
 await p.evaluate(()=>window.avatarBefore=document.querySelector('#new-avatar-button .character'));
 await p.locator('#bot-form [name=name]').pressSequentially('My teammate',{delay:35});
 assert(await p.evaluate(()=>window.avatarBefore===document.querySelector('#new-avatar-button .character')),'Typing must preserve the avatar instance');
 await p.evaluate(()=>document.querySelector('#bot-dialog').close());
 await p.locator('#settings-button').click();await p.locator('#settings-dialog').getByRole('button',{name:'Connections',exact:true}).click();
 const card=p.locator('.ai-account').filter({has:p.locator('summary strong',{hasText:'Local model'})});await card.locator(':scope > summary').click();
 p.once('dialog',d=>d.dismiss());await card.getByRole('button',{name:'Remove provider',exact:true}).click();assert(!removed);
 p.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Remove provider',exact:true}).click();await card.waitFor({state:'detached'});assert(removed);
 console.log('PASS: typing preserves avatar; keyless provider removal supports cancel and confirm');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
