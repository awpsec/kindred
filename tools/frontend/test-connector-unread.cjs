const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const bots=[{id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff'}}];
  let reply=false;
  const calls=[1,2,3].map(seq=>({seq,sender:'piper',kind:'connector_artifact',text:'Called Gmail',created:1700000000+seq,run_id:'check-'+seq,connector_artifact:{id:'call-'+seq,bot_id:'piper',connection:'Gmail',connector:'gmail',source:'Kindred',kind:'task',tool:'search_threads',title:'Search threads',status:'completed',revision:1,records:[]}}));
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);document.hasFocus=()=>false;
   window.dividerTargets=[];
   new MutationObserver(()=>{const n=document.querySelector('.unread-divider');if(n){const next=[...n.parentElement.children].slice([...n.parentElement.children].indexOf(n)+1).find(e=>e.dataset.message);if(next)window.dividerTargets.push(next.dataset.message);}}).observe(document,{subtree:true,childList:true});
},token);
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refresh};'}));
  await p.route(origin+'/api/**',r=>{
   const name=new URL(r.request().url()).pathname;
   if(name==='/api/bots')return r.fulfill({json:bots});
   if(name==='/api/chats')return r.fulfill({json:[{id:'dm-piper',name:'Piper',members:['piper']}]});
   if(name==='/api/runs')return r.fulfill({json:[]});
   if(name==='/api/activity')return r.fulfill({json:{}});
   if(name==='/api/attention')return r.fulfill({json:{bots:{},chats:{'dm-piper':{cursor:reply?4:0,read_cursor:0,latest_message_seq:reply?4:0,first_unread_seq:reply?4:null,unread:reply}}}});
   if(name==='/api/chats/dm-piper')return r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages:[...calls,...(reply?[{seq:4,sender:'piper',kind:'message',text:'Your utility bill arrived.',created:1700000004}]:[])]}});
   return r.continue();
  });
  await p.goto(origin);await p.locator('#content .connector-stack').waitFor();
  assert.equal(await p.locator('.unread-dot').count(),0);
  assert.equal(await p.locator('.unread-divider').count(),0);
  reply=true;await p.reload();
  await p.locator('#content [data-message="4"]').waitFor();
  assert.equal(await p.locator('#bots .unread-dot').count(),1);
  await p.waitForFunction(()=>window.dividerTargets.includes('4'));
  assert((await p.evaluate(()=>window.dividerTargets)).every(seq=>seq==='4'));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,quietCallsVisible:true,replyUnread:true,dividerOnReply:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
