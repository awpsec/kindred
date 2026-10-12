const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();
 const out=process.env.KINDRED_TEST_ARTIFACTS||'test-artifacts/send-busy';fs.mkdirSync(out,{recursive:true});const results=[];
 try{
 for(const mobile of [false,true])for(const theme of ['light','dark']){
  const p=await browser.newPage({viewport:{width:mobile?390:1100,height:844},hasTouch:mobile,isMobile:mobile}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({token,mobile})=>{sessionStorage.setItem('kindred-token',token);if(mobile){window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';}}, {token,mobile});
  await p.route(origin+'/api/settings',r=>r.fulfill({json:{name:'You',theme,approval_mode:'auto'}}));
  if(process.env.KINDRED_TEST_STYLE_SOURCE)await p.route(origin+'/style.css',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.KINDRED_TEST_STYLE_SOURCE,'utf8')}));
  let release,posts=0;await p.route(origin+'/api/chats/dm-piper/messages',async r=>{posts++;await new Promise(resolve=>release=()=>resolve());await r.fulfill(posts===1?{status:503,json:{error:'Synthetic send failed'}}:{json:{ok:true}});});
  await p.goto(origin);await p.locator('#prompt').waitFor();await p.waitForFunction(()=>document.querySelector('#composer').getBoundingClientRect().height>0);
  const sample=()=>p.locator('#send').evaluate(n=>{const b=n.getBoundingClientRect(),a=getComputedStyle(n,'::after'),s=n.querySelector('svg');return {x:b.x,y:b.y,w:b.width,h:b.height,arrow:getComputedStyle(s).visibility,disabled:n.disabled,busy:n.getAttribute('aria-busy'),label:n.getAttribute('aria-label'),pseudo:{content:a.content,position:a.position,w:parseFloat(a.width),h:parseFloat(a.height),left:parseFloat(a.left),top:parseFloat(a.top),ml:parseFloat(a.marginLeft),mt:parseFloat(a.marginTop),pointer:a.pointerEvents},draft:document.querySelector('#prompt').value};});
  for(const outcome of ['failure','success']){
   await p.locator('#prompt').fill('Synthetic held send');await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const before=await sample();assert.equal(before.arrow,'visible');assert.equal(before.disabled,false);assert(before.label);
   await p.locator('#send').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('#send').classList.contains('is-busy'));await p.waitForFunction(()=>document.querySelector('#send').getAttribute('aria-busy')==='true');
   while(!release)await p.waitForTimeout(10);
   const pending=await sample();assert.equal(pending.arrow,'hidden','busy arrow is replaced by spinner');assert.equal(pending.disabled,true);assert.equal(pending.busy,'true');assert.equal(pending.label,before.label);assert.equal(pending.draft,before.draft);
   for(const k of ['x','y','w','h'])assert(Math.abs(pending[k]-before[k])<.1,'stable button '+k);
   assert.equal(pending.pseudo.w,14);assert.equal(pending.pseudo.h,14);assert.equal(pending.pseudo.position,'absolute');assert.equal(pending.pseudo.pointer,'none');
   assert(Math.abs(pending.pseudo.left+pending.pseudo.ml+7-pending.w/2)<1,'spinner centered horizontally');assert(Math.abs(pending.pseudo.top+pending.pseudo.mt+7-pending.h/2)<1,'spinner centered vertically');
   await p.screenshot({path:path.join(out,`${engine}-${mobile?'ios':'desktop'}-${theme}-${outcome}-pending.png`)});
   const finish=release;release=null;finish();await p.waitForFunction(()=>!document.querySelector('#send').classList.contains('is-busy'));
   const after=await sample();assert.equal(after.arrow,'visible');assert.equal(after.busy,null);assert.equal(after.label,before.label);assert.equal(after.pseudo.content,'none');
   if(outcome==='failure'){assert.equal(after.draft,before.draft);assert.equal(after.disabled,false);await p.locator('#send').focus();assert(await p.locator('#send').evaluate(n=>document.activeElement===n),'failed send restores usable focus');}else assert.equal(after.draft,'');
   results.push({mobile,theme,outcome,before,pending,after});
  }
  assert.equal(posts,2,'exact two synthetic requests');assert.deepEqual(errors,[]);await p.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({engine,passed:true,cases:results},null,2));console.log(JSON.stringify({engine,passed:true,cases:results.length}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
