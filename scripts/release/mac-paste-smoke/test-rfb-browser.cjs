const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),vm=require('node:vm');
const {chromium}=require('playwright'),{WebSocket}=require('ws'),{attach}=require('./rfb-browser.cjs');
const source=path.resolve(__dirname,'../../..'),output=process.env.KINDRED_PASTE_SMOKE_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'kindred-paste-rfb-'));
async function snapshotBoundary(){
 const code=fs.readFileSync(process.env.KINDRED_PASTE_SNAPSHOT_SOURCE||path.join(__dirname,'rfb-browser.cjs'),'utf8'),start=code.indexOf(' async function snapshot(label){'),end=code.indexOf(' return {origin,ready:true',start);
 assert.ok(start>=0&&end>start);
 for(const phase of ['final-sleep','oracle','screenshot','oracle-timeout']){
  let injected=false,text='',tail=Promise.resolve(),inputSequence=0,processedInputSequence=0;const events=[];
  const inject=()=>{if(injected)return;injected=true;inputSequence++;events.push({sequence:1,processed:null,outcome:null});tail=new Promise(resolve=>setTimeout(()=>{text='actual late input';processedInputSequence=inputSequence;events[0].processed=Date.now();events[0].outcome='browser-dispatched';resolve();},120));};
  const context={events,connected:1,keys:1,failure:null,sourceBinding:{sourceCommit:'synthetic-source-boundary'},origin:'http://127.0.0.1:1',browser:{version:()=> 'snapshot-double'},output:'unused',path,fs:{writeFileSync(){}},Date,setTimeout,clearTimeout,Promise,Error,JSON,bounded(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label)),ms))]).finally(()=>clearTimeout(timer));},page:{async evaluate(){if(phase==='oracle-timeout')return new Promise(()=>{});if(phase==='oracle')inject();return{text,inputs:text?1:0,submits:0,enterDown:0};},async screenshot(){if(phase==='screenshot')inject();}}};
  Object.defineProperty(context,'inputTail',{get:()=>tail});Object.defineProperty(context,'inputSequence',{get:()=>inputSequence});Object.defineProperty(context,'processedInputSequence',{get:()=>processedInputSequence});vm.createContext(context);vm.runInContext(code.split('\n').find(line=>line.startsWith('function bounded(')),context);
  const snapshot=vm.runInContext(code.slice(start,end)+'\nsnapshot',context);
  if(phase==='final-sleep')setTimeout(inject,175);
  if(phase==='oracle-timeout'){await assert.rejects(snapshot(),/Destination oracle timed out/);continue;}
  const result=await snapshot(phase==='screenshot'?'boundary':undefined);
  assert.equal(result.text,'actual late input',phase);assert.equal(result.receivedSequence,1,phase);assert.equal(result.processedSequence,1,phase);assert.equal(result.events[0].outcome,'browser-dispatched',phase);assert.ok(result.events[0].processed,phase);
 }
 const pointer=code.split('\n').find(line=>line.includes('if(type===5&&control)'));assert.ok(pointer);
 for(const mode of ['control-lost','disconnected','still-controlled']){
  let release,moves=0;const context={type:5,control:true,inputSequence:0,processedInputSequence:0,message:Buffer.from([5,0,0,1,0,2]),inputTail:new Promise(r=>release=r),ws:{readyState:1},page:{mouse:{async move(){moves++},async down(){moves++},async up(){moves++}}}};vm.createContext(context);vm.runInContext(pointer,context);if(mode==='control-lost')context.control=false;if(mode==='disconnected')context.ws.readyState=3;release();await context.inputTail;assert.equal(moves,mode==='still-controlled'?2:0,mode);assert.equal(context.processedInputSequence,1);
 }
 console.log('Snapshot boundary: final sleep/oracle/screenshot/timeout and pointer dispatch fences passed');
}
(async()=>{
 await snapshotBoundary();
 const server=http.createServer((req,res)=>{
  if(req.url==='/vendor.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(source,'ui/vendor.js')));return;}
  if(req.url==='/client'){res.setHeader('Content-Type','text/html');res.end(`<div id="screen" style="width:960px;height:640px"></div><script type="module">import {RFB} from '/vendor.js';window.openRFB=t=>new Promise((resolve,reject)=>{const r=new RFB(document.querySelector('#screen'),'ws://'+location.host+'/vnc?ticket='+t);const timer=setTimeout(()=>{r.disconnect();reject(Error('RFB connect deadline'))},15000);r.addEventListener('connect',()=>{clearTimeout(timer);window.rfb=r;resolve()});r.addEventListener('securityfailure',e=>reject(Error(JSON.stringify(e.detail))));});</script>`);return;}res.writeHead(404);res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let destination,browser;const token='synthetic-rfb-test-only';
 try{
  await assert.rejects(attach(server,{output,token,source,sourceCommit:'0'.repeat(40)}),/UI source commit mismatch/);
  destination=await attach(server,{output,token,executablePath:process.env.KINDRED_PASTE_CHROMIUM,initiallyFocused:!process.env.KINDRED_PASTE_UNFOCUSED,source,sourceCommit:execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()});
  browser=await chromium.launch({headless:true,...(process.env.KINDRED_PASTE_CHROMIUM?{executablePath:process.env.KINDRED_PASTE_CHROMIUM}:{})});
  const client=await browser.newPage(),origin=destination.origin;
  const post=async(route,body)=>{const r=await fetch(origin+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  assert.equal((await fetch(origin+'/api/computer/session',{method:'POST',body:'{}'})).status,401);
  await post('/api/takeover',{enabled:true});const {ticket}=await post('/api/computer/session',{control:true});
  await client.goto(origin+'/client');await client.waitForFunction(()=>typeof window.openRFB==='function');await client.evaluate(t=>openRFB(t),ticket);
  const values=[0x41,0xe9,0x01004e2d,0x0101f600,0xff0d,0x5a];
  await client.evaluate(values=>{for(const v of values)window.rfb.sendKey(v);},values);
  const actual=await destination.snapshot('unicode-multiline');assert.equal(actual.text,'Aé中😀\nZ');assert.equal(actual.submits,0);assert.equal(actual.enterDown,1);assert.equal(actual.inputs,6);assert.equal(actual.keyEvents,12);assert.equal(actual.events.length,12);assert.equal(actual.receivedSequence,12);assert.equal(actual.processedSequence,12);assert.equal(actual.sourceBinding.appSha256,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(source,'ui/app.js'))).digest('hex'));assert.ok(actual.events.every((e,i)=>e.sequence===i+1&&e.processed&&e.outcome==='browser-dispatched'));assert.equal(new Set(actual.events.map(e=>e.connectionID)).size,1);assert.equal(actual.connected,1);
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
