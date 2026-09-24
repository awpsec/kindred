const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'edge';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:800}}),p=await context.newPage(),errors=[],requests=[];
  p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const until=async check=>{const deadline=Date.now()+12000;while(!check()){assert(Date.now()<deadline,'Expected fixture request did not arrive');await p.waitForTimeout(10);}};
  const bots=['Piper','Izabella','Juniper','Rowan'].map((name,i)=>({id:name.toLowerCase(),name,provider:'codex',profile:{shape:i?'capsule':'cloud',color:i?'#ff9638':'#2475ff'}})),chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
  const now=Math.floor(Date.now()/1000),history=new Map(chats.map((c,i)=>[c.id,Array.from({length:i===1?100:i===2?1:20},(_,j)=>({seq:j+1,sender:c.members[0],kind:'message',text:`${c.name} message ${j+1}. `+'Enough context to read and scroll. '.repeat(4),created:now+j}))]));
  Object.assign(history.get('dm-izabella')[98],{kind:'result',run_id:'old-result'});
  let releaseOlder,releaseDetail,olderStarted=false,detailStarted=false,unread=true,delayCached=0,failRowan=true,releaseRowan;
  const olderGate=new Promise(r=>releaseOlder=r),detailGate=new Promise(r=>releaseDetail=r);
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/attention')return send({bots:{},chats:unread?{'dm-izabella':{unread:true,cursor:100,read_cursor:99,first_unread_seq:100,latest_message_seq:100}}:{}});
   if(name.endsWith('/read')){unread=false;return send({cursor:100,read_cursor:100});}
   if(name==='/runs/old-result'){detailStarted=true;await detailGate;return send({run:{id:'old-result',bot_id:'izabella',chat_id:'dm-izabella',status:'completed',created:now+98,output:'Historical result'},events:[],attachments:[]});}
   if(name.startsWith('/chats/')){
    const id=name.slice(7),all=history.get(id);if(!all)return route.continue();
    const before=Number(u.searchParams.get('before')||Infinity),after=Number(u.searchParams.get('after')||-1),limit=Number(u.searchParams.get('limit')||50),inclusive=u.searchParams.get('inclusive')==='true';requests.push({id,before,after,limit});
    if(id==='dm-rowan'){if(failRowan)return route.fulfill({status:503,json:{error:'History temporarily unavailable'}});if(releaseRowan===null)await new Promise(r=>releaseRowan=r);}
    if(id==='dm-izabella'&&before===100){olderStarted=true;await olderGate;}
    if(id==='dm-izabella'&&delayCached)await new Promise(r=>setTimeout(r,delayCached));
    let rows=all.filter(m=>(inclusive?m.seq>=after:m.seq>after)&&m.seq<before);rows=after>=0?rows.slice(0,limit):rows.slice(-limit);
    return send({chat:chats.find(c=>c.id===id),messages:rows,page:{has_before:!!rows.length&&rows[0].seq>1,has_after:!!rows.length&&rows.at(-1).seq<all.at(-1).seq}});
   }
   return route.continue();
  });
  await p.goto(origin);const area=p.locator('#content'),loading=p.locator('#chat-loading'),open=name=>p.locator('#bots').getByRole('button',{name,exact:true}).click();
  await area.locator('[data-message="20"]').waitFor();await loading.waitFor({state:'detached'});
  await open('Izabella');await loading.waitFor();await p.waitForFunction(()=>document.querySelector('#chat-loading')?.textContent==='Loading conversation…');
  await until(()=>olderStarted);
  assert.equal(await area.getAttribute('aria-busy'),'true');assert(await area.evaluate(n=>n.inert));assert.equal(await area.evaluate(n=>getComputedStyle(n).visibility),'hidden');assert.equal(await loading.locator('.character').count(),1);
  assert.equal(await loading.locator('.character').evaluate(n=>getComputedStyle(n).animationName),'chat-loading-bob');
  const out=path.resolve(__dirname,'../../test-results/chat-opening');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-loading.png')});
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await loading.locator('.character').evaluate(n=>getComputedStyle(n).animationName),'none');await p.emulateMedia({reducedMotion:'no-preference'});
  await p.evaluate(()=>document.documentElement.dataset.motion='off');assert.equal(await loading.locator('.character').evaluate(n=>getComputedStyle(n).animationName),'none');await p.evaluate(()=>document.documentElement.dataset.motion='on');
  releaseOlder();await until(()=>detailStarted);assert(await loading.isVisible(),'Keep the loader while historical run details are still needed');assert.equal(await area.evaluate(n=>getComputedStyle(n).visibility),'hidden');
  releaseDetail();await loading.waitFor({state:'detached'});assert.equal(await area.locator('[data-message]').count(),50);assert.equal(await area.getAttribute('aria-busy'),null);assert(!(await area.evaluate(n=>n.inert)));
  assert(requests.some(r=>r.id==='dm-izabella'&&r.before===100&&r.limit===49),'Fetch preceding context before revealing the newest unread message');
  const ready=await area.evaluate(n=>({top:n.scrollTop,height:n.scrollHeight,client:n.clientHeight}));assert(ready.height>ready.client);assert(ready.top>0,'Opening unread position was restored');
  await area.hover();await p.mouse.wheel(0,-150);await p.waitForTimeout(150);const scrolled=await area.evaluate(n=>n.scrollTop);assert(scrolled<ready.top,'Scrolling works as soon as the loader leaves');await p.waitForTimeout(250);assert(Math.abs(await area.evaluate(n=>n.scrollTop)-scrolled)<2);
  await open('Piper');await loading.waitFor({state:'detached'});delayCached=700;await open('Izabella');await area.locator('[data-message="100"]').waitFor({timeout:500});assert.equal(await loading.count(),0,'A ready cached chat opens immediately');assert(Math.abs(await area.evaluate(n=>n.scrollTop)-scrolled)<3);delayCached=0;await p.waitForTimeout(850);
  await open('Juniper');await loading.waitFor({state:'detached'});await area.getByText(/^Juniper message/).waitFor();assert.equal(await area.locator('[data-message]').count(),1,'A genuinely one-message chat is ready without extra requests');
  await open('Rowan');await loading.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(await area.getAttribute('aria-busy'),'false');assert(await loading.getByText('Could not load conversation.',{exact:true}).isVisible());
  failRowan=false;releaseRowan=null;await loading.getByRole('button',{name:'Retry',exact:true}).click();await until(()=>releaseRowan);assert(await loading.isVisible());
  await open('Piper');await loading.waitFor({state:'detached'});await area.getByText(/^Piper message/).first().waitFor();releaseRowan();await p.waitForTimeout(250);assert.equal(await loading.count(),0);assert.equal(await p.locator('#heading').innerText(),'Piper');assert.equal(await area.getByText(/^Rowan message/).count(),0,'A late response cannot replace the newly selected conversation');
  await open('Rowan');await loading.waitFor({state:'detached'});await area.getByText(/^Rowan message/).first().waitFor();
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,loadingUntilContextAndDetails:true,scrollReadyBeforeReveal:true,cachedImmediate:true,realSingleMessage:true,retry:true,lateResponseIgnored:true,reducedMotion:true}));await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
