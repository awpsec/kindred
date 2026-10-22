const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');const{server,token}=require('./fixtures/desktop.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.WEBKIT?'webkit':'chromium',browser=await({chromium,webkit}[engine]).launch();const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve('test-results/avatar-held');fs.mkdirSync(out,{recursive:true});const result={engine,modes:{}};
try{for(const mode of ['animated','still','reduced']){const context=await browser.newContext({viewport:{width:1440,height:850},reducedMotion:mode==='reduced'?'reduce':'no-preference'});try{const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#bot-details').waitFor();result.modes[mode]=await p.evaluate(async mode=>{
const m=await import('/characters.js'),A=await import('/avatar-runtime/grok-avatar-engine.mjs'),{avatarData}=await import('/avatar-data.js');const host=document.createElement('div');host.id='held-expression-proof';host.style.cssText='position:fixed;inset:80px 0 auto;z-index:9999;background:var(--bg);display:flex;gap:10px;padding:10px';document.body.append(host);
const names=['neutral','happy','surprised','inspecting','sad','sleepy','squinted','calm','confused'];
const eyes=box=>[...box.querySelectorAll('mask path')].map(n=>n.getAttribute('d'));
const entries=[];for(const expression of names){const box=m.character({shape:'square',eyes:'curious',color:'#123456',animated:mode!=='still',avatar:{version:1,body:'squircle',expression,palette:null,custom_color:'#123456'}},96);host.append(box);entries.push({box,expression,kind:'preset'});}
for(const [legacy,expression] of [['wide','surprised'],['happy','happy'],['sleepy','sleepy']]){const box=m.character({shape:'square',eyes:legacy,color:'#123456',animated:mode!=='still'},96);host.append(box);entries.push({box,expression,kind:'legacy:'+legacy});}
for(let attempt=0;attempt<100&&!entries.every(({box})=>box._avatarHost.visible);attempt++)await new Promise(r=>setTimeout(r,20));
if(!entries.every(({box})=>box._avatarHost.visible))throw new Error('Avatar fixtures did not become visible');
// Step the real host synchronously so browser frame scheduling cannot skew comparisons.
// No explicit seed/id: saved expressions must not affect fallback animation identity.
const states=[];for(const state of ['idle','sleeping','listening','blocked','failed','idle']){
 for(const {box} of entries)m.setActivity(box,state);
 if(mode==='animated')for(let frame=0;frame<60;frame++)for(const {box} of entries)box._avatarHost.step(.1);
 states.push({state,faces:entries.map(({box,expression,kind})=>({kind,expression,actual:eyes(box)}))});
}
const now=Date.now()/1000;const facts=[['offline',{status:'completed',last_active_at:now-2000},'rest'],['approval',{status:'awaiting_approval'},'idle'],['user',{status:'awaiting_user'},'idle'],['confused',{status:'running',shape:'worry'},'idle'],['cancelling',{status:'cancelling'},'idle'],['finished',{status:'completed',run_id:'done',completed_at:now},'idle'],['failed',{status:'failed',run_id:'bad',completed_at:now},'idle'],['background',{commands:1},'idle'],['terminal',{status:'running',shape:'terminal'},'working']];const tributes=[];
for(const profile of Object.values(avatarData.tributes)){const box=m.character({name:profile.name,shape:profile.shape,color:profile.color,animated:mode!=='still'},96);host.append(box);for(const [fact,input,expected]of facts){const state=m.activityState(input,now);m.setActivity(box,state.action,state);tributes.push({name:profile.name,fact,semantic:state.action,actual:box.dataset.action,expected});}box.remove();}
return{states,tributes};},mode);result.modes[mode].errors=errors;await p.locator('#held-expression-proof').screenshot({path:path.join(out,engine+'-'+mode+'.png')});}finally{await context.close();}}
fs.writeFileSync(path.join(out,engine+'-observed.json'),JSON.stringify(result,null,2));const expressionFailures=[],tributeFailures=[];
for(const[mode,r]of Object.entries(result.modes)){
 assert.deepEqual(r.errors,[]);
 for(const sample of r.states){const baseline=sample.faces[0].actual;for(const e of sample.faces){assert.equal(e.actual.length,2,'Actual eye mask paths');if(JSON.stringify(e.actual)!==JSON.stringify(baseline))expressionFailures.push({mode,state:sample.state,kind:e.kind,expression:e.expression});}}
 assert.notDeepEqual(r.states.find(s=>s.state==='sleeping').faces[0].actual,r.states.find(s=>s.state==='listening').faces[0].actual,'activity still changes the expression');
 for(const t of r.tributes)if(t.actual!==t.expected)tributeFailures.push({mode,...t});
}
console.log(JSON.stringify({engine,expressionFailures,tributeFailures}));assert.deepEqual(tributeFailures,[],'Semantic activity must not turn nonworking tributes into work');assert.deepEqual(expressionFailures,[],'Saved expression choices must not override activity-driven faces');console.log(engine+' dynamic expression and tribute controls PASS');
}finally{await browser.close();server.closeAllConnections?.();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
