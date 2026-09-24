// A background refresh must neither consume an edge scroll nor erase Retry.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 let release;
 try{
  const context=await browser.newContext({viewport:{width:1100,height:760}}),p=await context.newPage();p.setDefaultTimeout(15000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const messages=Array.from({length:200},(_,n)=>({seq:n+1,sender:n%2?'piper':'user',kind:'message',created:100+n,text:'Message '+(n+1)+'. '+('A readable paragraph for history scrolling. '.repeat(4))}));
  let hold=false,blocked=false,failOlder=false,older=0,refreshes=0;
  await context.addInitScript(token=>sessionStorage.setItem('kindred-token',token),token);
  await context.route(origin+'/api/runs',r=>r.fulfill({json:[]}));
  await context.route(/\/api\/chats\/dm-piper(?:\?.*)?$/,async r=>{
   const url=new URL(r.request().url()),before=Number(url.searchParams.get('before')||Infinity),after=Number(url.searchParams.get('after')||0),inclusive=url.searchParams.get('inclusive')==='true',limit=Number(url.searchParams.get('limit')||50);
   const pagingOlder=before<Infinity&&!after;
   if(pagingOlder){older++;if(failOlder){failOlder=false;return r.fulfill({status:503,json:{error:'Fixture older page failure'}});}}
   else{refreshes++;if(hold){hold=false;blocked=true;await new Promise(resolve=>release=resolve);}}
   let rows=messages.filter(m=>(inclusive?m.seq>=after:m.seq>after)&&(inclusive?m.seq<=before:m.seq<before));rows=after?rows.slice(0,limit):rows.slice(-limit);
   await r.fulfill({json:{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages:rows,page:{has_before:rows[0]?.seq>1,has_after:rows.at(-1)?.seq<200}}});
  });
  await p.goto(origin);await p.locator('[data-message="200"]').waitFor();await p.locator('#chat-loading').waitFor({state:'hidden'});await p.evaluate(()=>document.fonts.ready);
  const area=p.locator('#content');
  const until=async check=>{const deadline=Date.now()+15000;while(!check()){assert(Date.now()<deadline,'Expected background request');await p.waitForTimeout(30);}};
  hold=true;await until(()=>blocked);
  await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});
  await p.waitForFunction(()=>document.querySelector('#content').scrollTop===100);
  // Let the scroll event be handled while the refresh remains blocked.
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const before=older;release();release=null;await until(()=>older>before);
  await p.waitForFunction(()=>Number(document.querySelector('#content [data-message]').dataset.message)<151);
  await p.locator('.jump-latest').click();await p.locator('[data-message="200"]').waitFor();
  await p.waitForFunction(()=>{const n=document.querySelector('#content');return n.scrollHeight-n.scrollTop-n.clientHeight<3;});
  failOlder=true;await area.evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-100}));n.scrollTop=100;});
  const retry=p.getByRole('button',{name:'Could not load messages · Retry',exact:true});await retry.waitFor();
  const refreshCount=refreshes;await until(()=>refreshes>refreshCount);await p.waitForTimeout(200);
  assert(await retry.isVisible(),'Background refresh erased Retry');const failedFirst=await area.locator('[data-message]').first().getAttribute('data-message');
  await retry.click();await p.waitForFunction(first=>Number(document.querySelector('#content [data-message]').dataset.message)<Number(first),failedFirst);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',queuedEdgeScroll:true,retrySurvivesRefresh:true,retryLoadsPage:true}));
 }finally{release?.();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
