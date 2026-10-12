const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.WEBKIT?'webkit':'chromium',browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true}),out=process.env.KINDRED_TEST_ARTIFACTS||'/tmp/computer-lifecycle-feedback';fs.mkdirSync(out,{recursive:true});
 async function bounded(p,label){let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' deadline')),12000))]);}finally{clearTimeout(timer);}}
 try{const results=[];for(const scenario of ['reboot','start','refused','shutdown','selection','closed','account','takeover','invalid','screen-failed','settings-closed','pane-hidden','late-takeover','connected-settings-closed'].filter(s=>!process.env.KINDRED_TEST_CASE||s===process.env.KINDRED_TEST_CASE)){
 console.log('Starting '+scenario);
 const page=await browser.newPage({viewport:{width:1180,height:850}});page.setDefaultTimeout(12000);const errors=[],actions=[],sessions=[];let release,received,hold=new Promise(r=>release=r),actionReceived=new Promise(r=>received=r);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);
 await page.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.KINDRED_BASELINE_APP||path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,openComputer,disconnectDesktop};'}));
 await page.route(origin+'/vendor.js',r=>{const real=fs.readFileSync(path.resolve(__dirname,'../../ui/vendor.js'),'utf8').replace('et as RFB','FixtureRFB as RFB');return r.fulfill({contentType:'text/javascript',body:'class FixtureRFB extends EventTarget {constructor(host){super();this.host=host;const c=document.createElement("canvas");c.width=600;c.height=400;host.append(c);setTimeout(()=>this.dispatchEvent(new Event(window.fixtureFail?"disconnect":"connect")),10);}disconnect(){this.host.remove();}}\n'+real});});
 await page.route(origin+'/api/**',async r=>{
 const req=r.request(),n=new URL(req.url()).pathname,send=json=>r.fulfill({json});
 if(n==='/api/bots')return send(['piper','another-bot'].map(id=>({id,name:id==='piper'?'Piper':'Another bot',provider:'codex',profile:{shape:'pebble',color:'#2475ff'}})));
 if(n==='/api/chats')return send(['piper','another-bot'].map(id=>({id:'dm-'+id,name:id,members:[id]})));
 if(n==='/api/status')return send({vm_enabled:true,vm:'configured-domain',screen_bot_id:'piper',takeover:scenario==='takeover'||(scenario==='late-takeover'&&actions.length>0)});
 if(n==='/api/computer/resources')return send({uptime_seconds:12,cpu_percent:1,memory_total:100,memory_used:10});
 if(n==='/api/computer/session'){sessions.push(req.postDataJSON());return send({ticket:'synthetic-'+sessions.length});}
 if(n.startsWith('/api/vm/')){actions.push(n);received();await hold;if(scenario==='refused')return r.fulfill({status:400,json:{error:'A screen is in use. Return control first.'}});return send({state:scenario==='invalid'?'unknown':scenario==='shutdown'?'shut off':'running'});}
 return r.continue();});
 await page.goto(origin);await page.locator('#bots').getByRole('button',{name:'Piper',exact:true}).waitFor();
 if(scenario!=='pane-hidden'){await page.evaluate(async()=>{await(await import('/app.js')).openComputer(false,true);});
 await page.waitForFunction(async()=>!!(await import('/app.js')).state.desktopConnected);}
 const initial=sessions.length;
 await page.locator('#settings-button').click();await page.locator('#settings-dialog').getByRole('button',{name:'Bot Computer',exact:true}).click();
 const action=scenario==='shutdown'?'Shut down':scenario==='start'?'Start computer':'Reboot computer';
 const click=page.getByRole('button',{name:action,exact:true}).click();click.catch(()=>{});await bounded(actionReceived,'VM request');
 if(['selection','account','closed'].includes(scenario))await page.evaluate(async scenario=>{const {state,disconnectDesktop}=await import('/app.js');if(scenario==='selection'){state.screenBotId='another-bot';state.bot=state.bots.find(b=>b.id==='another-bot');state.chat=null;}if(scenario==='account')state.token='another-synthetic-account';if(scenario==='closed'){document.getElementById('computer-panel').hidden=true;disconnectDesktop();}},scenario);
 if(scenario==='screen-failed')await page.evaluate(()=>window.fixtureFail=true);
 if(scenario==='settings-closed')await page.evaluate(()=>document.getElementById('settings-dialog').close());
 release();await click;
 if(['reboot','start','screen-failed','connected-settings-closed'].includes(scenario)){
 for(let i=0;sessions.length<initial+1&&i<100;i++)await page.waitForTimeout(50);
 assert.equal(sessions.length,initial+1,'Successful action reconnects the selected screen once');
 assert.deepEqual(sessions.at(-1),{control:false,bot_id:'piper'},'Reconnect remains view-only and bot-bound');
 if(scenario==='screen-failed'){await page.locator('#desktop-error').waitFor();await page.waitForTimeout(1800);assert.equal(sessions.length,initial+1,'Failed screen attempt is not automatically replayed');assert(!await page.evaluate(async()=>!!(await import('/app.js')).state.desktopConnected));}
 else await page.waitForFunction(()=>document.getElementById('computer-action-status').textContent.includes('Screen connected'));
 if(scenario==='connected-settings-closed'){await page.evaluate(async()=>{document.getElementById('settings-dialog').close();(await import('/app.js')).state.rfb.dispatchEvent(new Event('disconnect'));});assert(!await page.evaluate(async()=>!!(await import('/app.js')).state.desktopConnected),'A connected transport still handles disconnect after Settings closes');await page.locator('#desktop-error').waitFor();}
 }else{
 await page.waitForFunction(()=>![...document.querySelectorAll('#settings-content button')].some(n=>n.textContent==='Start computer'&&n.disabled));await page.waitForTimeout(200);
 assert.equal(sessions.length,initial,'No reconnect on refusal, shutdown, stale selection/account, closed pane, takeover or invalid state');
 const text=await page.locator('#computer-action-status').textContent();assert(!text.includes('Screen connected')&&!text.includes('Computer is responding.'),'No false screen readiness');
 if(scenario==='refused')assert.match(text,/screen is in use/);
 }
 assert.equal(actions.length,1,'One VM action, no action retry');assert.deepEqual(errors,[]);results.push({scenario,actions:actions.length,reconnects:sessions.length-initial,status:await page.locator('#computer-action-status').textContent()});
 console.log('Passed '+scenario);
 if(scenario==='reboot')await page.screenshot({path:path.join(out,engine+'-reboot.png')});await page.close();
 }
 fs.writeFileSync(path.join(out,engine+'-results.json'),JSON.stringify({engine,results},null,2));console.log(JSON.stringify({engine,passed:true,cases:results.length}));
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
