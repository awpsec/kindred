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
  let phase='asleep',sessions=0,previews=0,wakeReply=null,holdWake=false,wakeFailure=false,phaseReply=null,holdPhase=false;
  await page.route(origin+'/vendor.js',r=>r.fulfill({body:vendor,contentType:'text/javascript'}));
  await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {refreshScreenPhase,refreshPreview};'}));
  await page.route(origin+'/api/computer/screen-state*',async r=>{if(holdPhase){holdPhase=false;await new Promise(resolve=>phaseReply=resolve);}return r.fulfill({json:{state:phase}})});
  await page.route(origin+'/api/computer/session',async r=>{sessions++;if(holdWake){phase='waking';await new Promise(resolve=>wakeReply=resolve);}return r.fulfill(wakeFailure?{status:503,json:{screen_state:'failed',error:'The computer screen could not start.'}}:{json:{ticket:'fixture',control:false}});});
  await page.route(origin+'/api/computer?*',r=>{previews++;return r.continue();});
  await page.route(origin+'/api/computer/resources',r=>r.fulfill({json:{}}));
  await page.addInitScript(t=>{sessionStorage.setItem('kindred-token',t);window.motionLog=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.motionLog.push({cls:this.className,frames});return animate.call(this,frames,options)};},token);
  const poll=()=>page.evaluate(async()=>{const {refreshScreenPhase}=await import('/app.js');await refreshScreenPhase();});
  const label=async text=>{try{await page.waitForFunction(text=>document.querySelector('#desktop-mode').textContent===text,text);}catch(error){console.error({expected:text,phase,sessions,ui:await page.evaluate(()=>({label:document.querySelector('#desktop-mode').textContent,hidden:document.querySelector('#computer-panel').hidden,screen:document.querySelector('#desktop').dataset.screenState,loading:document.querySelector('#desktop-loading')?.innerText,error:document.querySelector('#desktop-error').textContent}))});throw error;}};

  phase='ready';await page.goto(origin);await page.locator('#show-computer').waitFor();await page.locator('#show-computer').click();await label('Watching live');assert.equal(sessions,1);
  await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));await label('Reconnecting…');
  phase='asleep';await page.waitForTimeout(1500);assert.equal(sessions,1,'Passive viewer retry must not wake a screen that fell asleep after disconnect observation');
  await label('Computer screen asleep…');
  await page.screenshot({path:path.join(artifacts,'passive-retry-asleep.png')});
  // Explicit user intent can still wake the screen.
  await page.locator('#desktop-loading').getByRole('button',{name:'Wake screen',exact:true}).click();
  await label('Watching live');assert.equal(sessions,2,'Explicit Wake still requests a session');
  // A ready screen still reconnects, using a fresh observation rather than waking.
  phase='ready';await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));await label('Reconnecting…');
  await label('Watching live');assert.equal(sessions,3,'Ready passive reconnect succeeds');
  // Closing cancels a pending retry before it can issue another session.
  await page.evaluate(()=>window.fixtureRfb.dispatchEvent(new Event('disconnect')));await label('Reconnecting…');
  await page.locator('#computer-close').click();await page.waitForTimeout(1500);assert.equal(sessions,3);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',retryDoesNotWakeNewlyAsleep:true,explicitWake:true,readyRetry:true,closedRetryCancelled:true,errors}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
