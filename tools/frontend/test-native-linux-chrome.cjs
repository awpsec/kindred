// Real Tauri/WebKitGTK, local fixtures and isolated X11 or nested Wayland desktop.
// No native IPC is mocked. The caller owns the compositor/display lifecycle.
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const out=process.env.KINDRED_TEST_ARTIFACTS,exe=process.env.KINDRED_NATIVE_EXE,backend=process.env.GDK_BACKEND;
assert(out&&exe&&['x11','wayland'].includes(backend));fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-chrome-'));
const screen=path.join(__dirname,'linux-chrome-screen.py'),source=path.resolve(__dirname,'../..'),original=server.listeners('request')[0];server.removeAllListeners('request');
let passed=false,child,finished=false,failure='',current='',results=[],stderr='',marker;
function screenCall(action,...args){return execFileSync('/usr/bin/python3',[screen,action,...args],{encoding:'utf8',env:{...process.env,GDK_BACKEND:'x11'}}).trim();}
function locate(){return JSON.parse(screenCall('locate'));}
const probe=`<script type="module">
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,m)=>{if(!ok)throw Error(m)},post=(route,data)=>fetch('/fixture/native/'+route,{method:'POST',body:JSON.stringify(data)}).then(r=>r.json());
async function until(fn){for(let i=0;i<160;i++){if(await fn())return;await sleep(50)}throw Error('Native state did not settle')}
try{
 await until(()=>document.querySelector('.message-row.assistant'));await document.fonts.ready;
 check(window.__KINDRED_DESKTOP?.platform==='linux','Not native Linux');
 const invoke=action=>window.__TAURI__.core.invoke('window_action',{action});
 const app=await import('/app.js'),computer=document.querySelector('#computer-panel'),details=document.querySelector('#details-panel');
 document.documentElement.dataset.motion='off';
 check(!document.querySelector('.desktop-window-title,.sidebar-top .wordmark'),'Branding remains');
 function measure(pane){
  const r=e=>e.getBoundingClientRect(),bar=r(document.querySelector('.desktop-titlebar')),search=r(document.querySelector('#search-trigger')),plus=r(document.querySelector('#new-bot'));
  const controls=[...document.querySelectorAll('.window-control')];check(controls.length===3,'OS-control owner count');
  check(bar.height===32&&bar.width===innerWidth&&bar.y===0,'Strip geometry');check(r(document.querySelector('.shell')).y===32,'Shell overlaps strip');
  check(Math.abs(search.y-plus.y)<2&&search.right<=plus.x,'Search/+ not compact row');
  for(const b of controls){const q=r(b);check(b.contains(document.elementFromPoint(q.x+q.width/2,q.y+q.height/2)),'Blocked OS button')}
  for(const b of computer.hidden?[]:[...computer.querySelector('.panel-header').querySelectorAll('button:not([hidden])')]){const q=r(b);if(q.width)check(q.y>=32&&b.contains(document.elementFromPoint(q.x+q.width/2,q.y+q.height/2)),'Blocked pane button')}
  check(document.documentElement.scrollWidth<=innerWidth,'Horizontal window overflow');
  return {pane,width:innerWidth,height:innerHeight,stripHeight:bar.height,reading:KindredReadingSize.get?.()};
 }
 for(const size of [100,150]){
  KindredReadingSize.set(size);
  for(const pane of ['chat','details','computer','expanded']){
   computer.hidden=!['computer','expanded'].includes(pane);details.hidden=pane!=='details';app.setComputerExpanded(pane==='expanded');app.state.desktopConnected=true;app.updateDesktopState();await sleep(130);
   await post('report',{size,...measure(pane)});
   if(size===150&&['chat','computer','expanded'].includes(pane))await post('screenshot',{name:pane});
  }
 }
 computer.hidden=true;details.hidden=true;app.setComputerExpanded(false);
 const max=document.querySelector('[data-window-action=maximize]');
 const initial=await invoke('state');check(initial===__EXPECTED_MAXIMIZED__,'Saved maximized state not restored');await until(()=>max.classList.contains('maximized')===initial);
 max.click();await until(async()=>await invoke('state')!==initial);await until(()=>max.classList.contains('maximized')!==initial);measure('max-toggle');
 max.click();await until(async()=>await invoke('state')===initial);await until(()=>max.classList.contains('maximized')===initial);
 await invoke('fullscreen');await sleep(400);measure('fullscreen');await post('screenshot',{name:'fullscreen'});await invoke('fullscreen');await sleep(400);
 if(await invoke('state')){max.click();await until(async()=>!await invoke('state'))}
 KindredReadingSize.set(100);
 const dot=document.createElement('div');dot.id='native-origin';dot.style.cssText='position:fixed;left:0;top:0;width:3px;height:3px;background:rgb(251,7,213);z-index:2147483647;pointer-events:none';document.body.append(dot);
 await sleep(100);await post('drag',{});await sleep(200);
 const min=document.querySelector('[data-window-action=minimize]').getBoundingClientRect();
 const minimized=await post('minimize',{x:min.x+min.width/2,y:min.y+min.height/2});check(!minimized.error,minimized.error);
 await post('report',{nativeControls:true,initialMaximized:initial,fullscreen:true,drag:true,minimizeRestore:true});
 const close=document.querySelector('[data-window-action=close]'),q=close.getBoundingClientRect();
 await post('complete',{close:{x:q.x+q.width/2,y:q.y+q.height/2}});
}catch(e){await post('failed',{message:e.message,stack:e.stack})}
</script>`;
server.on('request',async(req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname,send=x=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
 if(route.startsWith('/fixture/native/')){
  let body='';for await(const chunk of req)body+=chunk;const value=JSON.parse(body||'{}');
  try{
   if(route.endsWith('/report'))results.push({backend,current,...value});
   if(route.endsWith('/failed'))failure=value.message+'\n'+value.stack;
   if(route.endsWith('/screenshot'))screenCall('capture',path.join(out,current+'-'+value.name+'.png'));
   if(route.endsWith('/drag')){
    marker=locate();assert(marker,'No mapped native window marker');
    execFileSync('xdotool',['mousemove',String(marker.x+140),String(marker.y+16),'mousedown','1','sleep','.2','mousemove',String(marker.x+210),String(marker.y+61),'sleep','.2','mouseup','1']);
    await sleep(300);const moved=locate();assert(moved&&Math.abs(moved.x-marker.x)+Math.abs(moved.y-marker.y)>15,'Native strip drag did not move window');
   }
   if(route.endsWith('/minimize')){
    marker=locate();assert(marker);
    const activeWindow=backend==='x11'?execFileSync('xdotool',['getactivewindow'],{encoding:'utf8'}).trim():null;
    execFileSync('xdotool',['mousemove',String(marker.x+value.x),String(marker.y+value.y),'click','1']);
    await sleep(450);assert.equal(locate(),null,'Minimize did not hide the native window');
    if(backend==='x11'){
     execFileSync('xdotool',['windowmap',activeWindow,'windowactivate','--sync',activeWindow],{timeout:5000});
    }else execFileSync('xdotool',['keydown','Super_L','key','Tab','sleep','.3','keyup','Super_L']);
    for(let i=0;i<30&&!locate();i++)await sleep(100);
    assert(locate(),'Window switcher did not restore minimized app');
   }
   if(route.endsWith('/complete')){
    marker=locate();assert(marker);send({ok:true});
    execFileSync('xdotool',['mousemove',String(marker.x+value.close.x),String(marker.y+value.close.y),'click','1']);
    finished=true;return;
   }
   return send({ok:true});
  }catch(e){failure=String(e);try{screenCall('capture',path.join(out,current+'-failure.png'));}catch{}return send({error:failure});}
 }
 if(route==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(path.join(source,'ui/app.js'),'utf8')+'\nexport {state,setComputerExpanded,updateDesktopState};');}
 if(route==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(source,'ui/index.html'),'utf8').replace('</body>',probe.replace('__EXPECTED_MAXIMIZED__',String(current.endsWith('-1320')))+'</body>'));}
 if(route==='/identity/meta')return send({profiles:false});if(route==='/health')return send({status:'ok'});
 return original(req,res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const width of [800,900,1000,1100,1320]){
   current=backend+'-'+width;finished=false;failure='';stderr='';
   const data=path.join(root,current,'data'),config=path.join(root,current,'config'),saved=path.join(data,'kindred/window-state');fs.mkdirSync(saved,{recursive:true});
   fs.writeFileSync(path.join(saved,'main.json'),JSON.stringify({x:60,y:70,width,height:800,scale:1,monitor:null,maximized:width===1320,frame:[0,0]}));
   const env={...process.env,XDG_DATA_HOME:data,XDG_CONFIG_HOME:config,KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:crypto.createHash('sha256').update(origin+'\nfixture').digest('hex'),KINDRED_LEGACY_LOCAL_ACCESS:'0'};
   delete env.KINDRED_SERVER_URL;if(backend==='wayland')env.WAYLAND_DEBUG='client';
   child=spawn(exe,[origin],{env,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>stderr+=String(b));
   const deadline=Date.now()+120000;
   while(!finished&&!failure&&Date.now()<deadline){assert(child.exitCode===null,'Native app exited early: '+stderr.slice(-3000));await sleep(100)}
   assert(finished&&!failure,failure||'Native fixture timeout: '+stderr.slice(-2000));
   for(let i=0;i<60&&child.exitCode===null;i++)await sleep(100);
   assert.notEqual(child.exitCode,null,'Close window did not close the native app');
   if(backend==='wayland')assert(stderr.includes('xdg_toplevel'),'Native app did not use Wayland protocol');
   fs.writeFileSync(path.join(out,current+'-native.log'),stderr);console.log(current+' passed');
  }
  passed=true;
 }finally{
  if(current)fs.writeFileSync(path.join(out,current+'-native.log'),stderr);
  if(child?.exitCode===null)child.kill();
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({passed,backend,scope:'Current source Tauri binary and frontend on isolated native display; Wayland uses nested Weston, not XWayland.',results,failure},null,2));
  server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;server.closeAllConnections();server.close();});
