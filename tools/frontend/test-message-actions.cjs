const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
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
   let match=name.match(/^\/chats\/([^/]+)\/messages\/(\d+)\/reaction$/);
   if(match){const body=req.postDataJSON(),m=messages.find(m=>m.seq===Number(match[2]));reacted.push({chat:match[1],seq:m.seq,...body});m.reactions=m.reactions.filter(r=>!r.user);if(body.emoji)m.reactions.push({user:true,emoji:body.emoji});return send({ok:true});}
   match=name.match(/^\/chats\/([^/]+)\/messages$/);
   if(match){const body=req.postDataJSON();if(failSend){failSend=false;return route.fulfill({status:400,json:{error:'Fixture send failed'}});}sent.push({chat:match[1],...body});const quote=messages.find(m=>m.seq===body.reply_to);messages.push({seq:Math.max(...messages.map(m=>m.seq))+1,sender:'user',text:body.prompt,kind:'message',created:now+messages.length,reactions:[],reply_to:quote?{seq:quote.seq,sender:quote.sender,author:bots.find(b=>b.id===quote.sender)?.name||'You',text:quote.text}:undefined});return send({runs:[]});}
   match=name.match(/^\/chats\/([^/]+)$/);
   if(match){const c=chats.find(c=>c.id===match[1]),all=c.id==='pair'?messages:[],before=Number(url.searchParams.get('before')),after=Number(url.searchParams.get('after')),inclusive=url.searchParams.get('inclusive')==='true',limit=Number(url.searchParams.get('limit')||50);let rows=all.filter(m=>(!before||(inclusive?m.seq<=before:m.seq<before))&&(!after||(inclusive?m.seq>=after:m.seq>after)));rows=after?rows.slice(0,limit):rows.slice(-limit);return send({chat:c,messages:rows,page:{has_before:all.some(m=>m.seq<rows[0]?.seq),has_after:all.some(m=>m.seq>rows.at(-1)?.seq)}});}
   return route.continue();
  });
  await p.goto(origin);const tile=()=>p.locator('#pinned-bots').getByRole('button',{name:chat.name,exact:true});await tile().click();
  const first=()=>p.locator('[data-message="1"]'),second=()=>p.locator('[data-message="2"]'),prompt=p.locator('#prompt');
  await first().hover();await p.waitForTimeout(160);assert.equal(await first().locator('.message-actions').evaluate(n=>getComputedStyle(n).opacity),'1');assert.equal(await first().locator('.message-foot').count(),0);
  assert(await first().evaluate(n=>{const b=n.querySelector('.message-bubble').getBoundingClientRect(),a=n.querySelector('.message-actions').getBoundingClientRect();return a.left>=b.right&&Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2;}));
  assert.equal(await first().getByRole('button',{name:'More message actions',exact:true}).count(),0);
  await first().getByRole('button',{name:'Copy message',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.fixtureCopied),messages[0].text);
  await first().getByRole('button',{name:'Copied',exact:true}).waitFor();
  assert.equal(await p.getByRole('menu',{name:'Message options'}).count(),0);

  await first().getByRole('button',{name:'React to message',exact:true}).click();const picker=p.getByRole('menu',{name:'Choose a reaction'});assert.equal(await picker.getByRole('menuitemradio').count(),16);
  // A background message refresh must leave the open chooser and its focus intact.
  messages[0].reactions.push({bot_id:'b1',emoji:'👀'});await first().getByRole('button',{name:/React with 👀/}).waitFor();assert(await picker.isVisible());assert(await picker.evaluate(n=>n.contains(document.activeElement)));
  await picker.getByRole('menuitemradio',{name:'Heart',exact:true}).click();await first().getByRole('button',{name:/Remove your ❤️/}).waitFor();assert.equal(reacted.at(-1).seq,1);
  await p.reload();await tile().click();await first().getByRole('button',{name:/Remove your ❤️/}).click();await p.waitForFunction(()=>!document.querySelector('[data-message="1"] .own-reaction'));assert.equal(reacted.at(-1).emoji,null);
  await first().getByRole('button',{name:'React to message',exact:true}).click();await p.keyboard.press('ArrowRight');assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Heart');await p.keyboard.press('Escape');await p.waitForFunction(()=>document.activeElement?.dataset.messageAction==='react');
  await first().getByRole('button',{name:'Reply to message',exact:true}).click();assert(await prompt.evaluate(n=>n===document.activeElement));assert.equal(await prompt.getAttribute('data-placeholder'),'Reply…');assert.equal(await p.locator('.composer-reply-text').textContent(),messages[0].text);await prompt.fill('Please keep checking.');
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();assert(await p.locator('#composer-reply').isHidden());await tile().click();assert.equal(await prompt.innerText(),'Please keep checking.');assert(await p.locator('#composer-reply').isVisible());
  // Failed sends retain both the text and selected quote.
  failSend=true;await p.locator('#send').click();await p.locator('#notice').filter({hasText:'Fixture send failed'}).waitFor();assert.equal(await prompt.innerText(),'Please keep checking.');assert(await p.locator('#composer-reply').isVisible());
  for(const theme of ['dark','light']){settings.theme=theme;await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await second().hover();await p.waitForTimeout(180);await p.screenshot({path:path.join(artifacts,engine+'-message-reply-'+theme+'.png')});}
  await p.getByRole('button',{name:'Cancel reply',exact:true}).click();assert.equal(await prompt.innerText(),'Please keep checking.');assert(await p.locator('#composer-reply').isHidden());
  await second().getByRole('button',{name:'Reply to message',exact:true}).click();await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('.message-quote'));assert.equal(sent.at(-1).reply_to,2);assert.equal(sent.at(-1).chat,'pair');assert.equal(sent.at(-1).prompt,'Please keep checking.');assert(await p.locator('#composer-reply').isHidden());
  await p.reload();await tile().click();const quote=p.getByRole('button',{name:'View message from Izabella',exact:true});await quote.click();assert(await second().evaluate(n=>n.classList.contains('quoted-highlight')));
  // An old quote remains navigable after its source leaves the loaded page.
  for(let i=5;i<75;i++)messages.splice(messages.length-1,0,{seq:i,sender:'b0',text:'History item '+i,kind:'message',created:now+i,reactions:[]});messages.at(-1).seq=80;messages.at(-1).created=now+80;
  await p.reload();await tile().click();assert.equal(await second().count(),0);await quote.click();await second().waitFor();assert(await second().evaluate(n=>n.classList.contains('quoted-highlight')));
  await second().getByRole('button',{name:'Reply to message',exact:true}).click();await prompt.fill('A narrow-screen reply');await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);await second().scrollIntoViewIfNeeded();
  assert(await p.locator('#composer').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));assert(await second().locator('.message-actions').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&getComputedStyle(n).opacity==='1';}));await p.screenshot({path:path.join(artifacts,engine+'-message-reply-mobile.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine,hoverActions:true,directCopy:true,reactionAddRemoveReload:true,chooserSurvivesRefresh:true,replyDraftScopeAndFailure:true,quotedSendAndOldMessageJump:true,keyboardAndMobile:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
