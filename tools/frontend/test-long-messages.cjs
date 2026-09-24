const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const lines=n=>Array.from({length:n},(_,i)=>`Line ${i+1}`).join('\n');
 await p.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:[{seq:1,sender:'user',kind:'message',text:lines(200),created:1},{seq:2,sender:'piper',kind:'assistant',text:lines(40).replaceAll('\n','  \n'),created:2},{seq:3,sender:'user',kind:'message',text:lines(29),created:3}]}}));
 await p.goto(origin);const first=p.locator('[data-message="1"]');await first.getByRole('button',{name:'Show more',exact:true}).waitFor();
 const size=await first.locator('.message-text-viewport').evaluate(e=>({height:e.clientHeight,line:parseFloat(getComputedStyle(e).lineHeight)}));assert.ok(Math.abs(size.height/size.line-15.5)<.1);
 await p.locator('[data-message="2"]').getByRole('button',{name:'Show more',exact:true}).waitFor();assert.equal(await p.locator('[data-message="3"] .message-expand').isVisible(),false);
 await first.getByRole('button',{name:'Show more',exact:true}).click();assert.ok(await first.locator('.message-text-viewport').evaluate(e=>e.clientHeight>4000));
 await p.setViewportSize({width:800,height:800});await first.getByRole('button',{name:'Show less',exact:true}).waitFor();await first.getByRole('button',{name:'Show less',exact:true}).click();assert.ok(await first.locator('.message-text-viewport').evaluate(e=>e.clientHeight<500));assert.deepEqual(errors,[]);console.log('Long user/bot text, threshold, 15.5-line preview, expansion and resize passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
