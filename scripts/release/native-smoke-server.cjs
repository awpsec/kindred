// Serve the pinned application's actual UI against local synthetic API data.
// No provider account, VM, Docker daemon or external service is contacted.
const fs=require('node:fs'),path=require('node:path');
const [source,folder]=process.argv.slice(2);
const {server}=require(path.resolve(source,'tools/frontend/fixtures/desktop.cjs'));
const original=server.listeners('request')[0];server.removeAllListeners('request');
let phase='chat';const reports=[],feedRequests=[];
let pasteDestination=null;
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
  if(data.phase.startsWith('mac-paste-')&&!framePhases.has(data.phase)){
   if(!window.__KINDRED_NATIVE_CLIPBOARD_TEXT)throw Error('Native clipboard capability missing');
   const paste=document.querySelector('#desktop-paste'),control=document.querySelector('#take-control');
   if(data.phase==='mac-paste-close'){
    document.querySelector('#computer-close').click();
    await report({phase:data.phase,passed:true});
   }else if(data.phase==='mac-paste-open'){
    document.querySelector('#show-computer').click();
    for(let i=0;i<100&&(control.hidden||control.disabled);i++)await sleep(100);
    if(control.hidden||control.disabled)throw Error('Visible Take control not ready');
    control.click();
    for(let i=0;i<150&&(paste.disabled||!paste.getClientRects().length);i++)await sleep(100);
    if(paste.disabled||!paste.getClientRects().length)throw Error('Visible Paste not ready');
    window.__pasteNativeCalls=[];window.__pasteBrowserCalls=0;
    const invoke=window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
    window.__TAURI__.core.invoke=async(command,args)=>{
     if(command!=='read_clipboard_text')return invoke(command,args);
     const event={command,completed:false,error:false};window.__pasteNativeCalls.push(event);
     try{const value=await invoke(command,args);event.completed=true;if(window.__pasteUIBarrier)await window.__pasteUIBarrier;return value;}
     catch(error){event.completed=true;event.error=true;event.errorMessage=String(error);throw error;}
    };
    if(navigator.clipboard){const read=navigator.clipboard.readText.bind(navigator.clipboard);navigator.clipboard.readText=()=>{window.__pasteBrowserCalls++;return read();};}
    await report({phase:data.phase,passed:true,programmaticVisibleControl:true});
   }else{
    const before=window.__pasteNativeCalls.length;
    if(!paste.getClientRects().length)throw Error('Paste control not visible');
    if(data.phase==='mac-paste-no-control'){
     if(!paste.disabled){
      if(control.hidden||control.disabled)throw Error('Return control not available');
      await control.onclick();for(let i=0;i<100&&!paste.disabled;i++)await sleep(100);
     }
     if(!paste.disabled)throw Error('Paste must be disabled without control');
     paste.click(); // Real disabled control must refuse before native read.
    }else{
     let releaseUI;const cancellation=['mac-paste-reconnect','mac-paste-control-loss'].includes(data.phase);
     if(cancellation)window.__pasteUIBarrier=new Promise(resolve=>{releaseUI=resolve;});
     for(let i=0;i<150&&paste.disabled;i++)await sleep(100);
     if(paste.disabled)throw Error('Paste control disabled');
     paste.click();
     if(cancellation){
      try{
       for(let i=0;i<100&&(window.__pasteNativeCalls.length===before||!window.__pasteNativeCalls.at(-1).completed);i++)await sleep(100);
       if(window.__pasteNativeCalls.length!==before+1||!window.__pasteNativeCalls.at(-1).completed||window.__pasteNativeCalls.at(-1).error)throw Error('Real native read did not complete before UI cancellation');
       if(data.phase==='mac-paste-reconnect'){
        await document.querySelector('#desktop-reconnect').onclick();
       }else{
        await control.onclick();
        if(!paste.disabled)throw Error('Control loss did not disable Paste');
       }
      }finally{window.__pasteUIBarrier=null;releaseUI();}
     }
     for(let i=0;i<150&&(window.__pasteNativeCalls.length===before||!window.__pasteNativeCalls.at(-1).completed||paste.dataset.pending==='true');i++)await sleep(100);
     if(window.__pasteNativeCalls.length!==before+1||!window.__pasteNativeCalls.at(-1).completed||paste.dataset.pending==='true')throw Error('Expected exactly one completed real native read and settled UI handler');
    }
    if(errors.length)throw Error('Application window errors: '+JSON.stringify(errors));
    if(window.__pasteBrowserCalls!==0)throw Error('Browser clipboard fallback invoked');
    if(document.querySelector('dialog[open]'))throw Error('Unexpected open manual dialog');
    const calls=window.__pasteNativeCalls.slice(before);
    if(data.phase==='mac-paste-text'&&calls.some(call=>call.error))throw Error('Real native read failed');
    if(data.phase==='mac-paste-no-control'&&calls.length)throw Error('Native read without control');
    await report({phase:data.phase,passed:true,uiCancellationAfterNativeRead:['mac-paste-reconnect','mac-paste-control-loss'].includes(data.phase),nativeCalls:calls,browserClipboardCalls:window.__pasteBrowserCalls,manualDialogOpen:false,programmaticVisibleControl:true});
   }
   framePhases.add(data.phase);
  }
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
  feedRequests.push({phase,route,userAgent:req.headers['user-agent']||'',at:new Date().toISOString()});
  fs.writeFileSync(path.join(folder,'signed-feed.json'),JSON.stringify({served:true,requests:feedRequests}));
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
server.listen(0,'127.0.0.1',async()=>{
 try{
  if(process.env.KINDRED_TEST_MAC_PASTE_SELECTED==='1'){
   pasteDestination=await require('./mac-paste-smoke/rfb-browser.cjs').attach(server,{output:path.join(folder,'mac-paste'),token:'native-test-token-only',source,sourceCommit:require('node:child_process').execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8',timeout:5000}).trim()});
   const listeners=server.listeners('request');server.removeAllListeners('request');
   server.on('request',async(req,res)=>{
    const route=new URL(req.url,'http://127.0.0.1').pathname;
    if(route.startsWith('/fixture/mac-paste/oracle/')){
     if(req.headers.authorization!=='Bearer native-test-token-only'){res.writeHead(401);res.end();return;}
     try{
      let result;const action=route.slice('/fixture/mac-paste/oracle/'.length);
      if(req.method!=='POST')throw Error('Require POST');
      if(action==='clear'){await pasteDestination.clear();result={cleared:true};}
      else if(action==='snapshot'){let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw Error('Oversized label');}result=await pasteDestination.snapshot(JSON.parse(body).label);}
      else throw Error('Unknown oracle action');
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
     }catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}));}
     return;
    }
    for(const listener of listeners)listener.call(server,req,res);
   });
  }
  fs.writeFileSync(path.join(folder,'fixture.json'),JSON.stringify({url:'http://127.0.0.1:'+server.address().port,pasteDestination:!!pasteDestination}));
 }catch(error){console.error(error);process.exitCode=1;server.close();}
});
async function closeFixture(){try{if(pasteDestination)await pasteDestination.close();}finally{server.close(()=>process.exit(0));}}
process.once('SIGTERM',closeFixture);process.once('SIGINT',closeFixture);
