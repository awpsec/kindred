const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{WebSocket}=require('ws'),{attach}=require('./rfb-browser.cjs');
const source=path.resolve(__dirname,'../../..'),output=process.env.KINDRED_PASTE_SMOKE_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'kindred-paste-rfb-'));
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/vendor.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(source,'ui/vendor.js')));return;}
  if(req.url==='/client'){res.setHeader('Content-Type','text/html');res.end(`<div id="screen" style="width:960px;height:640px"></div><script type="module">import {RFB} from '/vendor.js';window.openRFB=t=>new Promise((resolve,reject)=>{const r=new RFB(document.querySelector('#screen'),'ws://'+location.host+'/vnc?ticket='+t);const timer=setTimeout(()=>{r.disconnect();reject(Error('RFB connect deadline'))},15000);r.addEventListener('connect',()=>{clearTimeout(timer);window.rfb=r;resolve()});r.addEventListener('securityfailure',e=>reject(Error(JSON.stringify(e.detail))));});</script>`);return;}res.writeHead(404);res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let destination,browser;const token='synthetic-rfb-test-only';
 try{
  destination=await attach(server,{output,token,executablePath:process.env.KINDRED_PASTE_CHROMIUM,initiallyFocused:!process.env.KINDRED_PASTE_UNFOCUSED});
  browser=await chromium.launch({headless:true,...(process.env.KINDRED_PASTE_CHROMIUM?{executablePath:process.env.KINDRED_PASTE_CHROMIUM}:{})});
  const client=await browser.newPage(),origin=destination.origin;
  const post=async(route,body)=>{const r=await fetch(origin+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  assert.equal((await fetch(origin+'/api/computer/session',{method:'POST',body:'{}'})).status,401);
  await post('/api/takeover',{enabled:true});const {ticket}=await post('/api/computer/session',{control:true});
  await client.goto(origin+'/client');await client.waitForFunction(()=>typeof window.openRFB==='function');await client.evaluate(t=>openRFB(t),ticket);
  const values=[0x41,0xe9,0x01004e2d,0x0101f600,0xff0d,0x5a];
  await client.evaluate(values=>{for(const v of values)window.rfb.sendKey(v);},values);
  const actual=await destination.snapshot('unicode-multiline');assert.equal(actual.text,'Aé中😀\nZ');assert.equal(actual.submits,0);assert.equal(actual.enterDown,1);assert.equal(actual.inputs,6);assert.equal(actual.keyEvents,12);assert.equal(actual.events.length,12);assert.ok(actual.events.every((e,i)=>e.sequence===i+1&&e.processed&&e.outcome==='browser-dispatched'));assert.equal(new Set(actual.events.map(e=>e.connectionID)).size,1);assert.equal(actual.connected,1);
  await client.screenshot({path:path.join(output,'real-novnc-client.png')});
  await destination.clear();await post('/api/takeover',{enabled:false});
  const noControl=await destination.snapshot('no-control-empty');assert.equal(noControl.text,'');assert.equal(noControl.keyEvents,0);
  await post('/api/takeover',{enabled:true});await destination.disconnect();
  await client.waitForFunction(()=>window.rfb._rfbConnectionState==='disconnected');
  await client.evaluate(()=>window.rfb.sendKey(0x58));const stale=await destination.snapshot('disconnected-refusal');assert.equal(stale.text,'');assert.equal(stale.keyEvents,0);
  await client.evaluate(t=>openRFB(t),ticket);await client.evaluate(()=>window.rfb.sendKey(0x59));
  const fresh=await destination.snapshot('fresh-reconnection');assert.equal(fresh.text,'Y');assert.equal(fresh.connected,2);assert.equal(fresh.keyEvents,2);assert.equal(fresh.submits,0);assert.notEqual(fresh.events[0].connectionID,actual.events[0].connectionID);
  const bad=await new Promise(resolve=>{const ws=new WebSocket(origin.replace('http:','ws:')+'/vnc?ticket=wrong',{headers:{Origin:origin}});ws.on('error',()=>resolve(true));ws.on('open',()=>resolve(false));});assert.equal(bad,true);
  console.log(JSON.stringify({passed:true,output,unicode:actual.text,realInputEvents:actual.inputs,submit:actual.submits,connectionIDs:fresh.events.map(e=>e.connectionID),scope:'Real noVNC/RFB/browser destination; no native Mac clipboard or packaged UI claim'}));
 }finally{if(browser)await browser.close();if(destination)await destination.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
