const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {transcriptAttachments:plan}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.resolve(__dirname,'../../ui/transcript-attachments.js'),'utf8')).toString('base64'));
 const now=Math.floor(Date.now()/1000)-100,chat={id:'dm-piper',name:'Piper',members:['piper']};
 const run={id:'report-run',bot_id:'piper',chat_id:chat.id,prompt:'Prepare report',status:'running',created:now,output:'',error:'',depth:0};
 const doc={id:'report-file',kind:'file',title:'report.txt',name:'report.txt',size:15,created:now+10},pic={id:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',title:'Evidence screenshot',size:100,created:now+10};
 const events=[{seq:11,kind:'assistant',created:now+10,body:{text:'Checking report'}},{seq:12,kind:'attachment',created:now+10,body:{id:doc.id}},{seq:13,kind:'attachment',created:now+10,body:{id:pic.id}},{seq:14,kind:'assistant',created:now+10,body:{text:'Report attached'}}];
 let messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now,run_id:'',delivery:[{run_id:run.id,bot_id:'piper',status:'running'}]},
 {seq:2,sender:'piper',kind:'assistant',text:'Checking report',created:now+10,run_id:run.id,source_event_seq:11},
 {seq:3,sender:'user',kind:'message',text:'Now check the next item',created:now+10},
 {seq:4,sender:'piper',kind:'assistant',text:'Report attached',created:now+10,run_id:run.id,source_event_seq:14},
 {seq:5,sender:'piper',kind:'assistant',text:'Reviewing a later item',created:now+30,run_id:run.id,source_event_seq:20}];
 let runs=[run],details=[{run,events,attachments:[pic,doc],approvals:[]}];
 const pure=(ms=messages,rs=runs,ds=details,edges={})=>plan(ms,rs,new Map(ds.map(d=>[d.run.id,d])),{directOrder:true,...edges});
 assert.deepEqual(pure().rows.get(2).map(i=>i.file.id),[doc.id,pic.id],'share sequence orders mixed storage lists before later same-second user');
 assert.equal(pure(messages.slice(3),runs,details,{hasBefore:true}).rows.size,0,'older files excluded from newer history window');
 assert.equal(pure(messages.slice(0,2),runs,details,{hasAfter:true}).rows.size,0,'future files excluded from older history window');
 assert.equal(pure(messages.slice(1,4),runs,details,{hasBefore:true,hasAfter:true}).rows.get(1).length,2,'middle window includes bounded share events');
 const successor={...run,id:'next-run',created:now+40},queued={seq:6,sender:'user',kind:'message',text:'Queued next turn',created:now+1,delivery:[{run_id:successor.id,bot_id:'piper',status:'queued'}]};
 assert.equal(pure([...messages.slice(0,2),queued],[run,successor]).rows.get(2).length,2,'logical queue boundary overrides earlier next-turn timestamp');
 const promptTie=[{...messages[0],created:now+10},messages[3]];assert.equal(pure(promptTie).rows.get(1).length,2,'empty user run_id uses delivery to anchor same-second prompt');
 assert.equal(pure([messages[0],messages[4],queued],[run,successor],details,{hasAfter:true}).rows.get(1).length,2,'history bound uses chronological max despite queued display ordering');
 const completed={...run,status:'completed'},result={seq:7,sender:'piper',kind:'result',text:'Finished report',created:now+50,run_id:run.id,attachments:[pic,doc]};
 assert.equal([...pure([...messages,result],[completed],details).rows.values()].flat().length,2,'completed payload deduplicated');
 assert.equal([...pure([...messages,result],[completed,successor],[...details,{run:successor,events:[],attachments:[doc],approvals:[]}]).rows.values()].flat().length,2,'continuation cannot duplicate a shared ID');
 assert.equal([...pure([...messages,result],[successor,completed],[{run:successor,events:[],attachments:[doc],approvals:[]},...details]).rows.values()].flat().find(i=>i.file.id===doc.id).run.id,run.id,'original share event wins over continuation metadata even in reversed run order');
 const childResult={...result,run_id:successor.id,attachments:[doc]};
 for(const owners of [[successor,completed],[completed,successor]]){
  const fallback=pure([childResult],owners,[{run:successor,events:[],attachments:[doc],approvals:[]},...details],{hasBefore:true});
  assert.equal(fallback.projected.has(doc.id),false,'any visible continuation result retains fallback when original share is before window');
 }
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();const out=process.env.KINDRED_TEST_ARTIFACTS;if(out)fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const old=setInterval;window.setInterval=(fn,ms,...args)=>ms===2500?0:old(fn,ms,...args);},token);
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+`\nwindow.attachmentSnapshot=async({messages,runs,details,edges={},chat,retainKey=false})=>{const entry=conversationHistory(chat.id);entry.messages=messages;Object.assign(entry,edges);state.allRuns=runs;state.details=new Map(details.map(d=>[d.run.id,d]));if(!retainKey)state.chatKey='';state.chat=chat;entry.loaded=true;await renderPreparedSharedChat(chat,true,'cached');};`}));
  await page.route(origin+'/api/**',route=>{const n=new URL(route.request().url()).pathname,send=json=>route.fulfill({json});
   if(n.startsWith('/api/attachments/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});if(n==='/api/chats')return send([chat]);if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/runs')return send(runs);if(n.startsWith('/api/runs/'))return send(details.find(d=>d.run.id===n.split('/').at(-1)));if(n==='/api/activity')return send({piper:{run_id:run.id,status:'running',shape:'thinking',label:'Reviewing results',started_at:now,server_time:now+60}});if(n==='/api/deliverables/'+doc.id)return route.fulfill({contentType:'text/plain',body:'Report contents'});return route.continue();});
  const replay=async(edges={},nextChat=chat,retainKey=false)=>page.evaluate(s=>window.attachmentSnapshot(s),{messages,runs,details,edges,chat:nextChat,retainKey});
  await page.goto(origin);await page.locator('[data-message="attachment:report-file"]').waitFor();
  const order=()=>page.locator('#content>[data-message]').evaluateAll(ns=>ns.map(n=>n.dataset.message));
  assert.deepEqual(await order(),['1','2','attachment:report-file','attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff','3','4','5']);
  assert.equal(await page.locator('#content>article:not([data-message]) [data-file-signature],#content>article:not([data-message]) .chat-media').count(),0,'no files beneath worker indicator');
  await page.locator('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"] img')?.naturalWidth>0).catch(async e=>{console.error(await page.locator('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"]').innerHTML());throw e;});
  await page.evaluate(()=>{window.savedFile=document.querySelector('[data-message="attachment:report-file"]');window.savedMedia=document.querySelector('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"] .chat-media');});
  await page.locator('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"] .chat-media-open').click();await page.locator('.chat-media-dialog img').waitFor();
  messages.push({seq:6,sender:'piper',kind:'assistant',text:'A later update',created:now+40,run_id:run.id,source_event_seq:22});await replay();
  assert(await page.evaluate(()=>window.savedFile===document.querySelector('[data-message="attachment:report-file"]')&&window.savedMedia===document.querySelector('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"] .chat-media')),'poll retains exact file/media nodes');
  assert(await page.locator('.chat-media-dialog').isVisible(),'open image remains open through poll');await page.keyboard.press('Escape');
  runs=[completed];details=[{...details[0],run:completed}];messages.push(result);await replay();
  assert.equal(await page.locator('[data-message="attachment:report-file"]').count(),1);assert.equal(await page.locator('[data-message="7"] [data-file-signature],[data-message="7"] .chat-media').count(),0,'result does not duplicate attachments');
  assert(await page.evaluate(()=>window.savedFile===document.querySelector('[data-message="attachment:report-file"]')&&window.savedMedia===document.querySelector('[data-message="attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"] .chat-media')),'completion retains exact nodes');
  const all=messages.slice();messages=all.slice(3);await replay({hasBefore:true});assert.equal(await page.locator('.shared-attachment-message').count(),0);messages=all.slice(0,2);await replay({hasBefore:false,hasAfter:true});assert.equal(await page.locator('.shared-attachment-message').count(),0);messages=[{seq:100,sender:'user',kind:'message',text:'Unrelated earlier conversation',created:now+5},{seq:101,sender:'user',kind:'message',text:'Unrelated later conversation',created:now+15}];runs=[];await replay({hasBefore:true,hasAfter:true});assert.equal(await page.locator('.shared-attachment-message').count(),2,'cached share owner survives paging past all owner messages');
  messages=all;runs=[completed];await replay({hasBefore:false,hasAfter:false});assert.equal(await page.locator('.shared-attachment-message').count(),2);
  // Metadata-only arrival must invalidate the chat render key, without another event.
  const added={...doc,id:'late-indexed-file',name:'late.txt',title:'late.txt',created:now+20};details[0].attachments.push(added);await replay({},chat,true);assert.equal(await page.locator('[data-message="attachment:late-indexed-file"]').count(),1);
  if(out)await page.screenshot({path:path.join(out,engine+'-attachment-order.png')});
  // Receipt batches must stop at a file, so later connector calls cannot leap over it.
  const connector=(seq,eventSeq)=>({seq,sender:'piper',kind:'connector_artifact',run_id:run.id,created:now+10,source_event_seq:eventSeq,text:'Read source '+seq,connector_artifact:{id:'source-'+seq,run_id:run.id,bot_id:'piper',chat_id:chat.id,connection:'Google Drive',connector:'googledrive',source:'Kindred',tool:'read_record',kind:'task',title:'Read source '+seq,status:'completed',revision:1,records:[]}});
  messages=[all[0],connector(2,11),connector(3,14),connector(4,15)];runs=[run];details=[{run,events,attachments:[doc,pic],approvals:[]}];await replay();
  assert.equal(await page.locator('.connector-stack-group').count(),0,'files divide receipt batches');assert.deepEqual(await order(),['1','2','attachment:report-file','attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff','3','4']);
  // An attachment-only worker in a shared chat is discoverable before its first prose reply.
  const team={id:'team-fixture',name:'Team',shared:true,members:['piper','fox'],me:'person:local',participants:[{id:'piper',bot_id:'piper',name:'Piper',kind:'bot',avatar:{shape:'round',color:'#2475ff'}},{id:'fox',bot_id:'fox',name:'Fox',kind:'bot',avatar:{shape:'round',color:'#2475ff'}}]};
  const a={...run,chat_id:team.id},b={...run,id:'fox-run',bot_id:'fox',chat_id:team.id,created:now+1},foxFile={...doc,id:'fox-file',name:'fox.txt',title:'fox.txt',created:now+20};
  messages=[{...all[0],mine:true,sender:'person:local'},{seq:2,sender:'person:local',mine:true,kind:'message',text:'Fox, check your item',created:now+1,delivery:[{run_id:b.id,bot_id:'fox',status:'running'}]}];
  runs=[a,b];details=[{run:a,events,attachments:[doc],approvals:[]},{run:b,events:[{seq:30,kind:'attachment',created:now+20,body:{id:foxFile.id}}],attachments:[foxFile],approvals:[]}];await replay({},team);
  assert.deepEqual(await order(),['1','2','attachment:report-file','attachment:fox-file','group-activity'],'shared prompts do not create direct-chat turn boundaries');
  assert.equal(await page.locator('[data-message="attachment:report-file"] .message-author').innerText(),'Piper');assert.equal(await page.locator('[data-message="attachment:fox-file"] .message-author').innerText(),'Fox');
  if(out)await page.screenshot({path:path.join(out,engine+'-shared-worker-files.png')});
  details[0].approvals=[{id:'legacy-review',run_id:a.id,tool:'legacy_tool',args:{text:'Review shared operation'},status:'pending',created:now+30}];runs[0]={...a,status:'awaiting_approval'};details[0].run=runs[0];await replay({},team);
  assert.equal(await page.locator('#content [data-approval="legacy-review"]').count(),1,'shared local worker renders a legacy approval only once');
  assert.deepEqual(errors,[]);const report={passed:true,engine,eventOrder:true,sameSecondPromptAndUser:true,queuedTurnBoundary:true,historyWindows:true,resultAndContinuationDedup:true,mediaIdentityAndOpenPreview:true,connectorBatchBoundary:true,multipleSharedWorkers:true,errors};if(out)fs.writeFileSync(path.join(out,engine+'-attachment-order.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1;});
