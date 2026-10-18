// Actual packaged WKWebView/native Focused hook, disposable loopback fixtures only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const args=process.argv.slice(2);const get=n=>args[args.indexOf(n)+1];
const source=path.resolve(get('--source')),exe=path.resolve(get('--exe')),focus=path.resolve(get('--focus')),out=path.resolve(get('--output'));
assert.equal(process.platform,'darwin');fs.mkdirSync(out,{recursive:true});
const {server,token}=require(path.join(source,'tools/frontend/fixtures/desktop.cjs'));
const original=server.listeners('request')[0];server.removeAllListeners('request');
let child,command='',reports=[],comparisons=[],messages=Array.from({length:45},(_,i)=>({seq:i+1,sender:'piper',kind:'message',text:'Native reading fixture '+i+' — '+('history '.repeat(12)),created:100+i}));
const prefix=`\nconst nativeInterval=window.setInterval;window.setInterval=(fn,ms,...a)=>ms===2500?0:nativeInterval(fn,ms,...a);\n`;
const probe=`\n;(()=>{let events=0;const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const state=()=>{const content=document.querySelector('#content'),rect=content?.getBoundingClientRect();
  const anchors=content?[...content.querySelectorAll(':scope > [data-message],:scope > [data-run]')].filter(n=>n.getBoundingClientRect().bottom>rect.top+1).slice(0,3).map(n=>({key:n.dataset.message||'run:'+n.dataset.run,offset:n.getBoundingClientRect().top-rect.top})):[];
  return {draft:document.querySelector('#prompt')?.value||'',scroll:content?.scrollTop||0,events,text:document.body.textContent,
   reading:{anchors,scrollHeight:content?.scrollHeight,clientHeight:content?.clientHeight,viewport:rect?{top:rect.top,height:rect.height}:null,follow:chatScroll.follow,rendering:chatScroll.rendering,opening:!!chatOpening}};};
 const report=phase=>fetch('/fixture/native-report',{method:'POST',body:JSON.stringify({phase,...state()})});
 addEventListener('kindred-desktop-resume',()=>{events++;setTimeout(()=>void report('native-resume'),700);});
 void(async()=>{for(let i=0;i<150&&!document.body.textContent.includes('Native reading fixture');i++)await delay(100);
 const prompt=document.querySelector('#prompt');if(!prompt)throw Error('No native composer');prompt.value='Keep native unsent draft';prompt.dispatchEvent(new Event('input',{bubbles:true}));
 const content=document.querySelector('#content');if(content){content.scrollTop=Math.min(400,Math.max(0,content.scrollHeight-content.clientHeight-400));content.dispatchEvent(new WheelEvent('wheel',{deltaY:-1,bubbles:true}));}await delay(300);await report('ready');
 for(let i=0;i<300;i++){let v=await(await fetch('/fixture/native-command')).json();if(v.action==='minimize'||v.action==='fullscreen'){await window.__TAURI__.core.invoke('window_action',{action:v.action});await report(v.action+'-dispatched');}await delay(100);}
 })().catch(e=>void fetch('/fixture/native-report',{method:'POST',body:JSON.stringify({phase:'error',error:String(e)})}));})();\n`;
function send(res,obj){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));}
server.on('request',async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(prefix+fs.readFileSync(path.join(source,'ui/app.js'),'utf8')+probe);}
 if(p.startsWith('/api/chats/dm-piper'))return send(res,{chat:{id:'dm-piper',name:'Piper',members:['piper']},messages,page:{has_before:false,has_after:false}});
 if(p==='/fixture/native-command'){const action=command;command='';return send(res,{action});}
 if(p==='/fixture/native-report'){let data='';for await(const b of req){data+=b;assert(data.length<1024*1024);}reports.push(JSON.parse(data));fs.writeFileSync(path.join(out,'reports.json'),JSON.stringify(reports,null,2));return send(res,{ok:true});}
 return original(req,res);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(test,ms=12000){const end=Date.now()+ms;while(Date.now()<end){assert(child.exitCode===null,'Native app exited');const bad=reports.find(r=>r.error);assert(!bad,bad?.error);const r=reports.find(test);if(r)return r;await sleep(100);}throw Error('Native foreground receipt timeout');}
