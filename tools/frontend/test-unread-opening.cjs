const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:800}}),errors=[],reads=[];
  p.on('pageerror',e=>errors.push(e.message));
  const bots=['Piper','Atlas'].map(name=>({id:name.toLowerCase(),name,provider:'codex',profile:{label:'Tester',shape:'cloud',color:'#2475ff'}}));
  let cursor=180,read=20,first=21,delay=0;
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.openingFrames=[];const sample=()=>{const divider=document.querySelector('.unread-divider'),area=document.querySelector('#content');if(divider&&getComputedStyle(area).visibility!=='hidden'&&window.openingFrames.length<1000){const next=[...area.children].slice([...area.children].indexOf(divider)+1).find(n=>n.dataset.message);window.openingFrames.push({seq:next?.dataset.message,top:divider.getBoundingClientRect().top-area.getBoundingClientRect().top});}requestAnimationFrame(sample);};requestAnimationFrame(sample);},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,refresh};'}));
  await p.route(origin+'/api/**',async route=>{
   const u=new URL(route.request().url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);
   if(name==='/chats')return send(bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id]})));
   if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/attention')return send({bots:{},chats:{'dm-piper':{unread:cursor>read,cursor,read_cursor:read,first_unread_seq:first,latest_message_seq:cursor}}});
   if(name.endsWith('/read')){reads.push(name);return send({cursor,read_cursor:cursor});}
   if(name.startsWith('/chats/')){
    const id=name.slice(7),all=Array.from({length:id==='dm-piper'?cursor:2},(_,i)=>({seq:i+1,sender:id.slice(3),kind:'message',text:`Message ${i+1}. `+'A long new message to read in order. '.repeat(15),created:1700000000+i}));
    const before=Number(u.searchParams.get('before')||Infinity),after=Number(u.searchParams.get('after')||-1),inclusive=u.searchParams.get('inclusive')==='true',limit=Number(u.searchParams.get('limit')||50);
    let rows=all.filter(m=>m.seq<before&&(inclusive?m.seq>=after:m.seq>after));rows=after>=0?rows.slice(0,limit):rows.slice(-limit);
    if(delay)await new Promise(r=>setTimeout(r,delay));
    return send({chat:{id,members:[id.slice(3)]},messages:rows,page:{has_before:rows[0]?.seq>1,has_after:rows.at(-1)?.seq<all.length}});
   }
   return route.continue();
  });
  const check=async seq=>{
   await p.locator(`#content>[data-message="${seq}"]`).waitFor();await p.locator('#chat-loading').waitFor({state:'detached'});
   await p.waitForFunction(seq=>{const n=document.querySelector('.unread-divider');return n&&[...n.parentElement.children].slice([...n.parentElement.children].indexOf(n)+1).find(n=>n.dataset.message)?.dataset.message===String(seq);},seq);
   await p.waitForTimeout(150);
   const result=await p.locator('.unread-divider').evaluate(n=>({top:n.getBoundingClientRect().top-document.querySelector('#content').getBoundingClientRect().top,next:[...n.parentElement.children].slice([...n.parentElement.children].indexOf(n)+1).find(n=>n.dataset.message)?.dataset.message}));
   assert.equal(result.next,String(seq));assert(Math.abs(result.top-20)<2,JSON.stringify(result));
   assert.equal(reads.length,0,'Opening the first page of unread messages must not mark the backlog read');
  };
  await p.goto(origin);await check(21);
  await p.evaluate(async()=>window.fixture=await import('/app.js'));
  const top=await p.locator('#content').evaluate(n=>n.scrollTop);cursor=190;
  await p.evaluate(()=>fixture.refresh(true));assert(Math.abs(await p.locator('#content').evaluate(n=>n.scrollTop)-top)<2,'Background activity must not move the reader');
  await p.locator('#bots').getByRole('button',{name:'Atlas',exact:true}).click();
  cursor=260;read=180;first=181;delay=200;
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await check(181);
  // Servers without a first-unread hint must page forward from the read cursor.
  await p.locator('#bots').getByRole('button',{name:'Atlas',exact:true}).click();cursor=340;read=260;first=undefined;
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await check(261);
  await p.locator('#bots').getByRole('button',{name:'Atlas',exact:true}).click();read=280;
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await check(281);
  const frames=await p.evaluate(()=>window.openingFrames);assert(frames.length>0);assert(frames.every(f=>Math.abs(f.top-20)<2),'Unread opening moved between visible frames: '+JSON.stringify(frames.filter(f=>Math.abs(f.top-20)>=2).slice(0,5)));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',startupUnread:true,freshVisitCursor:true,longBacklog:true,missingHint:true,stableReader:true}));
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
