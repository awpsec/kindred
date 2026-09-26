const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();this.host=host;this.screen=document.createElement('div');this.screen.style.cssText='display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden';
 this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=800;this.canvas.style.cssText='flex-shrink:0';this.screen.append(this.canvas);host.append(this.screen);
 this.draw('#719a99');this.observer=new ResizeObserver(()=>{this.scaleViewport=true;});this.observer.observe(host);
 window.fixtureRfb=this;setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}
 draw(color){const c=this.canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,1280,800);c.fillStyle='#eee';c.font='32px sans-serif';c.fillText('A sharp live desktop',50,70);c.strokeStyle='#345';for(let x=100;x<1280;x+=100){c.beginPath();c.moveTo(x,120);c.lineTo(x,650);c.stroke();}}
 set background(value){this.screen.style.background=value;}
 set scaleViewport(value){const b=this.host.getBoundingClientRect(),scale=Math.min(b.width/1280,b.height/800);this.canvas.style.width=1280*scale+'px';this.canvas.style.height=800*scale+'px';}
 disconnect(){this.observer.disconnect();this.screen.remove();this.dispatchEvent(new Event('disconnect'));}
}`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'edge',browser=await(process.env.WEBKIT?webkit:chromium).launch(process.env.WEBKIT?{headless:true}:{headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:1320,height:860}}),p=await context.newPage(),errors=[],sessions=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  await context.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await context.route(origin+'/app.js',r=>r.fulfill({body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {teachingSnapshot};',contentType:'text/javascript'}));
  await context.route(origin+'/api/computer/session',r=>{sessions.push(r.request().postDataJSON());return r.fulfill({json:{ticket:'fixture',control:false}});});
  await context.route(origin+'/api/computer/resources',r=>r.fulfill({json:{}}));
  await context.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);
  const open=async()=>{await p.locator('#show-computer').click();await p.locator('.desktop-glass.ready').waitFor();assert.equal(await p.locator('#computer-panel').evaluate(n=>n.classList.contains('expanded')),false);const openButton=p.getByRole('button',{name:'Open computer screen',exact:true});await openButton.hover();await p.waitForTimeout(220);assert.equal(await openButton.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await openButton.locator('span').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await openButton.locator('svg').count(),1);await p.locator('#desktop').screenshot({path:path.join(artifacts,'computer-open-hover.png')});await openButton.click();assert.equal(await p.locator('#computer-panel').evaluate(n=>n.classList.contains('expanded')),true);};await open();assert.deepEqual(await p.evaluate(()=>[fixtureRfb.qualityLevel,fixtureRfb.compressionLevel]),[9,2]);
  const pixel=()=>p.locator('.desktop-glass').evaluate(c=>[...c.getContext('2d').getImageData(10,100,1,1).data]);
  await p.waitForFunction(()=>{const c=document.querySelector('.desktop-canvas canvas').getBoundingClientRect(),b=document.querySelector('#desktop').getBoundingClientRect();return Math.abs(c.width-Math.min(b.width,b.height*1.6))<2;});
  assert.deepEqual(await pixel(),[113,154,153,255]);
  for(const width of [1320,390])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:860});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(220);
   const view=await p.evaluate(()=>{const c=document.querySelector('.desktop-canvas canvas'),g=document.querySelector('.desktop-glass'),b=c.getBoundingClientRect(),d=document.querySelector('#desktop').getBoundingClientRect();return {source:[c.width,c.height],ratio:b.width/b.height,inside:b.left>=d.left-1&&b.right<=d.right+1&&b.top>=d.top-1&&b.bottom<=d.bottom+1,sourceFilter:getComputedStyle(c).filter,glassFilter:getComputedStyle(g).filter,glassPointer:getComputedStyle(g).pointerEvents,glassSize:[g.width,g.height],background:getComputedStyle(c.parentElement).backgroundColor,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===c,viewOnly:window.fixtureRfb.viewOnly,resizeSession:window.fixtureRfb.resizeSession};});
   assert.deepEqual(view.source,[1280,800]);assert(Math.abs(view.ratio-1.6)<.01);assert(view.inside&&view.hit);assert.equal(view.sourceFilter,'none');assert(view.glassFilter.includes('blur'));assert.equal(view.glassPointer,'none');assert.deepEqual(view.glassSize,[240,150]);assert.equal(view.background,'rgba(0, 0, 0, 0)');assert(view.viewOnly);assert.equal(view.resizeSession,false);
   await p.screenshot({path:path.join(artifacts,engine+'-desktop-glass-'+width+'-'+theme+'.png')});
  }
  await p.evaluate(()=>window.fixtureRfb.draw('#b86448'));await p.waitForFunction(()=>document.querySelector('.desktop-glass').getContext('2d').getImageData(10,100,1,1).data[0]===184);assert.deepEqual(await pixel(),[184,100,72,255]);
  const lessonPixel=await p.evaluate(async()=>{const g=document.querySelector('.desktop-glass'),ctx=g.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,g.width,g.height);const {teachingSnapshot}=await import('./app.js');const img=new Image();img.src=teachingSnapshot();await img.decode();const c=document.createElement('canvas');c.width=480;c.height=300;c.getContext('2d').drawImage(img,0,0);return [...c.getContext('2d').getImageData(10,200,1,1).data];});assert(Math.abs(lessonPixel[0]-184)<5&&Math.abs(lessonPixel[1]-100)<5,'Lesson captures the real desktop, not its decorative copy');
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.desktop-glass').evaluate(c=>getComputedStyle(c).transitionDuration),'0s');
  await p.evaluate(()=>window.fixtureRfb.disconnect());await p.waitForFunction(()=>!document.querySelector('.desktop-glass'));await p.locator('.desktop-glass.ready').waitFor();assert.equal(await p.locator('.desktop-glass').count(),1);assert.equal(sessions.length,2);
  await p.locator('#computer-close').click();await p.waitForTimeout(650);assert.equal(await p.locator('.desktop-glass').count(),0);assert.equal(await p.locator('.desktop-canvas').count(),0);assert.equal(sessions.length,2);assert(sessions.every(s=>s.control===false));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine,themes:true,responsive:true,liveColorUpdates:true,sharpDesktopAndInput:true,realLessonSnapshot:true,reconnectAndClose:true,reducedMotion:true}));await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
