// Exercise the real renderer and send handler, including refresh/history gates.
const {server,token}=require('./fixtures/desktop.cjs');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  for(const [width,height,mobile] of [[1320,860,false],[390,844,true],[720,540,true]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const chat={id:'dm-piper',name:'Piper',members:['piper']},now=Math.floor(Date.now()/1000);
   let runs=[];
   let messages=[{seq:1,sender:'user',kind:'message',text:'Earlier question',created:now-60},{seq:2,sender:'piper',kind:'message',text:'Earlier answer',created:now-59}];
   await page.addInitScript(({token,mobile})=>{
    sessionStorage.setItem('kindred-token',token);
    if(mobile)Object.assign(window,{__KINDRED_MOBILE:true,__KINDRED_MOBILE_PLATFORM:'ios'});
    window.arrivals=[];const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
     if(this.classList.contains('reply-arriving'))window.arrivals.push({seq:this.dataset.message,frames,options});
     return animate.call(this,frames,options);
    };
   },{token,mobile});
   await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,renderSharedChat,chatScroll,prepareChatPresentation,ordinaryMessageArrival};'}));
   await page.route(origin+'/api/**',r=>{
    const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});
    if(n==='/api/runs')return send(runs);
    if(n.startsWith('/api/runs/'))return send({run:runs.find(run=>n.endsWith('/'+run.id)),events:[],attachments:[],approvals:[]});
    if(n==='/api/activity')return send({});
    if(n==='/api/chats')return send([chat]);
    if(n==='/api/chats/'+chat.id)return send({chat,messages,page:{has_before:false,has_after:false}});
    if(n==='/api/chats/'+chat.id+'/messages'){
     messages.push({seq:messages.length+1,sender:'user',kind:'message',text:r.request().postDataJSON().prompt,created:now});return send({});
    }
    return r.continue();
   });
   await page.goto(origin);await page.getByText('Earlier answer',{exact:true}).waitFor();
   await page.evaluate(async()=>window.app=await import('/app.js'));
   assert.deepEqual(await page.evaluate(()=>arrivals),[],'History must mount without entrances');
   await page.locator('#prompt').fill('Could you check the draft?');
   await page.locator('#composer').evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>arrivals.some(a=>a.seq==='3'));
   const append=async(text,kind='message',extra={})=>{
    const seq=Math.max(...messages.map(m=>m.seq))+1;
    messages.push({seq,sender:'piper',kind,text,created:now,...extra});
    await page.evaluate(async chat=>app.renderSharedChat(chat,true),chat);return seq;
   };
   await append('The draft is ready. I tightened the intro and kept the examples.');
   const entrances=await page.evaluate(()=>arrivals);
   assert.deepEqual(entrances.map(a=>a.seq),['3','4'],'Both sides enter exactly once');
   for(const a of entrances){
    assert.equal(a.options.duration,240);assert.equal(a.options.easing,'cubic-bezier(.23,1,.32,1)');
    assert.deepEqual(a.frames,[{transform:'translateY(12px)'},{transform:'translateY(0)'}]);
   }
   await page.waitForTimeout(300);
   await page.evaluate(async chat=>{window.original=document.querySelector('[data-message="4"]');await app.renderSharedChat(chat,true);},chat);
   assert(await page.evaluate(()=>original===document.querySelector('[data-message="4"]')),'Refresh preserves message identity');
   assert.equal(await page.evaluate(()=>arrivals.length),2,'Refresh never replays');
   // Reading above the latest message must not start entrances or seize the anchor.
   await page.evaluate(()=>app.chatScroll.follow=false);
   await append('A later update while reading');
   assert.equal(await page.evaluate(()=>arrivals.length),2);
   await page.evaluate(()=>app.chatScroll.follow=true);
   messages.unshift({seq:0,sender:'piper',kind:'message',text:'Older history',created:now-120});
   await page.evaluate(async chat=>app.renderSharedChat(chat,true),chat);
   assert.equal(await page.evaluate(()=>arrivals.length),2,'Backfilled history is not a fresh arrival');
   await page.emulateMedia({reducedMotion:'reduce'});
   await append('Reduced motion reply');
   assert.equal(await page.evaluate(()=>arrivals.length),2);
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>document.documentElement.dataset.motion='off');
   await append('App reduced motion reply');
   assert.equal(await page.evaluate(()=>arrivals.length),2);
   await page.evaluate(()=>{delete document.documentElement.dataset.motion;Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});});
   await append('Background reply');
   assert.equal(await page.evaluate(()=>arrivals.length),2);
   await page.evaluate(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
   await page.evaluate(async chat=>app.renderSharedChat(chat,true),chat);
   assert.equal(await page.evaluate(()=>arrivals.length),2,'Returning to the app does not replay');
   for(const status of ['failed','cancelled','interrupted']){
    const run={id:'run-'+status,bot_id:'piper',chat_id:chat.id,status,created:now,error:'Task '+status,output:''};runs.push(run);
    await page.evaluate(run=>app.state.allRuns.push(run),run);
    await append('Task '+status,'result',{run_id:run.id});
    assert.equal(await page.evaluate(()=>arrivals.length),2,'Derived '+status+' status card stays still');
   }
   const exclusions=await page.evaluate(()=>{
    const base={kind:'assistant',sender:'piper',run_id:'r'};
    return [
     {...base,progress:{mode:'summaries',phase:'commentary',run_id:'r',group_id:'g'}},
     {...base,kind:'task_progress'}, {...base,approval:{id:'a'}}, {...base,question:{id:'q'}},
     {...base,status_notice:{label:'Failed'}}, {...base,sender:'system'}
    ].map(app.ordinaryMessageArrival);
   });
   assert(exclusions.every(x=>!x),'Progress, approvals, choices and notices keep their own presentation');
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({engine:process.env.WEBKIT?'webkit':'chromium',width,height,mobile,passed:true}));
   await page.close();
  }
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
