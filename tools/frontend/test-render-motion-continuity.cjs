// Routine re-renders must not restart, flash or drop state: status loops keep
// their phase, sidebar focus survives, moved rows glide and reverse from where
// they are, group activity only fades what changed, artifact cards resize from
// their current height, and every effect honors both reduced-motion controls.
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.WEBKIT?'webkit':'chromium';
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:760}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  // WebKit may acknowledge emulation before delivering the media preference.
  // Wait for the stimulus itself, then still require motion to be skipped immediately.
  const reduced=async mode=>{await page.emulateMedia({reducedMotion:mode});await page.waitForFunction(expected=>matchMedia('(prefers-reduced-motion: reduce)').matches===expected,mode==='reduce');};
  const now=Math.floor(Date.now()/1000),colors=['#2475ff','#a9df20','#ffc900','#ff684d','#7956ff','#16867c'];
  const bots=Array.from({length:8},(_,i)=>({id:'b'+i,name:'Bot '+i,provider:'codex',model:'test',profile:{shape:'round',color:colors[i%colors.length],eyes:'curious'}}));
  const chats=bots.map((b,i)=>({id:'dm-'+b.id,name:b.name,members:[b.id],last_message:{text:'Note '+i,created:now-100-i*60,sender:b.id}}));
  const runs=[{id:'r1',bot_id:'b0',chat_id:'dm-b0',prompt:'Check',status:'running',output:'',error:'',created:now-5}];
  let v={id:'brief',title:'Daily brief',path:'/#artifact=brief',language:'html',source:'<h2>Daily brief</h2><p>Ready for review</p>',state:{},revision:1,updated:now,archived:false};
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,renderSidebar,node,buddy,elapsedTime,reconcileConversation};'}));
  await page.route(origin+'/api/bots',r=>r.fulfill({json:bots}));
  await page.route(origin+'/api/chats',r=>r.fulfill({json:chats}));
  await page.route(origin+'/api/runs',r=>r.fulfill({json:runs}));
  await page.route(origin+'/api/activity',r=>r.fulfill({json:{b0:{run_id:'r1',status:'running',shape:'read',label:'Reading',started_at:now-5,server_time:now}}}));
  // Every conversation opens on synthetic history, so no fixture error masks the UI.
  await page.route(url=>/^\/api\/chats\/dm-b\d$/.test(url.pathname),r=>{const chat=chats.find(c=>c.id===new URL(r.request().url()).pathname.split('/').pop());return r.fulfill({json:{chat,messages:[{seq:1,sender:'user',text:'Morning check-in',kind:'message',run_id:'',created:now-400},{seq:2,sender:chat.members[0],text:chat.last_message.text,kind:'message',run_id:'',created:now-300}],page:{has_before:false,has_after:false}}});});
  await page.route(origin+'/api/runs/r1',r=>r.fulfill({json:{run:runs[0],events:[],approvals:[],attachments:[]}}));
  const healthy=async()=>assert.equal(await page.getByText('Missing fixture').count(),0,'The fixture must not surface missing-route errors');
  await page.route(origin+'/api/workspace-artifacts/brief',r=>r.fulfill({json:v}));
  await page.addInitScript(t=>{if(window===top)sessionStorage.setItem('kindred-token',t);},token);
  await page.goto(origin);await page.waitForSelector('.sidebar-activity-dots.is-moving');await page.waitForTimeout(600);
  await page.evaluate(async()=>{window.app=await import('/app.js');window.idle=()=>new Promise(r=>setTimeout(r,450));window.effects=n=>n.getAnimations().filter(a=>a.constructor===Animation).length;});

  // 1. A routine rebuild recreates the working dots but continues their pulse.
  // Background polls read the same data, so they never undo a step's order.
  const setCreated=(id,t)=>{chats.find(c=>c.id===id).last_message.created=t;return t;};
  runs[0].output='.';
  const pulse=await page.evaluate(()=>{
   const dot=()=>document.querySelector('.sidebar-activity-dots.is-moving>span');
   const before=dot(),old=before.getAnimations()[0].currentTime;
   app.state.navKey='';app.state.allRuns=app.state.allRuns.map(r=>({...r,output:r.output+'.'}));app.renderSidebar();
   return {rebuilt:dot()!==before,old,next:dot().getAnimations()[0].currentTime};
  });
  assert(pulse.rebuilt,'The fixture must actually rebuild the sidebar');
  assert(pulse.old>300&&Math.abs(pulse.next-pulse.old)<40,'Rebuilt working dots must continue their pulse: '+JSON.stringify(pulse));

  // 2. Keyboard focus survives a rebuild that moves the focused conversation to the top.
  await page.keyboard.press('Shift');await page.locator('#bots .bot-link[data-sidebar-id="b5"]').focus();
  const moved=await page.evaluate(t=>{
   const rows=()=>[...document.querySelectorAll('#bots .nav-entry')];
   const top=id=>document.querySelector(`#bots .bot-link[data-sidebar-id="${id}"]`).closest('.nav-entry').getBoundingClientRect().top;
   const b1=top('b1');
   app.state.navKey='';app.state.chats=app.state.chats.map(c=>c.id==='dm-b5'?{...c,last_message:{...c.last_message,created:t}}:c);app.renderSidebar();
   const entry=id=>document.querySelector(`#bots .bot-link[data-sidebar-id="${id}"]`).closest('.nav-entry');
   return {focus:document.activeElement.dataset.sidebarId,first:rows()[0].querySelector('[data-sidebar-id]').dataset.sidebarId,
    b1Start:entry('b1').getBoundingClientRect().top,b1Before:b1,b1Animating:entry('b1').getAnimations().length,b5Animating:entry('b5').getAnimations().length};
  },setCreated('dm-b5',now+5));
  assert.equal(moved.focus,'b5','Keyboard focus must stay on the moved conversation');assert.equal(moved.first,'b5');
  assert(moved.b1Animating&&moved.b5Animating,'Reordered rows must move instead of jumping');
  assert(Math.abs(moved.b1Start-moved.b1Before)<1.5,'A shifted row starts from where it was: '+JSON.stringify(moved));
  await healthy();await page.screenshot({path:path.join(out,engine+'-sidebar-reorder.png')});

  // 3. An immediate reversal continues from the rows' current visual positions and settles.
  const reversal=await page.evaluate(async t=>{
   const entry=id=>document.querySelector(`#bots .bot-link[data-sidebar-id="${id}"]`).closest('.nav-entry');
   await new Promise(r=>setTimeout(r,70));const mid=entry('b1').getBoundingClientRect().top;
   app.state.navKey='';app.state.chats=app.state.chats.map(c=>c.id==='dm-b5'?{...c,last_message:{...c.last_message,created:t}}:c);app.renderSidebar();
   const resumed=entry('b1').getBoundingClientRect().top;await idle();
   const settled=[...document.querySelectorAll('#bots .nav-entry')].flatMap(n=>n.getAnimations());
   return {mid,resumed,left:settled.length,focus:document.activeElement.dataset.sidebarId};
  },setCreated('dm-b5',1000));
  assert(Math.abs(reversal.mid-reversal.resumed)<1.5,'A reversal must not jump: '+JSON.stringify(reversal));
  assert.equal(reversal.left,0,'Row motion must settle: '+JSON.stringify(reversal));assert.equal(reversal.focus,'b5');

  // 4. Blur settles moving rows at once; both reduced-motion controls skip them.
  const quiet=await page.evaluate(async([up,down])=>{
   const move=t=>{app.state.navKey='';app.state.chats=app.state.chats.map(c=>c.id==='dm-b6'?{...c,last_message:{...c.last_message,created:t}}:c);app.renderSidebar();return document.querySelectorAll('#bots .nav-entry').length&&[...document.querySelectorAll('#bots .nav-entry')].flatMap(n=>n.getAnimations()).length;};
   const moving=move(up);window.dispatchEvent(new Event('blur'));const afterBlur=[...document.querySelectorAll('#bots .nav-entry')].flatMap(n=>n.getAnimations()).length;
   document.documentElement.dataset.motion='off';const off=move(down);delete document.documentElement.dataset.motion;
   return {moving,afterBlur,off};
  },[now+9,setCreated('dm-b6',1000)]);
  assert(quiet.moving>0&&quiet.afterBlur===0&&quiet.off===0,'Blur and app reduced motion must settle sidebar motion: '+JSON.stringify(quiet));
  await reduced('reduce');await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  assert.equal(await page.evaluate(t=>{app.state.navKey='';app.state.chats=app.state.chats.map(c=>c.id==='dm-b6'?{...c,last_message:{...c.last_message,created:t}}:c);app.renderSidebar();return [...document.querySelectorAll('#bots .nav-entry')].flatMap(n=>n.getAnimations()).length;},setCreated('dm-b6',now+20)),0,'OS reduced motion must skip sidebar motion');
  await reduced('no-preference');await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);

  // 5. Group activity keeps unchanged rows steady, keeps avatar nodes and fades only what changed.
  const group=await page.evaluate(async()=>{
   const activity=await import('/group-activity.js'),host=document.createElement('section');host.style.cssText='position:fixed;left:360px;top:80px;width:520px;z-index:9999;background:var(--bg);padding:20px';document.body.append(host);
   const names=['Rowan','Piper','Atlas'];
   window.showWorkers=(statuses)=>{const items=statuses.map((status,i)=>({id:'w'+i,participant:'w'+i,name:names[i],status,created:Math.floor(Date.now()/1000)-60-i*20,profile:{color:['#a9df20','#ffc900','#ff684d'][i],shape:'round'}}));
    const desired=document.createElement('div');desired.append(activity.groupActivity(items,{node:app.node,elapsed:app.elapsedTime,avatar:(m,size)=>app.buddy(m,size,false)}));app.reconcileConversation(host,desired);};
   const fades=()=>[...host.querySelectorAll('.group-working-label')].map(n=>n.getAnimations().length);
   showWorkers(['running','running']);await idle();
   const faces=[...host.querySelectorAll('[data-worker]')],dot=host.querySelector('.group-working-dots>span'),phase=dot.getAnimations()[0].currentTime;
   showWorkers(['running','queued']);const status={fades:fades(),kept:faces.every(f=>f.isConnected),dotPhase:Math.abs(host.querySelector('.group-working-dots>span').getAnimations()[0].currentTime-phase)};
   await idle();showWorkers(['running','queued','running']);const joined={fades:fades(),newFace:host.querySelector('[data-worker="w2"]').getAnimations().length};
   for(let i=0;i<6;i++)showWorkers(i%2?['running','queued']:['running','queued','running']);await idle();
   const settled={rows:host.querySelectorAll('.group-working-row').length,left:host.getAnimations({subtree:true}).filter(a=>!a.animationName).length};
   showWorkers(['running']);window.dispatchEvent(new Event('blur'));const blurred=host.getAnimations({subtree:true}).filter(a=>!a.animationName).length;
   document.documentElement.dataset.motion='off';showWorkers(['running','running','queued']);const off=host.getAnimations({subtree:true}).filter(a=>!a.animationName).length;delete document.documentElement.dataset.motion;
   host.remove();return {status,joined,settled,blurred,off};
  });
  assert.deepEqual(group.status.fades,[0,1],'Only the reworded row may fade: '+JSON.stringify(group));
  assert(group.status.kept,'Worker avatars must keep their live nodes');
  assert(group.status.dotPhase<40,'Group working dots must continue their pulse');
  assert.deepEqual(group.joined.fades,[0,0,1]);assert.equal(group.joined.newFace,1,'A joining worker fades in');
  assert.equal(group.settled.rows,2);assert.equal(group.settled.left,0,'Rapid updates must settle');
  assert.equal(group.blurred,0,'Blur settles group motion');assert.equal(group.off,0,'App reduced motion disables group motion');

  // 6a. A stalled refresh keeps the previous preview visible but inert, then dims it.
  // Markdown previews need no fonts, so the first HTML revision waits on this font.
  let releaseFont,fontRequested,holdFont=true;const fontStarted=new Promise(r=>fontRequested=r);
  await page.route(url=>url.pathname==='/fonts/LiberationMono-BoldItalic.ttf',async r=>{if(holdFont){holdFont=false;fontRequested();await new Promise(res=>releaseFont=res);}return r.continue();});
  let notes={id:'notes',title:'Notes',path:'/#artifact=notes',language:'markdown',source:'# Notes\n\nFirst draft',state:{},revision:1,updated:now,archived:false};
  await page.route(origin+'/api/workspace-artifacts/notes',r=>r.fulfill({json:notes}));
  await page.evaluate(async()=>{
   const {workspaceArtifactCard}=await import('/workspace-artifacts.js'),markdown=s=>{const n=document.createElement('div');n.className='message-bubble';n.textContent=s;return n;};
   const api=async p=>{const r=await fetch('/api'+p,{headers:{Authorization:'Bearer '+sessionStorage.getItem('kindred-token')}});return r.json();};
   const host=document.createElement('section');host.id='notes-host';host.style.cssText='position:fixed;left:340px;top:40px;width:700px;z-index:9999;background:var(--bg);padding:16px';document.body.append(host);
   window.notesCard=workspaceArtifactCard(await api('/workspace-artifacts/notes'),{api,markdown,baseUrl:location.origin});host.append(notesCard);
  });
  await page.locator('#notes-host .workspace-artifact-actions button').last().click();await page.locator('#notes-host .message-bubble').waitFor();await page.waitForTimeout(300);
  notes={...notes,revision:2,language:'html',source:'<h2>Notes</h2><p>Second draft</p>'};
  await page.evaluate(next=>{window.notesSync=notesCard.syncArtifact(next);},notes);await fontStarted;
  const held=await page.evaluate(async()=>{
   const stage=notesCard.querySelector('.workspace-artifact-stage'),early={inert:stage.inert,text:stage.textContent,frames:stage.querySelectorAll('iframe').length,draft:notesCard.hasArtifactDraft()};
   await new Promise(r=>setTimeout(r,800));return {early,inert:stage.inert,opacity:Number(getComputedStyle(stage).opacity)};
  });
  assert(held.early.inert&&held.early.text.includes('First draft')&&held.early.frames===0&&!held.early.draft,'The previous preview stays visible and inert while the next prepares: '+JSON.stringify(held));
  assert(held.inert&&held.opacity<.9,'A stalled refresh dims the retained preview: '+JSON.stringify(held));
  await page.screenshot({path:path.join(out,engine+'-artifact-refreshing.png')});
  releaseFont();await page.locator('#notes-host iframe').waitFor();
  const refreshed=await page.evaluate(async()=>{await notesSync;await new Promise(r=>setTimeout(r,400));const stage=notesCard.querySelector('.workspace-artifact-stage');return {inert:stage.inert,refreshing:stage.classList.contains('is-refreshing'),opacity:Number(getComputedStyle(stage).opacity),bubbles:stage.querySelectorAll('.message-bubble').length};});
  assert.deepEqual(refreshed,{inert:false,refreshing:false,opacity:1,bubbles:0},'The new preview replaces the retained one interactively');
  await page.evaluate(()=>document.getElementById('notes-host').remove());

  // 6. Artifact cards resize from their current height, reverse cleanly and do not flash on sync.
  await page.evaluate(async()=>{
   const {workspaceArtifactCard}=await import('/workspace-artifacts.js'),{markdown}={markdown:s=>{const n=document.createElement('div');n.className='message-bubble';n.textContent=s;return n;}};
   const api=async p=>{const r=await fetch('/api'+p,{headers:{Authorization:'Bearer '+sessionStorage.getItem('kindred-token')}});return r.json();};
   const host=document.createElement('section');host.id='artifact-host';host.style.cssText='position:fixed;left:340px;top:40px;width:700px;z-index:9999;background:var(--bg);padding:16px';document.body.append(host);
   window.card=workspaceArtifactCard(await api('/workspace-artifacts/brief'),{api,markdown,baseUrl:location.origin});host.append(card);
  });
  const toggle=page.locator('#artifact-host .workspace-artifact-actions button').last();
  await toggle.click();await page.locator('#artifact-host iframe').waitFor();await page.waitForTimeout(450);
  const expanded=await page.evaluate(()=>card.getBoundingClientRect().height);
  const reopen=await page.evaluate(async()=>{
   const toggle=[...card.querySelectorAll('.workspace-artifact-actions button')].at(-1);toggle.click();
   await new Promise(r=>setTimeout(r,80));const mid=card.getBoundingClientRect().height;toggle.click();const resumed=card.getBoundingClientRect().height;
   return {mid,resumed};
  });
  assert(reopen.mid<expanded-4,'Closing must be under way: '+JSON.stringify({expanded,...reopen}));
  assert(Math.abs(reopen.mid-reopen.resumed)<2,'Reopening during collapse continues from the current height: '+JSON.stringify(reopen));
  await page.locator('#artifact-host iframe').waitFor();await page.waitForTimeout(450);
  assert(Math.abs(await page.evaluate(()=>card.getBoundingClientRect().height)-expanded)<2);
  // A running resize settles at its destination when either preference or focus changes, or it stalls.
  const settles=await page.evaluate(async()=>{
   const toggle=[...card.querySelectorAll('.workspace-artifact-actions button')].at(-1),results={};
   const natural=()=>{const a=card.getBoundingClientRect().height;card.style.height='auto';const b=card.getBoundingClientRect().height;card.style.height='';return Math.abs(a-b)<1;};
   const cycle=async(name,interrupt)=>{
    toggle.click();await new Promise(r=>setTimeout(r,40));const started=effects(card);await interrupt();
    results[name]={started,left:effects(card),natural:natural()};
    toggle.click();await new Promise(r=>setTimeout(r,450));
   };
   await cycle('appMotion',async()=>{document.documentElement.dataset.motion='off';await new Promise(r=>setTimeout(r,0));delete document.documentElement.dataset.motion;});
   await cycle('blur',async()=>window.dispatchEvent(new Event('blur')));
   await cycle('stalled',async()=>{card.getAnimations().forEach(a=>{if(a.constructor===Animation)a.pause();});await new Promise(r=>setTimeout(r,450));});
   return results;
  });
  for(const [name,result] of Object.entries(settles))assert.deepEqual(result,{started:1,left:0,natural:true},name+' must settle the card resize: '+JSON.stringify(settles));
  await page.locator('#artifact-host iframe').waitFor();await page.waitForTimeout(450);
  v={...v,revision:2,source:'<h2>Daily brief</h2><p>Updated by a teammate</p>'};
  const sync=await page.evaluate(async next=>{
   const samples=[];const watch=setInterval(()=>samples.push({text:card.querySelector('.workspace-artifact-stage').textContent,height:card.getBoundingClientRect().height,frames:card.querySelectorAll('iframe').length}),10);
   const before=card.querySelector('iframe');await card.syncArtifact(next);await new Promise(r=>setTimeout(r,250));clearInterval(watch);
   return {samples,replaced:card.querySelector('iframe')!==before};
  },v);
  assert(sync.replaced,'The newer revision must render');
  assert(sync.samples.every(s=>!s.text.includes('Loading')&&s.frames===1),'A revision sync must not flash the loading state');
  assert(Math.max(...sync.samples.map(s=>Math.abs(s.height-expanded)))<2,'A revision sync must not change the card height');
  await page.screenshot({path:path.join(out,engine+'-artifact-card.png')});
  const artifactOff=await page.evaluate(async()=>{
   const toggle=[...card.querySelectorAll('.workspace-artifact-actions button')].at(-1);
   document.documentElement.dataset.motion='off';toggle.click();const off=effects(card);delete document.documentElement.dataset.motion;return off;
  });
  assert.equal(artifactOff,0,'App reduced motion must skip the artifact collapse');
  await reduced('reduce');await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  await toggle.click();await page.locator('#artifact-host iframe').waitFor();
  assert.equal(await page.evaluate(()=>{[...card.querySelectorAll('.workspace-artifact-actions button')].at(-1).click();return effects(card);}),0,'OS reduced motion must skip the artifact collapse');
  await reduced('no-preference');await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);await page.evaluate(()=>document.getElementById('artifact-host').remove());

  // 7. A quick conversation open never flashes the loading state; a slow one fades it in.
  let release;const slow=new Promise(r=>release=r);
  await page.route(url=>url.pathname==='/api/chats/dm-b3',async r=>{await slow;return r.fulfill({json:{chat:chats[3],messages:[{seq:1,sender:'b3',text:'Loaded',kind:'message',created:now}],page:{has_before:false,has_after:false}}});});
  // Sample in the page from the moment of insertion; round trips under load would arrive late.
  await page.evaluate(()=>{window.loadingSamples=[];const watch=new MutationObserver(()=>{const n=document.getElementById('chat-loading');if(!n)return;watch.disconnect();const at=performance.now(),sample=()=>loadingSamples.push({t:performance.now()-at,opacity:Number(getComputedStyle(n).opacity)});sample();setTimeout(sample,60);setTimeout(sample,700);});watch.observe(document.body,{childList:true,subtree:true});});
  await page.locator('#bots .bot-link[data-sidebar-id="b3"]').click();await page.waitForFunction(()=>loadingSamples.length===3);
  release();await page.locator('#chat-loading').waitFor({state:'detached'});
  const reveal=await page.evaluate(()=>loadingSamples);
  assert(reveal.filter(s=>s.t<130).every(s=>s.opacity<.2)&&reveal.at(-1).opacity>.95,'Loading must stay hidden briefly, then fade in: '+JSON.stringify(reveal));

  // 8. Decision receipts settle when a webview cancels or drops the effect.
  const receipt=await page.evaluate(async()=>{
   const {decisionReceipt}=await import('/decision-receipts.js'),host=document.createElement('section');host.style.cssText='position:fixed;left:360px;top:80px;width:420px;z-index:9999';document.body.append(host);
   const make=key=>{const el=document.createElement('section');el.className='planning-card';el.innerHTML='<p>Decision details</p><button>Action</button>';host.append(decisionReceipt(el,{key,title:'Review proposal',outcome:'Allowed',terminal:true}));return el;};
   const cancelled=make('receipt-cancel');cancelled.querySelector('summary').click();cancelled.getAnimations().forEach(a=>a.cancel());await new Promise(r=>setTimeout(r,40));
   const afterCancel={open:cancelled.querySelector('details').open,moving:cancelled.classList.contains('decision-receipt-moving'),inert:cancelled.querySelector('.decision-receipt-body').inert};
   const dropped=make('receipt-dropped');dropped.querySelector('summary').click();dropped.getAnimations().forEach(a=>a.pause());await new Promise(r=>setTimeout(r,500));
   const afterDrop={open:dropped.querySelector('details').open,moving:dropped.classList.contains('decision-receipt-moving'),left:dropped.getAnimations().length};
   const blurred=make('receipt-blur');blurred.querySelector('summary').click();window.dispatchEvent(new Event('blur'));
   const afterBlur={open:blurred.querySelector('details').open,moving:blurred.classList.contains('decision-receipt-moving'),left:blurred.getAnimations().length};
   const focused=document.hasFocus;document.hasFocus=()=>false;
   const unfocused=make('receipt-unfocused');unfocused.querySelector('summary').click();
   const afterUnfocused={open:unfocused.querySelector('details').open,moving:unfocused.classList.contains('decision-receipt-moving'),left:unfocused.getAnimations().length};
   document.hasFocus=focused;host.remove();return {afterCancel,afterDrop,afterBlur,afterUnfocused};
  });
  assert.deepEqual(receipt.afterCancel,{open:true,moving:false,inert:false},'A cancelled receipt effect must settle open');
  assert.deepEqual(receipt.afterDrop,{open:true,moving:false,left:0},'A stalled receipt effect must settle on its fallback');
  assert.deepEqual(receipt.afterBlur,{open:true,moving:false,left:0},'Blur must settle a running receipt effect');
  assert.deepEqual(receipt.afterUnfocused,{open:true,moving:false,left:0},'Unfocused windows must not start receipt effects');

  await healthy();await page.screenshot({path:path.join(out,engine+'-loaded-chat.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,loopPhase:true,sidebarFocus:true,sidebarGlide:true,reversal:true,blurAndReducedMotion:true,groupActivity:true,artifactCard:true,loadingReveal:true,receiptSettle:true,retainedPreviewInert:true,liveSettle:true}));
 }finally{await browser.close();server.closeAllConnections?.();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
