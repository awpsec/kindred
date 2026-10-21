const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/avatar');fs.mkdirSync(out,{recursive:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/avatar-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="light"><body style="margin:0;background:white"><div id="test"></div></body></html>'}));
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
 check(root.children.length===25,'25 bodies');await wait(100);const ids=[...root.querySelectorAll('[id]')].map(n=>n.id);check(new Set(ids).size===ids.length,'unique SVG ids');
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
 for(let j=0;j<30;j++){const n=m.character({...p,bot_id:'churn'+j},32);root.append(n);await Promise.resolve();n.remove();}await wait(100);
 b.remove();await wait(80);const detached=window.avatarFrames;await wait(180);check(window.avatarFrames===detached,'detached zero RAF');
 return {catalog:25,identityCases:Object.keys(c.avatarCatalog.legacyBodies).length,precedence:cases.length,hiddenPaused:true,stillPaused:true,reducedPaused:true,idleSettled:true,detachedPaused:true};
});
await page.screenshot({path:path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-catalog.png')});
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,(process.env.WEBKIT?'webkit':'chromium')+'-runtime.json'),JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
