const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],cancelled=[];
  p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const now=Date.now()/1000,chats=[{id:'dm-piper',name:'Helper',members:['piper']},{id:'dm-requester',name:'Requester',members:['requester']}];
  let waiting=true,delegated=false;
  const wait={bot_id:'piper',requester_bot_id:'requester',parent_run_id:'parent',run_id:'help',chat_id:'dm-piper',status:'running'};
  const run=()=>({id:'help',bot_id:'piper',chat_id:'dm-piper',status:'running',created:now,prompt:'Check the notes',output:'',error:'',delegation:{requester_bot_id:'requester',source_chat_id:'dm-requester'}});
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),send=json=>route.fulfill({json});
   if(url.pathname==='/api/bots'){const response=await route.fetch(),bots=await response.json();return send([{...bots[0],id:'piper',name:'Helper'},{...bots[0],id:'requester',name:'Requester'}]);}
   if(url.pathname==='/api/chats')return send(chats);
   const chat=chats.find(c=>url.pathname==='/api/chats/'+c.id);
   if(chat)return send({chat,messages:[],pending_waits:waiting?[wait]:[],page:{has_before:false,has_after:false}});
   if(url.pathname==='/api/runs')return send(waiting&&delegated?[run()]:[]);
   if(url.pathname==='/api/runs/help')return send({run:run(),events:[],approvals:[]});
   if(url.pathname==='/api/activity')return send({});
   if(url.pathname==='/api/user-tasks'||url.pathname==='/api/approvals')return send([]);
   if(url.pathname.endsWith('/cancel')){cancelled.push(url.pathname);waiting=false;return send({});}
   return route.continue();
  });
  await p.goto('http://127.0.0.1:'+server.address().port);
  const row=p.locator('.nametag-status'),x=p.locator('.nametag-status-stop');
  // Pending waits alone must represent the helper side; no metadata dependency.
  await row.getByText('Requester is waiting on you',{exact:true}).waitFor();
  assert.equal(await p.locator('.collaboration-wait:visible').count(),0,'No duplicate transcript status');
  await p.mouse.move(0,840);await p.waitForTimeout(300);
  assert.equal(await x.evaluate(n=>getComputedStyle(n).opacity),'0','Interrupt stays hidden until status hover');
  await p.locator('.bot-link[data-sidebar-id="requester"]').click();
  await row.getByText('Waiting on Helper',{exact:true}).waitFor();
  await p.locator('.bot-link[data-sidebar-id="piper"]').click();
  await row.getByText('Requester is waiting on you',{exact:true}).waitFor();
  await p.reload();await row.getByText('Requester is waiting on you',{exact:true}).waitFor();
  await row.hover();await p.waitForTimeout(300);await x.click();
  await row.waitFor({state:'hidden'});assert.deepEqual(cancelled,['/api/runs/parent/cancel'],'Fallback preserves existing cancellation ownership');
  waiting=true;delegated=true;
  await row.getByText('Working for Requester',{exact:true}).waitFor();
  assert.equal(await p.locator('.collaboration-wait:visible,.helper-work:visible').count(),0,'Same-DM delegation also stays in nametag');
  // Compact/mobile layouts keep the existing reachable status, not a hidden one.
  await p.setViewportSize({width:600,height:850});await p.locator('.collaboration-wait').waitFor();
  assert.equal(await p.locator('.nametag-shell').count(),0);
  await p.setViewportSize({width:1100,height:850});await row.getByText('Working for Requester',{exact:true}).waitFor();
  await row.hover();await p.waitForTimeout(300);await x.click();await row.waitFor({state:'hidden'});
  assert.equal(cancelled.at(-1),'/api/runs/help/cancel','Known helper interrupts its own run');
  await p.locator('.bot-link[data-sidebar-id="requester"]').click();await p.waitForTimeout(500);
  assert.equal(await p.locator('.nametag-status:visible,.collaboration-wait:visible,.helper-work:visible').count(),0,'Clearing updates both sides');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',incomingWait:true,sameDmDelegation:true,switchAndReload:true,hoverAndCancel:true,mobileFallback:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
