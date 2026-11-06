const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(process.env.WEBKIT?webkit:chromium).launch();
 try{
  const p=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#prompt').waitFor();await p.waitForTimeout(400);
  const samples=[];
  for(const text of ['A first line\nA second line\nA third line','Short again']){
   const sample=await p.evaluate(async text=>{
    const form=document.querySelector('#composer'),editor=document.querySelector('#prompt'),surface=form.querySelector('.composer-resize-surface');
    const before=surface.getBoundingClientRect().height;
    editor.textContent=text;editor.dispatchEvent(new InputEvent('input',{bubbles:true}));
    await new Promise(resolve=>{
     const deadline=performance.now()+1000;
     function ready(){if(surface.getAnimations().length||performance.now()>deadline)resolve();else requestAnimationFrame(ready)}ready();
    });
    const effects=[...surface.getAnimations(),...editor.getAnimations()],a=surface.getAnimations()[0];
    if(!a)throw Error('Expected a compositor surface animation');
    const frames=[];
    for(const time of [0,45,90,180]){
     for(const effect of effects){effect.pause();effect.currentTime=time;}
     const box=form.getBoundingClientRect(),paint=surface.getBoundingClientRect();
     frames.push({time,layout:box.height,bottom:paint.bottom,height:paint.height});
    }
    for(const effect of effects)effect.finish();
    return {before,naturalSurface:surface.offsetHeight,frames,text:editor.textContent,keys:effects.flatMap(e=>e.effect.getKeyframes().flatMap(Object.keys))};
   },text);
   assert.equal(sample.text,text);assert(sample.frames.every(f=>f.layout===sample.frames[0].layout),'No animated layout height');
   assert(sample.frames.every(f=>Math.abs(f.bottom-sample.frames[0].bottom)<1),'Controls and surface stay bottom anchored');
   assert(Math.abs(sample.frames[0].height-sample.before)<1,'Starts at preceding visible height');
   assert(Math.abs(sample.frames.at(-1).height-sample.naturalSurface)<1);
   assert(!sample.keys.includes('height'));assert.notEqual(sample.frames[1].height,sample.frames[0].height);samples.push(sample);await p.waitForTimeout(50);
  }
  for(const mode of ['system','app']){
   if(mode==='system')await p.emulateMedia({reducedMotion:'reduce'});
   else{await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>document.documentElement.dataset.motion='off');}
   await p.locator('#prompt').fill('First\nSecond\nThird');await p.waitForTimeout(50);
   assert.equal(await p.locator('.composer-resize-surface').evaluate(n=>n.getAnimations().length),0);
   await p.locator('#prompt').fill('Short');await p.waitForTimeout(50);
  }
  await p.evaluate(()=>{
   const row=document.createElement('div');row.className='collaboration-wait-row';row.id='wait-test';row.innerHTML='<span>Ochrane is waiting on Orion</span><button class="icon-button collaboration-stop" aria-label="Stop waiting">×</button>';document.querySelector('#content').append(row);row.scrollIntoView();
  });
  const button=p.getByRole('button',{name:'Stop waiting'});
  assert.equal(await button.evaluate(n=>getComputedStyle(n).opacity),'0');
  assert.equal(await button.evaluate(n=>getComputedStyle(n).transitionDuration),'0s','Reduce motion also disables the status fade');
  await p.locator('#wait-test').hover();await p.waitForTimeout(180);assert.equal(await button.evaluate(n=>getComputedStyle(n).opacity),'1');
  await p.mouse.move(0,0);await button.focus();await p.waitForTimeout(180);assert.equal(await button.evaluate(n=>getComputedStyle(n).opacity),'1');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,engine:process.env.WEBKIT?'webkit':'chromium',samples,reducedMotion:true,keyboardAndHover:true}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
