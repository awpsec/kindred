const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const chat={id:'dm-piper',name:'Piper',members:['piper']},messages=Array.from({length:45},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:i===44?'Please confirm these five things:\n\n1. Which account?\n2. What date?\n3. Who owns the review?\n4. Which report?\n5. Where should I save it?':`Earlier message ${i+1}. `+'Useful context for this conversation. '.repeat(6),created:1790000000+i}));
 await p.route('**/api/chats/dm-piper*',r=>r.fulfill({json:{chat,messages,page:{has_before:false,has_after:false}}}));await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#content [data-message="45"]').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(350);
 const measure=()=>p.evaluate(()=>{const c=document.querySelector('#content'),a=document.querySelector('#composer-area');return {scroll:c.scrollTop,gap:c.scrollHeight-c.scrollTop-c.clientHeight,composerTop:a.getBoundingClientRect().top,height:a.getBoundingClientRect().height,last:c.querySelector('[data-message="45"]').getBoundingClientRect().bottom};});
 const type=async text=>{await p.locator('#prompt').fill(text);await p.waitForTimeout(250);};
 const draft=Array.from({length:7},(_,i)=>`Answer ${i+1}: these are the details I want to send.`).join('\n');
 // Clicking a question intentionally stops automatic following, even at the end.
 await p.locator('#content').evaluate(c=>{c.scrollTop=c.scrollHeight;});await p.waitForTimeout(100);await p.locator('#content [data-message="45"]').click();const before=await measure();await type(draft);const grown=await measure();
 assert(grown.height>before.height+40);assert(grown.last<=grown.composerTop-5,'Questions must stay above the growing composer');assert(Math.abs((grown.last-grown.composerTop)-(before.last-before.composerTop))<3,'Keep the visible question aligned with the composer');
 await type('');const shrunk=await measure();assert(Math.abs(shrunk.scroll-before.scroll)<3,'Deleting the draft returns the reading position');
 // A reader partway through history moves by only the composer delta, not to latest.
 await p.locator('#content').evaluate(c=>{c.dispatchEvent(new WheelEvent('wheel',{deltaY:-500}));c.scrollTop-=500;});await p.waitForTimeout(200);const older=await measure();await type(draft);const olderGrown=await measure();assert(Math.abs((olderGrown.scroll-older.scroll)-(olderGrown.height-older.height))<3,'Preserve the reading edge while replying to older messages');assert(Math.abs(olderGrown.gap-older.gap)<3,'Do not jump to newest');await type('');assert(Math.abs((await measure()).scroll-older.scroll)<3);
 // Ordinary soft wrapping, rapid shrink/grow, and reduced motion use the same policy.
 for(const reduced of [false,true]){await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});const start=await measure();await type('A reply with enough ordinary words to wrap naturally. '.repeat(12));const end=await measure();assert(end.height>start.height);assert(Math.abs((end.scroll-start.scroll)-(end.height-start.height))<3);await type('');}
 assert.equal(await p.locator('#content [data-message]').count(),45);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',questionVisibility:true,historyReadingEdge:true,softWrap:true,shrink:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
