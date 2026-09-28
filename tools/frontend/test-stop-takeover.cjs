const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch();try{
 const p=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port,events=[];let stopping=false,polls=0,controlled=false;
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,toggleControl}; connectDesktop=async()=>{window.controlConnected=state.desktopControlRequested&&state.status.takeover;};'}));
 await p.route(origin+'/api/status*',r=>{if(stopping)polls++;return r.fulfill({json:{screen_bot_id:'piper',takeover:controlled,computer_busy:stopping&&polls<3,computer_recovering_seconds:0}});});
 await p.route(origin+'/api/runs/task/cancel',r=>{events.push('cancel');stopping=true;return r.fulfill({json:{}});});
 await p.route(origin+'/api/takeover',r=>{events.push('takeover');assert(polls>=3,'Wait for actual screen availability');assert.equal(r.request().postDataJSON().bot_id,'piper');controlled=true;return r.fulfill({json:{enabled:true}});});
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.locator('#prompt').waitFor();await p.waitForTimeout(400);
 const result=await p.evaluate(async()=>{const {state,toggleControl}=await import('/app.js');state.allRuns=[{id:'task',bot_id:'piper',status:'running'}];state.screenBotId='piper';state.status.takeover=false;const start=performance.now();await toggleControl();return {connected:window.controlConnected,taking:state.takingControl,elapsed:performance.now()-start};});
 assert.deepEqual(events,['cancel','takeover']);assert(result.connected);assert(!result.taking);assert(result.elapsed<5000);
 console.log(JSON.stringify({passed:true,singleClick:true,waitsForScreen:true,scopedToBot:true,elapsed:result.elapsed}));
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
