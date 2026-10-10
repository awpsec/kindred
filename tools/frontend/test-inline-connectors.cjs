const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/inline-connectors');fs.mkdirSync(out,{recursive:true});
 try{
 const p=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
 const receipt=(seq,status,input={object:'Item',item_id:'12985760470',limit:2})=>({seq,sender:'piper',kind:'connector_artifact',text:'Read connected item',created:now,connector_artifact:{id:'inline-'+seq,bot_id:'piper',connection:'Monday',connector:'monday',source:'Claude',kind:'task',tool:'monday__get_updates',title:'Read connected item',status,revision:1,input,records:[]}});
 const messages=[{seq:1,sender:'user',kind:'message',text:'Check the item.',created:now},receipt(2,'completed'),{seq:3,sender:'piper',kind:'assistant',text:'The next message remains in place.',created:now}];
 await p.route(origin+'/api/runs',r=>r.fulfill({json:[]}));await p.route(url=>url.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat,messages,page:{has_before:false,has_after:false}}}));
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh};'}));
 await p.goto(origin);const call=p.locator('[data-message="2"] .connector-call'),toggle=call.locator(':scope>summary'),body=call.locator(':scope>.chat-disclosure-body');await toggle.waitFor();
 assert(!await toggle.innerText().then(t=>t.includes('ID ')),'Collapsed label must keep IDs in the expanded fields');assert(await body.evaluate(n=>n.inert));assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 await toggle.focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('.connector-call')?.open&&!document.querySelector('.connector-call')?.getAnimations({subtree:true}).some(a=>a.playState==='running'));
 const detail=call.locator('[data-connector-artifact]');assert.equal(await detail.evaluate(n=>getComputedStyle(n).borderTopWidth),'0px');assert.equal(await detail.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await detail.locator('h3').count(),0);assert(await detail.getByText('12985760470',{exact:true}).isVisible());assert(await detail.getByText('✓ Completed',{exact:true}).isVisible());assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert(await toggle.evaluate(n=>document.activeElement===n));
 for(const width of [1000,390,320])for(const scale of [1,1.5])for(const theme of ['light','dark']){await p.setViewportSize({width,height:900});await p.evaluate(({scale,theme})=>{document.documentElement.style.setProperty('--text-scale',String(scale));document.documentElement.dataset.theme=theme;},{scale,theme});await call.screenshot({path:path.join(out,`${engine}-${width}-${scale}-${theme}-completed.png`)});}
 await p.setViewportSize({width:1000,height:900});await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1'));await call.screenshot({path:path.join(out,engine+'-completed-expanded.png')});await detail.getByRole('button',{name:'Chat about this',exact:true}).click();assert(await p.locator('#composer-reply').isVisible());assert.equal(await detail.locator('input,textarea').count(),0);
 await toggle.click();await p.waitForFunction(()=>!document.querySelector('.connector-call')?.open);assert(await body.evaluate(n=>n.inert));
 // Actual browser interpolation moves the following message without jumping at start.
 const motion=await p.evaluate(async()=>{
  const d=document.querySelector('.connector-call'),b=d.querySelector('.chat-disclosure-body'),next=document.querySelector('[data-message="3"]'),summary=d.querySelector('summary');
  const sample=()=>({height:d.getBoundingClientRect().height,next:next.getBoundingClientRect().top,top:summary.getBoundingClientRect().top});
  const before=sample();summary.click();const raw=sample(),animation=b.getAnimations().find(a=>a.effect.getKeyframes().some(k=>'height' in k));if(!animation)throw Error('Missing real height animation');animation.pause();const samples=[];
  for(const t of [0,70,140,210,280]){animation.currentTime=t;samples.push(sample());}animation.finish();await new Promise(requestAnimationFrame);return {before,raw,samples};
 });assert(Math.abs(motion.before.next-motion.raw.next)<2);assert(motion.samples[2].height>motion.samples[0].height+1&&motion.samples[2].height<motion.samples[4].height-1);for(let i=1;i<motion.samples.length;i++)assert(motion.samples[i].next>=motion.samples[i-1].next-1);fs.writeFileSync(path.join(out,'motion.json'),JSON.stringify(motion,null,2));
 await toggle.click();await p.waitForFunction(()=>!document.querySelector('.connector-call')?.open);
 // Real data replaces the existing receipt, with no hardcoded field list.
 messages[1]=receipt(2,'failed',{item_id:'12985760470',long_text:'Long value '.repeat(150),nested:{name:'Nested item',token:'NEVER_RENDER_SECRET',count:3},enabled:true,password:'NEVER_RENDER_PASSWORD'});await p.evaluate(async()=>{const app=await import('/app.js');await app.refresh(true);});await toggle.click();await detail.getByText('Check outcome',{exact:true}).waitFor();assert(await detail.getByText(/final external state is unconfirmed/).isVisible());assert(!(await detail.innerText()).includes('NEVER_RENDER'));assert(await detail.getByText('true',{exact:true}).isVisible());assert(await detail.getByText('Item ID',{exact:true}).isVisible());const nested=detail.locator('.connector-field-more').filter({hasText:'2 fields'});await nested.locator(':scope>summary').click();assert(await nested.getByText('Nested item',{exact:true}).isVisible());assert.equal(await detail.locator('.connector-outcome-warning').evaluate(e=>getComputedStyle(e).borderLeftWidth),'0px');
 for(const width of [1000,390,320])for(const scale of [1,1.5])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:900});await p.evaluate(({scale,theme})=>{document.documentElement.style.setProperty('--text-scale',String(scale));document.documentElement.dataset.theme=theme;}, {scale,theme});await call.scrollIntoViewIfNeeded();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await call.screenshot({path:path.join(out,`${engine}-${width}-${scale}-${theme}-expanded.png`)});
 }
 await p.emulateMedia({reducedMotion:'reduce'});await toggle.focus();await p.keyboard.press('Enter');assert(!await call.evaluate(n=>n.open));assert.equal(await body.evaluate(n=>n.getAnimations().length),0);await p.keyboard.press('Enter');assert(await call.evaluate(n=>n.open));
 assert.equal(await toggle.locator('.icon').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');messages[1]=receipt(2,'pending',{item_id:'12985760470',title:'Review this change'});await p.evaluate(async()=>{const app=await import('/app.js');await app.refresh(true);});const pending=p.locator('[data-connector-artifact="inline-2"]');await pending.getByRole('button',{name:'Approve action',exact:true}).waitFor();assert.equal(await pending.locator('xpath=ancestor::details[contains(@class,"connector-call")]').count(),0);assert(!(await pending.evaluate(e=>e.classList.contains('connector-inline'))));await pending.screenshot({path:path.join(out,engine+'-pending-approval.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,engine,layouts:12,replyHandler:true,inert:true,realFields:true,secretsMasked:true,reducedMotion:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
