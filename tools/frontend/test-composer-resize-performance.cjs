const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {server,token}=require(root+'/tools/frontend/fixtures/desktop.cjs');
const {webkit,chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({webkit,chromium}[engine]).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  const now=Date.now()/1000,chat={id:'dm-piper',name:'Piper',members:['piper']};
  const messages=Array.from({length:150},(_,i)=>({seq:i+1,sender:i%3?'piper':'user',kind:i%3?'result':'message',text:i%3?'I reviewed the results and checked the remaining details.\n\n'+('This is a representative chat paragraph with a few **bold words**, a [link](https://example.com), and details about the current work. ').repeat(10):'Please check this work for me.',created:now-1000+i}));
  await p.route(origin+'/api/**',r=>{const n=new URL(r.request().url()).pathname,send=json=>r.fulfill({json});if(n==='/api/chats')return send([chat]);if(n==='/api/runs')return send([]);if(n==='/api/activity')return send({piper:{status:'running',shape:'think',label:'Thinking it through',started_at:now}});if(n==='/api/chats/dm-piper')return send({chat,messages,page:{has_before:false,has_after:false}});return r.continue();});
  const source=process.env.KINDRED_TEST_APP_OVERRIDE||root+'/ui/app.js';
  await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(source,'utf8')+`\nwindow.perfdiag={};for(const [name,fn,set] of [['resize',resizeComposer,f=>resizeComposer=f],['restore',restoreChatPosition,f=>restoreChatPosition=f],['layout',updateComposerLayout,f=>updateComposerLayout=f],['clearance',setComposerClearance,f=>setComposerClearance=f],['capture',captureChatAnchor,f=>captureChatAnchor=f],['reaction',updateReactions,f=>updateReactions=f]])set(function(...args){const t=performance.now();try{return fn(...args)}finally{const m=window.perfdiag[name]??={calls:0,ms:0,max:0};m.calls++;const d=performance.now()-t;m.ms+=d;m.max=Math.max(m.max,d);}});`}));
  await p.goto(origin);await p.locator('#prompt').waitFor({timeout:90000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
  // Exercise the Linux spacing policy without replacing the fixture's native
  // window bridge. Bot motion stays enabled throughout these wrapping checks.
  const linux=!!process.env.KINDRED_TEST_LINUX_COMPOSER;
  await p.evaluate(linux=>{if(linux)window.__KINDRED_DESKTOP={platform:'linux'};window.composerResizes=0;new ResizeObserver(()=>window.composerResizes++).observe(document.querySelector('#composer-area'));},linux);
  const samples=[];let draft='';const initial=await p.locator('#content>[data-message]').count();assert.equal(initial,150);
  // Keep a dense, real Markdown transcript while the draft crosses successive
  // wrapping boundaries. Report timings without tying them to one CPU speed.
  for(const text of ['This is a normal message. ',('Please review the project and let me know what you find. ').repeat(3),('This is another long line of normal text for a teammate. ').repeat(8)]){
   await p.evaluate(()=>{window.perfdiag={};window.composerResizes=0;window.frames=[];let last=performance.now();window.probe=true;function tick(now){frames.push(now-last);last=now;if(probe)requestAnimationFrame(tick)};requestAnimationFrame(tick);});
   const started=Date.now();draft+=text;await p.locator('#prompt').pressSequentially(text,{delay:5});await p.waitForTimeout(250);
   assert.equal(await p.locator('#prompt').evaluate(n=>n.value),draft,'Typing must preserve the draft through wrapping');
   assert(await p.locator('#prompt').evaluate(n=>n.contains(getSelection().anchorNode)),'Wrapping must retain the caret');
   const sample=await p.evaluate(({text,elapsed})=>{window.probe=false;return {length:text.length,elapsed,metrics:perfdiag,maxFrameGap:Math.max(...frames),resizes:window.composerResizes,rows:document.querySelectorAll('#content>[data-message]').length,composerHeight:document.querySelector('#composer').offsetHeight};},{text,elapsed:Date.now()-started});
   samples.push(sample);
   if(linux)assert((sample.metrics.clearance?.calls||0)<=sample.resizes+1,'Linux wrapping must not repeatedly lay out the transcript between actual composer size changes: '+JSON.stringify(sample));
  }
  assert(await p.locator('.character[data-bot-id="piper"]').evaluateAll(nodes=>nodes.some(n=>n._avatarHost?.active())),'The resize optimization must retain active bot animation');
  const geometry=()=>p.evaluate(()=>{const c=document.querySelector('#content'),a=document.querySelector('#composer-area'),form=document.querySelector('#composer');return {padding:parseFloat(getComputedStyle(c).paddingBottom),height:a.getBoundingClientRect().height,gap:c.scrollHeight-c.clientHeight-c.scrollTop,formTop:form.getBoundingClientRect().top,last:c.lastElementChild.getBoundingClientRect().bottom};});
  let g=await geometry();assert(g.padding>=g.height,'The growing composer must reserve enough space');assert(g.gap<3,'Typing at the end must stay at the end');assert(g.last<=g.formTop,'The last message must remain readable');
  await p.locator('#content').evaluate(n=>n.scrollTop=n.scrollHeight/2);await p.waitForTimeout(100);
  const anchor=await p.evaluate(()=>{const c=document.querySelector('#content'),top=c.getBoundingClientRect().top,n=[...c.children].find(n=>n.dataset.message&&n.getBoundingClientRect().bottom>top);return {id:n.dataset.message,y:n.getBoundingClientRect().top};});
  await p.locator('#prompt').fill('A short draft.');await p.waitForTimeout(300);
  assert(Math.abs((await p.locator('[data-message="'+anchor.id+'"]').boundingBox()).y-anchor.y)<2,'Changing composer size must preserve a reader’s position');
  await p.evaluate(()=>{document.documentElement.dataset.motion='off';const c=document.querySelector('#content');c.scrollTop=c.scrollHeight;});await p.waitForTimeout(150);
  await p.locator('#prompt').fill('');await p.waitForTimeout(100);g=await geometry();assert(g.gap<3&&g.last<=g.formTop,'Reduced motion collapse must preserve the newest message');
  assert.equal(await p.locator('#content>[data-message]').count(),initial,'Composer resizing must retain the transcript');assert.deepEqual(errors,[]);
  const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-composer-resize-performance';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'performance-'+engine+'.json'),JSON.stringify({engine,linux,samples},null,2));console.log(JSON.stringify({engine,linux,samples},null,2));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
