const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000),bots=['piper','helper'].map((id,i)=>({id,name:i?'Rowan':'Piper',provider:'codex',model:'test',memory:'',instructions:'Fixture',profile:{shape:i?'pill':'round',color:'#ff9638'}}));
  const chat={id:'team',name:'Team',members:bots.map(b=>b.id),pinned:true,archived:false};
  const messages=Array.from({length:40},(_,i)=>({seq:i+1,sender:i%2?'piper':'user',kind:'message',text:`Message ${i+1}. `+'A useful conversation with enough history to scroll. '.repeat(4),created:now-1000+i}));
  const runs=bots.map((b,i)=>({id:'work-'+i,bot_id:b.id,chat_id:'team',status:'running',prompt:'Review the project',output:'',error:'',created:now-30,depth:0}));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send([...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),chat]);if(name==='/runs')return send(runs);if(name==='/activity')return send({});
   if(name.startsWith('/runs/'))return send({run:runs.find(r=>r.id===name.slice(6)),events:[],attachments:[]});
   if(name==='/chats/team/messages'){messages.push({seq:messages.length+1,sender:'user',kind:'message',text:req.postDataJSON().prompt,created:now});return send({runs:[]});}
   if(name.startsWith('/chats/dm-'))return send({chat:{id:name.slice(7),members:[name.slice(10)]},messages:[],page:{has_before:false,has_after:false}});
   if(name==='/chats/team')return send({chat,messages,page:{has_before:false,has_after:false},pending_waits:[{run_id:'helper-task',parent_run_id:'work-0',bot_id:'helper',requester_bot_id:'piper',chat_id:'team'}]});
   return route.continue();
  });
  await p.goto(origin);await p.locator('[data-sidebar-id="team"]').first().click();await p.locator('.collaboration-wait-row').waitFor();await p.locator('.group-activity').waitFor();await p.waitForTimeout(400);
  const sample=text=>p.evaluate(async text=>{
   const area=document.querySelector('#content'),editor=document.querySelector('#prompt');
   const read=()=>({y:area.lastElementChild.getBoundingClientRect().bottom,padding:parseFloat(getComputedStyle(area).paddingBottom),top:area.scrollTop,gap:area.scrollHeight-area.scrollTop-area.clientHeight,composer:document.querySelector('#composer-area').getBoundingClientRect().top});
   const frames=[read()];editor.focus({preventScroll:true});editor.value=text;editor.dispatchEvent(new Event('input',{bubbles:true}));frames.push(read());
   const start=performance.now();while(performance.now()-start<450){await new Promise(requestAnimationFrame);frames.push(read());}return frames;
  },text);
  function smooth(frames,direction){
   const start=frames[0].y,end=frames.at(-1).y;assert((end-start)*direction>40,JSON.stringify({start,end}));
   assert(Math.abs(frames[1].y-start)<2,'No immediate jump');
   assert(frames.some(f=>f.y>Math.min(start,end)+5&&f.y<Math.max(start,end)-5),'Intermediate positions '+JSON.stringify(frames));
   for(let i=2;i<frames.length;i++)assert((frames[i].y-frames[i-1].y)*direction>=-2,'Monotonic movement');
   assert(frames.at(-1).gap<3,'Keep following latest');assert(frames.at(-1).y<=frames.at(-1).composer-5,'Wait row clears composer');
  }
  const draft='First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line';
  smooth(await sample(draft),-1);smooth(await sample(''),1);
  // Both working bots and the collaboration wait stay above a tall draft.
  await sample(draft);assert(await p.locator('.group-activity').evaluate(n=>n.getBoundingClientRect().bottom<document.querySelector('#composer-area').getBoundingClientRect().top));
  await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');await p.waitForTimeout(350);
  assert(await p.locator('#content').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<3));assert.equal(messages.at(-1).text,draft);
  // Reading older messages must not be displaced by editing a draft.
  await p.locator('#content').evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-400}));n.scrollTop-=600;});await p.waitForTimeout(100);
  const anchor=await p.locator('#content').evaluate(n=>{const top=n.getBoundingClientRect().top,row=[...n.children].find(c=>c.dataset.message&&c.getBoundingClientRect().bottom>top);return {id:row.dataset.message,y:row.getBoundingClientRect().top};});
  await sample(draft);await sample('');const y=await p.locator('[data-message="'+anchor.id+'"]').evaluate(n=>n.getBoundingClientRect().top);assert(Math.abs(y-anchor.y)<2);assert(await p.locator('.jump-latest').isVisible());
  await p.locator('.jump-latest').click();await p.waitForTimeout(200);
  // Retarget from the current spacing when content changes again mid-animation.
  await p.evaluate(async()=>{const n=document.querySelector('#prompt');for(const text of ['a\nb\nc\nd','a\nb','a\nb\nc\nd\ne\nf','']){n.value=text;n.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,35));}});await p.waitForTimeout(350);
  assert(await p.locator('#content').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight<3));
  await p.emulateMedia({reducedMotion:'reduce'});const reduced=await sample(draft);assert(reduced.every(f=>Math.abs(f.padding-reduced[0].padding)<1||Math.abs(f.padding-reduced.at(-1).padding)<1),'Reduced motion has no intermediate spacing');
  await p.setViewportSize({width:390,height:700});await sample('');await sample(draft);assert(await p.locator('.collaboration-wait-row').evaluate(n=>n.getBoundingClientRect().bottom<=document.querySelector('#composer-area').getBoundingClientRect().top));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',growthAndClear:true,send:true,workingAndWaiting:true,historyAnchor:true,rapidEdits:true,reducedMotion:true,mobile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
