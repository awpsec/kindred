const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/avatar');fs.mkdirSync(out,{recursive:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/avatar-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="light"><head><link rel="stylesheet" href="/style.css"></head><body style="margin:0;background:white"><div id="test"></div></body></html>'}));
await page.addInitScript(()=>{window.avatarFrames=0;const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>raf(t=>{window.avatarFrames++;fn(t)});window.testHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.testHidden,configurable:true});});
const base='http://127.0.0.1:'+server.address().port;await page.goto(base+'/avatar-fixture');
const result=await page.evaluate(async()=>{
 const m=await import('/characters.js'),c=await import('/avatar-runtime/catalog.js');
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(v,s)=>{if(!v)throw Error(s)};
 for(const [old,body]of Object.entries(c.avatarCatalog.legacyBodies))check(c.appearance({shape:old}).body===body,'legacy '+old);
 check(c.appearance({shape:'bean'}).body==='hex','legacy bean');check(c.selectAppearance({}, {body:'bean'}).shape==='pebble','new bean fallback');
 check(c.appearance({color:'#D8D8D8'}).palette==='black','adaptive');check(c.appearance({color:'#123456'}).custom_color==='#123456','exact custom');
 const cases=[
 [{status:'running',shape:'hammer',stale:true},'idle'],[{status:'running',shape:'hammer',local:{phase:'awaiting_approval'}},'blocked'],[{status:'awaiting_approval',shape:'hammer'},'blocked'],[{status:'queued',shape:'hammer'},'idle'],[{status:'cancelling'},'powering-down'],[{status:'cancelled'},'idle'],[{status:'cancelled',local:{phase:'awaiting_approval'},awaiting:'approval'},'idle'],[{status:'running',shape:'think',model_progress_state:'writing'},'streaming'],[{status:'running',shape:'worry'},'confused']];
 for(const [a,state]of cases)check(m.activityState(a,100).action===state,'facts '+JSON.stringify(a));
 const root=document.querySelector('#test');root.style.cssText='display:flex;flex-wrap:wrap;width:1000px';
 for(const body of c.bodies){const p=m.newAvatarProfile('same');p.avatar={...p.avatar,body};const b=m.character({...p,animated:false},48);root.append(b);check(b.querySelector('svg'),'svg '+body);}
 check(root.children.length===25,'25 bodies');check(m.shapes.length===15&&new Set(m.shapes).size===15,'15 unique picker shapes');check(c.avatarCatalog.defaults.every(body=>m.shapes.includes(body)),'new default shapes are selectable');check(m.shapes.includes('flower')&&m.shapes.includes('gem')&&m.shapes.includes('pebble'),'curated extras');await wait(100);const ids=[...root.querySelectorAll('[id]')].map(n=>n.id);check(new Set(ids).size===ids.length,'unique SVG ids');
 window.sampleRoot=root;
 const p=m.newAvatarProfile('stable'),b=m.character({...p,bot_id:'stable'},96);root.append(b);m.setActivity(b,'working');await wait(200);
 const runtime=b._artwork;m.updateCharacter(b,{...p,bot_id:'stable',color:'#123456'},96);check(b._artwork===runtime,'mounted once');
 const before=b.innerHTML;m.setActivity(b,'working');check(b.innerHTML===before,'same state no render');
 m.setActivity(b,'finished',{runId:'live-1',settledAt:Date.now()});check(b.dataset.action==='finished','live completion');const same=b.innerHTML;m.setActivity(b,'finished',{runId:'live-1',settledAt:Date.now()});check(b.innerHTML===same,'completion no replay');
 const remount=m.character({...p,bot_id:'stable'},32);root.append(remount);m.setActivity(remount,'working');m.setActivity(remount,'finished',{runId:'live-1',settledAt:Date.now()});check(remount.dataset.action==='idle','remount never retains working or replays');remount.remove();m.setActivity(b,'working');

 window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));await wait(80);const hidden=window.avatarFrames;await wait(180);check(window.avatarFrames===hidden,'zero hidden RAF');
 m.setActivity(b,'finished',{runId:'hidden-completion',settledAt:Date.now()});check(b.dataset.action==='idle','hidden completion suppressed');check(window.avatarFrames===hidden,'hidden update no RAF');window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));m.setActivity(b,'finished',{runId:'hidden-completion',settledAt:Date.now()});check(b.dataset.action==='idle','hidden completion never replays');m.setActivity(b,'working');await wait(200);check(window.avatarFrames>hidden,'resume');
 m.updateCharacter(b,{...p,animated:false},96);await wait(80);const still=window.avatarFrames;await wait(180);check(window.avatarFrames===still,'animated false zero RAF');
 m.updateCharacter(b,{...p,animated:true},96);m.setActivity(b,'working');await wait(100);document.documentElement.dataset.motion='off';await wait(80);const reduced=window.avatarFrames;await wait(180);check(window.avatarFrames===reduced,'live reduced zero RAF');
 document.documentElement.dataset.theme='dark';await wait(40);check(b.innerHTML.includes('#0E74E0'),'app theme palette');
 document.documentElement.dataset.motion='on';m.setActivity(b,'idle');await wait(4200);const settled=window.avatarFrames;await wait(200);check(window.avatarFrames===settled,'settled idle zero RAF');
 const idleEyes=[...b.querySelectorAll('mask path')].map(n=>n.getAttribute('d'));check(idleEyes.length===2,'neutral eye mask paths exist');m.setActivity(b,'sleeping');await wait(4200);const asleep=b.innerHTML,sleepFrames=window.avatarFrames;await wait(300);check(b.innerHTML===asleep,'resting pose remains static');check(window.avatarFrames===sleepFrames,'resting zero RAF');check(JSON.stringify([...b.querySelectorAll('mask path')].map(n=>n.getAttribute('d')))===JSON.stringify(idleEyes),'rest has neutral idle eyes');
 b._artwork.lookAt([1,1]);await wait(1200);check(b.innerHTML!==asleep,'resting identity follows hover gaze');b._artwork.lookAt(null);await wait(1400);check(!b._avatarHost.active(),'rest gaze settles');
 m.setActivity(b,'working');await wait(200);check(window.avatarFrames>sleepFrames,'sleep resumes working');
 m.setActivity(b,'idle');await wait(4200);const centered=b.innerHTML;b._artwork.lookAt([1,.5]);await wait(1200);const right=b.innerHTML;check(right!==centered,'gaze turns resting preview toward pointer');
 b._artwork.lookAt([-1,-.5]);await wait(1200);check(b.innerHTML!==right,'gaze follows opposite pointer');b._artwork.lookAt(null);await wait(1400);const gazeSettled=window.avatarFrames;await wait(200);check(window.avatarFrames===gazeSettled,'released gaze settles without RAF');
 b._artwork.lookAt([1,1]);await wait(1400);const held=b.innerHTML;window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));await wait(100);window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));await wait(1400);check(b.innerHTML!==held,'return from hidden releases settled gaze');check(!b._avatarHost.active(),'returned gaze settles');
 b._artwork.lookAt([-1,1]);await wait(1400);const offscreenHeld=b.innerHTML;b.style.position='absolute';b.style.top='4000px';await wait(150);b.style.position='';b.style.top='';await wait(1400);check(b.innerHTML!==offscreenHeld,'return from offscreen releases settled gaze');check(!b._avatarHost.active(),'offscreen return gaze settles');
 document.documentElement.dataset.motion='off';await wait(100);const reducedGaze=b.innerHTML;b._artwork.lookAt([1,1]);await wait(200);check(b.innerHTML===reducedGaze,'reduced motion ignores gaze');document.documentElement.dataset.motion='on';await wait(200);
 for(let j=0;j<30;j++){const n=m.character({...p,bot_id:'churn'+j},32);root.append(n);await Promise.resolve();n.remove();}await wait(100);
 b.remove();await wait(80);const detached=window.avatarFrames;await wait(180);check(window.avatarFrames===detached,'detached zero RAF');
 return {catalog:25,identityCases:Object.keys(c.avatarCatalog.legacyBodies).length,precedence:cases.length,hiddenPaused:true,stillPaused:true,reducedPaused:true,idleSettled:true,neutralRest:true,pickerShapes:15,gazeTracks:true,gazeSettles:true,reducedGazeIgnored:true,detachedPaused:true};
});
await page.screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-catalog.png')});
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-runtime.json'),JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
