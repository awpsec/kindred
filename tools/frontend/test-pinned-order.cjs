const {server,token}=require('./fixtures/desktop.cjs'),{chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:850}}),origin='http://127.0.0.1:'+server.address().port;
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await p.route(origin+'/api/bots',async r=>{const response=await r.fetch(),bots=await response.json();bots[0].profile.pinned=true;await r.fulfill({json:[bots[0],{...bots[0],id:'second',name:'Second'}]});});
 await p.route(origin+'/api/chats',async r=>{const response=await r.fetch(),chats=await response.json();await r.fulfill({json:[...chats,{id:'team',name:'Team',members:['piper','second'],pinned:true}]});});
 await p.goto(origin);await p.locator('#pinned-bots .pinned-entry').nth(2).waitFor();
 const order=()=>p.locator('#pinned-bots .pinned-entry').evaluateAll(ns=>ns.map(n=>n.dataset.pinKey));
 assert.deepEqual(await order(),['bots:piper','bots:second','chats:team']);
 const before=p.url();
 await p.locator('[data-pin-key="chats:team"] > .pinned-bot').dragTo(p.locator('[data-pin-key="bots:piper"]'),{sourcePosition:{x:10,y:10},targetPosition:{x:3,y:20}});
 assert.deepEqual(await order(),['chats:team','bots:piper','bots:second']);assert.equal(p.url(),before);
 assert.equal(await p.locator('.file-drag-over').count(),0);
 await p.reload();await p.locator('#pinned-bots .pinned-entry').nth(2).waitFor();assert.deepEqual(await order(),['chats:team','bots:piper','bots:second']);
 await p.locator('[data-pin-key="chats:team"] > .pinned-bot').dragTo(p.locator('[data-pin-key="bots:second"]'),{sourcePosition:{x:10,y:10},targetPosition:{x:75,y:20}});
 assert.deepEqual(await order(),['bots:piper','bots:second','chats:team']);
 await p.unrouteAll({behavior:'ignoreErrors'});
 console.log('PASS mixed DM/chat drag ordering, before/after placement, reload persistence, no navigation or attachment overlay');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
