const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);
  const errors=[],requests=[],details=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=Array.from({length:7},(_,i)=>({id:i?'bot-'+i:'piper',name:i?'Teammate '+i:'Piper',provider:'codex',model:'test',memory:'',instructions:'Fixture',profile:{shape:'pebble',color:'#2475ff',pinned:false}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
  const history=new Map(chats.map((c,i)=>[c.id,Array.from({length:i?20:1000},(_,n)=>({seq:i*10000+n+1,sender:n%2?bots[i].id:'user',kind:'message',text:`${bots[i].name} message ${n+1}. `+'History with enough detail to wrap naturally. '.repeat(5),created:now+n}))]));
  for(const m of history.get('dm-piper'))if(m.seq>=600&&m.seq<=950&&m.seq%25===0){m.kind='result';m.run_id='historical-'+m.seq;m.sender='piper';}
  let delay=0,failOlder=false;
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);
   if(name.startsWith('/runs/')){details.push(name);const id=name.slice(6);assert(id.startsWith('historical-'));return send({run:{id,bot_id:'piper',chat_id:'dm-piper',status:'completed',created:now,output:'Historical result'},events:[{kind:'tool_requested',body:{tool:'fixture_tool',args:{}}}],attachments:[]});}
   if(name==='/activity')return send({});
   if(/^\/bots\/[^/]+\/pin$/.test(name)){const b=bots.find(b=>name.includes('/'+b.id+'/'));b.profile.pinned=req.postDataJSON().pinned;return send(b);}
   if(name.startsWith('/chats/')){
    const id=name.slice(7),all=history.get(id);assert(all,'Known chat');
    const before=u.searchParams.has('before')?Number(u.searchParams.get('before')):Infinity,after=u.searchParams.has('after')?Number(u.searchParams.get('after')):-1,limit=Number(u.searchParams.get('limit')||50);
    requests.push({id,before,after,limit});assert(limit>0&&limit<=150);
    if(failOlder&&before<Infinity&&after===-1){failOlder=false;return route.fulfill({status:503,json:{error:'Temporary history failure'}});}
    if(delay)await new Promise(r=>setTimeout(r,delay));
    const inclusive=u.searchParams.get('inclusive')==='true';
    let rows=all.filter(m=>inclusive?m.seq<=before&&m.seq>=after:m.seq<before&&m.seq>after);rows=after>=0?rows.slice(0,limit):rows.slice(-limit);
    return send({chat:chats.find(c=>c.id===id),messages:rows,page:{has_before:!!rows.length&&all[0].seq<rows[0].seq,has_after:!!rows.length&&all.at(-1).seq>rows.at(-1).seq,first:rows[0]?.seq,last:rows.at(-1)?.seq}});
   }
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const area=p.locator('#content'),first=()=>area.locator('[data-message]').first().getAttribute('data-message'),last=()=>area.locator('[data-message]').last().getAttribute('data-message');
  await area.locator('[data-message="1000"]').waitFor();await p.locator('#chat-loading').waitFor({state:'hidden'});await p.evaluate(()=>document.fonts.ready);assert.equal(await area.locator('[data-message]').count(),50);assert.equal(await first(),'951');
  const anchor=()=>area.evaluate(n=>{const top=n.getBoundingClientRect().top,m=[...n.querySelectorAll('[data-message]')].find(m=>m.getBoundingClientRect().bottom>top+1);return {seq:m.dataset.message,y:m.getBoundingClientRect().top-top};});
  // Prepending must keep the same visible message, even as pages leave the opposite end.
  delay=120;
  for(let step=0;step<7;step++){
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const oldFirst=Number(await first());await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});const before=await anchor();
   await p.waitForFunction(old=>Number(document.querySelector('#content [data-message]').dataset.message)<old,oldFirst);
   await p.waitForTimeout(120);const after=await anchor();
   const anchoredY=await area.locator('[data-message="'+before.seq+'"]').evaluate(n=>n.getBoundingClientRect().top-document.querySelector('#content').getBoundingClientRect().top);
   assert(Math.abs(anchoredY-before.y)<3,JSON.stringify({before,after,anchoredY}));
   assert((await area.locator('[data-message]').count())<=150);
  }
  delay=0;
  assert(Number(await first())<700,'Read beyond the former latest-300 cutoff');assert(Number(await last())<1000,'Newer offscreen rows are unloaded');
  await area.evaluate(n=>n.scrollTop=900);await p.waitForTimeout(150);const saved=await anchor();
  await p.locator('#bots').getByRole('button',{name:'Teammate 1',exact:true}).click();await area.locator('[data-message="10020"]').waitFor();
  delay=800;
  // Cached content is drawn before a deliberately delayed network refresh returns.
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click({noWaitAfter:true});
  await area.locator('[data-message="'+saved.seq+'"]').waitFor({timeout:500});assert.equal(await p.locator('.chat-loading').count(),0);
  const restored=await anchor();assert.equal(restored.seq,saved.seq);assert(Math.abs(restored.y-saved.y)<3,JSON.stringify({saved,restored}));
  delay=0;await p.waitForTimeout(1100);
  const beforeArrival=await anchor();history.get('dm-piper').push({seq:1001,sender:'piper',kind:'message',text:'New message while reading',created:now+1001});
  await p.waitForTimeout(1900);const afterArrival=await anchor();assert.equal(afterArrival.seq,beforeArrival.seq);assert(Math.abs(afterArrival.y-beforeArrival.y)<3);
  await p.locator('.jump-latest').click();await area.locator('[data-message="1001"]').waitFor();assert.equal(await last(),'1001');
  await p.waitForFunction(()=>{const n=document.querySelector('#content');return n.scrollHeight-n.scrollTop-n.clientHeight<3;});
  // A failed older page leaves visible content intact and has an explicit retry.
  failOlder=true;await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});await p.getByRole('button',{name:'Could not load messages · Retry',exact:true}).waitFor();
  const failedFirst=Number(await first());await p.getByRole('button',{name:'Could not load messages · Retry',exact:true}).click();await p.waitForFunction(old=>Number(document.querySelector('#content [data-message]').dataset.message)<old,failedFirst);
  // Forward paging reloads offloaded newer rows without duplicates.
  const oldLast=Number(await last());await area.evaluate(n=>n.scrollTop=n.scrollHeight);await p.waitForFunction(old=>Number([...document.querySelectorAll('#content [data-message]')].at(-1).dataset.message)>old,oldLast);
  const ids=await area.locator('[data-message]').evaluateAll(nodes=>nodes.map(n=>n.dataset.message));assert.equal(new Set(ids).size,ids.length);assert(ids.length<=150);
  // Seven visited chats evict the oldest from the six-chat cache.
  for(let i=1;i<=6;i++){await p.locator('#bots').getByRole('button',{name:'Teammate '+i,exact:true}).click();await area.locator('[data-message="'+(i*10000+20)+'"]').waitFor();}
  const since=requests.length;await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await area.locator('[data-message="1001"]').waitFor();
  assert(requests.slice(since).some(r=>r.id==='dm-piper'&&r.limit===50&&r.before===Infinity&&r.after===-1));
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).hover();await p.screenshot({path:path.join(artifacts,engine+'-chat-history-pin.png')});
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(250);
  const mobileFirst=Number(await first());await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});
  await p.waitForFunction(old=>Number(document.querySelector('#content [data-message]').dataset.message)<old,mobileFirst);
  assert((await area.locator('[data-message]').count())<=150);
  await p.screenshot({path:path.join(artifacts,engine+'-chat-history-mobile.png')});
  assert(details.length>0&&new Set(details).size<20,'Only visible historical run details are requested');assert.deepEqual(errors,[]);
  await context.close();console.log(JSON.stringify({passed:true,engine,pagingBeyond300:true,boundedWindow:true,cachedPosition:true,offloadAndReload:true,retry:true,requests:requests.length}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
