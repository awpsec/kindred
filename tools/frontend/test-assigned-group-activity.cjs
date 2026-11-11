const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,renderPreparedSharedChat,conversationHistory,renderSidebar,renderHeader};'}));
  await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await page.goto(origin);await page.waitForSelector('#bots .bot-link');
  const result=await page.evaluate(async()=>{
   const app=await import('/app.js'),{state}=app,base=state.bots[0],now=Math.floor(Date.now()/1000);
   // Stop network refreshes from replacing the intentionally lagged fixture feeds.
   state.refreshing=true;
   state.bots=['Atlas','Piper'].map((name,i)=>({...base,id:'bot-'+i,name,profile:{...base.profile,shape:i?'round':'hexagon',color:i?'#ffc900':'#ff684d'}}));
   const participants=state.bots.map(b=>({id:'bot:owner:'+b.id,kind:'bot',name:b.name,bot_id:b.id,account:'owner',avatar:b.profile}));
   participants.push({id:'bot:remote:scratch',kind:'bot',name:'Scratch',bot_id:'remote-scratch',account:'remote',avatar:{shape:'capsule',color:'#8055ff'}});
   const chat={id:'server-team',name:'Team General',shared:true,me:'person:owner',participants,members:state.bots.map(b=>b.id),pinned:true};
   state.chats=[chat,...state.bots.map(b=>({id:'dm-'+b.id,name:b.name,members:[b.id]}))];state.chat=chat;state.bot=null;
   state.allRuns=state.bots.map((b,i)=>({id:'work-'+i,bot_id:b.id,chat_id:chat.id,status:'running',activity_started:false,created:now-4,output:'',error:'',prompt:'I was talking to @Atlas, not you'}));
   state.activities=Object.fromEntries(state.bots.map((b,i)=>[b.id,{run_id:'work-'+i,status:'running',shape:'think',started_at:now-4}]));
   const entry=app.conversationHistory(chat.id);Object.assign(entry,{loaded:true,ready:true,hasBefore:false,hasAfter:false,messages:[{seq:1,sender:'person:owner',mine:true,kind:'message',created:now,text:'I was talking to @Atlas, not you'}],sharedWorkers:participants.map((p,i)=>({id:'work-'+i,participant:p.id,name:p.name,status:'running',created:now-4,activity_started:false}))});
   app.renderHeader();
   window.sampleAssigned=async()=>{app.renderSidebar();await app.renderPreparedSharedChat(chat,false,'cached');return {chat:[...document.querySelectorAll('.group-working-label')].map(n=>n.textContent),sidebar:[...document.querySelectorAll('#bots .sidebar-activity-label')].map(n=>n.textContent)};};
   const quiet=await sampleAssigned();state.allRuns[0].activity_started=true;const assigned=await sampleAssigned();
   // Only activity changed, with the same run status, messages and stale room workers.
   if(assigned.chat.join('|')!=='Atlas working')throw Error('Assigned activity did not invalidate chat rendering');
   const snapshot=entry.sharedWorkers;entry.sharedWorkers=[];const missing=await sampleAssigned();entry.sharedWorkers=snapshot;
   state.allRuns[0].status='completed';const completed=await sampleAssigned();
   state.allRuns[0].status='running';entry.sharedWorkers[2].activity_started=true;const remote=await sampleAssigned();
   entry.sharedWorkers[2].activity_started=false;await sampleAssigned();
   return {quiet,assigned,missing,completed,remote};
  });
  assert.deepEqual(result.quiet,{chat:[],sidebar:[]});
  for(const key of ['assigned','missing']){assert.deepEqual(result[key].chat,['Atlas working']);assert.deepEqual(result[key].sidebar,['thinking']);}
  assert.deepEqual(result.completed,{chat:[],sidebar:[]});assert.deepEqual(result.remote.chat,['Atlas working','Scratch working']);
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-assigned-activity';fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'assigned-orion.png')});
  assert.deepEqual(errors,[]);console.log('PASS: assigned work appears in chat and sidebar before text/tools; lagged/missing shared workers, quiet observers, remote workers and completion handled');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
