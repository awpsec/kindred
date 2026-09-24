const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1320,height:1000}});page.setDefaultTimeout(12000);const errors=[],actions=[];page.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=['Oliver','Jenny','Sam'].map((name,i)=>({id:['piper','jenny','sam'][i],name,provider:'codex',profile:{shape:'round',color:'#2475ff'},approval_mode:'full'}));
  const chat={id:'group-intros',name:'Introductions',members:bots.map(b=>b.id),archived:false};
  const runs=bots.slice(0,2).map((b,i)=>({id:'active-'+b.id,bot_id:b.id,chat_id:chat.id,status:'running',prompt:'Introduce yourself',output:'',error:'',created:now+i}));
  runs.push({...runs[0],id:'queued-piper',status:'queued',prompt:'A clarification',created:now+4});
  const delivery={bot_id:'piper',status:'queued',run_id:'queued-piper',steer_requested:false};
  const messages=[{seq:1,sender:'user',kind:'message',text:'**Oliver** kick us off',created:now},{seq:2,sender:'piper',kind:'handoff',text:'# Introductions\nHey @Jenny, **please introduce yourself**.\n\n`@Sam` stays code.',run_id:runs[0].id,created:now+1},{seq:3,sender:'user',kind:'message',text:'A clarification',delivery:[delivery],created:now+4}];
  const card={id:'fifteen',bot_id:'piper',kind:'task',connection:'Asana',connector:'asana',source:'Codex',tool:'list_tasks',title:'15 tasks checked',status:'completed',revision:1,records:Array.from({length:15},(_,i)=>({title:'Task '+(i+1),fields:{Owner:'Example owner',Description:'A long task description. '.repeat(120)}}))};
  messages.push({seq:4,sender:'piper',kind:'connector_artifact',connector_artifact:card,text:card.title,run_id:runs[0].id,created:now+5});
  let review={id:'instruction-review',run_id:runs[0].id,tool:'bot_instructions_update',status:'pending',args:{bot_id:'jenny',bot_name:'Jenny',expected_instructions:'Review invoices.',instructions:'Review invoices and report outstanding balances.'}};
  await page.route(origin+'/api/**',async route=>{const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send([chat]);if(name==='/runs')return send(runs);if(name==='/approvals')return send(review.status==='pending'?[review]:[]);
   if(name.startsWith('/chats/'+chat.id))return send({chat,messages,pending_waits:[{parent_run_id:runs[0].id,requester_bot_id:'piper',bot_id:'jenny',run_id:runs[1].id,chat_id:chat.id}],page:{has_before:false,has_after:false}});
   if(name==='/runs/queued-piper/steer'){actions.push({name,body:req.postDataJSON()});delivery.steer_requested=true;return send({status:'requested'});}
   if(name.endsWith('/cancel')){actions.push({name});runs.find(r=>name.includes(r.id)).status='cancelling';return send({ok:true});}
   if(name==='/approvals/instruction-review'){actions.push({name,body:req.postDataJSON()});review.status=req.postDataJSON().approved?'approved':'denied';return send({ok:true});}
   if(name.startsWith('/runs/')){const run=runs.find(r=>r.id===name.slice(6));return send({run,events:[],attachments:[],approvals:run?.id===runs[0].id?[review]:[]});}
   if(name==='/activity')return send(Object.fromEntries(runs.filter(r=>r.status==='running').map(r=>[r.bot_id,{run_id:r.id,status:r.status,label:'Thinking it through',shape:'think',started_at:now}])));
   return route.continue();
  });
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);await page.getByRole('button',{name:/Introductions/}).first().click();
  const approval=page.getByRole('region',{name:'Review instruction change'});await approval.waitFor();assert((await approval.innerText()).includes('Full access'));assert.equal(await approval.getByRole('button').count(),2);assert.equal(await approval.locator('.workflow-diff').count(),1);
  const folder=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-instruction-review';fs.mkdirSync(folder,{recursive:true});await approval.screenshot({path:path.join(folder,'short-change.png')});
  await approval.getByRole('button',{name:'Decline',exact:true}).click();assert.equal(review.status,'denied');assert.equal(actions.filter(a=>a.name==='/approvals/instruction-review').length,1);assert.deepEqual(errors,[]);console.log('Existing instruction approval: compact diff renders and real decline endpoint is preserved.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
