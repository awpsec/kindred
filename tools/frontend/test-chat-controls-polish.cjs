const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {server,token}=require(root+'/tools/frontend/fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
const p=await browser.newPage({viewport:{width:1200,height:900}});await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
const q={id:'choice',run_id:'question-run',bot_id:'piper',chat_id:chat.id,created:now-80,question:'Which version should I include in the report?',context:'The shorter version covers the findings. The full version also includes the supporting evidence.',options:['Findings only','Include supporting evidence'],status:'pending',selected:null,answer:''};
const a={id:'approval',run_id:'approval-run',tool:'guest_exec',args:{command:'python build_report.py'},status:'pending',created:now-60};
const runs=[{id:q.run_id,status:'awaiting_user'},{id:a.run_id,status:'awaiting_approval'}].map(r=>({...r,bot_id:'piper',chat_id:chat.id,created:now-90,prompt:'Prepare the report',output:'',error:'',depth:0}));
await p.route(origin+'/api/**',async route=>{const n=new URL(route.request().url()).pathname.slice(4),send=json=>route.fulfill({json});
if(n==='/questions')return send([q]);if(n==='/approvals')return send([a]);if(n==='/runs')return send(runs);
if(n==='/chats/'+chat.id)return send({chat,messages:[{seq:1,kind:'message',sender:'user',text:'Please prepare the report for review.',created:now-120},{seq:2,kind:'assistant',sender:'piper',text:'The findings are ready. I have one choice for you before I finish the report.',created:now-100},{seq:3,kind:'question',sender:'piper',text:q.question,question:q,created:q.created,run_id:q.run_id}]});
if(n.startsWith('/runs/'))return send({run:runs.find(r=>r.id===n.slice(6)),events:[],approvals:[a].filter(a=>a.run_id===n.slice(6)),attachments:[]});return route.fallback();});
await p.goto(origin);await p.locator('#request-tray .question-title').waitFor();
const out=process.env.KINDRED_TEST_ARTIFACTS||path.join(root,'test-results');require('node:fs').mkdirSync(out,{recursive:true});const prefix=(process.env.WEBKIT?'webkit':'chromium')+'-polish';const capture=async(name,locator=p)=>locator.screenshot({path:path.join(out,prefix+'-'+name+'.png')});
const tray=p.locator('#request-tray');
const heading=await tray.locator('.request-tray-heading').boundingBox(),pager=await tray.locator('.request-tray-bar').boundingBox();assert(Math.abs(heading.y-pager.y)<8,'Heading and pager share the top row');
await capture('expanded');
await tray.getByRole('button',{name:'Next request',exact:true}).focus();await p.keyboard.press('Enter');assert.equal(await tray.getByRole('button',{name:'Allow once',exact:true}).count(),1);assert(await tray.evaluate(t=>t.contains(document.activeElement)),'Paging keeps keyboard focus');await tray.getByRole('button',{name:'Previous request',exact:true}).click();
await p.getByRole('button',{name:'Minimize pending requests',exact:true}).click();assert.equal(await tray.locator('.request-tray-preview').innerText(),q.question);assert.equal(await tray.getByRole('button').count(),1);assert((await tray.boundingBox()).height<=56);await capture('collapsed');
await p.getByRole('button',{name:'2 pending requests',exact:true}).click();await p.getByRole('button',{name:'Write my own response',exact:true}).click();await p.getByRole('textbox',{name:'Your response',exact:true}).fill('Include the supporting evidence, with a short summary at the top.');await p.waitForTimeout(250);await capture('custom');
await p.locator('#settings-button').click();await p.locator('.progress-choice-tiles').waitFor();await p.locator('.progress-choices').scrollIntoViewIfNeeded();const tiles=p.locator('.progress-choice');
for(const width of [1200,1000,800,390]){
 await p.setViewportSize({width,height:900});await p.locator('.progress-choices').scrollIntoViewIfNeeded();
 const boxes=await tiles.evaluateAll(ts=>ts.map(t=>{const r=t.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
 assert.equal(boxes.length,4);const rows=new Set(boxes.map(b=>Math.round(b.y)));assert.equal(rows.size,width>=1000?1:2,'Four desktop columns, two deliberate mobile rows');
 assert(await tiles.evaluateAll(ts=>ts.every(t=>{const title=t.querySelector('.progress-choice-title').getBoundingClientRect(),preview=t.querySelector('.progress-choice-preview').getBoundingClientRect();return title.bottom<=preview.top;})),'Labels never overlap illustrations');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
await p.setViewportSize({width:1200,height:900});await tiles.last().click();assert(await tiles.last().locator('input').isChecked());await tiles.last().locator('input').focus();await p.keyboard.press('ArrowLeft');assert(await tiles.nth(2).locator('input').isChecked(),'Radio keyboard selection still works');
await capture('settings',p.locator('#settings-dialog'));
await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.5'));await p.locator('.progress-choices').scrollIntoViewIfNeeded();
assert(await tiles.evaluateAll(ts=>ts.every(t=>t.querySelector('.progress-choice-title').getBoundingClientRect().bottom<=t.querySelector('.progress-choice-preview').getBoundingClientRect().top)),'Reading size never overlaps tile titles and previews');await capture('settings-large-text',p.locator('#settings-dialog'));
// A height-derived minimum must not force a tile wider than its grid track.
// Check actual card/radio rectangles, not only labels against illustrations.
const progressCases=[];
for(const theme of ['dark','light'])for(const scale of [1,1.5])for(const width of [1200,1000,800,390]){
 await p.setViewportSize({width,height:900});
 await p.evaluate(({theme,scale})=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--text-scale',String(scale));},{theme,scale});
 await p.locator('.progress-choices').scrollIntoViewIfNeeded();
 const geometry=await p.locator('.progress-choice-tiles').evaluate(grid=>({grid:grid.getBoundingClientRect().toJSON(),cards:[...grid.children].map(n=>n.getBoundingClientRect().toJSON())}));
 assert.equal(new Set(geometry.cards.map(c=>Math.round(c.top))).size,width>=1000?1:2,'Approved four desktop/two narrow columns');
 console.log('PROGRESS_BOUNDS',JSON.stringify({theme,scale,width,...geometry}));
 for(let i=0;i<geometry.cards.length;i++){
  const a=geometry.cards[i];assert(a.left>=geometry.grid.left-1&&a.right<=geometry.grid.right+1,'Each progress card fits its grid');
  for(const b of geometry.cards.slice(i+1))assert(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,'Progress cards never overlap');
 }
 for(let i=0;i<4;i++){
  const tile=tiles.nth(i),radio=tile.locator('input');await radio.scrollIntoViewIfNeeded();
  const hit=await radio.evaluate(input=>{const r=input.getBoundingClientRect(),tile=input.closest('.progress-choice'),t=tile.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight,contained:r.left>=t.left&&r.right<=t.right&&r.top>=t.top&&r.bottom<=t.bottom,hit:target===input};});
  assert(hit.visible&&hit.contained&&hit.hit,'Every radio remains visible and directly hit-testable');
  await radio.click();assert(await radio.isChecked(),'Each unobscured radio accepts a real click');
 }
 assert(await tiles.evaluateAll(ts=>ts.every(t=>{const title=t.querySelector('.progress-choice-title').getBoundingClientRect(),preview=t.querySelector('.progress-choice-preview').getBoundingClientRect();return title.bottom<=preview.top;})),'Experimental and titles stay above illustrations');
 const styles=await tiles.evaluateAll(ts=>ts.map(t=>{const s=getComputedStyle(t);return {border:s.borderColor,background:s.backgroundColor,shadow:s.boxShadow};}));assert(styles.every(s=>JSON.stringify(s)===JSON.stringify(styles[0])),'Selection remains a neutral dot without card highlighting');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await capture('bounds-'+theme+'-'+width+'-'+scale,p.locator('#settings-dialog'));progressCases.push({theme,scale,width});
}
await p.emulateMedia({reducedMotion:'reduce'});assert(await tiles.evaluateAll(ts=>ts.every(t=>getComputedStyle(t).transitionDuration==='0s')),'Reduced motion keeps tile transitions off');
console.log('PROGRESS_MATRIX',JSON.stringify(progressCases));
await p.evaluate(()=>document.documentElement.style.removeProperty('--text-scale'));
await p.keyboard.press('Escape');await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);for(const theme of ['dark','light']){
 await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const height of [844,520]){
  await p.setViewportSize({width:390,height});await p.waitForTimeout(250);
  const b=await tray.boundingBox(),composer=await p.locator('#composer').boundingBox();assert(b.y>=0,'Tray remains within the viewport');assert(b.y+b.height<=composer.y,'Tray never covers the composer');assert(b.height<=height*.52+2,'Tall request content stays bounded');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await tray.getByRole('textbox',{name:'Your response',exact:true}).scrollIntoViewIfNeeded();assert.equal(await tray.getByRole('textbox',{name:'Your response',exact:true}).inputValue(),'Include the supporting evidence, with a short summary at the top.');
  await capture(theme+'-'+height);
 }
}
await p.emulateMedia({reducedMotion:'reduce'});
q.question='Should I include the complete evidence and verification notes in the report, or keep this version focused on the findings and provide the technical details separately for the review team?';
await tray.getByText(q.question,{exact:true}).waitFor();assert.equal(await tray.locator('.request-tray-heading').innerText(),q.question);
await tray.getByRole('button',{name:'Minimize pending requests',exact:true}).click();assert((await tray.boundingBox()).height<=56,'Long collapsed question stays on one line');await tray.getByRole('button',{name:'2 pending requests',exact:true}).focus();await p.keyboard.press('Enter');assert(await tray.locator('.question-option').first().evaluate(b=>b===document.activeElement),'Expansion focuses answer controls');
console.log('Progress four-column desktop/two-column narrow, radio keyboard, request heading/pager, collapsed preview, retained reply, small viewport bounds PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
