const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  const text=Array.from({length:30},(_,i)=>`Paragraph ${i}. A synthetic long reply for scrolling.`).join('\n\n')+'\n\n| Item | Description |\n| --- | --- |\n'+Array.from({length:60},(_,i)=>`| Item ${i} | ${'wide_value_'.repeat(35)} |`).join('\n')+'\n\n```text\n'+Array.from({length:80},(_,i)=>`${i} ${'code_value_'.repeat(35)}`).join('\n')+'\n```\n\nEnd of reply.';
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await page.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await page.route(origin+'/api/chats/dm-piper*',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages:[{seq:1,sender:'piper',kind:'message',text,created:Math.floor(Date.now()/1000)}],page:{has_before:false,has_after:false}}}));
  await page.goto(origin);await page.locator('#content .markdown-code').waitFor();await page.locator('#chat-loading').waitFor({state:'detached'});
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const selector of ['.message-bubble','.markdown-table','.markdown-code pre']){
   const target=page.locator('#content '+selector).first();
   const point=await target.evaluate(n=>{const chat=document.querySelector('#content');chat.scrollTop+=n.getBoundingClientRect().top-chat.getBoundingClientRect().top+300;const r=n.getBoundingClientRect(),c=chat.getBoundingClientRect();return{x:r.left+40,y:c.top+Math.min(200,c.height/2)};});
   await page.waitForTimeout(150);await page.mouse.move(point.x,point.y);
   for(const delta of [-180,180]){
    const before=await page.locator('#content').evaluate(n=>n.scrollTop);
    await page.mouse.wheel(0,delta);
    await page.waitForFunction(({before,delta})=>delta<0?document.querySelector('#content').scrollTop<before-30:document.querySelector('#content').scrollTop>before+30,{before,delta},{timeout:3000});
    await page.waitForTimeout(250); // Let the wheel gesture settle before reversing direction.
   }
   if(selector!=='.message-bubble'){
    const dimensions=await target.evaluate(n=>({height:n.clientHeight,scrollHeight:n.scrollHeight,width:n.clientWidth,scrollWidth:n.scrollWidth,top:n.scrollTop}));
    assert(dimensions.scrollHeight<=dimensions.height+1,selector+' must not scroll vertically');assert.equal(dimensions.top,0);assert(dimensions.scrollWidth>dimensions.width,'Fixture must overflow horizontally');
    await page.mouse.wheel(180,0);await page.waitForFunction(selector=>document.querySelector('#content '+selector).scrollLeft>0,selector,{timeout:3000});
   }
  }
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',verticalChatScrolling:true,horizontalContentScrolling:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
