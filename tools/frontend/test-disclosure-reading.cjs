// Disclosure regression fixture adapted from the designer review; run from checkout root.
const root=process.cwd();
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require(root+'/tools/frontend/fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.OUT||process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-disclosure-reading';fs.mkdirSync(out,{recursive:true});
const engine=process.env.WEBKIT?'webkit':'chromium';
const results=[];const check=(name,ok,detail)=>results.push({name,ok:!!ok,detail});const info=(name,detail)=>results.push({name,ok:true,detail});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await({chromium,webkit}[engine]).launch();
 const now=Math.floor(Date.now()/1000);
 const earlier=Array.from({length:20},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Earlier conversation '+i+'. We checked the report and saved the findings.',created:now-1000+i}));
 async function open(kind,{width=1100,height=850,scheme='dark',touch=false,reduced=false}={}){
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,hasTouch:touch,reducedMotion:reduced?'reduce':'no-preference'});
  const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.route(url=>url.pathname==='/api/settings'||url.pathname==='/api/settings/timezone/initialize',async r=>{try{const j=await(await r.fetch()).json();j.theme='system';await r.fulfill({json:j});}catch{try{await r.continue();}catch{}}});
  const run={id:'done-run',bot_id:'piper',chat_id:'dm-piper',status:'completed',prompt:'Sign in to Gmail',output:'Signed in.',error:'',depth:0,created:now-400,progress_started:now-400};
  let messages=[...earlier];
  if(kind==='receipt'){messages.push({seq:21,sender:'piper',kind:'result',run_id:'done-run',text:'Signed in and checked the inbox.',created:now-10});}
  if(kind==='summary'){const ups=Array.from({length:24},(_,i)=>({seq:22+i,sender:'piper',kind:'assistant',run_id:'done-run',created:now-390+i*15,text:'Update '+(i+1)+': I checked another batch of messages and recorded what changed in the tracker so the summary stays accurate.',progress:{mode:'summaries',phase:'commentary',run_id:'done-run',group_id:'g1',task_title:'Review inbox'}}));messages.push({seq:21,sender:'piper',kind:'task_progress',run_id:run.id,created:now-400,text:'',progress:{...ups[0].progress,work_qualified:true,presentation:{mode:'staged',promoted:true,stages:['Review messages','Check inbox'],current_stage:1}}},...ups,{seq:60,sender:'piper',kind:'result',run_id:'done-run',text:'Done reviewing the inbox.',created:now-5});}
  if(kind==='long'){const lines=Array.from({length:70},(_,i)=>`Line ${i+1}: here is a detailed paragraph of the report that keeps going for a while.`).join('\n\n');messages.push({seq:21,sender:'piper',kind:'message',text:lines,created:now-5});}
  await p.route(url=>url.pathname==='/api/runs',r=>r.fulfill({json:[run]}).catch(()=>{}));
  await p.route(origin+'/api/runs/done-run',r=>r.fulfill({json:{run,events:[],approvals:[]}}).catch(()=>{}));
  await p.route(url=>url.pathname==='/api/user-tasks',r=>r.fulfill({json:kind==='receipt'?[{id:'signin',run_id:'done-run',bot_id:'piper',title:'Sign in to Gmail',instructions:'Complete the sign-in in the browser, then return control.\n\n'+'Your browser session is ready. '.repeat(12),status:'resumed',outcome:'done',created:now}]:[]}).catch(()=>{}));
  await p.route(url=>url.pathname==='/api/chats/dm-piper',r=>r.fulfill({json:{chat:{id:'dm-piper',members:['piper']},messages,page:{has_before:false,has_after:false}}}).catch(()=>{}));
  if(process.env.KINDRED_TEST_APP_OVERRIDE)await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_TEST_APP_OVERRIDE,'utf8')}));
  await p.goto(origin);await p.locator('#prompt').waitFor();await p.locator('#chat-loading').waitFor({state:'detached'}).catch(()=>{});
  const sel={receipt:'.decision-receipt .decision-receipt-disclosure > summary',summary:'.summary-progress-heading',long:'.message-expand'}[kind];
  await p.locator(sel).last().waitFor();await p.waitForTimeout(300);
  p.sel=sel;return p;
 }
 const area=p=>p.locator('#content');
 const toBottom=async p=>{await area(p).evaluate(n=>n.scrollTop=n.scrollHeight);await p.waitForTimeout(150);};
 const gap=p=>area(p).evaluate(n=>Math.round(n.scrollHeight-n.scrollTop-n.clientHeight));
 // Records per-frame: gap, clicked control's top relative to content top, last content bottom vs composer top
 const record=async(p,fn,selector=p.sel)=>{
  await p.evaluate(sel=>{
   window.fr=[];let ro,timer;
   const start=e=>{
    const c=e.target.closest(sel);if(!c)return;
    document.removeEventListener('click',start,true);
    const n=document.querySelector('#content'),comp=document.querySelector('#composer-area')||document.querySelector('#composer');
    const tick=()=>{const cb=c.getBoundingClientRect(),nb=n.getBoundingClientRect();window.fr.push({gap:Math.round(n.scrollHeight-n.scrollTop-n.clientHeight),top:Math.round(n.scrollTop),ctrlTop:Math.round(cb.top-nb.top),visibleBottom:Math.round(nb.bottom),composerTop:Math.round(comp.getBoundingClientRect().top)});};
    ro=new ResizeObserver(tick);[...n.children].forEach(ch=>ro.observe(ch));timer=setTimeout(()=>ro.disconnect(),900);
   };
   // Arm on the actual click, before the app changes layout. Locator readiness
   // can take longer than the observation window; it is not animation time.
   document.addEventListener('click',start,true);
   window.stopDisclosureRecording=()=>{document.removeEventListener('click',start,true);clearTimeout(timer);ro?.disconnect();};
  },selector);
  if(process.env.KINDRED_TEST_DISCLOSURE_ACTION_DELAY_MS)await p.waitForTimeout(Number(process.env.KINDRED_TEST_DISCLOSURE_ACTION_DELAY_MS));
  await fn();await p.waitForTimeout(700);
  return p.evaluate(()=>{window.stopDisclosureRecording();return window.fr;});
 };
 try{
  const SC=(process.env.SCEN||'ABCDEF');
  if(SC.includes('A'))
  // A. Sign-in receipt at bottom, both widths and themes; also nested "Show full instructions".
  for(const [w,scheme] of [[1100,'dark'],[390,'light'],[1100,'light'],[390,'dark']]){
   const p=await open('receipt',{width:w,scheme});const s=p.locator(p.sel).last();await toBottom(p);
   for(const openIt of [true,false]){const fr=await record(p,()=>s.click());const g=await gap(p);
    check(`A ${w} ${scheme} receipt ${openIt?'expand':'collapse'} follows bottom`,g<3&&fr.every(f=>f.gap<4),{finalGap:g,maxGap:Math.max(...fr.map(f=>f.gap)),tops:fr.map(f=>f.top).filter((v,i,a)=>i===0||v!==a[i-1]).join(',')});
    if(openIt){await p.screenshot({path:path.join(out,`${engine}-A-receipt-open-${w}-${scheme}.png`)});
     const nested=p.locator('.decision-receipt .human-task-details > summary').last();
     if(await nested.count()&&await nested.isVisible()){await toBottom(p);const g0=await gap(p);const fr2=await record(p,()=>nested.click(),'.decision-receipt .human-task-details > summary');const g2=await gap(p);check(`A ${w} ${scheme} nested Show full instructions follows or caps`,fr2.length>0&&fr2.every(f=>f.ctrlTop>=0&&(f.ctrlTop<=9||f.gap<4)),{gapBefore:g0,gapAfter:g2,frames:fr2});await p.screenshot({path:path.join(out,`${engine}-A-nested-instructions-${w}-${scheme}.png`)});await nested.click();await p.waitForTimeout(400);await toBottom(p);}
    }}
   check(`A ${w} ${scheme} no errors`,p.errors.length===0,p.errors);await p.context().close();}
  if(SC.includes('B'))
  // B. Dispatch the disclosure click without locator auto-scrolling: the
  // header is deliberately capped at the top after expansion. Measure the
  // application animation, not Playwright moving the header before the click.
  for(const w of [1100,390]){const p=await open('summary',{width:w});const s=p.locator(p.sel).last();await toBottom(p);
   const fr=await record(p,()=>s.evaluate(n=>n.click()));const g=await gap(p);const head=await s.evaluate(n=>{const a=document.querySelector('#content').getBoundingClientRect(),b=n.getBoundingClientRect();return {headTopInView:Math.round(b.top-a.top),headBottomInView:Math.round(b.bottom-a.top),viewH:Math.round(a.height)};});
   info(`B ${w} tall summary expand: final`,{gap:g,...head,ctrlTopFrames:fr.map(f=>f.ctrlTop).filter((v,i,a)=>i===0||v!==a[i-1]).join(',')});
   check(`B ${w} tall summary: clicked heading visible every pre-paint frame`,head.headTopInView>=0&&fr.length>0&&fr.every(f=>f.ctrlTop>=0&&(f.ctrlTop<=9||f.gap<4)),{...head,frames:fr});
   await p.screenshot({path:path.join(out,`${engine}-B-summary-expanded-${w}.png`)});
   const fr2=await record(p,()=>s.evaluate(n=>n.click()));check(`B ${w} tall summary collapse continuous at bottom`,(await gap(p))<3&&fr2.length>0&&fr2.every(f=>f.ctrlTop>=0&&(f.ctrlTop<=9||f.gap<4)),{finalGap:await gap(p),maxGap:Math.max(...fr2.map(f=>f.gap)),minimumHeadingTop:Math.min(...fr2.map(f=>f.ctrlTop)),frames:fr2});
   await p.context().close();}
  if(SC.includes('C'))
  // C. Long message Show more at bottom: pointer vs keyboard. Track where the fold line lands.
  for(const via of ['pointer','keyboard'])for(const w of [1100,390]){const p=await open('long',{width:w});await toBottom(p);const t=p.locator('.message-expand').last();
   const foldLine=await p.evaluate(()=>{const v=[...document.querySelectorAll('.message-text-viewport')].at(-1),a=document.querySelector('#content').getBoundingClientRect(),vb=v.getBoundingClientRect();return {foldYInView:Math.round(vb.bottom-a.top),viewH:Math.round(a.height)};});
   // Mark the paragraph at the fold
   await p.evaluate(()=>{const v=[...document.querySelectorAll('.message-text-viewport')].at(-1),vb=v.getBoundingClientRect();const ps=[...v.querySelectorAll('p')];const atFold=ps.find(x=>x.getBoundingClientRect().bottom>vb.bottom-2)||ps.at(-1);atFold.dataset.fold='1';});
   if(via==='pointer')await t.click();else{await t.focus();await p.keyboard.press('Enter');}
   await p.waitForTimeout(500);
   const after=await p.evaluate(()=>{const a=document.querySelector('#content').getBoundingClientRect(),f=document.querySelector('[data-fold]').getBoundingClientRect(),tg=[...document.querySelectorAll('.message-expand')].at(-1).getBoundingClientRect();return {foldParaTopInView:Math.round(f.top-a.top),toggleTopInView:Math.round(tg.top-a.top),viewH:Math.round(a.height)};});
   const g=await gap(p);
   const kept=after.foldParaTopInView>-5&&after.foldParaTopInView<after.viewH;
   check(`C ${w} long message Show more via ${via}: reading place (fold paragraph) stays in view`,kept,{before:foldLine,after,gap:g});
   await p.screenshot({path:path.join(out,`${engine}-C-long-${via}-${w}.png`)});await p.context().close();}
  // D. Cancel gestures during expansion at bottom: touch and PageUp.
  {const p=await open('summary',{width:390,touch:true});const s=p.locator(p.sel).last();await toBottom(p);
   await s.click();await area(p).evaluate(n=>{n.dispatchEvent(new Event('touchstart',{bubbles:true}));n.scrollTop-=200;});await p.waitForTimeout(600);check('D touch cancels follow during expansion',(await gap(p))>100,await gap(p));await p.context().close();}
  {const p=await open('summary',{width:1100});const s=p.locator(p.sel).last();await toBottom(p);
   await s.click();await area(p).evaluate(n=>{n.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));n.scrollTop-=300;});await p.waitForTimeout(600);check('D PageUp cancels follow during expansion',(await gap(p))>100,await gap(p));await p.context().close();}
  if(SC.includes('E'))
  // E. Reading earlier: expand receipt while scrolled up 300px; scrollTop stable, nothing pulled.
  for(const w of [1100,390]){const p=await open('receipt',{width:w});await toBottom(p);await area(p).evaluate(n=>{n.dispatchEvent(new WheelEvent('wheel',{deltaY:-200,bubbles:true}));n.scrollTop-=200;});await p.waitForTimeout(150);
   const t0=await area(p).evaluate(n=>n.scrollTop);const s=p.locator(p.sel).last();const bb=await s.boundingBox();const cb=await area(p).boundingBox();const inView=bb&&bb.y>cb.y&&bb.y+bb.height<cb.y+cb.height-120;info('E '+w+' target in view',{inView,y:bb&&Math.round(bb.y)});if(inView){await p.mouse.click(bb.x+20,bb.y+bb.height/2);}else{await s.evaluate(n=>n.click());}await p.waitForTimeout(600);
   const t1=await area(p).evaluate(n=>n.scrollTop);check(`E ${w} reader above bottom stays anchored`,Math.abs(t1-t0)<2,{t0,t1});await p.context().close();}
  // F. Reduced motion: instant follow both ways.
  {const p=await open('receipt',{width:390,reduced:true});const s=p.locator(p.sel).last();await toBottom(p);await s.click();await p.waitForTimeout(120);const g1=await gap(p);await s.click();await p.waitForTimeout(120);const g2=await gap(p);check('F reduced motion follows instantly both ways',g1<3&&g2<3,{g1,g2});await p.context().close();}
 }finally{fs.writeFileSync(path.join(out,`${engine}-results.json`),JSON.stringify(results,null,1));if(results.some(r=>!r.ok))process.exitCode=1;console.log(JSON.stringify(results.map(r=>(r.ok?'OK  ':'FAIL ')+r.name+'  '+JSON.stringify(r.detail).slice(0,260))),null,0);await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;try{server.close();}catch{}});