function assertReadingPreserved(before,after){
 const anchor=before.reading?.anchors?.[0];assert(anchor&&typeof anchor.key==='string'&&Number.isFinite(anchor.offset),'Initial reading anchor missing');
 const matched=after.reading?.anchors?.find(a=>a.key===anchor.key);assert(matched&&Number.isFinite(matched.offset),'Visible reading message changed');
 assert(Math.abs(matched.offset-anchor.offset)<=32,'Native logical reading position changed');
}
function checkReading(phase,before,after){
 comparisons.push({phase,before,after,rawScrollDelta:after.scroll-before.scroll,rawScrollPredicate:Math.abs(after.scroll-before.scroll)<=32});
 fs.writeFileSync(path.join(out,'comparisons.json'),JSON.stringify(comparisons,null,2));
 assertReadingPreserved(before,after);
}
const app=exe.slice(0,exe.indexOf('.app/')+4);
const native=(action)=>JSON.parse(execFileSync(focus,[action,String(child.pid)],{encoding:'utf8',timeout:6000}));
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'kindred-native-focus-'));let result={passed:false,nativePlatform:'darwin',syntheticResumeDispatched:false,physicalSpacesGestureVerified:false};
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));child=spawn(exe,['http://127.0.0.1:'+server.address().port],{env:{...process.env,HOME:root,CFFIXED_USER_HOME:root,KINDRED_ACCESS_TOKEN:token,KINDRED_PROFILE_ID:'fixture',KINDRED_LEGACY_LOCAL_ACCESS:'0'},detached:true,stdio:['ignore',fs.openSync(path.join(out,'process.log'),'w'),fs.openSync(path.join(out,'process-errors.log'),'w')]});
 const initial=await waitFor(r=>r.phase==='ready',20000);const bg=native('background');assert.equal(bg.active,false);messages.push({seq:46,sender:'piper',kind:'message',text:'Native foreground updated message',created:200});await sleep(400);const fg=native('foreground');assert.equal(fg.active,true);
 const fresh=await waitFor(r=>r.phase==='native-resume'&&r.events>initial.events&&r.text.includes('Native foreground updated message'));assert.equal(fresh.draft,initial.draft);checkReading('foreground',initial,fresh);
 result={...result,passed:true,nativeFocusedResume:true,foregroundFreshness:true,draftPreserved:true,readingPositionPreserved:true,minimizeRestore:{attempted:true,verified:false},spacesReturn:{physicalGestureVerified:false,nativeFocusReturnVerified:true,reason:'AppKit focus return is observed; no physical Spaces gesture is asserted'}};
 // Minimize through the production native command; restore through normal LaunchServices reopen.
 try{command='minimize';await waitFor(r=>r.phase==='minimize-dispatched');await sleep(600);const minimized=native('status');assert.equal(minimized.visibleMainWindows,0,'No minimized native window observation');execFileSync('/usr/bin/open',['-a',app],{timeout:6000});native('foreground');
 const restored=await waitFor(r=>r.phase==='native-resume'&&r.events>fresh.events,5000);assert(native('status').visibleMainWindows>0);assert.equal(restored.draft,initial.draft);checkReading('minimize-restore',initial,restored);result.minimizeRestore={attempted:true,verified:true,nativeCommand:true,minimizedNotVisible:true,restoredVisible:true,normalReopen:true,draftPreserved:true,readingPositionPreserved:true};
 }catch(e){result.minimizeRestore={attempted:true,verified:false,reason:'Existing GUI reopen/minimize observation did not establish complete native cycle; baseline native Focused refresh passed',errorClass:e.constructor.name};}
 if(result.minimizeRestore.verified){try{command='fullscreen';await waitFor(r=>r.phase==='fullscreen-dispatched',5000);await sleep(1400);native('background');await sleep(500);const away=native('status');messages.push({seq:47,sender:'piper',kind:'message',text:'Native Space return updated message',created:201});native('foreground');const returned=await waitFor(r=>r.phase==='native-resume'&&r.text.includes('Native Space return updated message'),5000);assert.equal(returned.draft,initial.draft);checkReading('space-return',initial,returned);const visible=native('status').visibleMainWindows>0;
 result.spacesReturn={nativeFullscreenSpaceAttempted:true,hiddenOnBackgroundSpace:away.visibleMainWindows===0,returnedVisible:visible,nativeFocusedRefresh:true,verified:away.visibleMainWindows===0&&visible,physicalGestureVerified:false,reason:'Native fullscreen/app-switch return observed; physical trackpad/keyboard Spaces gesture not asserted'};
 }catch(e){result.spacesReturn={nativeFullscreenSpaceAttempted:true,verified:false,physicalGestureVerified:false,reason:'Existing GUI did not establish bounded fullscreen Space return',errorClass:e.constructor.name};}}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(child&&child.exitCode===null){process.kill(-child.pid,'SIGTERM');await new Promise(r=>child.once('exit',r));}server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),String(e));fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({passed:false,errorClass:e.constructor.name,error:String(e),comparisons,reports},null,2));console.error(e);process.exitCode=1;});
