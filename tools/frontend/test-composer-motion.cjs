const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':process.env.KINDRED_TEST_BROWSER==='edge'?'edge':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:!process.env.KINDRED_HEADED}:{headless:!process.env.KINDRED_HEADED,...(engine==='edge'?{channel:'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:900}}),p=await context.newPage(),errors=[],sent=[],reacted=[];p.setDefaultTimeout(16000);p.on('pageerror',e=>errors.push(e.message));
  const bots=['Piper','Izabella'].map((name,i)=>({id:'b'+i,name,memory:'',provider:'codex',profile:{shape:i?'capsule':'cloud',color:i?'#ff9638':'#2475ff'}}));
  const chat={id:'pair',name:'Piper, Izabella',members:['b0','b1'],pinned:true,archived:false},chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),chat];
  let settings={name:'CZ',theme:'dark',reduced_motion:false,approval_mode:'auto'},failSend=false;
  const now=Math.floor(Date.now()/1000),messages=[['b0','Good. Empty of real mail is the right first pass.'],['b1',"Thanks. I’ll ping the room if something real lands."],['user','Keep me posted.']].map(([sender,text],i)=>({seq:i+1,sender,text,kind:'message',created:now+i,reactions:[]}));
  await context.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.fixtureCopied=text;}}});},token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),name=url.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/settings')return send(settings);if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(name==='/uploads')return send({id:'file-1',name:'notes.txt'});if(name==='/uploads/file-1')return send({ok:true});
   let match=name.match(/^\/chats\/([^/]+)\/messages\/(\d+)\/reaction$/);
   if(match){const body=req.postDataJSON(),m=messages.find(m=>m.seq===Number(match[2]));reacted.push({chat:match[1],seq:m.seq,...body});m.reactions=m.reactions.filter(r=>!r.user);if(body.emoji)m.reactions.push({user:true,emoji:body.emoji});return send({ok:true});}
   match=name.match(/^\/chats\/([^/]+)\/messages$/);
   if(match){const body=req.postDataJSON();if(failSend){failSend=false;return route.fulfill({status:400,json:{error:'Fixture send failed'}});}sent.push({chat:match[1],...body});const quote=messages.find(m=>m.seq===body.reply_to);messages.push({seq:Math.max(...messages.map(m=>m.seq))+1,sender:'user',text:body.prompt,kind:'message',created:now+messages.length,reactions:[],reply_to:quote?{seq:quote.seq,sender:quote.sender,author:bots.find(b=>b.id===quote.sender)?.name||'You',text:quote.text}:undefined});return send({runs:[]});}
   match=name.match(/^\/chats\/([^/]+)$/);
   if(match){const c=chats.find(c=>c.id===match[1]),all=c.id==='pair'?messages:[],before=Number(url.searchParams.get('before')),after=Number(url.searchParams.get('after')),inclusive=url.searchParams.get('inclusive')==='true',limit=Number(url.searchParams.get('limit')||50);let rows=all.filter(m=>(!before||(inclusive?m.seq<=before:m.seq<before))&&(!after||(inclusive?m.seq>=after:m.seq>after)));rows=after?rows.slice(0,limit):rows.slice(-limit);return send({chat:c,messages:rows,page:{has_before:all.some(m=>m.seq<rows[0]?.seq),has_after:all.some(m=>m.seq>rows.at(-1)?.seq)}});}
   return route.continue();
  });
  await p.goto(origin);const tile=()=>p.locator('#pinned-bots .pinned-bot[data-sidebar-id="pair"]');await tile().click();
  const first=()=>p.locator('[data-message="1"]'),second=()=>p.locator('[data-message="2"]'),prompt=p.locator('#prompt');

  await first().waitFor();
  const sample=action=>p.evaluate(async action=>{
    const form=document.querySelector('#composer'),prompt=document.querySelector('#prompt');
    const read=()=>{const f=form.getBoundingClientRect(),t=prompt.getBoundingClientRect();return {height:f.height,bottom:f.bottom,promptTop:t.top,promptLeft:t.left,moving:form.classList.contains('is-morphing')};};
    const frames=[read()];document.querySelector(action).click();frames.push(read());
    // Include the bounded cleanup fallback when a busy renderer delays onfinish.
    const start=performance.now();while(performance.now()-start<600){await new Promise(requestAnimationFrame);frames.push(read());}return frames;
  },action);
  const border=()=>p.locator('#composer').evaluate(n=>getComputedStyle(n).borderColor);
  await prompt.evaluate(n=>n.blur());await p.mouse.move(2,2);await p.waitForTimeout(240);const idle=await border();
  await p.locator('#composer').hover();await p.waitForTimeout(240);const hovered=await border();assert.notEqual(hovered,idle);
  await prompt.focus();await p.waitForTimeout(240);assert.notEqual(await border(),hovered);
  const expanding=await sample('[data-message="1"] [data-message-action="reply"]');
  assert(expanding.at(-1).height>expanding[0].height+40);
  function smooth(frames,direction){
    assert(Math.abs(frames[1].height-frames[0].height)<2,'first frame must preserve height');
    assert(Math.abs(frames[1].promptTop-frames[0].promptTop)<2,'writing area must not jump');
    assert(Math.abs(frames[1].promptLeft-frames[0].promptLeft)<2,'writing area horizontal continuity');
    assert(frames.some(f=>f.height>Math.min(frames[0].height,frames.at(-1).height)+5&&f.height<Math.max(frames[0].height,frames.at(-1).height)-5),'real intermediate heights');
    for(let i=1;i<frames.length;i++){assert(Math.abs(frames[i].bottom-frames[0].bottom)<1,'bottom edge stays anchored');assert((frames[i].height-frames[i-1].height)*direction>=-1,'height moves monotonically');}
    assert(!frames.at(-1).moving,'animation cleans up');
  }
  smooth(expanding,1);assert(await prompt.evaluate(n=>n===document.activeElement));
  const collapsing=await sample('#composer-reply button');smooth(collapsing,-1);
  assert.equal(await p.locator('.composer-reply-ghost').count(),0);
  // Reverse while the first expansion is still running; resume at the visual height.
  const rapid=await p.evaluate(async()=>{
    const form=document.querySelector('#composer'),reply=document.querySelector('[data-message="1"] [data-message-action="reply"]');
    reply.click();await new Promise(r=>setTimeout(r,65));const before=form.getBoundingClientRect().height;
    document.querySelector('#composer-reply button').click();const after=form.getBoundingClientRect().height;
    await new Promise(r=>setTimeout(r,45));reply.click();
    // Wait for settlement, including the bounded fallback if a busy webview drops finish.
    const deadline=performance.now()+1500;while(form.classList.contains('is-morphing')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));
    return {before,after,replying:form.classList.contains('is-replying'),ghosts:document.querySelectorAll('.composer-reply-ghost').length,moving:form.classList.contains('is-morphing')};
  });assert(Math.abs(rapid.before-rapid.after)<2);assert(rapid.replying&&!rapid.moving&&rapid.ghosts===0,JSON.stringify(rapid));
  await prompt.fill('A draft stays here.');await p.getByRole('button',{name:'Cancel reply',exact:true}).click();await p.waitForTimeout(380);assert.equal(await prompt.innerText(),'A draft stays here.');
  // Editing during expansion releases the measured height for multiline content.
  await first().getByRole('button',{name:'Reply to message',exact:true}).click();await prompt.fill('First line\nSecond line\nThird line');assert(await prompt.evaluate(n=>n.scrollHeight<=n.clientHeight+1));
  await p.waitForTimeout(400);const settled=await p.locator('#composer').boundingBox();await p.waitForTimeout(1800);assert.deepEqual(await p.locator('#composer').boundingBox(),settled);
  for(const theme of ['dark','light']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await prompt.focus();await p.waitForTimeout(240);await p.screenshot({path:path.join(artifacts,engine+'-composer-motion-'+theme+'.png')});}
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(100);await p.screenshot({path:path.join(artifacts,engine+'-composer-motion-mobile.png')});
  assert(await p.locator('#composer').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);const reduced=await sample('#composer-reply button');assert(reduced.every(f=>!f.moving));assert.equal(reduced[1].height,reduced.at(-1).height);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>document.documentElement.dataset.motion='off');const off=await sample('[data-message="1"] [data-message-action="reply"]');assert(off.every(f=>!f.moving));
  await p.evaluate(()=>document.documentElement.dataset.motion='on');await p.getByRole('button',{name:'Cancel reply',exact:true}).click();await p.waitForTimeout(370);
  await p.locator('input[type="file"]').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('A small fixture attachment.')});await p.getByRole('button',{name:'Remove notes.txt',exact:true}).waitFor();
  const withFiles=await sample('[data-message="1"] [data-message-action="reply"]');smooth(withFiles,1);
  const withoutQuote=await sample('#composer-reply button');smooth(withoutQuote,-1);assert(await p.getByRole('button',{name:'Remove notes.txt',exact:true}).isVisible());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,expansionHeights:expanding.map(f=>Math.round(f.height)),collapseHeights:collapsing.map(f=>Math.round(f.height)),anchoredBottom:true,continuousPrompt:true,rapidReversal:true,draftAndMultiline:true,pollStable:true,reducedMotion:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
