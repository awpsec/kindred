const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/workflow-polish');fs.mkdirSync(out,{recursive:true});
 try{
  const p=await browser.newPage({viewport:{width:1320,height:960}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(token=>{
   sessionStorage.setItem('kindred-token',token);localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'local:small',microphone:'default'}));
   window.__KINDRED_DICTATION_MODELS=true;window.__TAURI__={core:{invoke:async()=>({supported:true,enabled:true,phase:'ready',model:'small',downloading:'medium',progress:18,models:[{id:'small',name:'Small',downloaded:true,loaded:true},{id:'medium',name:'Medium',downloading:true}]})}};
  },token);
  const sources=[{bot_id:'piper',bot_name:'Piper',name:'Gmail via Codex',provider:'codex',account_key:'codex-fixture',connector_key:'inbox'},{bot_id:'other',bot_name:'Other bot',name:'Gmail via Claude',provider:'claude-code',account_key:'claude-fixture',connector_key:'other-inbox'}];
  await p.route('**/api/inbox-monitors',r=>r.fulfill({json:{items:[],provider_sources:sources}}));
  await p.route('**/api/composio',r=>r.fulfill({json:{configured:false,apps:[]}}));
  await p.route('**/api/local/devices',r=>r.fulfill({json:{devices:[]}}));
  const table='| # | Command | Size | What it does |\n|---|---|---|---|\n'+Array.from({length:18},(_,i)=>`| ${i+9} | review-${i} | 3 KB | Review the supplied report and retain useful context for the next task. |`).join('\n');
  await p.route(url=>url.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages:[{seq:1,sender:'piper',kind:'message',text:table,created:1}],page:{has_before:false,has_after:false,first:1,last:1}}}));
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await p.locator('.markdown-table').waitFor();
  let layouts=0;
  for(const width of [390,800,1320])for(const size of [100,150])for(const theme of ['dark','light']){
   await p.setViewportSize({width,height:960});await p.evaluate(({size,theme})=>{KindredReadingSize.set(size);document.documentElement.dataset.theme=theme;},{size,theme});
   const cells=await p.locator('.markdown-table td:first-child').evaluateAll(nodes=>nodes.map(n=>{const range=document.createRange();range.selectNodeContents(n);return {text:n.textContent,lines:range.getClientRects().length};}));
   assert(cells.some(c=>c.text.trim()==='10'));assert(cells.every(c=>c.lines===1),'Short numeric cells must stay on one line');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tables must scroll inside the message');layouts++;
  }
  await p.setViewportSize({width:1320,height:960});await p.evaluate(()=>KindredReadingSize.set(115));await p.screenshot({path:path.join(out,engine+'-table.png')});
  const settings=p.locator('#settings-button');await settings.click();
  const progress=p.getByRole('progressbar',{name:'Dictation model download'});await progress.scrollIntoViewIfNeeded();
  const spacing=await progress.evaluate(n=>{const pane=n.closest('.settings-pane'),detail=pane.querySelector('.dictation-detail');return {bottom:pane.getBoundingClientRect().bottom-n.getBoundingClientRect().bottom,gap:n.getBoundingClientRect().top-detail.getBoundingClientRect().bottom};});
  assert(spacing.bottom>=15&&spacing.gap>=8&&spacing.gap<=14,JSON.stringify(spacing));
  assert.equal(await p.locator('#settings-dialog').evaluate(n=>getComputedStyle(n).outlineStyle),'none');await p.screenshot({path:path.join(out,engine+'-dictation.png')});
  await p.locator('#settings-close').click();await p.locator('#settings-dialog').waitFor({state:'hidden'});assert.equal(await settings.evaluate(n=>getComputedStyle(n).outlineStyle),'none');
  await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.documentElement.dataset.inputModality),'keyboard');
  await settings.focus();assert.notEqual(await settings.evaluate(n=>getComputedStyle(n).outlineStyle),'none','Keyboard focus remains visible');
  await p.locator('#new-bot').click();assert.equal(await p.locator('#new-menu').getByRole('button').count(),2);assert.equal(await p.locator('#new-menu').getByText('Import workspace').count(),0);await p.locator('#new-bot').click();
  await settings.click();await p.locator('#settings-nav').getByRole('button',{name:'Skills',exact:true}).click();await p.getByRole('button',{name:'Import workspace',exact:true}).click();
  const workspace=p.getByRole('dialog',{name:'Import workspace',exact:true});await workspace.waitFor();assert((await workspace.innerText()).includes('AGENTS.md'));assert((await workspace.innerText()).includes('Pi'));await workspace.getByRole('button',{name:'Close',exact:true}).click();await workspace.waitFor({state:'detached'});
  // Exercise the actual browser collector at the cap, including Pi single-file skills.
  const collected=await p.evaluate(async()=>{
   const {collectWorkspace}=await import('./workspace-import.js');const files=[];
   function file(name,text){const f=new File([text],name.split('/').at(-1));Object.defineProperty(f,'webkitRelativePath',{value:'project/'+name});return f;}
   files.push(file('AGENTS.md','Agent context'),file('CLAUDE.md','Additional scoped guidance'),file('.pi/SYSTEM.md','Pi context'));
   for(let i=0;i<255;i++)files.push(file(['.claude/commands/','.codex/prompts/','.pi/prompts/'][i%3]+i+'.md','Review supplied input'));
   files.push(file('.pi/skills/review.md','---\ndescription: Review\n---\nReview input'));
   const result=await collectWorkspace(files);let rejected=false;try{await collectWorkspace([...files,file('.pi/prompts/extra.md','Extra')]);}catch(e){rejected=e.message.includes('256');}
   return {documents:result.documents.length,packages:result.packages.length,rejected};
  });assert.deepEqual(collected,{documents:3,packages:256,rejected:true});
  await p.locator('#settings-nav').getByRole('button',{name:'Routines',exact:true}).click();await p.getByRole('button',{name:'Add routine',exact:true}).waitFor();
  assert(!(await p.locator('#settings-content').innerText()).includes('Set up Gmail through Claude'));
  await p.getByRole('button',{name:'Add routine',exact:true}).click();await p.locator('#routine-schedule-mode').selectOption('activity');
  const inbox=p.getByRole('dialog',{name:'Inbox routine',exact:true});await inbox.waitFor();
  const options=await inbox.getByLabel('Inbox connection',{exact:true}).locator('option').allTextContents();assert(options.includes('Gmail via Codex'));assert(!options.includes('Gmail via Claude'),'Only the assigned bot’s provider sources belong here');
  await inbox.getByRole('button',{name:'Continue',exact:true}).click();const review=p.getByRole('dialog',{name:'Scheduled inbox reviews',exact:true});await review.waitFor();assert(!(await review.innerText()).includes('Claude'));await review.evaluate(async n=>{await Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{})));});for(const width of [390,800,1320]){await p.setViewportSize({width,height:960});const bounds=await review.evaluate(n=>({width:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth+1}));assert(bounds.width<=641&&!bounds.overflow,JSON.stringify(bounds));}await p.screenshot({path:path.join(out,engine+'-inbox.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,layouts,numericColumns:true,pointerAndKeyboardFocus:true,whisperSpacing:true,workspaceInSettings:true,workflowCap256:true,providerAwareInboxEntry:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
