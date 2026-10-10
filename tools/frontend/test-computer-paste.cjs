const {chromium,webkit}=require(process.env.KINDRED_PLAYWRIGHT_MODULE||'playwright');
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(process.env.WEBKIT?webkit:chromium).launch({headless:true});try{
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
 const native=await p.evaluate(async()=>{
  const {state}=await import('/app.js');let keys=[],reads=0,browserReads=0,mode='text',resolveRead;
  const rfb={sendKey:k=>keys.push(k)};state.rfb=rfb;state.desktopConnected=true;state.status.takeover=true;state.desktopControlRequested=true;
  window.__KINDRED_NATIVE_CLIPBOARD_TEXT=true;
  window.__TAURI__={core:{invoke:async command=>{if(command!=='read_clipboard_text')throw new Error('Unexpected native command');reads++;if(mode==='error')throw new Error('Clipboard unavailable');if(mode==='pending')return new Promise(resolve=>resolveRead=resolve);return mode==='empty'?'':'Aé中😀\nZ';}}};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{browserReads++;throw new Error('Browser paste menu requested');}}});
  const click=()=>document.getElementById('desktop-paste').onclick(),dialog=()=>document.getElementById('text-dialog').open;
  await click();const direct={keys:[...keys],reads,browserReads,dialog:dialog()};keys=[];
  mode='error';await click();const failed={count:keys.length,browserReads,dialog:dialog()};
  mode='empty';await click();const empty=keys.length;
  mode='pending';const pending=click();while(!resolveRead)await new Promise(r=>setTimeout(r,0));state.rfb={sendKey:k=>keys.push(k)};resolveRead('Never paste to a replacement connection');await pending;const switched=keys.length;
  state.desktopControlRequested=false;const before=reads;await click();const denied=reads===before;
  // Plain browser clients still have the manual fallback when access is denied.
  window.__KINDRED_NATIVE_CLIPBOARD_TEXT=false;state.desktopControlRequested=true;await click();const fallback=dialog();document.getElementById('text-dialog').close();state.rfb=null;
  return {direct,failed,empty,switched,denied,fallback};
 });
 assert.deepEqual(native.direct,{keys:[65,233,0x01004e2d,0x0101f600,0xff0d,90],reads:1,browserReads:0,dialog:false});
 assert.deepEqual(native.failed,{count:0,browserReads:0,dialog:false});assert.equal(native.empty,0);assert.equal(native.switched,0);assert(native.denied&&native.fallback);
 assert.deepEqual(result.unicode,[65,233,0x01004e2d,0x0101f600,0xff0d,0xff09,90]);assert.equal(result.longCount,100);assert.equal(result.disconnected,0);assert(result.oversize&&result.cancelled&&result.denied);assert.equal(result.stoppedAt,32);assert.equal(inputRequests.length,0);console.log('Native one-click paste bypasses browser clipboard; failures do not reopen menus; connection changes and control loss stop input; browser fallback, Unicode, multiline and size limits passed');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);process.exit(1)});
