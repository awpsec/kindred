// Regression adapted from the designer stale-cap polling repro; assert post-motion reply behavior.
const root=process.cwd();
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE);
const {server,token}=require(root+'/tools/frontend/fixtures/desktop.cjs');
const fs=require('node:fs');const out=process.env.OUT||process.env.KINDRED_TEST_ARTIFACTS;fs.mkdirSync(out,{recursive:true});
const engine=process.env.WEBKIT?'webkit':'chromium';const res=[];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await({chromium,webkit}[engine]).launch();const now=Math.floor(Date.now()/1000);
 const earlier=Array.from({length:20},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Earlier conversation '+i+'. We checked the report and saved the findings.',created:now-1000+i}));
 async function trial(name,{width,clickFirst,kind='receipt',reverse=false}){
  const ctx=await browser.newContext({viewport:{width,height:850},colorScheme:'dark'});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const run={id:'done-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Sign in to Gmail',output:'Signed in.',error:'',depth:0,created:now-400,progress_started:now-400};
  const messages=[...earlier];
  if(kind==='receipt')messages.push({seq:21,sender:'piper',kind:'result',run_id:'done-run',text:'Signed in and checked the inbox.',created:now-10});
  if(kind==='summary'){const ups=Array.from({length:24},(_,i)=>({seq:21+i,sender:'piper',kind:'assistant',run_id:'done-run',created:now-390+i*15,text:'Update '+(i+1)+': I checked another batch of messages and recorded what changed in the tracker so the summary stays accurate.',progress:{mode:'summaries',phase:'commentary',run_id:'done-run',group_id:'g1',task_title:'Review inbox'}}));messages.push(...ups,{seq:60,sender:'piper',kind:'result',run_id:'done-run',text:'Done reviewing the inbox.',created:now-5});}
  await p.route(u=>u.pathname==='/api/runs',r=>r.fulfill({json:[run]}).catch(()=>{}));
  await p.route(origin+'/api/runs/done-run',r=>r.fulfill({json:{run,events:[],approvals:[]}}).catch(()=>{}));
  await p.route(u=>u.pathname==='/api/user-tasks',r=>r.fulfill({json:kind==='receipt'?[{id:'signin',run_id:'done-run',bot_id:'piper',title:'Sign in to Gmail',instructions:'Complete the sign-in in the browser, then return control.\n\n'+'Your browser session is ready. '.repeat(12),status:'resumed',outcome:'done',created:now}]:[]}).catch(()=>{}));
  await p.route(u=>u.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}).catch(()=>{}));
  if(process.env.KINDRED_TEST_APP_OVERRIDE)await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_TEST_APP_OVERRIDE,'utf8')}));await p.goto(origin);await p.locator('#prompt').waitFor();await p.locator('#chat-loading').waitFor({state:'detached'}).catch(()=>{});
  const sel=kind==='receipt'?'.decision-receipt .decision-receipt-disclosure > summary':'.summary-progress-heading';
  await p.locator(sel).last().waitFor();await p.waitForTimeout(400);
  await p.locator('#content').evaluate(n=>n.scrollTop=n.scrollHeight);await p.waitForTimeout(300);
  let reversal=null;if(reverse){await p.bringToFront();reversal=await p.locator(sel).last().evaluate(n=>{n.click();const a=n.closest('[data-message],[data-run]').getAnimations({subtree:true}).find(a=>a.playState==='running'&&a.effect?.getKeyframes().some(k=>'height' in k));if(!a)throw new Error('No active height effect to reverse');a.currentTime=80;const body=n.nextElementSibling,partialHeight=body.getBoundingClientRect().height;n.click();return {controlledTime:80,partialHeight};});await p.waitForTimeout(1200);}else if(clickFirst){const b=await p.locator(sel).last().boundingBox();await p.mouse.click(b.x+20,b.y+b.height/2);await p.waitForTimeout(1200);}
  const before=await p.locator(sel).last().evaluate(heading=>{const n=document.querySelector('#content');return {gap:Math.round(n.scrollHeight-n.scrollTop-n.clientHeight),top:n.scrollTop,headingTop:heading?.getBoundingClientRect().top-n.getBoundingClientRect().top};});
  // New assistant reply arrives through the normal 2.5s refresh.
  const text=Array.from({length:14},(_,i)=>`Reply paragraph ${i+1}: here is what I found after signing in, with enough detail to make the reply tall.`).join('\n\n');
  messages.push({seq:100,sender:'piper',kind:'message',text,created:now});
  await p.locator('[data-message="100"]').waitFor({timeout:15000}).catch(()=>{});await p.waitForTimeout(1500);
  const after=await p.evaluate(()=>{const n=document.querySelector('#content'),m=document.querySelector('[data-message="100"]'),nb=n.getBoundingClientRect();return {present:!!m,gap:Math.round(n.scrollHeight-n.scrollTop-n.clientHeight),top:n.scrollTop,newBottomVsView:m?Math.round(m.getBoundingClientRect().bottom-nb.bottom):null,jumpLatest:!!document.querySelector('.jump-latest:not([hidden]),#jump-latest:not([hidden])')};});
  await p.screenshot({path:`${out}/${engine}-${name}.png`});
  const passed=errors.length===0&&after.present&&(kind==='summary'?before.gap>100&&Math.abs(after.top-before.top)<2&&after.gap>before.gap+100&&after.jumpLatest:after.gap<3&&!after.jumpLatest);res.push({name,engine,width,clickFirst,kind,before,after,errors,reversal,passed});await ctx.close();
 }
 try{
  if(!process.env.REVERSALS_ONLY)for(const width of [1100,390]){
   await trial(`noclick-${width}`,{width,clickFirst:false});
   await trial(`receipt-click-${width}`,{width,clickFirst:true});
   await trial(`summary-click-${width}`,{width,clickFirst:true,kind:'summary'});
  }
  for(const width of [1100,390])await trial(`receipt-reversal-${width}`,{width,clickFirst:true,reverse:true});
 }finally{fs.writeFileSync(`${out}/${engine}-stale-cap.json`,JSON.stringify(res,null,1));console.log(JSON.stringify(res));if(res.some(r=>!r.passed))process.exitCode=1;await browser.close();server.close();}
})();
