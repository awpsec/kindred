const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:900}}),p=await context.newPage();p.setDefaultTimeout(12000);const errors=[],stops=[],requests=[];p.on('pageerror',e=>errors.push(e.message));
  const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',fileId='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',now=Math.floor(Date.now()/1000);
  const bot={id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff'}},chat={id:'dm-piper',name:'Piper',members:['piper'],archived:false};
  const run={id,bot_id:bot.id,chat_id:chat.id,prompt:'Create the QA report',status:'running',output:'',error:'',created:now,depth:0};
  const file={id:fileId,kind:'file',title:'QA report.md',name:'QA report.md',size:15,created:now};
  let failedOnce=false;
  const messages=[{seq:1,sender:'user',kind:'message',text:run.prompt,created:now,run_id:id}];
  await context.route(origin+'/api/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.slice(4),send=json=>route.fulfill({json});
   if(name==='/bots')return send([bot]);if(name==='/chats')return send([chat]);if(name==='/chats/'+chat.id)return send({chat,messages});if(name==='/runs')return send([run]);if(name==='/runs/'+id)return send({run,events:[],attachments:[file],approvals:[]});
   if(name==='/activity')return send(run.status==='running'?{piper:{run_id:id,status:'running',shape:'terminal',label:'Creating report',started_at:now,server_time:now}}:{});
   if(name==='/runs/'+id+'/cancel'){stops.push(req.method());run.status='cancelled';run.error='Stopped by the user. Completed actions are not undone.';messages.push({seq:2,sender:'piper',kind:'result',text:run.error,run_id:id,created:now+1,attachments:[file],status_notice:{label:'Task stopped',text:run.error}});return send({ok:true});}
   if(name==='/runs/'+id+'/continue'){assert.equal(req.method(),'POST');requests.push({path:name,body:req.postDataJSON()});if(!failedOnce){failedOnce=true;return route.abort('failed');}return send({run_id:'continued-run'});}
   if(name==='/deliverables/'+fileId){assert.equal(req.headers().authorization,'Bearer '+token);return route.fulfill({status:200,headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="QA report.md"'},body:'# QA report\n'});}
   return route.continue();
  });
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const stop=p.getByRole('button',{name:'Stop task for Piper',exact:true});await stop.waitFor();assert.equal(await p.locator('#computer-panel').isVisible(),false);await stop.locator('..').hover();await p.waitForFunction(()=>getComputedStyle(document.querySelector('[aria-label="Stop task for Piper"]')).opacity==='1');await stop.click();await p.getByText('Task stopped',{exact:true}).waitFor();assert.deepEqual(stops,['POST']);
  const [item]=await Promise.all([p.waitForEvent('download'),p.getByRole('region',{name:'File: QA report.md',exact:true}).getByRole('button',{name:'Download',exact:true}).click()]);await item.saveAs(path.join(artifacts,'downloaded-report.md'));assert.equal(fs.readFileSync(path.join(artifacts,'downloaded-report.md'),'utf8'),'# QA report\n');assert.equal(item.suggestedFilename(),'QA report.md');
  await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Continue task',exact:true}).click();let dialog=p.getByRole('dialog',{name:'Continue task',exact:true});await dialog.getByRole('button',{name:'Continue',exact:true}).click();await p.locator('#notice.error').waitFor();await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await p.reload();await p.getByRole('button',{name:'Continue task',exact:true}).click();dialog=p.getByRole('dialog',{name:'Continue task',exact:true});await p.waitForTimeout(300);await p.screenshot({path:path.join(artifacts,engine+'-continue-task-mobile.png')});await dialog.getByRole('button',{name:'Continue',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].path,'/runs/'+id+'/continue');assert.deepEqual(requests[0].body,{});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,stopFromChat:true,downloadExactBytes:true,downloadAuthenticated:true,continueRetryUsesSameRunAcrossReload:true,mobile:true,errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
