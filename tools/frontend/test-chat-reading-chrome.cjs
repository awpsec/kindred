// Exercise real history/rendering: fresh replies vs page replay, reading anchors,
// compact navigation and shallow progressive frost without changing chat layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
const origin='http://127.0.0.1:'+server.address().port;
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const chat={id:'dm-piper',name:'Piper',members:['piper']};let hasAfter=false;
 let messages=Array.from({length:45},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Review question '+(i+1)+'. Please keep the supporting notes with the draft.\n\nCheck the dates and the reviewer before sending.',created:1790000000+i}));
 await page.addInitScript(({token,mobile})=>{sessionStorage.setItem('kindred-token',token);if(mobile)window.__KINDRED_MOBILE=true;},{token,mobile});
 await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {renderSharedChat,chatScroll,chatHistory,acceptHistoryPage,updateJumpLatest};'}));
 await page.route('**/api/chats/dm-piper?*',r=>r.fulfill({json:{chat,messages,page:{has_before:false,has_after:hasAfter}}}));
 await page.goto(origin);await page.locator('#content [data-message="45"]').waitFor();await page.evaluate(async()=>window.app=await import('/app.js'));await page.waitForTimeout(400);
 const jump=page.locator('.jump-latest'),content=page.locator('#content');
 assert.equal(await jump.locator('path').first().getAttribute('d'),'M12 5v14m-7-7 7 7 7-7','latest has the down arrow, not the unknown-icon fallback');
 assert(await jump.isHidden(),'hidden at latest');
 await page.locator('#prompt').fill('Retain my draft.');
 await content.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-400}));n.scrollTop-=400;});await page.waitForTimeout(200);await jump.waitFor({state:'visible'});
 const top=await content.evaluate(n=>n.scrollTop),draft=await page.locator('#prompt').innerText();
 const refresh=()=>page.evaluate(chat=>app.renderSharedChat(chat,true),chat);
 const add=(kind,sender='piper',extra={})=>messages.push({seq:messages.at(-1).seq+1,sender,kind,text:'A fresh '+kind+' reply.',created:1790000000+messages.length,...extra});
 add('message');add('result');add('message','user');add('message','system');add('message','piper',{mine:true});
 await refresh();await page.waitForTimeout(250);
 assert.equal(await jump.locator('.jump-latest-count').innerText(),'2');assert(Math.abs(await content.evaluate(n=>n.scrollTop)-top)<2,'arrival must preserve the reader');
 await refresh();assert.equal(await jump.locator('.jump-latest-count').innerText(),'2','refresh does not double count');
 // Connector and progress records can update repeatedly without becoming messages.
 await page.evaluate(()=>{const entry=app.chatHistory.get('dm-piper');app.acceptHistoryPage(entry,{messages:[...entry.messages,{seq:51,sender:'piper',kind:'connector_artifact'},{seq:52,sender:'piper',kind:'task_progress'}],page:{}});app.updateJumpLatest();});
 assert.equal(await jump.locator('.jump-latest-count').innerText(),'2');
 const geometry=await jump.evaluate(n=>{const b=n.getBoundingClientRect(),c=n.parentElement.getBoundingClientRect();return {w:b.width,h:b.height,center:b.x+b.width/2,parent:c.x+c.width/2};});
 assert.equal(geometry.w,geometry.h);assert(geometry.w<=44);assert(Math.abs(geometry.center-geometry.parent)<1);
 const frost=await page.locator('.chat-top-frost').evaluate(n=>({h:n.offsetHeight,pointer:getComputedStyle(n).pointerEvents,filters:[...n.children].map(c=>getComputedStyle(c).backdropFilter||getComputedStyle(c).webkitBackdropFilter),masks:[...n.children].map(c=>getComputedStyle(c).maskImage||getComputedStyle(c).webkitMaskImage)}));
 assert.equal(frost.h,mobile?44:56);assert.equal(frost.pointer,'none');assert.equal(new Set(frost.filters).size,4);assert(frost.masks.every(m=>m.includes('gradient')));
 if(process.env.KINDRED_TEST_OUTPUT){fs.mkdirSync(process.env.KINDRED_TEST_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.KINDRED_TEST_OUTPUT,(process.env.WEBKIT?'webkit':'chromium')+(mobile?'-mobile':'-desktop')+'.png')});}
 await jump.click();await page.waitForTimeout(500);assert(await jump.isHidden(),JSON.stringify(await page.evaluate(()=>({gap:document.querySelector("#content").scrollHeight-document.querySelector("#content").clientHeight-document.querySelector("#content").scrollTop,follow:app.chatScroll.follow,unread:[...app.chatHistory.get('dm-piper').latestUnread||[]],notice:document.querySelector('#notice').textContent,view:app.chatScroll.view})))) ;assert.equal(await page.locator('#prompt').innerText(),draft);
 // A completed tail refresh may clear the badge; incoming history stays quiet.
 await refresh();assert(await jump.isHidden());
 // Historical pages must not be mistaken for live arrivals.
 await page.evaluate(()=>{const e=app.chatHistory.get('dm-piper');e.hasAfter=true;app.chatScroll.follow=false;app.acceptHistoryPage(e,{messages:[{seq:100,sender:'piper',kind:'message'}],page:{has_after:true}});app.updateJumpLatest();});
 assert(await jump.isVisible());assert(await jump.locator('.jump-latest-count').isHidden());
 await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.equal(await jump.evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.setViewportSize({width:320,height:700});assert.equal(await page.locator('.conversation').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
 assert.deepEqual(errors,[]);await page.close();
}
console.log('PASS: compact latest, fresh-message counts, replay/history/tools excluded, reader/draft preservation, progressive frost, mobile, reduced motion');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
