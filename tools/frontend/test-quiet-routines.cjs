const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  const now=Math.floor(Date.now()/1000),marker='<mcp__kindred__finish_quietly> </mcp__kindred__finish_quietly>';
  const bot={id:'harold',name:'Harold',provider:'claude-code',profile:{shape:'round',color:'#7755ff',label:'Inbox monitor'}};
  const normal={id:'alert',bot_id:bot.id,chat_id:'dm-harold',status:'completed',prompt:'Check inbox',output:'A client needs a reply.',error:'',created:now-3600};
  const runs=[normal],messages=[{seq:1,sender:bot.id,kind:'result',text:normal.output,run_id:normal.id,created:normal.created}];
  const chat={id:'dm-harold',name:'Harold',members:[bot.id],last_message:messages[0]};
  await p.route(origin+'/api/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send([bot]);if(name==='/chats')return send([chat]);if(name==='/runs')return send(runs);
   if(name==='/chats/'+chat.id)return send({chat,messages});
   if(name.startsWith('/runs/')){const run=runs.find(r=>r.id===name.slice(6));return send({run,events:[],attachments:[],approvals:[]});}
   if(name==='/activity'){const run=runs[0];return send({harold:{run_id:run.id,status:run.status,shape:'think',label:'Checking inbox',started_at:run.created}});}
   return route.continue();
  });
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const row=p.locator('#bots .bot-link'),preview=row.locator('.bot-preview');await p.getByText(normal.output,{exact:true}).last().waitFor();
  const stamp=await row.locator('.bot-time').textContent();assert.equal(await preview.textContent(),normal.output);
  const quiet={...normal,id:'quiet',status:'running',output:'',created:now};runs.unshift(quiet);
  await p.locator('#content .work-line').waitFor();
  quiet.status='completed';quiet.output=marker;messages.push({seq:2,sender:bot.id,kind:'result',text:marker,run_id:quiet.id,created:now});chat.last_message=messages.at(-1);
  await p.waitForFunction(()=>document.querySelectorAll('#content .work-line').length===0);
  await p.waitForTimeout(2000);
  assert.equal(await p.locator('#content [data-message="2"]').count(),0);
  assert.equal(await preview.textContent(),normal.output);assert.equal(await row.locator('.bot-time').textContent(),stamp);
  await p.reload();await preview.waitFor();assert.equal(await preview.textContent(),normal.output);
  await p.waitForFunction(()=>document.querySelector('#content [data-message="1"]'));
  assert.equal(await p.locator('#content [data-message="2"]').count(),0,'Old backend history must not restore a blank bubble');
  const failed={...normal,id:'failed',status:'failed',output:'',error:'Gmail access denied',created:now+1};runs.unshift(failed);
  messages.push({seq:3,sender:bot.id,kind:'result',text:'Gmail access denied',run_id:failed.id,created:failed.created});chat.last_message=messages.at(-1);
  await p.locator('#content [data-message="3"]').waitFor();await p.waitForFunction(()=>document.querySelector('#bots .bot-preview')?.textContent==='Gmail access denied');
  messages.push({seq:4,sender:bot.id,kind:'result',text:'Example: `<finish_quietly/>`',run_id:normal.id,created:now+2});
  messages.push({seq:5,sender:'user',kind:'message',text:marker,created:now+3});
  await p.locator('#content [data-message="4"] code').waitFor();await p.locator('#content [data-message="5"]').waitFor();
  assert.equal(await p.locator('#content [data-message="4"] code').textContent(),'<finish_quietly/>');
  assert.equal(await p.locator('#content [data-message="5"] .message-bubble').textContent(),marker);
  await p.setViewportSize({width:420,height:850});await p.waitForTimeout(200);
  const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/quiet-routines');fs.mkdirSync(out,{recursive:true});
  await p.screenshot({path:path.join(out,engine+'-quiet-routines.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,noBlankBubble:true,noMarkerPreview:true,stableTimestamp:true,noStuckWorker:true,reload:true,errorsAndQuotedCodeVisible:true,userTextPreserved:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
