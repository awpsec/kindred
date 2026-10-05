// Real shared UI with isolated HTTP/VNC fixtures; no provider or owner computer.
const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fixtureTheme=process.env.KINDRED_TEST_THEME||'dark';
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=(process.env.WEBKIT?'webkit':'chromium')+(fixtureTheme==='light'?'-light':''),browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',isMobile:true,hasTouch:true}),p=await context.newPage();p.setDefaultTimeout(5000);
 if(process.env.KINDRED_TEST_APP_SOURCE)await context.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_TEST_APP_SOURCE,'utf8')}));
 const errors=[],writes=[],requests=[],sessions=[];p.on('pageerror',e=>errors.push(e.message));
 const pause={bot_id:'piper',name:'Piper',control_id:'piper-pause',reason:'manual',queued:1};
 let active=true,omit=true,fail=false,failNetwork=false,ambiguous=false,hold=null,release=null;
 const status=()=>({screen_bot_id:'piper',takeover:active,control_pauses:active&&!omit?[pause,{bot_id:'other',name:'Other',control_id:'other-pause',reason:'manual'}]:[],vm_enabled:true});
 await context.route(origin+'/vendor.js',route=>{
  const real=fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'),'utf8').replace('et as RFB','FixtureRFB as RFB');
  const mock=`class FixtureRFB extends EventTarget {constructor(host){super();this.host=host;const c=document.createElement('canvas');c.width=600;c.height=400;host.append(c);setTimeout(()=>this.dispatchEvent(new Event('connect')),10);}sendKey(key){(window.fixtureKeys??=[]).push(key);}disconnect(){this.host.remove();} }\n`;
  return route.fulfill({contentType:'text/javascript',body:mock+real});
 });
 await context.route(origin+'/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),name=u.pathname.slice(4),send=json=>route.fulfill({json});
  if(name==='/settings')return send({theme:fixtureTheme,reduced_motion:true});
  if(name==='/bots')return send([{id:'piper',name:'Piper',provider:'codex',profile:{shape:'round',color:'#2475ff',archived:false}}]);
  if(name==='/chats')return send([{id:'dm-piper',name:'Piper',members:['piper'],archived:false}]);
  if(name==='/chats/dm-piper')return send({chat:{id:'dm-piper',name:'Piper',members:['piper'],archived:false},messages:[]});
  if(name==='/status')return send(status());
  if(name==='/runs')return send([{id:'queued',bot_id:'piper',chat_id:'dm-piper',status:'queued',created:1,prompt:'Continue fixture',output:'',error:'',depth:0}]);
  if(name==='/activity')return send({});
  if(name==='/computer/resources')return send({cpu_percent:1,cpus:2,memory_used:1,memory_total:2,disk_used:1,disk_total:2,uptime_seconds:60,sampled_at:1});
  if(name==='/computer/session'){sessions.push(req.postDataJSON());return send({ticket:'fixture'});}
  if(name==='/takeover'){
   const body=req.postDataJSON();writes.push(body);requests.push({method:req.method(),path:u.pathname,...body});if(hold)await hold;
   if(failNetwork){failNetwork=false;return route.abort('failed');}
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Fixture release failed. Retry.'}});}
   active=false;
   if(ambiguous){ambiguous=false;return route.abort('failed');}
   return send({enabled:false});
  }
  return route.continue();
 });
 await context.addInitScript(t=>{window.__KINDRED_MOBILE=true;window.__KINDRED_MOBILE_PLATFORM='ios';sessionStorage.setItem('kindred-token',t);},token);
 await p.goto(origin);await p.locator('#prompt').waitFor();await p.locator('#show-computer').click();await (process.env.KINDRED_TEST_APP_SOURCE ? p.getByRole('button',{name:'Use screen',exact:true}).evaluate(b=>b.click()) : p.getByRole('button',{name:'Use screen',exact:true}).click()).catch(async e=>{await p.screenshot({path:path.join(out,engine+'-fixture-failure.png')});console.log(await p.locator('#take-control').evaluate(b=>({rect:b.getBoundingClientRect().toJSON(),disabled:b.disabled,html:b.outerHTML})));throw e;});await p.locator('#take-control[aria-label="Return control"]').waitFor();
 // The toolbar can advertise Return even when the status projection has no pause.
 await p.locator('#take-control').tap();
 await p.waitForFunction(()=>!document.querySelector('#computer-control-error').hidden&&document.querySelector('#computer-control-error').textContent.includes('pause')).catch(e=>{console.log(JSON.stringify({missingPauseProbeFailed:true,writes}));throw e;});
 assert.equal(writes.length,0,'Never invent a pause identity');
 await p.reload();await p.locator('#prompt').waitFor();await p.locator('#show-computer').click();await p.getByRole('button',{name:'Use screen',exact:true}).click();await p.locator('#take-control[aria-label="Return control"]').waitFor();
 await p.locator('#take-control[aria-label="Return control"]').waitFor();
 await p.locator('#computer-expand').click();await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{readText:async()=>{throw new Error('Fixture clipboard denied');}},configurable:true}));await p.locator('#desktop-paste').click();await p.locator('#paste-text').fill('fixture login text');await p.locator('#text-form .primary').click();await p.locator('#text-dialog').waitFor({state:'hidden'});assert(await p.evaluate(()=>window.fixtureKeys.length>0),'Real Paste dialog sends text through VNC fixture');
 await p.setViewportSize({width:390,height:540});await p.waitForTimeout(300);
 await p.screenshot({path:path.join(out,engine+'-return-before.png')});
 omit=false;hold=new Promise(r=>release=r);
 await p.locator('#take-control').tap();
 await p.waitForFunction(()=>document.querySelector('#take-control').disabled);
 assert.match(await p.locator('#take-control').getAttribute('aria-label'),/Returning/);assert(await p.locator('#take-control .desktop-action-label').isVisible(),'Phone must show pending text');
 await p.screenshot({path:path.join(out,engine+'-return-pending.png')});
 assert.equal(writes.length,1);assert.deepEqual(writes[0],{enabled:false,bot_id:'piper',control_id:'piper-pause'});
 release();hold=null;await p.locator('#take-control[aria-label="Take control"]').waitFor();
 await p.setViewportSize({width:390,height:844});await p.locator('#desktop-loading').waitFor({state:'hidden'});assert.equal(await p.locator('#desktop-mode').textContent(),'Watching live');await p.waitForTimeout(300);await p.screenshot({path:path.join(out,engine+'-return-resumed.png')});await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.waitForTimeout(300);await p.screenshot({path:path.join(out,engine+'-return-resumed-light.png')});await p.evaluate(theme=>document.documentElement.dataset.theme=theme,fixtureTheme);
 assert(sessions.some(s=>s.control===false),'Successful release reconnects view-only');
 // Failure restores retryability; uncertain transport reconciles release to view-only.
 active=true;await p.locator('#desktop-reconnect').click();await p.getByRole('button',{name:'Use screen',exact:true}).click();failNetwork=true;await p.locator('#take-control').tap();await p.locator('#take-control[aria-label="Return control"]:not([disabled])').waitFor();assert.match(await p.locator('#computer-control-error').textContent(),/Could not reach the server/);await p.screenshot({path:path.join(out,engine+'-return-unconfirmed-error.png')});fail=true;
 await p.locator('#take-control').tap();await p.locator('#take-control[aria-label="Return control"]:not([disabled])').waitFor();
 assert.equal(active,true);ambiguous=true;await p.locator('#take-control').tap();await p.locator('#take-control[aria-label="Take control"]').waitFor();assert.equal(active,false);
 // Existing chat route still releases the exact pause and does not cancel queued work.
 active=true;await p.locator('#desktop-reconnect').click();await p.locator('#computer-close').click();
 await p.screenshot({path:path.join(out,engine+'-chat-return-before.png')});hold=new Promise(r=>release=r);await p.locator('#queue-status').getByRole('button',{name:'Return control',exact:true}).click();await p.waitForTimeout(100);await p.screenshot({path:path.join(out,engine+'-chat-return-pending.png')});release();hold=null;await p.waitForFunction(()=>!document.querySelector('#queue-status button'));await p.screenshot({path:path.join(out,engine+'-chat-return-resumed.png')});
 await p.locator('#show-computer').click();await p.waitForFunction(()=>document.querySelector('#desktop-mode').textContent==='Watching live');await p.locator('#computer-expand').click();
 for(const [category,points] of [['xS',14],['L',17],['XXXL',23],['AX3',40],['AX5',53]])for(const theme of ['dark','light']){
  await p.evaluate(({scale,theme})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';window.dispatchEvent(new CustomEvent('kindred-system-text-size',{detail:{scale}}));},{scale:points/17,theme});await p.waitForTimeout(300);
  assert.equal(await p.locator('#desktop-error').isVisible(),false,'Desktop error: '+await p.locator('#desktop-error').textContent());assert.equal(await p.locator('#computer-control-error').isVisible(),false);await p.screenshot({path:path.join(out,`${engine}-${category}-${theme}-computer.png`)});
  assert(await p.locator('#take-control .desktop-action-label').isVisible());
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 assert(writes.every(w=>w.bot_id==='piper'&&w.control_id==='piper-pause'&&w.enabled===false));const resizeWarnings=errors.filter(e=>e==='ResizeObserver loop completed with undelivered notifications.');assert.deepEqual(errors.filter(e=>!resizeWarnings.includes(e)),[]);
 console.log(JSON.stringify({passed:true,engine,writes,requests,resizeWarnings,missingPauseVisible:true,firstTouch:true,retry:true,ambiguousReconciled:true,chatUnchanged:true,keyboardViewport:'simulated; native iOS not exercised'}));
 await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
