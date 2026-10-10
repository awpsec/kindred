const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:900}});page.setDefaultTimeout(12000);const errors=[],actions=[];page.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bot={id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff'},approval_mode:'full'};
  const chat={id:'dm-piper',name:'Piper',members:[bot.id],archived:false},runs=[],messages=[],reviews=[];
  await page.route(origin+'/api/**',async route=>{const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send([bot]);if(name==='/chats')return send([chat]);if(name==='/runs')return send(runs);if(name==='/approvals')return send(reviews.filter(a=>a.status==='pending'));
   if(name==='/questions')return send([]);if(name==='/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
   if(name.startsWith('/approvals/')){
    assert.equal(req.method(),'POST');assert.equal(req.headers().authorization,'Bearer '+token);
    const a=reviews.find(a=>name==='/approvals/'+a.id);assert(a,'Exact known instruction request');assert.equal(a.status,'pending');
    const body=req.postDataJSON();assert.deepEqual(Object.keys(body),['approved']);assert.equal(typeof body.approved,'boolean');actions.push({name,body});
    a.status=body.approved?'approved':'denied';runs.find(r=>r.id===a.run_id).status='completed';return send({ok:true});
   }
   if(name.startsWith('/runs/')){const run=runs.find(r=>r.id===name.slice(6));return send({run,events:[],attachments:[],approvals:reviews.filter(a=>a.run_id===run?.id)});}
   return route.fallback();
  });
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const folder=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-instruction-review',engine=process.env.WEBKIT?'webkit':'chromium';fs.mkdirSync(folder,{recursive:true});
  for(const [id,approved,long]of [['instruction-allow',true,false],['instruction-deny',false,true]]){
   const before=long?Array.from({length:9},(_,i)=>'Current rule '+i+'.').join('\n'):'Review invoices.';
   const after=long?Array.from({length:9},(_,i)=>'Proposed rule '+i+'.').join('\n'):'Review invoices and report outstanding balances.';
   const run={id:'run-'+id,bot_id:bot.id,chat_id:chat.id,status:'awaiting_approval',prompt:'Review instructions',created:now,output:'',error:''};runs.push(run);
   const review={id,run_id:run.id,tool:'bot_instructions_update',status:'pending',created:now,args:{bot_id:'jenny',bot_name:'Jenny',expected_instructions:before,instructions:after}};reviews.push(review);
   messages.push({seq:messages.length+1,sender:bot.id,kind:'approval',text:review.tool,run_id:run.id,approval:review,created:now});
   await page.goto(origin);const tray=page.locator('#request-tray'),card=tray.getByRole('region',{name:'Review instruction change',exact:true});await card.waitFor();
   assert.equal(await page.locator('#content .instruction-review:not(.compact-receipt)').count(),0,'Pending instruction review appears only in composer tray');
   assert((await card.innerText()).includes('Your one-time approval is required, including with Full access. Applies to future tasks.'));
   assert.equal(await card.getByRole('button',{name:'Allow',exact:true}).count(),1);assert.equal(await card.getByRole('button',{name:'Decline',exact:true}).count(),1);
   if(long)await card.locator('summary').filter({hasText:/^View changes$/}).click();
   await card.locator('.workflow-diff .removed').waitFor();await card.locator('.workflow-diff .added').waitFor();assert.equal(await card.locator('.workflow-diff .removed').textContent(),before);assert.equal(await card.locator('.workflow-diff .added').textContent(),after);
   await card.locator('summary').filter({hasText:/^Full instructions$/}).click();await card.locator('summary').filter({hasText:/^Current instructions$/}).click();await card.locator('summary').filter({hasText:/^Proposed instructions$/}).click();
   for(const[label,text]of [['Current instructions',before],['Proposed instructions',after]]){const full=card.locator('details').filter({has:page.locator('summary').filter({hasText:new RegExp('^'+label+'$')})}).last().locator(':scope > .chat-disclosure-body > pre');await full.waitFor();assert.equal(await full.textContent(),text);}
   await tray.screenshot({path:path.join(folder,engine+'-'+id+'-pending.png')});
   await card.getByRole('button',{name:approved?'Allow':'Decline',exact:true}).evaluate(b=>{b.click();b.click();});
   await tray.waitFor({state:'hidden'});assert.equal(review.status,approved?'approved':'denied');
   const receipt=page.locator('#content [data-receipt-key="approval:'+id+'"]');await receipt.getByText(approved?'Approved':'Denied',{exact:true}).waitFor();
   assert.equal(await receipt.locator('.compact-receipt-mark').textContent(),approved?'✓':'✗');assert.equal(await receipt.getAttribute('data-receipt-tone'),approved?'success':'denied');
   assert.equal(await receipt.getByRole('button',{name:/^(Allow|Decline)$/}).count(),0,'Terminal receipt has no decision action');
   assert.deepEqual(actions.filter(a=>a.name==='/approvals/'+id),[{name:'/approvals/'+id,body:{approved}}],'Duplicate activation dispatches one authenticated decision');
   await receipt.screenshot({path:path.join(folder,engine+'-'+id+'-receipt.png')});
  }
  assert.equal(actions.length,2);assert.deepEqual(errors,[]);console.log('Instruction approvals: tray-only, Full access warning, exact short/long diff and full text, approve/deny IDs, authenticated single dispatch, compact terminal receipts PASS');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
