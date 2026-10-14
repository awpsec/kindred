const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1100,height:900},hasTouch:mobile});
   const errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
   const chat={id:'dm-piper',name:'Piper',members:['piper']},now=Math.floor(Date.now()/1000);
   const active={id:'active',chat_id:chat.id,bot_id:'piper',status:'awaiting_approval',created:now-100,prompt:'Update instructions',output:'',error:'',depth:0};
   const queued={...active,id:'queued',status:'queued',created:now,prompt:'Wait, change that plan.',push_target_run_id:active.id};
   const other={...queued,id:'other-chat',chat_id:'team-test'};
   const review={id:'review',run_id:active.id,tool:'bot_instructions_update',message_seq:2,status:'pending',args:{bot_id:'jenny',bot_name:'Jenny',expected_instructions:'Review invoices.',instructions:'Review all invoices.'}};
   let eligible=true,fail=true,release;
   await page.route(origin+'/api/**',async route=>{
    const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
    if(name==='/chats')return send([chat]);
    if(name==='/runs')return send([active,{...queued,push_target_run_id:eligible?active.id:null},other]);
    if(name==='/approvals')return send(review.status==='pending'?[review]:[]);
    if(name==='/questions')return send([]);
    if(name==='/chats/'+chat.id)return send({chat,messages:[{seq:1,sender:'user',kind:'message',text:active.prompt,created:now-100},{seq:2,sender:'piper',kind:'approval',text:review.tool,run_id:active.id,approval:review,created:now-20},{seq:3,sender:'user',kind:'message',text:queued.prompt,created:now,delivery:[{run_id:queued.id,bot_id:'piper',status:'queued'}]}]});
    if(name==='/chats/'+chat.id+'/push'){
     assert.equal(req.method(),'POST');assert.equal(req.headers().authorization,'Bearer '+token);
     assert.deepEqual(req.postDataJSON(),{run_ids:['queued']});posts.push(name);
     await new Promise(r=>release=r);
     if(fail)return route.fulfill({status:409,json:{error:'Task changed. Try again.'}});
     eligible=false;review.status='cancelled';active.status='running';return send({requested_count:1});
    }
    if(name.startsWith('/runs/'))return send({run:active,events:[],attachments:[],approvals:[review]});
    if(name.startsWith('/approvals/'))throw Error('Push must not submit an approval decision');
    return route.fallback();
   });
   await page.goto(origin);
   const row=page.locator('#queue-status'),tray=page.locator('#request-tray'),push=row.getByRole('button',{name:'Push queued messages now'});
   await push.waitFor();await tray.waitFor();
   async function checkLayout(){
    await push.waitFor();
    const {r,t,b,label}=await page.evaluate(()=>{
     const row=document.querySelector('#queue-status'),rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
     return{r:rect(row),t:rect(document.querySelector('#request-tray')),b:rect(row.querySelector('.queue-push')),label:rect(row.firstElementChild)};
    });
    assert(r.y+r.height<=t.y+1,'Queue row precedes the request tray');
    assert(b.x>label.x+label.width,'Push sits to the right of the queue label');
    assert(Math.abs(b.x+b.width-(r.x+r.width))<4,'Push aligns to the right edge');
   }
   await checkLayout();
   await tray.getByRole('button',{name:/Minimize/}).click();await page.waitForTimeout(300);await checkLayout();
   await tray.locator('.request-tray-expand').click();await page.waitForTimeout(300);await checkLayout();
   await page.locator('#prompt').fill('Keep this unsent draft.');
   const output=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-queue-push';fs.mkdirSync(output,{recursive:true});
   await page.locator('#composer-area').screenshot({path:output+'/'+(process.env.WEBKIT?'webkit':'chromium')+(mobile?'-mobile':'-desktop')+'.png'});
   await push.evaluate(b=>{b.click();b.click();});await page.waitForFunction(()=>document.querySelector('.queue-push')?.disabled);
   assert.equal(posts.length,1,'Duplicate click dispatches only once');release();
   await page.waitForFunction(()=>document.querySelector('.queue-push')&&!document.querySelector('.queue-push').disabled);
   assert.equal(await page.locator('#prompt').innerText(),'Keep this unsent draft.');assert.equal(review.status,'pending','Failed push does not remove approval');
   fail=false;await push.click();await page.waitForFunction(()=>document.querySelector('.queue-push')?.disabled);release();
   await tray.waitFor({state:'hidden'});await push.waitFor({state:'detached'});
   await page.locator('#content [data-receipt-key="approval:review"]').getByText('Cancelled',{exact:true}).waitFor();
   assert.equal(await page.locator('#prompt').innerText(),'Keep this unsent draft.');assert.equal(posts.length,2);
   const cancelled=await page.evaluate(async()=>{
    const {connectorCard}=await import('/connector-cards.js');
    const controls={heading:()=>document.createElement('span'),button:(text,action,cls)=>{const b=document.createElement('button');b.textContent=text;b.className=cls;b.onclick=action;return b;},api:()=>{throw Error('Cancelled receipt cannot dispatch');},onChange:()=>{},onDiscuss:()=>{},botName:'Piper'};
    return [false,true].map(email=>{
     const card=connectorCard({id:'cancelled-'+email,status:'cancelled',approval_id:'approval-'+email,kind:email?'email':'records',tool:'test_action',title:'Review',connection:'Test',email_send:email,email:email?{to:{text:'test@example.invalid'},subject:{text:'Draft'},body:{text:'Unsent draft'}}:undefined},controls);
     return {label:card.querySelector('.connector-card-status').textContent,buttons:[...card.querySelectorAll('button')].map(b=>b.textContent),terminal:!!card.dataset.decisionReceipt};
    });
   });
   assert.equal(cancelled[0].label,'Cancelled');assert(cancelled[0].terminal);
   assert.equal(cancelled[1].label,'Cancelled · Not sent');
   assert(cancelled.every(c=>c.buttons.every(b=>! /^(Allow|Approve|Send email|Edit draft)/.test(b))),'Cancelled connector requests cannot approve, edit or send');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Queue Push: desktop/mobile layout, collapsed/expanded trays, scoped authenticated dispatch, duplicate guard, failure retry, draft preservation and cancelled receipt PASS');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
