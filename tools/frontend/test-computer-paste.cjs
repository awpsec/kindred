const {chromium}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 const p=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
 const inputRequests=[];p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/computer')inputRequests.push(r.url());});
 await p.route(origin+'/app.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../ui/app.js'),'utf8')+'\nexport {state,pasteIntoComputer};'}));
 await p.route(origin+'/api/status',r=>r.fulfill({json:{version:'test',screen_bot_id:'piper',takeover:true,vm_enabled:true}}));
 await p.addInitScript(t=>sessionStorage.setItem('kindred-token',t),token);await p.goto(origin);await p.waitForTimeout(500);
 const result=await p.evaluate(async()=>{const {state,pasteIntoComputer}=await import('/app.js');let disconnected=0,keys=[];const rfb={sendKey:k=>keys.push(k),disconnect:()=>disconnected++};state.rfb=rfb;state.desktopConnected=true;state.status.takeover=true;state.desktopControlRequested=true;
 await pasteIntoComputer('Aé中😀\r\n\tZ');const unicode=[...keys];keys=[];await pasteIntoComputer('x'.repeat(100));const longCount=keys.length;
 let oversize=false;try{await pasteIntoComputer('x'.repeat(16001));}catch{oversize=true;}
 keys=[];rfb.sendKey=k=>{keys.push(k);if(keys.length===32)state.desktopControlRequested=false;};let cancelled=false;try{await pasteIntoComputer('x'.repeat(100));}catch{cancelled=true;}
 const stoppedAt=keys.length;let denied=false;try{await pasteIntoComputer('secret');}catch{denied=true;}
 state.rfb=null;return{unicode,longCount,disconnected,oversize,cancelled,stoppedAt,denied};});
 assert.deepEqual(result.unicode,[65,233,0x01004e2d,0x0101f600,0xff0d,0xff09,90]);assert.equal(result.longCount,100);assert.equal(result.disconnected,0);assert(result.oversize&&result.cancelled&&result.denied);assert.equal(result.stoppedAt,32);assert.equal(inputRequests.length,0);console.log('Paste keeps the live connection; Unicode, multiline, size limits and control loss passed');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
