const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');const{server}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();
try{const page=await browser.newPage({viewport:{width:1280,height:1000}}),base='http://127.0.0.1:'+server.address().port;
await page.route('**/avatar-scale-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/style.css"></head><body style="display:block;padding:30px"><main id="fixture" style="display:flex;flex-wrap:wrap;gap:24px"></main></body></html>'}));
await page.addInitScript(()=>{window.testHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.testHidden});});await page.goto(base+'/avatar-scale-fixture');
const geometry=await page.evaluate(async()=>{
 const m=await import('/characters.js'),e=await import('/avatar-runtime/grok-avatar-engine.mjs'),root=document.querySelector('#fixture');
 window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));
 const rect=box=>{const svg=box.querySelector('svg'),bounds=[...svg.children].filter(n=>n.tagName!=='defs').map(n=>n.getBoundingClientRect());const left=Math.min(...bounds.map(r=>r.left)),right=Math.max(...bounds.map(r=>r.right)),top=Math.min(...bounds.map(r=>r.top)),bottom=Math.max(...bounds.map(r=>r.bottom));return {width:right-left,height:bottom-top,box:box.getBoundingClientRect().width};};
 const sizes=[16,18,22,32,34,38,44,48,96],bodies=[];
 for(const size of sizes)for(const body of m.shapes){const p=m.newAvatarProfile('test');p.avatar={...p.avatar,body};const b=m.character({...p,animated:false},size);root.append(b);bodies.push({size,body,...rect(b)});}
 root.replaceChildren();const states=[];
 for(const size of sizes)for(const state of Object.keys(e.animationStates)){
 const b=m.character(m.newAvatarProfile('test'),size);root.append(b);b._artwork.setState(state);let min=Infinity,max=0;
 for(let j=0;j<90;j++){b._avatarHost.step(1/30);if(j>=30){const r=rect(b);min=Math.min(min,Math.max(r.width,r.height));max=Math.max(max,Math.max(r.width,r.height));}}
 states.push({size,state,min,max});b._artwork.destroy();b.remove();}
 window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));
 return {bodies,states};
});
const timing=await page.evaluate(async()=>{
 const m=await import('/characters.js'),root=document.querySelector('#fixture');root.replaceChildren();const b=m.character(m.newAvatarProfile('cadence'),44);root.append(b);m.setActivity(b,'working');await new Promise(r=>setTimeout(r,150));
 const samples=[],costs=[],i=b._avatarHost,step=i.step;i.step=dt=>{const start=performance.now();samples.push(start);step(dt);costs.push(performance.now()-start);};await new Promise(r=>setTimeout(r,1200));
 const deltas=samples.slice(1).map((t,j)=>t-samples[j]),sort=deltas.slice().sort((a,b)=>a-b);b._artwork.destroy();b.remove();return {frames:samples.length,medianMs:sort[Math.floor(sort.length/2)],p95Ms:sort[Math.floor(sort.length*.95)],meanDrawMs:costs.reduce((a,b)=>a+b,0)/costs.length};
});
const workload=await page.evaluate(async()=>{
 const m=await import('/characters.js'),root=document.querySelector('#fixture'),items=[];root.replaceChildren();
 for(let n=0;n<4;n++){const b=m.character(m.newAvatarProfile('worker'+n),48);root.append(b);m.setActivity(b,['working','thinking','reading','writing'][n]);items.push({b,times:[],cost:0});}
 await new Promise(r=>setTimeout(r,150));for(const item of items){const host=item.b._avatarHost,step=host.step;host.step=dt=>{const start=performance.now();item.times.push(start);step(dt);item.cost+=performance.now()-start;};}
 await new Promise(r=>setTimeout(r,1200));const result=items.map(item=>{const gaps=item.times.slice(1).map((t,n)=>t-item.times[n]).sort((a,b)=>a-b);item.b._artwork.destroy();item.b.remove();return {frames:item.times.length,medianMs:gaps[Math.floor(gaps.length/2)],p95Ms:gaps[Math.floor(gaps.length*.95)],meanDrawMs:item.cost/item.times.length};});return result;
});
const offscreen=await page.evaluate(async()=>{
 const m=await import('/characters.js'),root=document.querySelector('#fixture'),p=m.newAvatarProfile('offscreen');root.replaceChildren();const b=m.character(p,48);root.append(b);m.setActivity(b,'thinking');let steps=0;const i=b._avatarHost,step=i.step;i.step=dt=>{steps++;step(dt);};const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(120);root.style.transform='translateY(3000px)';await wait(120);const paused=steps;await wait(150);const pausedSteps=steps-paused;root.style.transform='';await wait(150);const resumed=steps>paused;b._artwork.destroy();b.remove();return {pausedSteps,resumed};
});assert.equal(offscreen.pausedSteps,0,'offscreen animation pauses');assert(offscreen.resumed,'offscreen animation resumes');
const compactResize=await page.evaluate(async()=>{
 const m=await import('/characters.js'),root=document.querySelector('#fixture'),p=m.newAvatarProfile('resize');
 window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));root.replaceChildren();const b=m.character(p,22);root.append(b);m.setActivity(b,'sending');
 const measure=size=>{m.updateCharacter(b,p,size);for(let j=0;j<90;j++)b._avatarHost.step(1/30);const nodes=[...b.querySelector('svg').children].filter(n=>n.tagName!=='defs').map(n=>n.getBoundingClientRect());return Math.max(Math.max(...nodes.map(r=>r.right))-Math.min(...nodes.map(r=>r.left)),Math.max(...nodes.map(r=>r.bottom))-Math.min(...nodes.map(r=>r.top)))/size;};
 const result={compact32:measure(32),compact:measure(44),large:measure(48),compactAgain:measure(34),largeAgain:measure(96)};b._artwork.destroy();root.replaceChildren();return result;
});
assert(compactResize.compact32>.65&&compactResize.compact>.65&&compactResize.compactAgain>.65,'compact slots retain readable body identity');assert(compactResize.large<.6&&compactResize.largeAgain<.6,'resizing restores authored sending morph');
const orbitReversals=await page.evaluate(async()=>{
 const m=await import('/characters.js'),root=document.querySelector('#fixture'),b=m.character(m.newAvatarProfile('orbit-reversal'),48);root.replaceChildren(b);const scale=()=>Number(b.querySelector('.avatar-canvas').style.transform.match(/scale\(([^)]+)\)/)[1]);let previous=scale(),maxDelta=0,maxBounds=0;const samples=[];
 for(const [state,frames]of [['waiting',90],['thinking',5],['waiting',5],['thinking',5],['writing',60],['waiting',90],['idle',240]]){
 b._artwork.setState(state);for(let n=0;n<frames;n++){b._avatarHost.step(1/60);const value=scale();maxDelta=Math.max(maxDelta,Math.abs(value-previous));previous=value;const bounds=[...b.querySelector('svg').children].filter(n=>n.tagName!=='defs').map(n=>n.getBoundingClientRect());maxBounds=Math.max(maxBounds,Math.max(...bounds.map(r=>r.right))-Math.min(...bounds.map(r=>r.left)),Math.max(...bounds.map(r=>r.bottom))-Math.min(...bounds.map(r=>r.top)));}samples.push({state,scale:scale()});}
 b._artwork.destroy();b.remove();return{maxDelta,maxBounds,samples};
});assert(orbitReversals.maxDelta<.12,'rapid reversal scale cannot jump');assert(orbitReversals.maxBounds<48*1.5,'orbit transition stays bounded');assert.equal(orbitReversals.samples.at(-1).scale,1,'idle settles without leftover magnification');
// Drive the real host scheduler at common display refresh rates without wall-clock jitter.
const cadencePage=await browser.newPage();await cadencePage.route('**/cadence-fixture',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
await cadencePage.addInitScript(()=>{let id=0;const frames=new Map();window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};window.cancelAnimationFrame=n=>frames.delete(n);window.advanceFrame=t=>{const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(t);};});
await cadencePage.goto(base+'/cadence-fixture');const cadence=await cadencePage.evaluate(async()=>{const m=await import('/characters.js'),b=m.character(m.newAvatarProfile('refresh'),44);document.body.append(b);m.setActivity(b,'working');await new Promise(r=>setTimeout(r,80));const i=b._avatarHost,step=i.step,results=[];let frames=0;i.step=dt=>{frames++;step(dt);};for(const hz of [60,120,144]){document.dispatchEvent(new Event('visibilitychange'));frames=0;for(let n=0;n<hz;n++)window.advanceFrame(1000+n*1000/hz);results.push({hz,rendered:frames});}b._artwork.destroy();return results;});await cadencePage.close();
for(const sample of cadence)assert(sample.rendered>=59&&sample.rendered<=61,JSON.stringify(sample));
for(const r of geometry.bodies){const fill=Math.max(r.width,r.height)/r.size;assert(fill>.66&&fill<1.12,'static body fit '+JSON.stringify(r));}
for(const r of geometry.states)assert(Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>0&&r.max<r.size*2,'finite bounded state '+JSON.stringify(r));
for(const r of geometry.states.filter(r=>r.size===48&&['waiting','orbit'].includes(r.state)))assert(r.min/r.size>.7&&r.max/r.size<1,'full work indicator orbit remains legible and bounded '+JSON.stringify(r));
for(const r of geometry.states.filter(r=>r.size<48&&['thinking','waiting','sending','receiving','bouncing','writing'].includes(r.state)))assert(r.min/r.size>.65,'compact activity identity '+JSON.stringify(r));
await page.evaluate(async()=>{const m=await import('/characters.js'),root=document.querySelector('#fixture');root.style.cssText='display:grid;grid-template-columns:70px repeat(6,140px);gap:16px;align-items:center';for(const label of ['Size','Idle','Thinking','Working','Waiting','Writing','Sending']){const cell=document.createElement('div');cell.textContent=label;root.append(cell);}for(const size of [16,22,32,44,48,96]){const label=document.createElement('div');label.textContent=size+'px';root.append(label);for(const state of ['idle','thinking','working','waiting','writing','sending']){const cell=document.createElement('div');cell.style.cssText='height:110px;display:grid;place-items:center;border:1px solid #333';const b=m.character(m.newAvatarProfile('proof'),size);cell.append(b);root.append(cell);b._artwork.setState(state);for(let n=0;n<60;n++)b._avatarHost.step(1/30);}}});
const out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/avatar-scale';fs.mkdirSync(out,{recursive:true});const engine=process.env.WEBKIT?'webkit':'chromium';await page.screenshot({path:path.join(out,engine+'-activity-size-matrix.png')});fs.writeFileSync(path.join(out,engine+'-geometry-cadence.json'),JSON.stringify({geometry,timing,workload,cadence,compactResize,offscreen,orbitReversals},null,2));console.log(JSON.stringify({engine,timing,workload,cadence,compactResize,offscreen,orbitReversals,bodyRange:[Math.min(...geometry.bodies.map(x=>Math.max(x.width,x.height)/x.size)),Math.max(...geometry.bodies.map(x=>Math.max(x.width,x.height)/x.size))],statesMeasured:geometry.states.length}));
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
