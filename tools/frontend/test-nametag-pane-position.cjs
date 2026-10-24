const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch(),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/kindred-nametag-pane';fs.mkdirSync(out,{recursive:true});
 try{const p=await browser.newPage({viewport:{width:1320,height:850}}),errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto('http://127.0.0.1:'+server.address().port);const chip=p.locator('#bot-details'),details=p.locator('#details-panel'),computer=p.locator('#computer-panel');await chip.filter({hasText:'Piper'}).waitFor();
 const settled=()=>p.waitForTimeout(450);
 const rects=()=>p.evaluate(()=>{const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width}};return{chip:rect(document.querySelector('#bot-details')),chat:rect(document.querySelector('.conversation'))}});
 for(const width of [1320,1050,900,780]){
  await p.setViewportSize({width,height:850});await p.mouse.move(0,0);await chip.evaluate(n=>n.blur());await settled();let r=await rects();assert(Math.abs(r.chip.x+r.chip.width/2-r.chat.x-r.chat.width/2)<2,'Closed nametag centered at '+width);
  await chip.click();await details.locator('.bot-center-heading').waitFor();await settled();
  for(const tab of ['details','library','computer','details']){
   const current=await computer.isVisible()?computer:details;if(tab!=='details'||current===computer)await current.locator('[data-tab='+tab+']').click();await settled();
   const pane=tab==='computer'?computer:details;r=await rects();const box=await pane.boundingBox();assert(Math.abs(r.chip.x-r.chat.x-16)<2,'Open nametag left aligned at '+width+' '+tab);assert(r.chip.right<=box.x,'Nametag clears pane at '+width+' '+tab);await chip.hover();await settled();const hover=await rects();assert(Math.abs(hover.chip.x-r.chip.x)<1,'Hover expansion keeps left edge fixed');assert(hover.chip.right<=box.x,'Hover stays clear of pane');
  }
  await p.screenshot({path:path.join(out,engine+'-'+width+'-open.png')});await details.getByRole('button',{name:'Close bot center',exact:true}).click();await settled();await p.mouse.move(0,0);await chip.evaluate(n=>n.blur());await settled();r=await rects();assert(Math.abs(r.chip.x+r.chip.width/2-r.chat.x-r.chat.width/2)<2,'Closing re-centers nametag');checks.push({width,openLeft:true,hoverAnchored:true,tabs:true,closeCentered:true});
 }
 await p.emulateMedia({reducedMotion:'reduce'});assert(await chip.evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)===0)),'Reduced motion disables slide');await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>document.documentElement.dataset.motion='off');assert(await chip.evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)===0)),'App reduced motion disables slide');
 // Native iOS must not pick up desktop pane-position rules, even at tablet width.
 await p.evaluate(()=>{delete document.documentElement.dataset.motion;document.documentElement.dataset.kindredIos='true';});await chip.click();await settled();assert.notEqual(await chip.evaluate(n=>getComputedStyle(n).left),'16px','Native iOS excluded');assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,passed:true,checks,reducedMotion:true,iosExcluded:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
