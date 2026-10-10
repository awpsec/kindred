// Test-only RFB destination. The expected clipboard text never enters this module.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {WebSocketServer}=require('ws'),{PNG}=require('pngjs'),{chromium}=require('playwright');
const WIDTH=960,HEIGHT=640;
function bounded(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));}
const html=`<!doctype html><meta charset="utf-8"><title>Disposable Paste destination</title><style>body{font:20px system-ui;margin:30px}textarea{width:850px;height:440px;font:24px system-ui}</style><h1>Disposable Paste destination</h1><form><textarea id="destination" autofocus></textarea><button>Submit</button></form><script>window.observations={inputs:0,submits:0,enterDown:0};document.querySelector('form').onsubmit=e=>{e.preventDefault();observations.submits++};document.querySelector('textarea').addEventListener('input',()=>observations.inputs++);document.querySelector('textarea').addEventListener('keydown',e=>{if(e.key==='Enter')observations.enterDown++});</script>`;
async function attach(server,options){
 const {output,token,executablePath,initiallyFocused=true}=options;
 if(!server.listening||server.address().address!=='127.0.0.1')throw Error('Use a listening loopback server');
 if(typeof token!=='string'||!token||!output)throw Error('Synthetic token and output required');
 fs.mkdirSync(output,{recursive:true});
 const origin='http://127.0.0.1:'+server.address().port,ticket=crypto.randomBytes(32).toString('hex');
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT}});page.setDefaultTimeout(5000);
 const events=[];let connected=0,keys=0,control=false,closed=false,failure=null,inputTail=Promise.resolve();
 const sessions=new Set(),wss=new WebSocketServer({noServer:true,maxPayload:1024*1024});
 const old=server.listeners('request');server.removeAllListeners('request');
 const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const handle=async(req,res)=>{
  const route=new URL(req.url,origin).pathname;
  if(route==='/fixture/mac-paste/destination'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
  const paths=['/api/status','/api/takeover','/api/computer/session'];
  if(!paths.includes(route)){for(const listener of old)listener.call(server,req,res);return;}
  if(req.headers.authorization!=='Bearer '+token){json(res,{error:'Synthetic account required'},401);return;}
  if(route==='/api/status'){json(res,{version:'fixture',screen_bot_id:'piper',takeover:control,vm_enabled:true});return;}
  let body='';for await(const c of req){body+=c;if(body.length>4096){json(res,{error:'Oversized fixture request'},413);return;}}
  let data;try{data=JSON.parse(body||'{}');}catch{json(res,{error:'Invalid fixture JSON'},400);return;}
  if(route==='/api/takeover'){control=data.enabled===true;json(res,{ok:true});return;}
  json(res,{ticket,control:control&&data.control===true});
 };
 const request=(req,res)=>{handle(req,res).catch(e=>{failure=String(e);if(!res.headersSent)json(res,{error:'Fixture failed'},500);else res.destroy();});};
 server.on('request',request);
 const upgrade=(req,socket,head)=>{
  const u=new URL(req.url,origin);
  if(u.pathname!=='/vnc'||u.searchParams.get('ticket')!==ticket||req.headers.origin!==origin){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 };
 server.on('upgrade',upgrade);
 await page.goto(origin+'/fixture/mac-paste/destination');if(initiallyFocused)await page.locator('#destination').focus();else await page.evaluate(()=>document.activeElement?.blur());
 const cdp=await page.context().newCDPSession(page);
 const input=async(key,down)=>{
  // Real browser event input. No text is inserted from an expectation or oracle.
  if(key===0xff0d||key===0xff09){await bounded(cdp.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:key===0xff0d?'Enter':'Tab',code:key===0xff0d?'Enter':'Tab',windowsVirtualKeyCode:key===0xff0d?13:9,...(down&&key===0xff0d?{text:'\r',unmodifiedText:'\r'}:{})}),5000,'Browser special key');return;}
  const point=key>=0x01000000?key&0xffffff:key;
  if(point<32||point>0x10ffff||(point>=0xd800&&point<=0xdfff))throw Error('Unsupported destination keysym '+key);
  const text=String.fromCodePoint(point);
  await bounded(cdp.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:text,...(down?{text,unmodifiedText:text}:{})}),5000,'Browser Unicode key');
 };
 wss.on('connection',ws=>{
  const connectionID=crypto.randomUUID();sessions.add(ws);let stage=0,buffer=Buffer.alloc(0),format={big:false,r:16,g:8,b:0};
  ws.on('error',e=>{failure=String(e);});ws.send(Buffer.from('RFB 003.008\n'));ws.on('close',()=>sessions.delete(ws));
  const fail=e=>{failure=String(e);ws.close(1011,'Fixture protocol failed');};
  const frame=async()=>{
   const png=PNG.sync.read(await page.screenshot({type:'png'}));
   if(png.width!==WIDTH||png.height!==HEIGHT)throw Error('Destination framebuffer size changed');
   const out=Buffer.alloc(16+WIDTH*HEIGHT*4);out[0]=0;out.writeUInt16BE(1,2);out.writeUInt16BE(WIDTH,8);out.writeUInt16BE(HEIGHT,10);out.writeInt32BE(0,12);
   for(let i=0;i<WIDTH*HEIGHT;i++){const p=i*4,value=((png.data[p]<<format.r)|(png.data[p+1]<<format.g)|(png.data[p+2]<<format.b))>>>0;format.big?out.writeUInt32BE(value,16+p):out.writeUInt32LE(value,16+p);}
   if(ws.readyState===1)ws.send(out);
  };
  const parse=()=>{
   while(buffer.length){
    if(stage===0){if(buffer.length<12)return;if(buffer.subarray(0,12).toString()!=='RFB 003.008\n')throw Error('Require RFB3.8');buffer=buffer.subarray(12);ws.send(Buffer.from([1,1]));stage=1;continue;}
    if(stage===1){if(buffer.length<1)return;if(buffer[0]!==1)throw Error('Invalid local security selection');buffer=buffer.subarray(1);ws.send(Buffer.alloc(4));stage=2;continue;}
    if(stage===2){if(buffer.length<1)return;buffer=buffer.subarray(1);const name=Buffer.from('Disposable real Chromium textarea'),init=Buffer.alloc(24+name.length);init.writeUInt16BE(WIDTH);init.writeUInt16BE(HEIGHT,2);init[4]=32;init[5]=24;init[7]=1;for(const i of [8,10,12])init.writeUInt16BE(255,i);init[14]=16;init[15]=8;init.writeUInt32BE(name.length,20);name.copy(init,24);ws.send(init);connected++;stage=3;continue;}
    const type=buffer[0];let length;
    if(type===0)length=20;else if(type===2){if(buffer.length<4)return;length=4+buffer.readUInt16BE(2)*4;}else if(type===3)length=10;else if(type===4)length=8;else if(type===5)length=6;else if(type===6){if(buffer.length<8)return;length=8+buffer.readUInt32BE(4);if(length>1024*1024)throw Error('Oversized clipboard packet');}else throw Error('Unsupported RFB message '+type);
    if(buffer.length<length)return;const message=buffer.subarray(0,length);buffer=buffer.subarray(length);
    if(type===0){if(message[4]!==32||message[5]!==24||message[7]!==1||[8,10,12].some(i=>message.readUInt16BE(i)!==255))throw Error('Require true-color32');format={big:!!message[6],r:message[14],g:message[15],b:message[16]};if(![format.r,format.g,format.b].every(v=>[0,8,16].includes(v))||new Set([format.r,format.g,format.b]).size!==3)throw Error('Unsupported channel format');}
    if(type===3)inputTail=inputTail.then(frame);
    if(type===4){if(!control){fail('Input received without control');continue;}const key=message.readUInt32BE(4),down=!!message[1];keys++;const event={sequence:events.length+1,connectionID,key,down,received:Date.now(),processed:null,outcome:null};events.push(event);inputTail=inputTail.then(async()=>{if(ws.readyState!==1||!control){event.outcome='cancelled-before-dispatch';event.processed=Date.now();return;}await input(key,down);event.outcome='browser-dispatched';event.processed=Date.now();});}
    if(type===5&&control){const x=message.readUInt16BE(2),y=message.readUInt16BE(4);inputTail=inputTail.then(async()=>{await page.mouse.move(x,y);if(message[1]&1)await page.mouse.down();else await page.mouse.up();});}
    inputTail=inputTail.catch(fail);
   }
  };
  ws.on('message',data=>{try{buffer=Buffer.concat([buffer,data]);if(buffer.length>1024*1024)throw Error('Oversized RFB buffer');parse();}catch(e){fail(e);}});
 });
 async function snapshot(label){
  const deadline=Date.now()+3000;let stable=0,previous=-1;while(stable<3){await bounded(inputTail,Math.max(1,deadline-Date.now()),'Destination input queue');if(failure)throw Error(failure);const current=events.length;stable=current===previous?stable+1:0;previous=current;if(Date.now()>deadline)throw Error('Destination input did not quiesce');await new Promise(r=>setTimeout(r,50));}
  const observed=await page.evaluate(()=>({text:document.querySelector('#destination').value,...window.observations}));
  const receipt={...observed,connected,keyEvents:keys,events:events.map(e=>({...e})),browserVersion:browser.version(),origin,destination:origin+'/fixture/mac-paste/destination'};
  if(label){if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid evidence label');await page.screenshot({path:path.join(output,label+'.png')});fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify(receipt,null,2));}
  return receipt;
 }
 return {origin,ready:true,async snapshot(label){return snapshot(label);},async clear(){await inputTail;await page.evaluate(()=>{document.querySelector('#destination').value='';window.observations={inputs:0,submits:0,enterDown:0};});await page.locator('#destination').focus();keys=0;events.length=0;},async disconnect(){for(const ws of sessions)ws.close();},async close(){if(closed)return;closed=true;server.off('request',request);for(const l of old)server.on('request',l);server.off('upgrade',upgrade);for(const ws of sessions)ws.terminate();await new Promise(r=>wss.close(r));await browser.close();}};
}
module.exports={attach};
