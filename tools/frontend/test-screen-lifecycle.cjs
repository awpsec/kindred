const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vendor=`export * from './vendor.js?real';
export class RFB extends EventTarget {
 constructor(host){super();const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const c=canvas.getContext('2d');c.fillStyle='#245863';c.fillRect(0,0,800,600);host.append(canvas);window.fixtureRfb=this;setTimeout(()=>{if(!this.closed)this.dispatchEvent(new Event('connect'));},20);}
 disconnect(){this.closed=true;this.dispatchEvent(new Event('disconnect'));}
}`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 const artifacts=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(artifacts,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1250,height:900}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  let phase='asleep',sessions=0,previews=0,wakeReply=null,holdWake=false,wakeFailure=false;
  await page.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refreshScreenPhase,refreshPreview};'}));
  await page.route(origin+'/api/computer/screen-state*',r=>r.fulfill({json:{state:phase}}));
  await page.route(origin+'/api/computer/session',async r=>{sessions++;if(holdWake){phase='waking';await new Promise(resolve=>wakeReply=resolve);}return r.fulfill(wakeFailure?{status:503,json:{screen_state:'failed',error:'The computer screen could not start.'}}:{json:{ticket:'fixture',control:false}});});
  await page.route(origin+'/api/computer?*',r=>{previews++;return r.continue();});
  await page.route(origin+'/api/computer/resources',r=>r.fulfill({json:{}}));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.motionLog=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.motionLog.push({cls:this.className,frames});return animate.call(this,frames,options)};},token);
  const poll=()=>page.evaluate(async()=>{const {refreshScreenPhase}=await import('/app.js');await refreshScreenPhase();});
  const label=async text=>{try{await page.waitForFunction(text=>document.querySelector('#desktop-mode').textContent===text,text);}catch(error){console.error({expected:text,phase,sessions,ui:await page.evaluate(()=>({label:document.querySelector('#desktop-mode').textContent,hidden:document.querySelector('#computer-panel').hidden,screen:document.querySelector('#desktop').dataset.screenState,loading:document.querySelector('#desktop-loading')?.innerText,error:document.querySelector('#desktop-error').textContent}))});throw error;}};
  await page.goto(origin);await page.locator('#show-computer').waitFor();
  await page.evaluate(async()=>{const {refreshPreview}=await import('/app.js');const box=document.createElement('div');box.id='fixture-preview';box.innerHTML='<img data-computer-preview="piper" style="width:100px;height:100px"><span class="preview-fallback"><span></span></span>';document.body.append(box);await refreshPreview();});
  assert.equal(previews,0,'Settings preview must not wake an asleep screen');assert.match(await page.locator('#fixture-preview .preview-fallback').innerText(),/screen asleep/);await page.locator('#fixture-preview').evaluate(el=>el.remove());
  await page.locator('#show-computer').click();
  await label('Computer screen asleep…');assert.equal(sessions,0);assert(await page.locator('#desktop-error').isHidden());
  await page.screenshot({path:path.join(artifacts,'screen-asleep.png')});
  // A bot starts its screen independently; the open viewer follows without sending a wake request.
  phase='waking';await poll();await label('Computer screen waking…');assert.equal(sessions,0);
  phase='ready';await poll();await label('Watching live');assert.equal(sessions,1);
  assert(await page.evaluate(()=>motionLog.some(m=>m.cls==='desktop-canvas'&&m.frames[0].opacity===0)),'Screen fades in');
  // Sleep is a neutral transition with the last frame fading away, not an error loop.
  phase='sleeping';await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));await label('Computer screen sleeping…');
  assert(await page.evaluate(()=>motionLog.some(m=>String(m.cls).includes('desktop-sleep-still')&&m.frames[1].opacity===0)),'Screen fades out');
  phase='asleep';await poll();await label('Computer screen asleep…');assert(await page.locator('#desktop-error').isHidden());
  const count=sessions;await page.waitForTimeout(3100);assert.equal(sessions,count,'An asleep screen never enters automatic wake retries');
  // Explicit wake preserves the waking state until the server verifies startup.
  holdWake=true;await page.locator('#desktop-loading').getByRole('button',{name:'Wake screen',exact:true}).click();await label('Computer screen waking…');
  for(let i=0;i<100&&!wakeReply;i++)await new Promise(r=>setTimeout(r,20));assert(wakeReply);assert.equal(sessions,count+1);await page.screenshot({path:path.join(artifacts,'screen-waking.png')});
  phase='ready';holdWake=false;wakeReply();await label('Watching live');
  // Failed services and disconnected viewers have distinct explanations.
  phase='failed';await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));await label('Computer screen couldn’t start');
  assert.match(await page.locator('#desktop-error').innerText(),/screen service failed/);assert(!/asleep/i.test(await page.locator('#desktop-mode').innerText()));
  phase='ready';await poll();await label('Watching live');await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));
  await page.waitForFunction(()=>document.querySelector('#desktop-error').textContent.includes('screen is running'));
  assert(!/offline/i.test(await page.locator('#desktop-error').innerText()));await label('Watching live');
  await page.locator('#computer-close').click();phase='off';const beforeOff=sessions;await page.locator('#show-computer').click();await label('Computer is off');assert.equal(sessions,beforeOff);assert(await page.locator('#desktop-error').isHidden());
  await page.locator('#computer-close').click();phase='paused';await page.locator('#show-computer').click();await label('Computer is paused');assert.equal(sessions,beforeOff);
  // A rejected startup must remain a failure, not get relabeled as normal sleep.
  await page.locator('#computer-close').click();phase='asleep';await page.locator('#show-computer').click();await label('Computer screen asleep…');wakeFailure=true;
  await page.locator('#desktop-loading').getByRole('button',{name:'Wake screen',exact:true}).click();await label('Computer screen couldn’t start');await poll();await label('Computer screen couldn’t start');assert.match(await page.locator('#desktop-error').innerText(),/could not start/);wakeFailure=false;
  // Closing while a wake request is outstanding must not resurrect the viewer.
  await page.locator('#computer-close').click();phase='asleep';await page.locator('#show-computer').click();await label('Computer screen asleep…');holdWake=true;wakeReply=null;
  await page.locator('#desktop-loading').getByRole('button',{name:'Wake screen',exact:true}).click();await label('Computer screen waking…');for(let i=0;i<100&&!wakeReply;i++)await new Promise(r=>setTimeout(r,20));assert(wakeReply);
  await page.locator('#computer-close').click();const lastRfb=await page.evaluate(()=>window.fixtureRfb.closed);phase='ready';holdWake=false;wakeReply();await page.locator('#computer-panel').waitFor({state:'hidden'});
  assert(await page.locator('#computer-panel').isHidden());assert.equal(await page.locator('.desktop-canvas').count(),0);assert.equal(lastRfb,true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',asleepWithoutWake:true,previewDoesNotWake:true,botWakeObserved:true,manualWake:true,fadeIn:true,fadeOut:true,failedDistinctFromAsleep:true,viewerDisconnectDistinctFromOffline:true,powerOffAndPaused:true,staleWakeDiscarded:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
