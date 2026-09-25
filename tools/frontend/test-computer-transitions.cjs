const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// A fake screen that connects after a short delay, so the connecting state is visible.
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();this.host=host;this.screen=document.createElement('div');this.screen.style.cssText='display:flex;width:100%;height:100%;align-items:center;justify-content:center';
 this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=800;this.canvas.style.cursor='none';this.canvas.addEventListener('pointerdown',()=>window.remoteClicks=(window.remoteClicks||0)+1);this.screen.append(this.canvas);host.append(this.screen);
 const c=this.canvas.getContext('2d');c.fillStyle='#2475ff';c.fillRect(0,0,1280,800);
 setTimeout(()=>this.dispatchEvent(new Event('connect')),250);}
 set background(v){} set scaleViewport(v){const b=this.host.getBoundingClientRect(),s=Math.min(b.width/1280,b.height/800)||.2;this.canvas.style.width=1280*s+'px';this.canvas.style.height=800*s+'px';}
 set viewOnly(v){} set resizeSession(v){}
 disconnect(){this.screen.remove();this.dispatchEvent(new Event('disconnect'));}
}`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:820}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  await context.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await context.route(origin+'/vendor.js?real',r=>r.fulfill({body:fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js')),contentType:'text/javascript'}));
  await context.route(origin+'/api/computer/session',r=>r.fulfill({json:{ticket:'fixture'}}));
  await context.route(origin+'/api/computer/resources',r=>r.fulfill({status:404,json:{error:'none'}}));
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto(origin);await p.locator('#show-computer').waitFor();
  // Connecting → live screen is a crossfade, not a cut.
  await p.locator('#show-computer').click();await p.locator('#desktop-loading').waitFor();
  const reveal=await p.evaluate(()=>new Promise(resolve=>{
   const host=document.querySelector('#desktop');const seen={overlap:false,fadeIn:false};
   const tick=()=>{const canvas=host.querySelector('.desktop-canvas'),loading=host.querySelector('.desktop-loading');
    if(canvas&&loading&&canvas.getAnimations().length)seen.overlap=true;
    if(canvas?.getAnimations().some(a=>a.effect.getKeyframes()[0].opacity==0))seen.fadeIn=true;
    if(canvas&&!loading&&!canvas.getAnimations().length)return resolve(seen);requestAnimationFrame(tick);};tick();}));
  assert.deepEqual(reveal,{overlap:true,fadeIn:true},'The live screen fades in over the connecting state');
  const preview=p.getByRole('button',{name:'Open computer screen',exact:true});
  await preview.hover();await p.waitForTimeout(220);
  assert.equal(await preview.evaluate(n=>getComputedStyle(n).cursor),'pointer');
  assert.equal(await preview.locator('span').evaluate(n=>getComputedStyle(n).opacity),'1','Open is visible over the live screen');
  assert.equal(await p.locator('#desktop .desktop-canvas canvas').evaluate(n=>getComputedStyle(n).cursor),'pointer');
  await preview.click();await p.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('expanded'));
  assert.equal(await p.evaluate(()=>window.remoteClicks||0),0,'Opening the preview does not click the remote desktop');
  assert.equal(await preview.isVisible(),false);
  assert.equal(await p.locator('#desktop .desktop-canvas canvas').evaluate(n=>getComputedStyle(n).cursor),'default','Watching keeps the local pointer visible');
  await p.locator('#computer-expand').click();await preview.waitFor();await preview.focus();await p.keyboard.press('Enter');
  await p.waitForFunction(()=>document.querySelector('#computer-panel').classList.contains('expanded'));
  await p.locator('#computer-expand').click();await preview.waitFor();
  // Closing keeps the last frame visible while the pane fades out.
  await p.locator('#computer-close').click();
  const closing=await p.evaluate(()=>{const still=document.querySelector('#desktop .desktop-still');return {still:!!still,painted:!!still&&still.width===1280};});
  assert.deepEqual(closing,{still:true,painted:true},'A closing pane shows its last frame, not a blank screen');
  await p.waitForFunction(()=>document.querySelector('#computer-panel').hidden);
  // Reduced motion: no fade, no still, immediate removal.
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.locator('#show-computer').click();await p.waitForFunction(()=>document.querySelector('#desktop .desktop-canvas')&&!document.querySelector('#desktop-loading'));
  assert.equal(await p.evaluate(()=>document.querySelector('#desktop .desktop-canvas').getAnimations().length),0);
  await p.locator('#computer-close').click();
  assert.equal(await p.evaluate(()=>document.querySelector('#desktop .desktop-still')),null);
  // Group pictures: one shared tile; a pair sits on the diagonal without overlap.
  const stacks=await p.evaluate(async()=>{
   const root=document.createElement('div');document.body.append(root);const make=(slots,items)=>{const s=document.createElement('span');s.className='participant-stack participant-stack-row';s.dataset.slots=String(slots);for(const cls of items){const i=document.createElement('span');i.className=cls;i.style.width=i.style.height='18px';s.append(i);}root.append(s);return s;};
   const pair=make(2,['participant-user','participant-more']),r=pair.getBoundingClientRect(),[a,b]=[...pair.children].map(c=>c.getBoundingClientRect());
   const style=getComputedStyle(pair),tile=style.backgroundColor!=='rgba(0, 0, 0, 0)'&&parseFloat(style.borderTopLeftRadius)>8;root.remove();
   return {tile,diagonal:b.left>a.right-1&&b.top>a.bottom-1,inside:[a,b].every(x=>x.left>=r.left&&x.right<=r.right&&x.top>=r.top&&x.bottom<=r.bottom)};
  });
  assert.deepEqual(stacks,{tile:true,diagonal:true,inside:true},'Group pictures share a tile with members on the diagonal');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,crossfade:true,closingStill:true,reducedMotion:true,groupTile:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
