// Serve the pinned application's actual UI against local synthetic API data.
// No provider account, VM, Docker daemon or external service is contacted.
const fs=require('node:fs'),path=require('node:path');
const [source,folder]=process.argv.slice(2);
const {server}=require(path.resolve(source,'tools/frontend/fixtures/desktop.cjs'));
const original=server.listeners('request')[0];server.removeAllListeners('request');
let phase='chat';const reports=[];
const probe=`<script type="module">
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report=value=>fetch('/fixture/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const chatState=()=>{
 const content=document.querySelector('#content');
 const text=[...document.querySelectorAll('.message-row.assistant')].map(e=>e.innerText).join(' ');
 return {text,ready:!!content&&!content.inert&&content.getAttribute('aria-busy')!=='true'&&!document.querySelector('#chat-loading')&&getComputedStyle(content).visibility==='visible'};
};
try {
 let chat=chatState();
 for(let n=0;n<150&&(!chat.ready||!chat.text.includes('Here is the screenshot.'));n++){await sleep(100);chat=chatState();}
 if(!chat.ready||!chat.text.includes('Here is the screenshot.'))throw Error('Actual application chat did not become ready: '+JSON.stringify(chat));
 const text=chat.text;
 const state=await window.__TAURI__.core.invoke('profile_home_state');
 if(!Array.isArray(state.entries))throw Error('Native account bridge did not return entries');
 // Check capture capability without requesting permission or recording audio.
 await report({phase:'chat',passed:true,clientVersion:state.version,text,errors,secureContext:window.isSecureContext,microphoneCaptureAvailable:typeof navigator.mediaDevices?.getUserMedia==='function',audioContextAvailable:typeof (window.AudioContext||window.webkitAudioContext)==='function'});
 let notchTested=false,foregroundTested=false,previewTested=false,updaterTested=false;
 const framePhases=new Set();
 for(let n=0;n<300;n++){
  const data=await(await fetch('/fixture/phase')).json();
  if(data.phase.startsWith('frame-')&&!framePhases.has(data.phase)){
   if(!window.__KINDRED_MAC_OVERLAY||document.querySelector('.window-controls button'))throw Error('Expected native Mac traffic lights without duplicate HTML controls');
   const mode=data.phase.slice(6);
   if(mode==='light'||mode==='dark')document.documentElement.dataset.theme=mode;
   else if(mode==='maximize'||mode==='restore')await window.__TAURI__.core.invoke('window_action',{action:'maximize'});
   else if(mode==='fullscreen'||mode==='windowed')await window.__TAURI__.core.invoke('window_action',{action:'fullscreen'});
   else if(mode==='local-access')await window.__TAURI__.core.invoke('open_local_access',{theme:'dark',bounds:null});
   await sleep(mode==='fullscreen'||mode==='windowed'?1800:350);
   framePhases.add(data.phase);await report({phase:data.phase,passed:true,width:innerWidth,height:innerHeight,nativeControls:true});
  }
  if((data.phase==='notch'&&!notchTested)||(data.phase==='notch-foreground'&&!foregroundTested)||(data.phase==='notch-preview'&&!previewTested)){
   await window.__TAURI__.core.invoke('set_notch_notifications',{enabled:false});
   await window.__TAURI__.core.invoke('set_notch_notifications',{enabled:true});
   const status=await window.__TAURI__.core.invoke('notification_status');
   if(!status.notch?.supported||!status.notch.enabled)throw Error('Native notch toggle did not enable');
   if(data.phase==='notch-foreground'){
    // Preview notifications intentionally bypass foreground suppression. Exercise
    // a real notification through the normal native polling path instead.
    let polls=await(await fetch('/fixture/polls')).json();
    for(let i=0;i<100&&!polls.length;i++){await sleep(100);polls=await(await fetch('/fixture/polls')).json();}
    if(!polls.length)throw Error('Native notification poller did not initialize');
    const queued=await(await fetch('/fixture/finish',{method:'POST'})).json();
    const acknowledged=()=>polls.some(p=>p.after!==null&&Number(p.after)>=queued.cursor);
    for(let i=0;i<100&&!acknowledged();i++){await sleep(100);polls=await(await fetch('/fixture/polls')).json();}
    if(!acknowledged())throw Error('Native notification poller did not acknowledge the real alert');
    foregroundTested=true;
   }else{
    await window.__TAURI__.core.invoke('test_notification');
    if(data.phase==='notch')notchTested=true;else previewTested=true;
   }
   await report({phase:data.phase,passed:true});
  }
  if(data.phase==='updater'&&!updaterTested){window.open('kindred-update://check','_blank');updaterTested=true;await report({phase:'updater',passed:true});}
  if(data.phase==='native-dictation'){
   if(!window.__KINDRED_NATIVE_DICTATION)throw Error('Native macOS dictation capability is missing');
   const editor=document.querySelector('#prompt');editor.focus();
   if(document.activeElement!==editor)throw Error('Composer was not focused before native dictation');
   let accepted=false,unavailable='';
   try{await window.__TAURI__.core.invoke('start_native_dictation');accepted=true;}
   catch(e){unavailable=String(e);if(!unavailable.includes('Enable Dictation in macOS System Settings'))throw e;}
   await report({phase:'native-dictation',passed:true,accepted,unavailable,physicalSpeechVerified:false});
   break;
  }
  if(data.phase==='accounts'){
   if(notchTested)await window.__TAURI__.core.invoke('set_notch_notifications',{enabled:false});
   await window.__TAURI__.core.invoke('open_profile_home',{bounds:null,theme:'dark'});
   await report({phase:'accounts',passed:true});break;
  }
  await sleep(200);
 }
}catch(e){await report({passed:false,error:String(e),chat:chatState(),errors});}
</script>`;
// Block external HTTPS update discovery only for the test app’s proxy.
server.on('connect',(_req,socket)=>socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
server.on('request',async(req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const send=data=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(route==='/updates/client-stable.json'||route==='/updates/client-linux.json'){
  fs.writeFileSync(path.join(folder,'signed-feed.json'),JSON.stringify({served:true}));
  return send(JSON.parse(fs.readFileSync(path.join(__dirname,'native-client-feed-fixture.json'),'utf8')));
 }
 if(route==='/fixture/report'){
  let body='';for await(const chunk of req)body+=chunk;
  reports.push(JSON.parse(body));fs.writeFileSync(path.join(folder,'reports.json'),JSON.stringify(reports,null,2));return send({ok:true});
 }
 if(route==='/fixture/phase'){
  if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;phase=JSON.parse(body).phase;}
  return send({phase});
 }
 if(route==='/'){
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  return res.end(fs.readFileSync(path.resolve(source,'ui/index.html'),'utf8').replace('</body>',probe+'</body>'));
 }
 // Serve the pinned UI's modules directly. Older source fixtures may have a
 // static allowlist that predates a newly imported module; that must not turn
 // a valid packaged UI into a blank validation page.
 const file=route.slice(1);
 if(/^[a-z0-9-]+\.(js|css|svg)$/.test(file)){
  const asset=path.resolve(source,'ui',file);
  if(fs.existsSync(asset)){
   res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/javascript','Cache-Control':'no-store'});
   return res.end(fs.readFileSync(asset));
  }
 }
 const extras={'/identity/meta':{profiles:false},'/health':{ok:true},'/api/inbox-monitors':{items:[],provider_sources:[]},'/api/lists':[],'/api/reminders':[]};
 if(route in extras)return send(extras[route]);
 return original(req,res);
});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(folder,'fixture.json'),JSON.stringify({url:'http://127.0.0.1:'+server.address().port})));
