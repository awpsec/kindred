const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();p.setDefaultTimeout(10000);const errors=[],native=[],writes=[];let reads=0,details=0,bytes=0,fail=false,delay=0;
  p.on('pageerror',e=>errors.push(e.message));
  await context.exposeFunction('fixtureNative',async(command,args)=>{native.push({command,args});if(command==='profile_home_state')return {entries:[],theme:'dark'};if(command==='profile_activity')return {};if(command==='local_access_status')return {mode:'off',device_id:'pc'};return null;});
  await context.addInitScript(t=>{if(window.top!==window)return;sessionStorage.setItem('kindred-token',t);window.__KINDRED_DESKTOP={platform:'linux'};window.__KINDRED_NATIVE_FRAME=true;window.__KINDRED_LOCAL_ACCESS=true;window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_EMBEDDED_ACCOUNTS=true;window.__KINDRED_FILE_DELIVERY=true;window.__TAURI__={core:{invoke:(...args)=>window.fixtureNative(...args)}};},token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),send=json=>route.fulfill({json});
   if(u.pathname==='/api/settings')return send({name:'Casey',theme:'dark',reduced_motion:true,approval_mode:'ask',timezone:'UTC',local_access:true});
   if(u.pathname==='/api/composio')return send({configured:false,apps:[]});
   if(u.pathname==='/api/inbox-monitors')return send({items:[],provider_sources:[{bot_id:'piper',bot_name:'Piper',account_key:'a'.repeat(64),connector_key:'gmail',name:'Gmail via Claude',requires_approval:true}]});
   if(u.pathname==='/api/provider-inbox-routines'){writes.push(req.postDataJSON());return send({saved:true});}
   if(u.pathname==='/api/bots/piper/artifacts'){
    reads++;if(delay)await new Promise(r=>setTimeout(r,delay));if(fail)return route.fulfill({status:503,json:{error:'Artifact index unavailable'}});
    const second=!!u.searchParams.get('before');return send({items:second?[{id:'last',kind:'file',title:'Older graph.html',created:1,size:100}]:Array.from({length:20},(_,i)=>({id:'record-'+i,kind:i===0?'file':i===2?'snippet':'checklist',title:i===0?'Interactive graph.html':i===2?'Inline React graph':'Saved list '+i,created:100-i,status:i?'active':'',size:i?0:100})),next_cursor:second?null:'page-two'});
   }
   if(u.pathname.startsWith('/api/bots/piper/artifacts/checklist/')){details++;return send({id:u.pathname.split('/').pop(),bot_id:'piper',chat_id:'dm-piper',revision:1,title:'Opened list',items:[{id:'a',title:'A saved item',state:'pending',owner:'user'}]});}
   if(u.pathname.startsWith('/api/bots/piper/artifacts/snippet/')){details++;return send({snippets:[{language:'jsx',source:'export default function App(){return <h1>Inline plot</h1>}'}]});}
   if(u.pathname.startsWith('/api/deliverables/')){bytes++;return route.fulfill({contentType:'text/html',body:'<h1>A graph</h1><button onclick="this.textContent=\'Changed\'">Interact</button>'});}
   return route.continue();
  });
  await p.goto(origin);await p.locator('#app').waitFor({state:'visible'});
  assert.equal(await p.locator('#chat-planning').count(),0);assert.equal(await p.locator('#composer-caption').innerText(),'');assert.equal(await p.locator('.desktop-titlebar').count(),0);
  assert.equal(await p.evaluate(()=>window.KindredReadingSize.get()),115);
  assert(Math.abs(await p.locator('.message-bubble').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize))-14.95)<0.05);
  assert.equal(reads,0);await p.locator('#bot-details').click();assert.equal(reads,0);await p.getByRole('button',{name:'Artifacts',exact:true}).click();
  await p.locator('.artifact-library-record').last().waitFor();assert.equal(await p.locator('.artifact-library-record').count(),20);assert.equal(details,0);assert.equal(bytes,0);
  const refresh=p.getByRole('button',{name:'Refresh artifacts',exact:true});assert.equal(await refresh.innerText(),'');assert.equal(await refresh.locator('svg').count(),1);
  for(const width of [1280,800,390]){await p.setViewportSize({width,height:900});assert(await refresh.evaluate(n=>{const r=n.getBoundingClientRect(),t=n.parentElement.getBoundingClientRect();return r.width>=34&&r.height>=34&&r.left>=t.left&&r.right<=t.right+1;}));}
  await p.setViewportSize({width:1280,height:900});
  await p.locator('.artifact-library-record').first().locator('summary').click();await p.locator('.artifact-record-body').first().getByRole('button',{name:'Preview',exact:true}).click();await p.frameLocator('.artifact-library iframe').getByRole('heading',{name:'A graph'}).waitFor();assert.equal(bytes,1);
  await p.locator('.artifact-library-record').nth(1).locator('summary').click();await p.getByText('A saved item',{exact:true}).waitFor();assert.equal(details,1);assert.equal(await p.locator('.artifact-library iframe').count(),0);
  await p.locator('.artifact-library-record').nth(2).locator('summary').click();await p.locator('.artifact-library-record').nth(2).getByRole('button',{name:'Preview',exact:true}).click();await p.frameLocator('.artifact-library iframe').getByRole('heading',{name:'Inline plot'}).waitFor();assert.equal(details,2);
  const count=reads;await p.waitForTimeout(2300);assert.equal(reads,count,'No background polling');
  // Allow the compositor to settle after scrolling past an isolated iframe.
  const next=p.locator('.artifact-library').getByRole('button',{name:'Next',exact:true});await next.scrollIntoViewIfNeeded();await p.waitForTimeout(150);await next.click();await p.getByText('Older graph.html',{exact:true}).waitFor();assert.equal(await p.locator('.artifact-library-record').count(),1);assert.equal(await p.locator('.artifact-library [data-list]').count(),0);
  await p.locator('.artifact-library').getByRole('button',{name:'Previous',exact:true}).click();await p.getByText('Interactive graph.html',{exact:true}).waitFor();
  fail=true;await p.locator('.artifact-library').getByRole('button',{name:'Refresh artifacts',exact:true}).click();await p.getByText('Artifact index unavailable',{exact:true}).waitFor();fail=false;await p.locator('.artifact-library').getByRole('button',{name:'Retry',exact:true}).click();await p.getByText('Interactive graph.html',{exact:true}).waitFor();
  const out=path.resolve(__dirname,'../../test-results/feedback-library');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-artifacts.png')});
  await p.locator('#details-close').click();assert.equal(await p.locator('.artifact-library').count(),0);
  await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByRole('combobox',{name:'Text size',exact:true}).selectOption('150');assert.equal(await p.evaluate(()=>localStorage.getItem('kindred-text-size')),'150');
  await p.locator('#settings-dialog').getByRole('button',{name:'Computer',exact:true}).click();const before=await p.locator('#app').boundingBox();await p.getByRole('button',{name:'Desktop permissions',exact:true}).click();
  assert(native.some(x=>x.command==='open_local_access'&&!x.args.bounds));assert.equal(await p.locator('.embedded-permissions-content').count(),0);assert.deepEqual(await p.locator('#app').boundingBox(),before);
  await p.locator('#settings-dialog').getByRole('button',{name:'Routines',exact:true}).click();await p.getByRole('button',{name:'Add routine',exact:true}).click();await p.locator('#routine-schedule-mode').selectOption('activity');await p.getByRole('dialog',{name:'Inbox routine',exact:true}).getByRole('button',{name:'Continue',exact:true}).click();
  const editor=p.getByRole('dialog',{name:'Scheduled inbox reviews'});await editor.getByRole('combobox',{name:'Review frequency',exact:true}).selectOption('300');await editor.getByRole('button',{name:'Create inbox routine',exact:true}).click();await editor.waitFor({state:'detached'});
  assert.equal(writes.length,1);assert.equal(writes[0].interval_seconds,300);assert.equal(writes[0].connector_key,'gmail');assert.equal(writes[0].account_key,'a'.repeat(64));assert.equal(writes[0].bot_id,'piper');
  await p.setViewportSize({width:800,height:650});await p.screenshot({path:path.join(out,engine+'-linux-large-text.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.locator('#settings-dialog').evaluate(n=>n.close());await p.locator('#bot-details').click();await p.getByRole('button',{name:'Artifacts',exact:true}).click();await p.locator('.artifact-library-record').last().waitFor();delay=500;await p.locator('.artifact-library').getByRole('button',{name:'Next',exact:true}).click();await p.locator('#details-close').click();await p.waitForTimeout(650);assert.equal(await p.locator('.artifact-library').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,lazyMetadata:true,boundedPages:true,onePreview:true,noPolling:true,lateResponseDiscarded:true,linuxTextSize:true,linuxPermissionsBounds:true,claudeGmailReuse:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
