// Real Linux WebKitGTK layout under GTK scaling, using isolated local fixtures.
const {server,token}=require('./fixtures/desktop.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out=process.env.KINDRED_TEST_ARTIFACTS||path.resolve(__dirname,'../../test-results/native-linux-layout');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 assert.equal(process.platform,'linux');assert(process.env.KINDRED_NATIVE_EXE,'Set KINDRED_NATIVE_EXE');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-linux-layout-')),source=path.resolve(__dirname,'../..');
 const original=server.listeners('request')[0];server.removeAllListeners('request');
 const results=[];let child,current,complete,failed;
 function windowId(){return execFileSync('xdotool',['search','--onlyvisible','--pid',String(child.pid),'--name','Kindred'],{encoding:'utf8'}).trim().split('\n')[0];}
 const probe=`<script type="module">
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const post=(route,body)=>fetch('/fixture/'+route,{method:'POST',body:JSON.stringify(body)});
 try{
  while(!document.querySelector('.message-row.assistant'))await sleep(100);
  await document.fonts.ready;
  check([...document.fonts].some(f=>f.family==='Inter'&&f.status==='loaded'),'Bundled Inter did not load');
  // Exercise the same interrupted transitions in the actual Linux webview.
  const panel=document.querySelector('#details-panel');
  document.querySelector('#bot-details').click();await sleep(80);
  document.querySelector('#details-close').focus();document.querySelector('#details-close').click();
  panel.getAnimations().forEach(animation=>animation.pause());await sleep(400);
  check(panel.hidden,'Interrupted pane close did not settle');
  check(!panel.contains(document.activeElement),'Focus remained in a closed pane');
  document.querySelector('#bot-details').click();await sleep(50);
  document.documentElement.dataset.motion='off';await sleep(80);
  check(panel.getAnimations().length===0,'Live reduced motion left a pane effect running');
  document.querySelector('#details-close').click();check(panel.hidden,'Reduced-motion close was delayed');
  document.documentElement.dataset.motion='on';
  document.querySelector('#settings-button').click();await sleep(250);
  const skills=document.querySelector('[data-settings-page="skills"]');skills.focus();skills.click();await sleep(250);
  check(document.activeElement===skills&&skills.getAttribute('aria-current')==='page','Settings navigation lost keyboard focus');
  await post('screenshot',{name:'settings'});
  document.querySelector('#settings-close').click();check(!document.querySelector('#settings-dialog').open,'Settings close was delayed');
  const app=await import('/app.js'),computer=document.querySelector('#computer-panel'),screen=document.querySelector('#desktop');
  computer.hidden=false;app.state.desktopConnected=true;app.updateDesktopState();
  const sampleScreen=async expanded=>{
   const frames=[],read=()=>{const r=computer.getBoundingClientRect();return {x:r.x,width:r.width,transform:getComputedStyle(computer).transform};};
   frames.push(read());app.setComputerExpanded(expanded);frames.push(read());
   const start=performance.now();while(performance.now()-start<400){await new Promise(requestAnimationFrame);frames.push(read());}
   check(frames.length>4,'Native screen transition did not render intermediate frames');
   check(Math.abs(frames[0].x-frames[1].x)<2,'Native screen transition jumped at start');
   check(frames.every(f=>f.transform==='none'),'Native screen ancestor was scaled');
   for(let i=1;i<frames.length;i++)check(expanded?frames[i].width>=frames[i-1].width-1:frames[i].width<=frames[i-1].width+1,'Native screen transition reversed direction');
   check(computer.style.cssText===''&&screen.style.cssText==='','Native screen geometry was not cleaned up');
   return frames.length;
  };
  const expandFrames=await sampleScreen(true),collapseFrames=await sampleScreen(false);computer.hidden=true;
  document.querySelector('[data-message="1"] [data-message-action="reply"]').click();await sleep(400);
  check(!document.querySelector('#composer').classList.contains('is-morphing'),'Native reply transition did not settle');
  document.querySelector('#composer-reply button').click();await sleep(400);
  check(!document.querySelector('.composer-reply-ghost'),'Native reply ghost remained');
  await post('report',{kind:'motion',interruptedPane:true,liveReducedMotion:true,settingsFocus:true,expandFrames,collapseFrames,replyCleanup:true});
  const editor=document.querySelector('#prompt'),sample='Agjpqy café — first  double space\\nSecond line\\n\\nFourth line';
  for(const [width,height] of [[1320,860],[1100,760],[800,650]]){
   await post('resize',{width,height});await sleep(250);
   for(const size of [100,115,125,150])for(const theme of ['dark','light']){
    KindredReadingSize.set(size);document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='off';editor.value=sample;editor.dispatchEvent(new Event('input',{bubbles:true}));await sleep(70);
    const s=getComputedStyle(editor),r=editor.getBoundingClientRect(),send=document.querySelector('#send').getBoundingClientRect();
    // WebKitGTK rounds scrollWidth up but innerWidth down at fractional DPI.
    const measurement={kind:'composer',width:innerWidth,height:innerHeight,dpr:devicePixelRatio,size,theme,font:s.fontFamily,fontSize:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),weight:s.fontWeight,documentWidth:document.documentElement.scrollWidth,viewportWidth:document.documentElement.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>Math.ceil(document.documentElement.getBoundingClientRect().width),inside:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,sendInside:send.left>=0&&send.right<=innerWidth&&send.bottom<=innerHeight};
    await post('report',measurement);check(measurement.line>=measurement.fontSize*1.4,'Crowded composer lines');check(!measurement.overflow&&measurement.inside&&measurement.sendInside,'Composer outside window');check(editor.value===sample,'Draft whitespace changed');check(s.fontWeight==='400','Unexpected composer weight');
    if(width===1100&&size===150)await post('screenshot',{name:theme});
   }
  }
  editor.value='Ordinary text';editor.focus();const range=document.createRange();range.selectNodeContents(editor);getSelection().removeAllRanges();getSelection().addRange(range);
  await post('shortcut',{});check(!editor.querySelector('b,strong'),'Native Ctrl+B made text bold');check(editor.value==='Ordinary text','Shortcut changed text');
  document.querySelector('#settings-button').click();while(!document.querySelector('.settings-dialog[open]'))await sleep(50);
  for(const tab of document.querySelectorAll('.settings-nav button')){
   tab.click();await sleep(200);const dialog=document.querySelector('.settings-dialog'),r=dialog.getBoundingClientRect();
   check(r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'Settings outside viewport: '+tab.textContent);
   await post('report',{kind:'settings',tab:tab.textContent,size:150,width:innerWidth,height:innerHeight});
  }
  await post('complete',{passed:true});
 }catch(e){await post('failed',{error:e.message+'\\n'+e.stack});}
 </script>`;
 server.on('request',async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const send=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(route.startsWith('/fixture/')&&req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const value=JSON.parse(body);
   try{
    if(route==='/fixture/resize')execFileSync('xdotool',['windowsize',windowId(),String(value.width),String(value.height)]);
    if(route==='/fixture/shortcut')execFileSync('xdotool',['windowactivate','--sync',windowId(),'key','--clearmodifiers','ctrl+b']);
    if(route==='/fixture/screenshot')execFileSync('python3',['-c',"import gi,sys; gi.require_version('Gdk','3.0'); from gi.repository import Gdk; w=Gdk.get_default_root_window(); Gdk.pixbuf_get_from_window(w,0,0,w.get_width(),w.get_height()).savev(sys.argv[1],'png',[],[])",path.join(out,current+'-'+value.name+'.png')]);
    if(route==='/fixture/report')results.push({configuration:current,...value});
    if(route==='/fixture/complete')complete=true;if(route==='/fixture/failed')failed=value.error;
    return send({ok:true});
   }catch(e){failed=String(e);return send({error:failed});}
  }
  if(route==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(path.join(source,'ui/app.js'),'utf8')+'\nexport {state,setComputerExpanded,updateDesktopState};');}
  if(route==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(source,'ui/index.html'),'utf8').replace('</body>',probe+'</body>'));}
  const extra={'/identity/meta':{profiles:false},'/health':{status:'ok'},'/api/inbox-monitors':{items:[],provider_sources:[]},'/api/lists':[],'/api/reminders':[]};
  if(route in extra)return send(extra[route]);return original(req,res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const [scale,dpi] of [['1','1'],['1','1.25'],['1','1.5'],['2','1']]){
   current='gtk-'+scale+'-dpi-'+dpi;if(process.env.KINDRED_GTK_CONFIG&&process.env.KINDRED_GTK_CONFIG!==current)continue;complete=false;failed=null;const data=path.join(root,current,'data'),config=path.join(root,current,'config'),scope=crypto.createHash('sha256').update(origin+'\nfixture').digest('hex');
   const errors=[];child=spawn(process.env.KINDRED_NATIVE_EXE,[origin],{env:{...process.env,GDK_SCALE:scale,GDK_DPI_SCALE:dpi,XDG_DATA_HOME:data,XDG_CONFIG_HOME:config,KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_PROFILE_SCOPE:scope,KINDRED_LEGACY_LOCAL_ACCESS:'0'},stdio:['ignore','ignore','pipe']});
   child.stderr.on('data',b=>errors.push(String(b)));
   try{const deadline=Date.now()+120000;while(!complete&&!failed&&Date.now()<deadline){assert(child.exitCode===null&&child.signalCode===null,'Native app exited: '+errors.join(''));await sleep(100);}assert(complete&&!failed,failed||'Native layout timed out: '+errors.join(''));console.log(current+' passed');}
   finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,results},null,2));
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:!failed&&complete,failed,results},null,2));await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
