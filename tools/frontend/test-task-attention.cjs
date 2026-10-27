const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-task-attention';fs.mkdirSync(out,{recursive:true});const results=[];
 try{for(const width of [1100,466,867])for(const expanded of [false,true]){
  const mobile=width!==1100,context=await browser.newContext({viewport:{width,height:850},hasTouch:mobile,isMobile:mobile,recordVideo:process.env.KINDRED_RECORD_PREVIEW?{dir:out,size:{width,height:850}}:undefined});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const native=path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web');
  await p.addInitScript(({token,mobile,width,css,js})=>{
   sessionStorage.setItem('kindred-token',token);const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);
   if(mobile){
    Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_NATIVE_SESSION_BOOTSTRAP:true,__KINDRED_SYSTEM_TEXT_SCALE:1});
    window.__KINDRED_IOS_LAYOUT={isDuo:true,isDuoInner:width===867,topInset:0,bottomInset:0,leftInset:0,rightInset:0,viewportHeight:850};
    window.__KINDRED_NATIVE_GEOMETRY={width,height:850,windowWidth:width+(width===867?78:0),windowHeight:890,safeArea:{top:0,right:0,bottom:0,left:0},reservedRegions:[]};
    window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
    document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
   }
  }, {token,mobile,width,css:fs.readFileSync(path.join(native,'MobileLayout.css'),'utf8'),js:fs.readFileSync(path.join(native,'MobileLayout.js'),'utf8')});
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.attentionRefresh=()=>refresh(true);'}));
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};let pending=true,finished=false;
  const run=()=>({id:'signin',bot_id:'piper',chat_id:chat.id,status:pending?'awaiting_user':finished?'completed':'running',created:now-300,progress_started:now-300,task_title:'Prepare the client report',prompt:'Prepare the client report.',output:finished?'The report is ready.':'',error:''});
  const task=()=>({id:'login',run_id:'signin',bot_id:'piper',title:'Sign in to the client portal',instructions:'Please sign in on the bot computer. I’ll continue the report when you return control.',authentication:{method:'signin',service:'the client portal'},status:pending?'pending':'resumed',outcome:pending?'':'done',created:now-20});
  const progress={mode:'summaries',phase:'commentary',run_id:'signin',group_id:'report',work_qualified:true,task_title:'Prepare the client report',presentation:{mode:'staged',promoted:true,stages:['Gather sources','Prepare report'],current_stage:0},activity:{completed:2,recent:[{label:'Open the client portal',created:now-30}]}};
  const messages=[{seq:1,sender:'user',kind:'message',text:'Prepare the client report.',created:now-305},{seq:2,sender:'piper',run_id:'signin',kind:'task_progress',text:'',created:now-300,progress},{seq:3,sender:'piper',run_id:'signin',kind:'assistant',text:'The portal needs you to sign in before I can continue.',created:now-25,progress}];
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([run()]);if(n==='/api/runs/signin')return send({run:run(),events:[{seq:10,kind:'user_action',body:{id:'login'},created:now-20}],approvals:[]});if(n==='/api/user-tasks')return send([task()]);if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});if(n==='/api/activity')return send({});return r.continue();});
  await p.goto(origin);const header=p.locator('.summary-progress-heading'),row=p.locator('[data-message="human-task-login"]');await row.waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(350);
  if(!expanded){await header.click();await p.waitForTimeout(300);}
  assert(await row.isVisible(),'Pending handoff must be visible even with a collapsed job');
  assert.equal(await row.getAttribute('data-task-commentary'),null,'Pending handoff is outside history');
  assert(await row.getByRole('button',{name:'Take over',exact:true}).isVisible());
  const pendingBox=await row.boundingBox();assert(pendingBox.x>=0&&pendingBox.x+pendingBox.width<=width+1,'Pending action fits the available native viewport');
  assert.equal(await p.locator('[data-user-task="login"]').count(),1);
  await p.locator('#content').evaluate(n=>n.scrollTop=n.scrollHeight);await p.waitForTimeout(150);
  await p.screenshot({path:path.join(out,`${engine}-${width}-${expanded?'expanded':'collapsed'}-pending.png`)});
  await row.getByRole('button',{name:'Take over',exact:true}).focus();
  pending=false;await p.evaluate(()=>window.attentionRefresh());
  assert(await p.locator('.connector-transfer-ghost').count()>0,'Confirmed handoff animates into its owning job');
  assert.equal(await row.getAttribute('data-task-commentary'),'report');
  if(expanded){assert(await row.isVisible());const x=await p.locator('.summary-progress-activity').evaluate(n=>n.getBoundingClientRect().x+parseFloat(getComputedStyle(n).paddingInlineStart));assert(Math.abs((await row.boundingBox()).x-x)<1,'Resolved receipt aligns with task history');}
  else assert(!await row.isVisible(),'Resolved handoff follows collapsed history');
  await p.waitForTimeout(450);assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0,'Transfer clears its presentation-only copies');
  assert(await (expanded?row.locator('summary'):header).evaluate(n=>n===document.activeElement),'Focus follows the resolved receipt or its visible owning header');
  await p.evaluate(()=>window.attentionRefresh());assert.equal(await p.locator('.connector-transfer-ghost').count(),0,'Refresh does not replay completed transfer');
  await p.screenshot({path:path.join(out,`${engine}-${width}-${expanded?'expanded':'collapsed'}-resolved.png`)});
  await p.reload();await header.waitFor();assert.equal(await p.locator('[data-user-task="login"]').count(),1);assert.equal(await p.locator('.connector-transfer-ghost').count(),0,'History load does not replay');
  finished=true;messages.push({seq:4,sender:'piper',kind:'result',run_id:'signin',text:'The report is ready.',created:now});await p.evaluate(()=>window.attentionRefresh());await p.waitForTimeout(450);
  assert.equal(await p.locator('[data-user-task="login"]').count(),1,'Finishing the job preserves one handoff receipt');assert(!await row.isVisible(),'Finished job keeps the resolved handoff in its collapsed history');
  finished=false;messages.pop();
  pending=true;await p.reload();await row.waitFor();await p.emulateMedia({reducedMotion:'reduce'});pending=false;await p.evaluate(()=>window.attentionRefresh());assert.equal(await p.locator('.connector-transfer-ghost,.connector-transfer-space').count(),0,'Reduced motion settles directly');
  assert.deepEqual(errors,[]);results.push({width,mobile,expanded,pendingVisible:true,resolvedNested:true,noReplay:true,reducedMotion:true});
  await context.close();
 }
 fs.writeFileSync(path.join(out,`${engine}-attention.json`),JSON.stringify({engine,results},null,2));console.log(JSON.stringify({engine,results}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exitCode=1});
