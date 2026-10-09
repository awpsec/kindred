const {server,token}=require('./fixtures/desktop.cjs');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch(),out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/mobile-composer');fs.mkdirSync(out,{recursive:true});try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const errors=[],sent=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_SYSTEM_TEXT_SCALE=1;sessionStorage.setItem('kindred-token',t);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:whistle'}));},token);
 await p.route('**/api/uploads',r=>r.fulfill({json:{id:'mobile-file',name:'notes.txt'}}));
 await p.route('**/api/uploads/mobile-file',r=>r.fulfill({json:{ok:true}}));
 await p.route('**/api/settings',r=>r.fulfill({json:{theme:'light',name:'You',approval_mode:'auto'}}));
 await p.route('**/api/chats/dm-piper/messages',r=>{sent.push(r.request().postDataJSON());return r.fulfill({json:{runs:[]}});});
 await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#prompt').waitFor();await p.waitForTimeout(300);
 const prompt=p.locator('#prompt'),composer=p.locator('#composer');const capture=async label=>{await p.waitForTimeout(300);await p.locator('#composer-area').screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-'+label+'.png')});};
 const measure=()=>p.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const c=document.querySelector('#composer');return {box:rect(c),text:rect(document.querySelector('#prompt')),controls:[...c.querySelectorAll('#composer-actions,#send,.dictation-button,.dictation-cancel')].filter(b=>b.getClientRects().length).map(rect),pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
 const contained=async()=>{const m=await measure();for(const b of m.controls){assert(b.width>=44&&b.height>=44,'Touch targets stay at least 44px');assert(b.x>=m.box.x&&b.right<=m.box.right,'Controls fit horizontally');assert(b.bottom<=m.box.bottom-4,'Controls retain a bottom inset');}assert(m.pageWidth<=m.viewport);return m;};
 let m=await contained();assert(m.box.height<=60,'Empty resting composer is a compact pill');assert(Math.abs(m.text.y+m.text.height/2-m.controls[0].y-22)<2,'Idle text and controls align');await capture('idle-light');
 await prompt.focus();await p.setViewportSize({width:390,height:550});await p.waitForTimeout(300);m=await contained();assert(m.box.height>=90&&m.box.height<=110,'Focused composer uses two compact rows');assert(m.text.y-m.box.y>=8&&m.text.y-m.box.y<=14,'Text begins near the top');assert(m.text.bottom<m.controls[0].y,'Text stays above the toolbar');await capture('writing-light');
 await prompt.fill('A single-line draft');m=await contained();assert.equal(m.controls.length,3,'Add, mic, and send stay available');
 const long=Array.from({length:14},(_,i)=>'Line '+(i+1)+' of a longer draft').join('\n');await prompt.fill(long);await p.waitForTimeout(300);m=await contained();assert(m.box.y>=0);assert(m.text.height<=166);assert(await prompt.evaluate(e=>e.scrollHeight>e.clientHeight),'Long drafts scroll inside the editor');assert(m.text.bottom<m.controls[0].y);await capture('multiline-light');
 await p.evaluate(()=>document.documentElement.dataset.theme='dark');await capture('multiline-dark');
 await p.evaluate(()=>window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1.5}})));await p.waitForTimeout(300);await contained();assert.equal(await prompt.innerText(),long,'Changing text size preserves the draft');
 await p.emulateMedia({reducedMotion:'reduce'});await prompt.fill('Send this mobile draft');await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').textContent==='');assert.equal(sent.length,1);assert.equal(sent[0].prompt,'Send this mobile draft');
 await p.evaluate(()=>{window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale:1}}));document.activeElement?.blur();});await p.setViewportSize({width:390,height:844});await p.waitForTimeout(350);m=await contained();assert(m.box.height<=60);await capture('idle-dark');
 // Exercise the real attachment and reply rows together.
 await p.locator('input[type="file"]').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Mobile attachment fixture')});await p.getByRole('button',{name:'Remove notes.txt',exact:true}).waitFor();
 await p.locator('[data-message="1"] [data-message-action="reply"]').evaluate(b=>b.click());await p.getByRole('button',{name:'Cancel reply',exact:true}).waitFor();await p.waitForTimeout(400);await contained();
 const attachment=await p.locator('.composer-files').boundingBox(),reply=await p.locator('#composer-reply').boundingBox();m=await measure();assert(reply.y+reply.height<=attachment.y+1&&attachment.y+attachment.height<=m.text.y+1,'Reply, attachment and draft occupy separate rows: '+JSON.stringify({reply,attachment,text:m.text}));
 await p.getByRole('button',{name:'Cancel reply',exact:true}).click();await p.getByRole('button',{name:'Remove notes.txt',exact:true}).click();await p.waitForTimeout(400);await contained();

 assert.deepEqual(errors,[]);console.log('Mobile composer: idle/focus, 44px targets, keyboard-sized viewport, multiline scroll, dictation/send, text size, themes, reduced motion and send pass');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
