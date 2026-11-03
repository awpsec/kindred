// Opt-in local hardware check in the installed Mac WKWebView. Real getUserMedia,
// shipped dictation input selector, call graph, worklet and playback; fake server.
// Microphone PCM stays in RAM on loopback. Only numeric metadata is written.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {WebSocketServer,encode}=require('../../../scripts/release/native-ui-smoke/loopback-ws.cjs');
const root=path.resolve(__dirname,'../../../ui'),out=process.argv[2];if(!out)throw Error('Pass an exclusive metadata output directory');
fs.mkdirSync(out,{recursive:true});
const baseline=!!process.env.KINDRED_TEST_VOICE_INPUT_BASELINE,sessions=[],events=[],sockets=new Map();let sequence=0;
const voiceBaseline=()=>require('node:child_process').execFileSync('git',['show','d271cc42bbd7522407640a93687a689d52f9bede:ui/voice.js'],{cwd:path.resolve(__dirname,'../../..')});
const binding=Object.fromEntries(['dictation.js','voice.js','voice-audio-worklet.js'].map(n=>[n,crypto.createHash('sha256').update(n==='voice.js'&&baseline?voiceBaseline():fs.readFileSync(path.join(root,n))).digest('hex')]));
const html=`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><title>Kindred · local microphone check</title><link rel="stylesheet" href="/style.css"><style>body{background:#111;color:#eee;margin:0;padding:60px 40px;font:16px system-ui}main{max-width:900px;margin:auto}h1{font-size:24px}.conversation{position:relative;min-height:230px;margin:20px 0}#composer{position:relative;inset:auto;transform:none;width:100%;box-sizing:border-box}#prompt{width:75%;background:transparent;color:inherit;min-height:44px}.microphone-setting{margin:30px 0;padding:20px;background:#222}button,select{min-height:44px}pre{white-space:pre-wrap;padding:20px;background:#1d1d1d;border-radius:12px}#notice{min-height:25px}</style></head><body><main id="app"><form id="account-connect" hidden></form><h1>Local Mac microphone check</h1><p>Real microphone and Kindred audio. Fake call transport, no provider. No recorded audio.</p><p>Refresh microphones, choose the input, then start a call. Speak briefly, try mute/unmute, and end. Each test is capped at 45 seconds.</p><div id="input-settings"></div><div class="conversation"><div class="conversation-header">Capture QA</div><form id="composer"><textarea id="prompt" aria-label="Test draft" placeholder="Draft stays here"></textarea><button type="button" id="send">Send</button></form></div><p id="notice" role="status"></p><button id="playback" type="button">Play test tone</button><pre id="metadata" aria-label="Capture metadata">Ready</pre></main><script type="module" src="/fixture/probe.js"></script></body></html>`;
const probe=`import {createVoiceUI} from '/voice.js';import {createDictationUI} from '/dictation.js';import {icon,character} from '/characters.js';
localStorage.setItem('kindred-dictation-v1',JSON.stringify({enabled:true,model:'native',microphone:'default'}));
const by=id=>document.getElementById(id),report=value=>fetch('/fixture/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});window.addEventListener('error',e=>report({type:'error',name:e.error?.name||'Error'}));
const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{await report({type:'request',explicit:!!constraints.audio?.deviceId?.exact});try{const stream=await get(constraints);for(const t of stream.getAudioTracks()){const s=t.getSettings();await report({type:'track',label:t.label,sampleRate:s.sampleRate,channelCount:s.channelCount,echoCancellation:s.echoCancellation,noiseSuppression:s.noiseSuppression,autoGainControl:s.autoGainControl,muted:t.muted,enabled:t.enabled,readyState:t.readyState});t.addEventListener('ended',()=>report({type:'track-ended'}),{once:true});}return stream;}catch(e){await report({type:'capture-error',name:e.name});throw e;}};
const Context=window.AudioContext;window.AudioContext=class extends Context{constructor(...a){super(...a);report({type:'context',sampleRate:this.sampleRate,state:this.state});this.addEventListener('statechange',()=>report({type:'context-state',state:this.state}));}createBufferSource(){report({type:'playback-buffer'});return super.createBufferSource();}};
const notice=text=>{by('notice').textContent=text;},api=async(route,method='GET',data)=>{const r=await fetch('/api'+route,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return r.json();};
const dictation=createDictationUI({editor:by('prompt'),send:by('send'),composer:by('composer'),nativeInvoke:(...a)=>window.__TAURI__.core.invoke(...a),api,chatId:()=> 'dm-input',hasFiles:()=>false,notice,icon});by('input-settings').append(dictation.microphoneControl());
const voice=createVoiceUI({api,composer:by('composer'),editor:by('prompt'),send:by('send'),bot:()=>({name:'Capture QA',profile:{shape:'round',color:'#2475ff'}}),chatId:()=> 'dm-input',icon,avatar:b=>character(b.profile,36),notice,openSettings:()=>{},cancelDictation:()=>dictation.cancel(),microphone:()=>dictation.microphone()});await voice.init();
by('playback').onclick=()=>fetch('/fixture/playback',{method:'POST'});by('composer').onsubmit=e=>e.preventDefault();
setInterval(async()=>{const r=await fetch('/fixture/state');by('metadata').textContent=JSON.stringify(await r.json(),null,2);},1000);await report({type:'ready'});`;
function snapshot(){return {baseline,resourceHashes:binding,sessions:sessions.map(({sumSquares,samples,...s})=>({...s,rms:samples?Math.sqrt(sumSquares/samples):0})),events,noPaidProvider:true,noAudioRetained:true};}
function save(){fs.writeFileSync(path.join(out,'capture-metadata.json'),JSON.stringify(snapshot(),null,2)+'\n');}
function tone(send,row){const pcm=Buffer.alloc(24000);for(let i=0;i<12000;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*660/24000)*3000),i*2);send({type:'audio',data:pcm.toString('base64')});row.outputFrames++;row.outputBytes+=pcm.length;}
const server=http.createServer(async(req,res)=>{
  const n=new URL(req.url,'http://127.0.0.1').pathname,send=v=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
  if(n==='/fixture/event'){let body='';for await(const b of req){body+=b;if(body.length>4096){res.writeHead(413);return res.end();}}const v=JSON.parse(body);if(events.length<300)events.push({...v,at:Date.now()});save();return send({ok:true});}
  if(n==='/fixture/state')return send(snapshot());
  if(n==='/fixture/playback'){for(const [id,send]of sockets){const row=sessions.find(s=>s.id===id);tone(send,row);}return send({ok:true});}
  if(n==='/api/voice/settings')return send({enabled:true,configured:true,voice:'quartz',pace:'normal',voices:[{id:'quartz',name:'Quartz'}]});
  if(n==='/api/voice/start'){sequence++;return send({id:'local-'+sequence,ticket:String(sequence).padStart(64,'0')});}
  if(n==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(html);}
  if(n==='/fixture/probe.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(probe);}
  if(/^\/avatar-runtime\/(catalog\.js|host\.js|grok-avatar-engine\.mjs|rolldown-runtime\.mjs)$/.test(n)){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(path.join(root,n.slice(1))));}
  if(n==='/voice.js'&&baseline){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(voiceBaseline());}
  if(/^\/[a-z0-9-]+\.(js|css|svg)$/.test(n)){try{res.writeHead(200,{'Content-Type':n.endsWith('.js')?'text/javascript':n.endsWith('.css')?'text/css':'image/svg+xml','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(root,n.slice(1))));}catch{}}
  res.writeHead(404);res.end();
});
const wsServer=new WebSocketServer();server.on('upgrade',(req,socket,head)=>{
  if(new URL(req.url,'http://127.0.0.1').pathname!=='/voice'){socket.destroy();return;}
  wsServer.handleUpgrade(req,socket,head,ws=>{
    const id='local-'+sequence,row={id,started:Date.now(),inputFrames:0,inputBytes:0,activeFrames:0,mutedFrames:0,mutedActiveFrames:0,peak:0,sumSquares:0,samples:0,muteEvents:0,outputFrames:0,outputBytes:0,ended:false};sessions.push(row);let muted=false;
    const send=value=>{if(ws.readyState===1)socket.write(encode(Buffer.from(JSON.stringify(value)),1));};sockets.set(id,send);send({type:'started',started_ms:Date.now()});
    const cap=setTimeout(()=>{send({type:'ended',saved:true});ws.close()},45000);
    ws.on('message',data=>{const v=JSON.parse(data.toString());if(v.type==='audio'){const pcm=Buffer.from(v.data,'base64');if(pcm.length!==1920){ws.close();return;}row.inputFrames++;row.inputBytes+=pcm.length;let peak=0;for(let i=0;i<pcm.length;i+=2){const n=pcm.readInt16LE(i)/32768;row.sumSquares+=n*n;row.samples++;peak=Math.max(peak,Math.abs(n));}row.peak=Math.max(peak,row.peak);if(peak>128/32768)row.activeFrames++;if(muted){row.mutedFrames++;if(peak>0)row.mutedActiveFrames++;}}
      else if(v.type==='mute'){muted=v.muted===true;row.muteEvents++;send(v);}else if(v.type==='ping')send({type:'pong'});else if(v.type==='end'){send({type:'ended',saved:true});ws.close();}});
    ws.on('close',()=>{clearTimeout(cap);row.ended=true;row.finished=Date.now();sockets.delete(id);save();});
  });
});
const flush=setInterval(save,1000);server.listen(0,'127.0.0.1',()=>{const url='http://127.0.0.1:'+server.address().port;fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify({url,baseline,resourceHashes:binding},null,2)+'\n');console.log(url);});
process.on('SIGTERM',()=>{clearInterval(flush);wsServer.close();server.closeAllConnections();server.close();save();});
