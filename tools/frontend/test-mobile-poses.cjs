const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/mobile-poses';fs.mkdirSync(out,{recursive:true});
 try {
  const p=await browser.newPage({viewport:{width:900,height:800},hasTouch:true});const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';window.__KINDRED_MOBILE_PROFILE='pose-profile';window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;window.webkit={messageHandlers:{kindredNavigation:{postMessage:()=>{}},kindredSession:{postMessage:()=>{}}}};window.retainedPage=crypto.randomUUID();},token);
  await p.goto('http://127.0.0.1:'+server.address().port);
  await p.locator('#content').getByText('Here is the screenshot.',{exact:true}).waitFor();
  await p.locator('#prompt').fill('Keep my draft through every fold.');
  const pageID=await p.evaluate(()=>retainedPage);
  const setPose=async(regions,width=900,height=800)=>{
   await p.setViewportSize({width,height});
   await p.evaluate(({regions,width,height})=>{window.__KINDRED_NATIVE_GEOMETRY={width,height,windowWidth:width,windowHeight:height,safeArea:{top:0,left:0,bottom:0,right:0},reservedRegions:regions};window.dispatchEvent(new Event('kindred-native-geometry'));},{regions,width,height});
   await p.waitForFunction(()=>!document.querySelector('#app').dataset.mobileResizing);
   assert.equal(await p.evaluate(()=>retainedPage),pageID);
   assert.equal(await p.locator('#prompt').innerText(),'Keep my draft through every fold.');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  };
  const division=(x,y,width,height,active=true)=>({kind:'division',x,y,width,height,active});
  const flat=[division(450,0,0,800,false)],book=[division(440,0,20,800)],table=[division(0,390,900,20)];
  await setPose(flat);
  assert.equal(await p.locator('.sidebar').evaluate(n=>Math.round(n.getBoundingClientRect().width)),210);
  await setPose(book);
  const chat=await p.locator('.conversation').boundingBox();assert.equal(chat.x,210);assert.equal(chat.width,690);
  const draftForm=await p.locator('#composer').boundingBox();assert(draftForm.x>=460,'Composer crosses book fold');
  await p.evaluate(()=>{const d=document.createElement('dialog');d.id='pose-dialog';d.innerHTML='<h2>Review draft</h2><input value="Retain my edits"><button>Close</button>';document.body.append(d);d.showModal();});
  const checkDialog=async()=>{const rect=await p.locator('#pose-dialog').boundingBox();const safe=await p.evaluate(()=>['x','y','width','height'].map(n=>parseFloat(document.documentElement.style.getPropertyValue('--ios-safe-'+n))));assert(rect.x>=safe[0]&&rect.y>=safe[1]&&rect.x+rect.width<=safe[0]+safe[2]+1&&rect.y+rect.height<=safe[1]+safe[3]+1);assert.equal(await p.locator('#pose-dialog input').inputValue(),'Retain my edits');};
  await checkDialog();
  await setPose(table);await checkDialog();
  await p.evaluate(()=>document.querySelector('#pose-dialog').close());
  const composer=await p.locator('#composer-area').boundingBox(),history=await p.locator('.conversation-history').boundingBox();
  assert(composer.y>=410,'Tabletop composer crosses fold');assert(history.y+history.height<=390.5,'Tabletop history crosses fold');
  await p.locator('#composer-actions').click();
  await p.waitForFunction(()=>{const n=document.querySelector('.composer-menu:not([hidden])');if(!n)return false;const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+30,r.y+20)?.closest('.composer-menu')===n;});
  await p.locator('#composer-actions').click();
  await p.screenshot({path:path.join(out,'tabletop.png')});
  await setPose(book);await p.screenshot({path:path.join(out,'book.png')});
  // Same-size fold changes must apply even when no window resize is delivered.
  await setPose([division(350,0,30,800)]);assert.equal((await p.locator('.sidebar').boundingBox()).width,210);assert((await p.locator('#composer').boundingBox()).x>=380);
  // Large type keeps the list narrow; controls still clear the fold.
  await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1.5'));await setPose(book);
  assert.equal((await p.locator('.sidebar').boundingBox()).width,210);
  assert((await p.locator('#composer').boundingBox()).x>=460);
  await setPose(book,650,800);
  await p.locator('#mobile-menu').click();assert(await p.locator('.sidebar').isVisible());
  const list=await p.locator('.sidebar').boundingBox();assert(list.x>=460&&list.width<=240);
  await p.evaluate(()=>document.querySelector('#app').classList.remove('sidebar-open'));
  await p.evaluate(()=>document.documentElement.style.setProperty('--text-scale','1'));
  // An off-center fold must not intersect the narrow sidebar either.
  await setPose([division(150,0,20,800)]);
  assert.equal(await p.evaluate(()=>document.documentElement.dataset.iosLayout),'compact');
  await setPose([division(180,0,20,800)]);
  assert.equal((await p.locator('.sidebar').boundingBox()).width,180);
  // Camera safety and an offscreen division in a split window.
  await setPose([...book,{kind:'occlusion',active:true,x:880,y:0,width:40,height:50}]);
  await p.evaluate(()=>document.querySelector('#pose-dialog').showModal());await checkDialog();
  await p.evaluate(()=>document.querySelector('#pose-dialog').close());
  await setPose([{kind:'occlusion',active:true,x:830,y:0,width:70,height:65}]);
  const control=await p.locator('#show-computer').boundingBox();assert(control.x+control.width<=830,'Header control overlaps camera');
  await setPose([division(-10,0,40,800)],500,800);
  assert((await p.locator('.conversation').boundingBox()).x>=30,'Edge fold overlaps conversation');
  await setPose([division(-80,0,20,800)],500,800);
  assert.equal(await p.evaluate(()=>document.documentElement.dataset.iosFold),'none');
  for(const [w,h] of [[390,844],[844,390],[600,700],[900,800]])await setPose([],w,h);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',draftRetained:true,modalRetained:true,poses:12}));
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
