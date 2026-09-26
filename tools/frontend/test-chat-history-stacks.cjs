const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
const artifactMode=!!process.env.ARTIFACT_STACK,summary=artifactMode?'.artifact-update-stack > summary':'.connector-stack-summary';
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=Array.from({length:1},(_,i)=>({id:i?'bot-'+i:'piper',name:i?'Teammate '+i:'Piper',provider:'codex',model:'test',memory:'',instructions:'Fixture',profile:{shape:'pebble',color:'#2475ff',pinned:false}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
  const history=new Map(chats.map((c,i)=>[c.id,Array.from({length:i?20:1000},(_,n)=>({seq:i*10000+n+1,sender:n%2?bots[i].id:'user',kind:'message',text:`${bots[i].name} message ${n+1}. `+'History with enough detail to wrap naturally. '.repeat(5),created:now+n}))]));
  for(const m of history.get('dm-piper'))if(m.seq>=921&&m.seq<=970){m.kind='connector_artifact';m.sender='piper';m.text='Connector receipt';m.connector_artifact={id:'call-'+m.seq,connection:'gmail',connector:'gmail',tool:'search_threads',status:'completed',bot_id:'piper',input:{query:'fixture'}};}
  if(artifactMode)for(const m of history.get('dm-piper'))if(m.connector_artifact){delete m.connector_artifact;m.kind='workspace_artifact';m.artifact_action='updated';m.workspace_artifact={id:'brief',title:'Brief',kind:'document',language:'markdown',revision:m.seq,path:'/artifacts/brief',updated:now};}
  let delay=0;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);
   if(name==='/activity')return send({});
   if(name.startsWith('/chats/')){
    const id=name.slice(7),all=history.get(id);assert(all,'Known chat');
    const before=u.searchParams.has('before')?Number(u.searchParams.get('before')):Infinity,after=u.searchParams.has('after')?Number(u.searchParams.get('after')):-1,limit=Number(u.searchParams.get('limit')||50);
    assert(limit>0&&limit<=150);
    if(delay)await new Promise(r=>setTimeout(r,delay));
    const inclusive=u.searchParams.get('inclusive')==='true';
    let rows=all.filter(m=>inclusive?m.seq<=before&&m.seq>=after:m.seq<before&&m.seq>after);rows=after>=0?rows.slice(0,limit):rows.slice(-limit);
    return send({chat:chats.find(c=>c.id===id),messages:rows,page:{has_before:!!rows.length&&all[0].seq<rows[0].seq,has_after:!!rows.length&&all.at(-1).seq>rows.at(-1).seq,first:rows[0]?.seq,last:rows.at(-1)?.seq}});
   }
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const area=p.locator('#content'),first=()=>area.locator('[data-message]').first().getAttribute('data-message');
  await area.locator('[data-message="1000"]').waitFor();assert.equal(await first(),'951');
  const anchor=()=>area.evaluate(n=>{const top=n.getBoundingClientRect().top,m=[...n.querySelectorAll('[data-message]')].find(m=>m.getBoundingClientRect().bottom>top+1);return {seq:m.dataset.message,y:m.getBoundingClientRect().top-top};});
  // Loading earlier receipts changes a stack's first message, but must not move its summary.
  delay=200;
  await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=20;});
  const before=await area.locator(summary).first().evaluate(n=>n.getBoundingClientRect().top);
  await p.waitForFunction(()=>document.querySelector('#content > [data-message]').dataset.message==='901');
  await p.waitForTimeout(200);
  const after=await area.locator(summary).first().evaluate(n=>n.getBoundingClientRect().top);
  assert(Math.abs(after-before)<3,JSON.stringify({before,after}));
  // A delayed page must preserve the *current* position, not the position at
  // request time. Exercise both wheel directions while it is in flight.
  delay=1200;
  await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});
  await p.waitForTimeout(100);
  await area.hover();await p.mouse.wheel(0,320);await p.waitForTimeout(450);
  const during=await anchor();
  await p.waitForFunction(()=>document.querySelector('#content > [data-message]').dataset.message==='851');
  await p.waitForTimeout(150);
  const settled=await anchor();assert.equal(settled.seq,during.seq);assert(Math.abs(settled.y-during.y)<3,JSON.stringify({during,settled}));
  for(const delta of [140,-100,170,-120]){
   const top=await area.evaluate(n=>n.scrollTop);await p.mouse.wheel(0,delta);await p.waitForTimeout(120);
   const next=await area.evaluate(n=>n.scrollTop);assert(delta>0?next>top:next<top,JSON.stringify({delta,top,next}));
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,artifactMode,stackAnchor:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
