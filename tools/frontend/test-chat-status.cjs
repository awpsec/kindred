const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1250,height:1000}}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const created=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const runs=['failed','cancelled','interrupted','completed'].map((status,i)=>({id:'run-'+i,bot_id:'piper',chat_id:chat.id,prompt:'Explain this error',status,output:i===3?'The error is resolved.':'',error:i===0?'The provider could not finish this task.':i===1?'Stopped by you.':i===2?'Connection interrupted.':'',created}));
  const messages=[{seq:1,sender:'user',text:'Explain this error',kind:'message',created},{seq:2,sender:'piper',text:'I found the file; its contents mention an error.',kind:'assistant',run_id:'run-0',created},
   {seq:3,sender:'piper',text:'Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute, and if it persists close other Claude Code processes or sign in again',kind:'assistant',run_id:'run-0',created}];
  messages[2].status_notice={label:'Provider error',text:messages[2].text};
  for(const [i,run] of runs.entries())messages.push({seq:4+i,sender:'piper',text:run.error||run.output,kind:'result',run_id:run.id,created,...(i<3?{status_notice:{label:['Task failed','Task stopped','Task interrupted'][i],text:run.error}}:{})});
  messages.push({seq:8,sender:'system',text:'Automatic follow-up paused.',kind:'notice',created});
  // Runs can be absent from the latest-run window; history must carry its own status.
  await context.route(origin+'/api/**',route=>{const name=new URL(route.request().url()).pathname.slice(4);if(name==='/runs')return route.fulfill({json:[]});if(name==='/activity')return route.fulfill({json:{}});if(name==='/chats/dm-piper')return route.fulfill({json:{chat,messages}});if(name.startsWith('/runs/run-'))return route.fulfill({json:{run:runs.find(r=>name.endsWith(r.id)),events:[],attachments:[],approvals:[]}});return route.continue();});
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('.chat-status-notice').first().waitFor();
  assert.equal(await p.locator('.chat-status-group').count(),5);
  assert.equal(await p.locator('.chat-status-group .message-bubble,.chat-status-group .message-avatar,.chat-status-group .message-actions').count(),0);
  assert.equal(await p.locator('.message-bubble').filter({hasText:'I found the file'}).count(),1);assert.equal(await p.locator('.message-bubble').filter({hasText:'The error is resolved.'}).count(),1);
  assert.deepEqual(await p.locator('.chat-status-label').allTextContents(),['Provider error','Task failed','Task stopped','Task interrupted','Status']);
  for(const theme of ['dark','light'])for(const width of [1250,390]){
   await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.locator('.chat-status-notice').first().scrollIntoViewIfNeeded();
   const style=await p.locator('.chat-status-notice').first().evaluate(e=>({color:getComputedStyle(e).color,muted:getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),background:getComputedStyle(e).backgroundColor,overflows:e.scrollWidth>e.clientWidth}));
   assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.overflows,false);assert(style.color);await p.screenshot({path:path.join(artifacts,engine+'-status-'+theme+'-'+width+'.png')});
  }
  await p.reload();await p.locator('.chat-status-notice').first().waitFor();assert.equal(await p.locator('.chat-status-group').count(),5);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,historyWithoutRecentRuns:true,noticesDistinctFromReplies:true,normalErrorDiscussionPreserved:true,reload:true,themes:2,widths:2}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
