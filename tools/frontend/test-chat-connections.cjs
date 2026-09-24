const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage({viewport:{width:1100,height:800}});const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
 let accounts=[{id:'personal',name:'Personal',status:'ACTIVE'},{id:'work',name:'Work inbox',status:'INITIATED'}];
 await p.route(origin+'/api/**',async route=>{const req=route.request(),url=new URL(req.url()),send=json=>route.fulfill({json});
 if(url.pathname==='/api/composio')return send({configured:true,apps:[{id:'gmail',accounts}]});
 if(url.pathname==='/api/marketplace/gmail')return send({id:'gmail',name:'Gmail',description:'Search, read, and manage email.',tools_count:32,managed_auth:['OAUTH2']});
 if(url.pathname==='/api/composio/gmail/authenticate'){writes.push(req.postDataJSON());return send({redirect_url:'https://composio.dev/test-auth',account_id:'work'});}
 if(url.pathname==='/api/composio/gmail/check'){accounts[1].status='ACTIVE';return send({status:'ACTIVE'});}
 if(url.pathname.startsWith('/api/chats/')&&req.method()==='GET'){const response=await route.fetch(),data=await response.json();if(data.messages)data.messages=[{seq:300,sender:'piper',kind:'connection_card',text:'gmail',created:1,run_id:''}];return send(data);}
 return route.continue();});
 await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.open=()=>null;},token);await p.goto(origin);const card=p.locator('.chat-connection-card');await card.getByRole('button',{name:'Reconnect Work inbox',exact:true}).waitFor();
 assert(await card.getByText('Needs sign-in',{exact:true}).isVisible());assert(await card.getByRole('button',{name:'Personal · Connected · Manage account',exact:true}).isVisible());
 await card.getByRole('button',{name:'Add another account',exact:true}).click();await p.getByRole('dialog').getByLabel('Account name',{exact:true}).fill('Household');assert.equal(writes.length,0);await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await card.getByRole('button',{name:'Reconnect Work inbox',exact:true}).click();await card.getByText('Connected',{exact:true}).waitFor();assert.deepEqual(writes,[{account_id:'work'}]);await p.getByRole('button',{name:'Done',exact:true}).click();
 for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);fs.mkdirSync('test-results',{recursive:true});await p.screenshot({path:'test-results/chat-connections-'+(process.env.WEBKIT?'webkit':'chromium')+'-'+theme+'.png'});await card.screenshot({path:'test-results/connection-card-'+(process.env.WEBKIT?'webkit':'chromium')+'-'+theme+'.png'});}
 accounts[1].status='EXPIRED';await p.reload();await card.getByRole('button',{name:'Reconnect Work inbox',exact:true}).click();await p.getByRole('button',{name:'Add replacement account',exact:true}).click();await p.getByRole('dialog').getByLabel('Account name',{exact:true}).waitFor();assert.equal(writes.length,1);await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await p.setViewportSize({width:390,height:844});assert(await card.evaluate(n=>n.getBoundingClientRect().right<=innerWidth));assert.deepEqual(errors,[]);console.log('Chat connection cards: labels, reconnect account binding, live status, add account form, light/dark and mobile passed');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
