const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/message-search');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1180,height:820}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const bots=['piper','other'].map(id=>({id,name:id==='piper'?'Piper':'Other',provider:'codex',memory:'',profile:{shape:'round',color:'#2475ff'}}));
  const chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),{id:'server-shared',name:'Shared team',members:[],participants:[],shared:true,archived:false}];
  const now=Math.floor(Date.now()/1000),messages=Array.from({length:300},(_,i)=>({seq:i+1,sender:i%2?'piper':'user',text:i===1?'Kickoff confirmed Friday at 10. <img onerror=alert(1)>':'Message '+(i+1)+'. A short piece of conversation.',kind:'message',created:now+i,reactions:[]}));
  let queries=[],phase='normal';
  const gathered=key=>{
   const offset=key==='matched'?0:10,run_id='run-'+key,marker={seq:offset+2,created:now-90,sender:'piper',run_id,task_title:'Review '+key};
   const progress={mode:'summaries',phase:'commentary',run_id,group_id:key,work_qualified:true,task_title:marker.task_title,marker,commentary_count:4,activity:{seconds:70,completed:2,last_at:now}};
   return [{...marker,text:'',kind:'task_progress',progress},...Array.from({length:4},(_,i)=>({seq:offset+3+i,sender:'piper',kind:'assistant',run_id,created:now-70+i,text:key==='matched'&&i===0?'Kickoff inside a gathered update.':'Review progress '+key+' '+i,progress}))];
  };
  const gatheredMessages=[...gathered('matched'),...gathered('unrelated')];
  await p.route(origin+'/api/**',async route=>{
   const u=new URL(route.request().url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(phase==='unavailable'?chats.filter(c=>!c.shared):chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   if(phase==='gather'&&name.startsWith('/runs/run-'))return send({run:{id:name.slice(6),bot_id:'piper',chat_id:'dm-piper',status:'completed',created:now-100,output:'',error:''},events:[],attachments:[],approvals:[]});
   if(name==='/server-chats/search')return phase==='limited'?send({matches:Array.from({length:24},(_,i)=>({chat_id:'server-shared',seq:i+1,sender:'piper',excerpt:'Kickoff shared '+i,created:now+i})),limited:false}):route.fulfill({status:503,json:{error:'Shared search temporarily unavailable'}});
   if(name==='/messages/search'){queries.push(u.searchParams.get('q'));if(phase==='unavailable')return route.fulfill({status:503,json:{error:'Search temporarily unavailable'}});if(phase==='gather')return send({matches:[{chat_id:'dm-piper',seq:3,sender:'piper',excerpt:'Kickoff inside a gathered update.',created:now}],limited:false});if(phase==='limited')return send({matches:Array.from({length:24},(_,i)=>({chat_id:'dm-piper',seq:i+1,sender:'piper',excerpt:'Kickoff local '+i,created:now+i})),limited:false});return send({matches:[{chat_id:'dm-piper',seq:2,sender:'piper',excerpt:messages[1].text,created:now}],limited:false});}
   const match=name.match(/^\/chats\/(dm-piper|dm-other)$/);if(!match)return route.continue();
   const id=match[1],before=Number(u.searchParams.get('before')),after=Number(u.searchParams.get('after')),inclusive=u.searchParams.get('inclusive')==='true',limit=Number(u.searchParams.get('limit')||50);
   const all=id==='dm-piper'?(phase==='gather'?gatheredMessages:messages):[{seq:2,sender:'other',text:'Different conversation',kind:'message',created:now,reactions:[]}];
   let rows=all.filter(m=>(!before||(inclusive?m.seq<=before:m.seq<before))&&(!after||(inclusive?m.seq>=after:m.seq>after)));
   rows=after?rows.slice(0,limit):rows.slice(-limit);
   return send({chat:chats.find(c=>c.id===id),messages:rows,page:{has_before:all.some(m=>m.seq<rows[0]?.seq),has_after:all.some(m=>m.seq>rows.at(-1)?.seq)}});
  });
  await p.goto(origin);await p.locator('[data-message="300"]').waitFor();
  const draft='Keep this draft while I find the kickoff.';await p.locator('#prompt').fill(draft);
  await p.locator('#search-trigger').click();const input=p.getByRole('combobox');await input.fill('kickoff');
  const result=p.getByRole('option').filter({hasText:'Kickoff confirmed Friday'});await result.waitFor();
  await p.getByRole('status').filter({hasText:'Some messages could not be searched'}).waitFor();
  assert.equal(await result.locator('mark').innerText(),'Kickoff');assert.equal(await result.locator('img').count(),0);
  await p.screenshot({path:path.join(out,engine+'-results.png')});await result.click();
  await p.locator('[data-message="2"].quoted-highlight').waitFor();assert.equal(await p.locator('#prompt').innerText(),draft);
  const before=await p.locator('#content').evaluate(n=>n.scrollTop);await p.getByRole('button',{name:'Back to results',exact:true}).click();assert.equal(await input.inputValue(),'kickoff');await result.waitFor();
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('.navigation-search').open);assert(Math.abs(await p.locator('#content').evaluate(n=>n.scrollTop)-before)<2);
  await p.locator('#bots').getByRole('button',{name:'Other',exact:true}).click();await p.getByText('Different conversation',{exact:true}).waitFor();assert(!await p.getByRole('button',{name:'Back to results',exact:true}).isVisible());
  await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await p.locator('[data-message="2"]').waitFor();assert.equal(await p.locator('#prompt').innerText(),draft);
  await p.getByRole('button',{name:'Latest messages',exact:true}).click();await p.locator('[data-message="300"]').waitFor();assert.equal(await p.locator('#prompt').innerText(),draft);
  phase='gather';await p.reload();await p.locator('#bots').getByRole('button',{name:'Piper',exact:true}).click();await p.locator('[data-progress-group="matched"]').waitFor();
  assert(!await p.locator('[data-message="3"]').isVisible(),'Gather is collapsed until explicit navigation');
  await p.locator('#search-trigger').click();await input.fill('kickoff');await p.getByRole('option').filter({hasText:'Kickoff inside a gathered update'}).click();
  await p.locator('[data-message="3"].quoted-highlight').waitFor();assert(await p.locator('[data-message="3"]').isVisible());
  assert(await p.locator('[data-progress-group="matched"] details').evaluate(n=>n.open));
  assert(!await p.locator('[data-message="13"]').isVisible(),'Unrelated Gather stays collapsed');
  await p.waitForTimeout(350);assert(await p.locator('[data-message="3"]').isVisible(),'Collapse completion cannot hide the destination');
  phase='limited';await p.reload();await p.locator('[data-message="300"]').waitFor();await p.locator('#search-trigger').click();await input.fill('kickoff');
  await p.getByRole('status').filter({hasText:'Showing recent matches. Add a more specific phrase'}).waitFor();assert.equal(await p.locator('.navigation-search-result.is-message').count(),32);
  phase='unavailable';await p.reload();await p.locator('[data-message="300"]').waitFor();await p.locator('#search-trigger').click();await input.fill('kickoff');
  await p.getByRole('status').filter({hasText:'Search is unavailable'}).waitFor();assert.equal(await p.locator('.navigation-search-result.is-message').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,exactMessage:true,queryReturn:true,draftAndScroll:true,escapedExcerpt:true,partialFailureKeepsResults:true,unavailableWithoutShared:true,gatheredDestination:true,combinedLimit:true,latest:true,queries,errors}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
