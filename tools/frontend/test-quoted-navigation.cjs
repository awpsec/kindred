const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/quoted-navigation');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1180,height:820}}),errors=[],requests=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh};'}));
  const bots=['piper','other'].map(id=>({id,name:id==='piper'?'Piper':'Other',provider:'codex',memory:'',profile:{shape:'round',color:'#2475ff'}}));
  const chats=bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false}));
  const now=Math.floor(Date.now()/1000),messages=Array.from({length:300},(_,i)=>({seq:i+1,sender:i%2?'piper':'user',text:'Message '+(i+1)+'. A short piece of conversation.',kind:'message',created:now+i,reactions:[]}));
  const reply=(seq,to,author)=>({seq,sender:'user',text:'A reply to '+author,kind:'message',created:now+seq,reactions:[],reply_to:{seq:to,sender:'piper',author,text:'Quoted message '+to}});
  messages.push(reply(301,290,'Loaded original'),reply(302,2,'Old original'),reply(303,120,'Another original'));
  let gate=null,failNext=false;
  await p.route(origin+'/api/**',async route=>{
   const u=new URL(route.request().url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   const match=name.match(/^\/chats\/(dm-piper|dm-other)$/);if(!match)return route.continue();
   const id=match[1],before=Number(u.searchParams.get('before')),after=Number(u.searchParams.get('after')),inclusive=u.searchParams.get('inclusive')==='true',limit=Number(u.searchParams.get('limit')||50);
   requests.push({id,before,after,inclusive,limit});
   if(id==='dm-piper'&&before===2&&inclusive){
    if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Quote history temporarily unavailable'}});}
    if(gate){const held=gate;gate=null;held.started();await held.promise;}
   }
   const all=id==='dm-piper'?messages:[{seq:2,sender:'other',text:'Different conversation',kind:'message',created:now,reactions:[]}];
   let rows=all.filter(m=>(!before||(inclusive?m.seq<=before:m.seq<before))&&(!after||(inclusive?m.seq>=after:m.seq>after)));
   rows=after?rows.slice(0,limit):rows.slice(-limit);
   return send({chat:chats.find(c=>c.id===id),messages:rows,page:{has_before:all.some(m=>m.seq<rows[0]?.seq),has_after:all.some(m=>m.seq>rows.at(-1)?.seq)}});
  });
  const quote=name=>p.getByRole('button',{name:'View message from '+name,exact:true});
  const draft='Keep my draft while I inspect this quote.';
  const reset=async()=>{await p.goto(origin);await p.locator('[data-message="303"]').waitFor();await p.locator('#prompt').fill(draft);};
  const highlighted=async seq=>{
   await p.waitForFunction(seq=>{const n=document.querySelector('#content [data-message="'+seq+'"]'),area=document.querySelector('#content');if(!n)return false;const r=n.getBoundingClientRect(),a=area.getBoundingClientRect();return n.classList.contains('quoted-highlight')&&getComputedStyle(n.querySelector('.message-bubble')).boxShadow!=='none'&&document.activeElement===n&&r.bottom>a.top&&r.top<a.bottom;},seq);
   assert.equal(await p.locator('#prompt').innerText(),draft);
  };
  const hold=()=>{
   let release,started;const promise=new Promise(r=>release=r),began=new Promise(r=>started=r);gate={promise,started};return {release,began};
  };
  await reset();await quote('Loaded original').click();await highlighted(290);
  messages[289].reactions=[{user:true,emoji:'👀'}];
  await p.evaluate(async()=>await(await import('/app.js')).refresh(true));await highlighted(290);
  assert(await p.locator('[data-message="290"] .reaction-badge').isVisible(),'Refresh actually changed the highlighted row');
  await reset();const before=requests.length;await quote('Old original').click();await highlighted(2);
  assert(requests.slice(before).some(r=>r.after===2&&r.limit===48),'Fill the short destination page before showing it');
  assert.equal(await p.locator('#content [data-message]').count(),50);
  await p.screenshot({path:path.join(out,engine+'-old-quote.png')});
  await p.waitForFunction(()=>!document.querySelector('.quoted-highlight'));
  assert.equal(await p.locator('#content [data-message="2"]').count(),1,'Highlight expiry must retain the original');

  // A missing original does not throw the reader onto an unrelated history page.
  messages.at(-2).reply_to.seq=9999;await reset();const ids=await p.locator('#content [data-message]').evaluateAll(ns=>ns.map(n=>n.dataset.message));
  await quote('Old original').click();await p.locator('#notice.error').filter({hasText:'The original message is unavailable.'}).waitFor();
  assert.deepEqual(await p.locator('#content [data-message]').evaluateAll(ns=>ns.map(n=>n.dataset.message)),ids);assert.equal(await p.locator('#prompt').innerText(),draft);messages.at(-2).reply_to.seq=2;
  await reset();failNext=true;await quote('Old original').click();await p.locator('#notice.error').filter({hasText:'Quote history temporarily unavailable'}).waitFor();
  assert(await p.locator('[data-message="303"]').isVisible());await quote('Old original').click();await highlighted(2);

  // A loaded quote supersedes an older in-flight jump without waiting for it.
  await reset();let held=hold();await quote('Old original').click();await held.began;await quote('Loaded original').click();await highlighted(290);held.release();
  await p.waitForFunction(()=>!document.querySelector('[aria-label="View message from Old original"]')?.disabled);
  assert.equal(await p.locator('[data-message="2"]').count(),0);assert.equal(await p.locator('[data-message="290"]').count(),1);

  // Leaving and returning while the request is outstanding must also invalidate it.
  await reset();held=hold();await quote('Old original').click();await held.began;
  await p.locator('#bots').getByRole('button',{name:'Other',exact:true}).click();await p.getByText('Different conversation',{exact:true}).waitFor();
  assert.equal(await p.locator('.quoted-highlight').count(),0);
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();held.release();await p.locator('[data-message="303"]').waitFor();
  assert.equal(await p.locator('[data-message="2"]').count(),0);assert.equal(await p.locator('#prompt').innerText(),draft);

  // Two unloaded quotes resolve in the user's latest order, not request order.
  await reset();held=hold();await quote('Old original').click();await held.began;await quote('Another original').click();held.release();await highlighted(120);
  assert.equal(await p.locator('[data-message="2"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,loadedQuote:true,highlightSurvivesRefresh:true,oldQuote:true,filledShortPage:true,highlightExpires:true,missingOriginalPreservesView:true,failedRequestRetry:true,latestQuoteWins:true,chatSwitchInvalidates:true,draftRetained:true,errors}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
