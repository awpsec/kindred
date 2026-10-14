const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,engine=process.env.WEBKIT?'webkit':'chromium';
 const browser=await({chromium,webkit}[engine]).launch();
 try{
  for(const width of [1100,390]){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
   const now=Math.floor(Date.now()/1000),chat={id:'dm-piper',name:'Piper',members:['piper']};
   const run={id:'clock-run',bot_id:'piper',chat_id:chat.id,status:'running',created:now-60,progress_started:now-60,task_title:'Check email filters',output:'',error:''};
   const messages=[{seq:1,sender:'piper',kind:'assistant',run_id:run.id,created:now-50,text:'Checking the saved filters.',progress:{mode:'summaries',phase:'commentary',run_id:run.id,group_id:'clock-group',task_title:run.task_title}}];
   let hold=false;
   await page.route(origin+'/api/**',r=>{
    if(hold)return r.abort();
    const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
    if(n==='/api/runs')return send([run]);
    if(n==='/api/runs/'+run.id)return send({run,events:[],attachments:[],approvals:[]});
    if(n==='/api/chats')return send([chat]);
    if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
    if(n==='/api/activity')return send({});
    return r.continue();
   });
   if(process.env.KINDRED_TEST_APP_SOURCE)await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:require('node:fs').readFileSync(process.env.KINDRED_TEST_APP_SOURCE,'utf8')}));
   await page.clock.install();
   await page.goto(origin);const timer=page.locator('.summary-progress-time');await timer.waitFor();
   hold=true;await page.clock.runFor(1500);await timer.evaluate(el=>window.originalProgressClock=el);
   const seconds=text=>{const m=text.match(/^(?:(\d+)m)?(\d+)s$/);assert(m,text);return Number(m[1]||0)*60+Number(m[2]);};
   let previous=seconds(await timer.innerText());
   for(let i=0;i<3;i++){
    await page.clock.runFor(1100);const current=seconds(await timer.innerText());
    assert(current>previous&&current<=previous+2,JSON.stringify({previous,current,dom:await timer.evaluate(el=>({html:el.outerHTML,hidden:document.hidden,now:Date.now()}))}));previous=current;
    assert(await timer.evaluate(el=>el===window.originalProgressClock),'clock must not require rebuilding chat');
   }
   assert.equal(await page.locator('.progress-update-time-toggle').innerText(),'10s','update timestamps remain fixed');
   await page.locator('.summary-progress-heading').click();await page.clock.runFor(500);
   previous=seconds(await timer.innerText());await page.clock.runFor(1100);assert(seconds(await timer.innerText())>previous,'collapsed active task keeps ticking');
   hold=false;run.status='completed';messages.push({seq:2,sender:'piper',kind:'assistant',run_id:run.id,created:now-5,text:'Filters checked.',progress:{mode:'summaries',phase:'final_answer',run_id:run.id,group_id:'clock-group',task_title:run.task_title}});
   await page.reload();await timer.waitFor();assert.equal(await timer.innerText(),'55s');
   hold=true;await page.clock.runFor(2200);assert.equal(await timer.innerText(),'55s','completed task freezes at recorded finish');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({passed:true,engine,liveWithoutPolling:true,collapsedTicks:true,completedFrozen:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
