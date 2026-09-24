// Real WebKitGTK WebAudio startup, including AppImage media-plugin loading.
// Uses a muted oscillator and isolated app data; never opens a microphone.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');const {server,token}=require('./fixtures/desktop.cjs');
(async()=>{
 const binary=process.env.KINDRED_NATIVE_EXE;assert(binary,'Set KINDRED_NATIVE_EXE');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-audio-')),original=server.listeners('request')[0];let result,child,ready=false,triggered=false;const errors=[];
 server.removeAllListeners('request');server.on('request',async(req,res)=>{
  if(req.url==='/fixture/audio-result'){let data='';for await(const c of req)data+=c;const value=JSON.parse(data);if(value.ready)ready=true;else result=value;res.end('{}');return;}
  if(req.url==='/'){
   const probe=`<script>document.addEventListener('keydown',async e=>{if(e.key!=='F9')return;let c;try{c=new AudioContext();await Promise.race([c.resume(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Audio startup timed out')),8000))]);const source=c.createOscillator(),processor=c.createScriptProcessor(1024,1,1),mute=c.createGain();mute.gain.value=0;let frames=0;processor.onaudioprocess=()=>frames++;source.connect(processor);processor.connect(mute);mute.connect(c.destination);source.start();await new Promise(r=>setTimeout(r,700));source.stop();source.disconnect();processor.disconnect();mute.disconnect();await c.close();if(!frames)throw Error('Audio graph did not process samples');await fetch('/fixture/audio-result',{method:'POST',body:JSON.stringify({passed:true,frames,rate:c.sampleRate})});}catch(e){if(c)void c.close().catch(()=>{});await fetch('/fixture/audio-result',{method:'POST',body:JSON.stringify({passed:false,name:e.name,error:e.message})});}},true);fetch('/fixture/audio-result',{method:'POST',body:JSON.stringify({ready:true})});</script>`;
   res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.resolve(__dirname,'../../ui/index.html'),'utf8').replace('</body>',probe+'</body>'));return;
  }
  const extras={'/health':{status:'ok'},'/identity/meta':{profiles:false}};
  if(req.url in extras){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(extras[req.url]));return;}original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,scope=crypto.createHash('sha256').update(origin+'\nfixture').digest('hex');
 try{
  child=spawn(binary,[...(binary.endsWith('.AppImage')?['--appimage-extract-and-run']:[]),origin],{env:{...process.env,XDG_DATA_HOME:path.join(root,'data'),XDG_CONFIG_HOME:path.join(root,'config'),KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:scope},detached:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>errors.push(b.toString()));
  const deadline=Date.now()+30000;while(!result&&Date.now()<deadline){assert(child.exitCode===null,'App exited: '+errors.join(''));if(ready&&!triggered){try{const id=execFileSync('xdotool',['search','--onlyvisible','--name','^Kindred$'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n')[0];if(id){execFileSync('xdotool',['windowfocus','--sync',id,'key','--clearmodifiers','F9']);triggered=true;}}catch{}}await new Promise(r=>setTimeout(r,100));}
  console.log(JSON.stringify({binary,...result,errors:errors.join('').slice(-5000)}));assert(result?.passed,'The native audio graph failed');
 }finally{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}if(child.exitCode===null)await new Promise(r=>child.once('exit',r));}server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
