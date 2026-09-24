const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],sent=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const bots=['Piper','Izabella'].map((name,i)=>({id:'b'+i,name,memory:'',provider:'codex',profile:{shape:'pebble',color:'#2475ff'}}));
  const group={id:'pair',name:'Team chat',members:['b0','b1'],pinned:true,archived:false},chats=[...bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id],archived:false})),group];
  await context.addInitScript(t=>{if(!sessionStorage.getItem('kindred-token'))sessionStorage.setItem('kindred-token',t);},token);
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send(bots);if(name==='/chats')return send(chats);if(name==='/runs')return send([]);if(name==='/activity')return send({});
   const match=name.match(/^\/chats\/([^/]+)(\/messages)?$/);
   if(match){if(match[2]){sent.push({chat:match[1],...req.postDataJSON()});return send({runs:[]});}return send({chat:chats.find(c=>c.id===match[1]),messages:[{seq:1,sender:'b0',kind:'message',text:'History in '+match[1],created:1,reactions:[]}]});}
   return route.continue();
  });
  const history=id=>p.locator('#content').getByText('History in '+id,{exact:true});
  await p.goto(origin);await history('dm-b0').waitFor();await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();await history('dm-b1').waitFor();await p.locator('#prompt').fill('Unsent private draft');
  await p.reload();await history('dm-b1').waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Unsent private draft');
  await p.locator('#pinned-bots').getByRole('button',{name:group.name,exact:true}).click();await history('pair').waitFor();await p.locator('[data-message="1"]').hover();await p.locator('[data-message="1"]').getByRole('button',{name:'Reply to message',exact:true}).click();await p.locator('#prompt').fill('Quoted team response');
  await p.reload();await history('pair').waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Quoted team response');await p.locator('#send').click();await p.waitForFunction(()=>document.querySelector('#prompt').value==='');assert.equal(sent.length,1);assert.equal(sent[0].chat,'pair');assert.equal(sent[0].reply_to,1);
  await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();await history('dm-b1').waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'Unsent private draft');
  await p.evaluate(()=>sessionStorage.setItem('kindred-token','a-different-profile-session'));await p.reload();await history('dm-b0').waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'');await p.locator('#bots').getByRole('button',{name:'Izabella',exact:true}).click();await history('dm-b1').waitFor();assert.equal(await p.locator('#prompt').evaluate(n=>n.value),'');
  assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'edge',dmSelectionAndDraft:true,groupSelectionAndQuote:true,sendToRestoredChat:true,sessionIsolation:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
