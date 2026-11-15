// Render real carousel receipts through the iOS adapter; every page and its
// expanded content must remain beside the closed Duo rail.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();let cases=0;
 try{for(const width of [466,678,390]){
  const context=await browser.newContext({viewport:{width,height:width===678?466:900},hasTouch:true}),page=await context.newPage(),errors=[],writes=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);const interval=window.setInterval;window.setInterval=(f,ms,...a)=>ms===2500?0:interval(f,ms,...a);},token);
  const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']},other={id:'team',name:'Piper and Rowan',members:['piper'],bot_only:true};let completed=false,notes=3,receipts=false;
  const run=()=>({id:'review',bot_id:'piper',chat_id:chat.id,status:completed?'completed':'running',created:now-100,progress_started:now-100,task_title:'Check the client evidence',output:'',error:''});
  const progress=()=>({mode:'summaries',phase:'commentary',run_id:'review',group_id:'review',work_qualified:true,activity:{seconds:70,completed:2}});
  const reminder={id:'followup',chat_id:chat.id,bot_id:'piper',revision:1,status:'pending',run_at:now+3600,timezone:'America/New_York',message:'Follow up with the team',sources:[]};
  const artifact={id:'board',title:'Client status board',language:'markdown',path:'/artifacts/board',version:2};
  const messages=()=>[
   {seq:1,sender:'user',kind:'message',created:now-100,text:'Check the evidence and coordinate the follow-up.'},
   {seq:2,sender:'piper',kind:'task_progress',created:now-90,text:'',run_id:'review',progress:progress()},
   ...Array.from({length:notes},(_,i)=>({seq:3+i,sender:'piper',kind:'assistant',created:now-80+i,run_id:'review',text:['The client records are current.','Comparing the two reports.','The attachments match.','Checking the final reference.','Verification is complete.'][i],progress:progress()})),
   ...(receipts?[
    {seq:20,sender:'piper',kind:'collaboration',created:now-70,text:'Piper started a chat with Rowan.',linked_chat_id:'team'},
    {seq:21,sender:'piper',kind:'artifact',created:now-69,text:'Updated status board',workspace_artifact:artifact,artifact_action:'updated'},
    {seq:22,sender:'piper',kind:'reminder_card',created:now-68,text:reminder.message,planning:reminder},
   ]:[]),
  ];
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nwindow.carouselRefresh=async()=>{while(state.refreshing)await new Promise(r=>setTimeout(r,10));await refresh(true);};window.carouselQuote=async seq=>{const n=document.querySelector(`[data-message="${seq}"]`);revealActivityItem(n);};window.carouselSwitch=async()=>{await chooseChat(state.chats.find(c=>c.id==="team"));await chooseChat(state.chats.find(c=>c.id==="dm-piper"));};'}));
  await page.route(origin+'/api/**',r=>{const p=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(p==='/api/chats')return send([chat,other]);if(p==='/api/runs')return send([run()]);if(p==='/api/runs/review')return send({run:run(),events:[],attachments:[],approvals:[]});if(p==='/api/chats/'+chat.id)return send({chat,messages:messages(),page:{has_before:false,has_after:false}});if(p==='/api/chats/team')return send({chat:other,messages:[{seq:1,sender:'piper',kind:'message',created:now,text:'The actual collaboration conversation.'}]});if(p==='/api/chats/'+chat.id+'/reminders/followup'){writes.push(r.request().postDataJSON());Object.assign(reminder,{status:'cancelled',revision:2});return send(reminder);}if(['/api/approvals','/api/questions','/api/user-tasks'].includes(p))return send([]);if(p==='/api/activity')return send({});return r.continue();});
  await page.addInitScript(({width,css,js})=>{
   const duo=width!==390,height=width===678?466:900;
   Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios',__KINDRED_MOBILE_PROFILE:'activity-fixture',__KINDRED_NATIVE_SESSION_BOOTSTRAP:true});
   window.webkit={messageHandlers:{kindredAccounts:{postMessage:()=>{}},kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};
   window.__KINDRED_IOS_LAYOUT={topInset:0,bottomInset:24,leftInset:0,rightInset:duo?84:0,railSide:duo?'right':'none',isDuo:duo,isDuoInner:false,usesNativeRail:duo,isPortrait:width<height,viewportHeight:height};
   window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width,windowHeight:height,reservedRegions:[]};
   window.__KINDRED_IOS_TOOLBAR=duo?{x:width-84,y:100,width:84,height:250}:null;
   addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);(0,eval)(js);},{once:true});
  },{width,css:fs.readFileSync(path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web/MobileLayout.css'),'utf8'),js:fs.readFileSync(path.resolve(__dirname,'../../mobile/ios/KindredCompanion/Web/MobileLayout.js'),'utf8')});
  await page.goto(origin);await page.getByText('The attachments match.',{exact:false}).waitFor();assert.equal(await page.locator('.summary-progress').count(),0);await page.locator('#prompt').fill('Keep my unsent draft');
  notes=4;await page.evaluate(()=>carouselRefresh());const job=page.locator('[data-progress-group="review"]'),heading=job.locator('summary').first();await job.waitFor();assert.equal(await page.locator('.activity-pager:visible').count(),0);cases++;
  receipts=true;await page.evaluate(()=>carouselRefresh());await page.locator('.activity-count').filter({hasText:'4 / 4'}).waitFor();assert.equal(await page.locator('.activity-receipt:visible').count(),1);assert(await page.locator('.activity-reminder-heading:visible').isVisible());assert.equal(await page.locator('.activity-dot').count(),4);cases++;

  const check=async label=>{
   await page.waitForTimeout(280);
   const rects=await page.locator('#content>.activity-receipt:visible,#content>.activity-pager:visible,#content>.task-commentary-block:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {class:n.className,left:r.left,right:r.right,width:r.width,overflow:n.scrollWidth-n.clientWidth};}));
   assert(rects.length>=2,label+': active item and navigation are present');
   for(const r of rects){assert(r.right<=width-(width===390?0:84)+1,label+': activity clears rail '+JSON.stringify(r));assert(r.left>=0,label+': left stays on screen');assert(r.overflow<=1,label+': no horizontal content overflow '+JSON.stringify(r));}
   return rects;
  };
  const widths=[];
  for(let i=1;i<=4;i++){
   await page.getByRole('button',{name:`Show update ${i} of 4`,exact:true}).click();
   const rects=await check('page '+i);widths.push(rects.find(r=>r.class.includes('activity-receipt')).width);
  }
  assert(Math.max(...widths)-Math.min(...widths)<1,'all activity types use the same mobile width');
  await page.getByRole('button',{name:'Show update 1 of 4',exact:true}).click();await heading.click();await check('expanded running job');
  completed=true;await page.evaluate(()=>carouselRefresh());await check('expanded completed job');
  await page.getByRole('button',{name:'Show update 4 of 4',exact:true}).click();await page.locator('.activity-reminder-heading:visible').click();await check('expanded reminder');
  await page.evaluate(()=>{const a=document.querySelector('#content');a.scrollTop=0;});await check('scrolled');
  assert.equal(await page.locator('#prompt').evaluate(n=>n.value??n.innerText),'Keep my unsent draft');assert.deepEqual(errors,[]);await context.close();
 }console.log(JSON.stringify({passed:true,engine,cases,railSafeReceipts:true,expandedJob:true,expandedReminder:true}));}finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
