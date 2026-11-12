// Runs inside the real app's embedded engine. No desktop/Tauri capability mocks.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw Error(m);};
async function wait(fn,label){const end=performance.now()+12000;while(performance.now()<end){const v=fn();if(v)return v;await sleep(40);}throw Error('Missing '+label);}
const $=s=>document.querySelector(s),rect=n=>n.getBoundingClientRect().toJSON();
let fixtureNonce='';
const request=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Kindred-Fixture':fixtureNonce},body:JSON.stringify(body)}).then(async r=>{const v=await r.json();assert(r.ok,v.error||path);return v;});
const replay=async messages=>{await request('/fixture/replay',messages);await globalThis.__nativeReleaseReplay(messages);};
const visible=n=>n&&n.getClientRects().length&&!n.closest('[hidden]');
const named=(root,name)=>[...root.querySelectorAll('button')].find(n=>n.textContent.trim()===name||n.getAttribute('aria-label')===name);
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function input(kind,n,dx=0,dy=0){const r=rect(n),x=r.x+r.width*.4,y=r.y+r.height*.4;return request('/fixture/input',{kind,x,y,tx:x+dx,ty:y+dy,vw:innerWidth,vh:innerHeight});}
const focusEvidence={};
const motionState=()=>({focused:document.hasFocus(),hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,motion:document.documentElement.dataset.motion||'default'});
const errors=[];addEventListener('error',e=>errors.push(e.message));
try{
 const manifest=await(await fetch('/fixture/manifest')).json();fixtureNonce=manifest.fixtureNonce;
 assert(window.__TAURI__?.core?.invoke,'Actual Tauri bridge missing');
 assert(window.__KINDRED_DESKTOP?.platform===manifest.platform,'Native platform injection mismatch');
 assert(!window.__KINDRED_MOBILE&&!window.__KINDRED_MOBILE_PLATFORM,'Unexpected mobile capability');
 const native=await window.__TAURI__.core.invoke('profile_home_state');assert(native.version===manifest.version,'Built native version mismatch');
 assert(manifest.platform==='windows'?/Windows/.test(navigator.userAgent)&&/Edg|Chrome/.test(navigator.userAgent):/Macintosh/.test(navigator.userAgent)&&/AppleWebKit/.test(navigator.userAgent),'Unexpected actual engine user agent');
 const resources={};
 for(const [name,entry]of Object.entries(manifest.resources)){
  const b=new Uint8Array(await(await fetch('/'+name)).arrayBuffer()),prefix=b.slice(0,entry.bytes);
  assert(await hash(prefix)===entry.sha256,'Served product resource mismatch '+name);
  if(name==='app.js')assert(await hash(b.slice(entry.bytes))===manifest.rendererHookSha256,'Renderer test hook mismatch');else assert(b.length===entry.bytes,'Unexpected resource suffix '+name);
  resources[name]=await hash(prefix);
 }
 await wait(()=>$('#bot-details')?.onclick&&$('#bot-details').textContent.includes('Piper')&&!$('#chat-loading'),'actual chat');
 const prompt=$('#prompt'),draft='Native release verification draft';prompt.textContent=draft;prompt.dispatchEvent(new Event('input',{bubbles:true}));
 // Foreground the owned native window through real OS input before testing
 // animations, which correctly stay disabled in background windows.
 focusEvidence.before=motionState();focusEvidence.nativeClick=!focusEvidence.before.focused||focusEvidence.before.hidden;
 if(focusEvidence.nativeClick)await input('click',prompt);
 await wait(()=>document.hasFocus()&&!document.hidden,'foreground native window');
 focusEvidence.after=motionState();
 assert(!focusEvidence.after.reduced&&focusEvidence.after.motion!=='off','Motion disabled by actual native preferences: '+JSON.stringify(focusEvidence));
 // Exercise the actual WKWebView/WebView2 geometry, not a mocked font or
 // compositor. The declared renderer hook only controls reply timing and data.
 const originalMessages=await(await fetch('/fixture/messages')).json();
 const motionMessages=Array.from({length:35},(_,i)=>({seq:300+i,sender:i%3?'piper':'user',kind:'message',created:1700000000+i,text:'Keep this paragraph still when a reply arrives and the pane opens. Read the wrapped lines without moving neighboring characters. '.repeat(3)}));
 await replay(motionMessages);await document.fonts.ready;await sleep(300);
 const motionAPI=globalThis.__nativeReleaseChatMotion,area=$('#content'),replyStability=[];
 for(const at of [0,65,120]){
  const target=$('[data-message="320"]'),neighbour=$('[data-message="321"]');
  motionAPI.chatScroll.follow=false;area.scrollTop+=rect(target).top-rect(area).top-2;await sleep(80);motionAPI.chatScroll.gestureUntil=0;
  const textTop=()=>{const r=document.createRange();r.selectNodeContents(neighbour.querySelector('.message-text-content'));return r.getClientRects()[0].top;};
  const before={scroll:area.scrollTop,text:textTop()};motionAPI.revealReply(target,Date.now());
  const effect=target.getAnimations({subtree:true}).find(a=>a.id==='reply-arrival');assert(effect,'Reply entrance missing in native engine: '+JSON.stringify(motionState()));effect.pause();effect.currentTime=at;motionAPI.captureChatAnchor();assert(motionAPI.chatScroll.anchor.key==='320','Native reading anchor precondition');
  effect.currentTime=160;motionAPI.restoreChatPosition();assert(Math.abs(textTop()-before.text)<1,'Native neighboring text moves during arrival');
  effect.finish();await sleep(60);motionAPI.restoreChatPosition();await replay(motionMessages);
  const after={scroll:area.scrollTop,text:textTop()};assert(Math.abs(after.scroll-before.scroll)<1&&Math.abs(after.text-before.text)<1,'Native reply entrance shifts transcript');replyStability.push({at,before,after});
 }
 const paneOverlap=[];
 for(const opening of [true,false]){
  const target=$('[data-message="320"]'),offset=()=>rect(target).top-rect(area).top,before=offset();motionAPI.revealReply(target,Date.now());
  const effect=target.getAnimations({subtree:true}).find(a=>a.id==='reply-arrival');assert(effect,'Pane overlap reply missing');effect.pause();effect.currentTime=65;
  (opening?$('#bot-details'):named($('#details-panel'),'Close bot center')).click();await sleep(40);await replay(motionMessages);effect.finish();await sleep(400);motionAPI.restoreChatPosition();
  const after=offset();assert(Math.abs(after-before)<1,'Native pane/reply overlap shifts reading anchor');paneOverlap.push({opening,before,after});
 }
 motionAPI.chatScroll.follow=true;motionAPI.chatScroll.anchor=null;await replay(originalMessages);await sleep(100);
 assert(prompt.textContent===draft,'Reply and pane motion changed draft');
 const heading=await wait(()=>$('.summary-progress-heading'),'owned task heading');heading.click();await sleep(350);
 assert(document.querySelectorAll('[data-task-commentary-block]').length===1,'Ordinary commentary is not one contiguous block');
 const savedRow=$('[data-message="20"]'),clock=savedRow.querySelector('.progress-update-time-toggle'),text=$('[data-message="4"] .message-text-content>p').firstChild;
 clock.focus({preventScroll:true});getSelection().setBaseAndExtent(text,0,text,8);assert(document.activeElement===clock,'Focus precondition');
 let messages=await(await fetch('/fixture/messages')).json();const split=messages.slice();split.splice(split.findIndex(m=>m.seq===11),0,{seq:10.5,sender:'user',kind:'message',text:'Intervening user record',created:messages[0].created+25});
 await replay(split);assert($('[data-message="20"]')===savedRow&&document.activeElement===clock,'Split loses retained row or focused clock');assert(getSelection().toString()==='Update 4','Split loses selected prose');
 await replay(messages);assert(document.activeElement===clock&&getSelection().toString()==='Update 4','Merge loses focus/selection');
 heading.click();await sleep(350);assert(document.activeElement===heading,'Collapse does not return focus to owning header');assert(prompt.textContent===draft,'Disclosure changed draft');
 const disclosure={splitMergeFocus:true,selection:true,rowIdentity:true,collapseFocus:true,draftRetained:true,blockCount:document.querySelectorAll('[data-task-commentary-block]').length};
 $('#bot-details').click();const panelHeading=await wait(()=>$('#details-panel>.bot-center-heading'),'bot pane');panelHeading.querySelector('[data-tab=library]').click();
 const library=await wait(()=>$('#bot-center-library'),'Library');const opener=await wait(()=>[...document.querySelectorAll('.bot-library-open')].find(n=>n.textContent.includes('Native workbook')),'Library workbook');await wait(()=>!$('.pane-layout-reservation')&&!$('#details-panel').classList.contains('pane-layout-frame'),'settled Library pane');const headerBounds=rect(panelHeading);opener.click();
 const studio=await wait(()=>$('.artifact-studio .document-grid')&&$('.artifact-studio'),'actual workbook grid');await wait(()=>studio.querySelectorAll('.document-sheets button').length===2,'decoded workbook sheets');await sleep(200);
 const siblings=[...studio.parentElement.children].filter(n=>n!==studio).map(n=>[n,n.inert]);let paint;
 try{for(const [n]of siblings)n.inert=false;paint=[.2,.5,.8].flatMap(x=>[.2,.5,.8].map(y=>studio.contains(document.elementFromPoint(headerBounds.x+headerBounds.width*x,headerBounds.y+headerBounds.height*y))));}
 finally{for(const [n,v]of siblings)n.inert=v;}
 assert(siblings.every(([n,v])=>n.inert===v)&&$('#details-panel').inert,'Paint probe did not restore inert '+JSON.stringify({siblings:siblings.map(([n,v])=>({id:n.id,wasInert:v,isInert:n.inert})),paneFrame:$('#details-panel').classList.contains('pane-layout-frame'),reservation:!!$('.pane-layout-reservation')}));assert(paint.length===9&&paint.every(Boolean),'Library header paints above artifact');
 const back=named(studio,'Back to chat');assert(visible(back),'Artifact return unavailable');back.click();await wait(()=>!$('.artifact-studio'),'artifact closed');assert($('#bot-center-library')===library,'Library return discarded state');
 panelHeading.querySelector('[data-tab=computer]').click();await wait(()=>$('#desktop canvas'),'normal RFB pixels');
 const toggle=await wait(()=>$('.computer-popout-toggle'),'desktop popout');toggle.click();const win=await wait(()=>$('.computer-popout[data-status=ready]'),'ready popout');
 const pixels=red=>wait(()=>{const c=win.querySelector('canvas');return c&&c.getContext('2d').getImageData(1,1,1,1).data[0]===red;},'decoded real framebuffer');await pixels(18);
 const surface=win.querySelector('.computer-popout-open');let trusted=0;surface.addEventListener('pointerdown',e=>{if(e.isTrusted)trusted++;});const r=rect(win);assert(Math.abs(r.width/r.height-16/9)<.005,'Popout aspect');
 await input('click',surface);await wait(()=>$('#computer-panel.expanded:not([hidden])'),'native click opens existing viewer');assert($('.computer-popout-layer').hidden,'Normal viewer failed to suspend float');$('#computer-close').click();await wait(()=>!$('.computer-popout-layer').hidden,'float restored');await pixels(18);await sleep(300);
 const placements=[];
 for(const corner of ['top-left','bottom-right']){
  const area=rect($('.computer-popout-layer')),current=rect(win),toX=corner.endsWith('left')?area.x+12:area.right-current.width-12,toY=corner.startsWith('top')?area.y+12:area.bottom-current.height-12;
  await input('drag',surface,toX-current.x,toY-current.y);await sleep(350);assert(win.dataset.corner===corner,'Native drag did not snap '+corner);assert($('#computer-panel').hidden,'Native drag incorrectly opened pane');placements.push({corner,rect:rect(win)});
 }
 assert(trusted>=3,'Native input did not enter actual embedded engine');const p=rect(win),composer=rect($('#composer-area')),chatHeader=rect($('.conversation-header'));assert(p.bottom<composer.y&&p.top>=chatHeader.bottom,'Float overlaps header/composer');
 const cersei=named($('#bots'),'Cersei');assert(cersei,'Second bot missing');cersei.click();await pixels(255);const switched=rect(win);assert(Math.abs(switched.width-p.width)<1&&Math.abs(switched.x-p.x)<1,'Bot switch lost shared placement');named($('#bots'),'Piper').click();await pixels(18);assert(prompt.textContent===draft,'Bot return lost draft');
 win.querySelector('.computer-popout-return').click();await wait(()=>$('.computer-popout-layer').hidden,'return hides float');assert($('#computer-panel').hidden,'Return opened side pane');await sleep(150);
 assert(errors.length===0,'Native page errors: '+errors.join(';'));
 await request('/fixture/report',{passed:true,platform:window.__KINDRED_DESKTOP.platform,userAgent:navigator.userAgent,nativeVersion:native.version,resources,focusEvidence,replyStability,paneOverlap,disclosure,library:{paint,decodedSheetCount:2,inertRestored:true,stateRetained:true},popout:{realFramebuffer:true,aspect:r.width/r.height,trustedPointerDowns:trusted,placements,botSwitchPlacement:true,viewerSuspendRestore:true,returnPaneClosed:true,draftRetained:true,composerGap:composer.y-p.bottom},errors});
}catch(e){await request('/fixture/report',{passed:false,error:String(e),stack:e.stack,focusEvidence,motionState:motionState(),errors}).catch(()=>{});}
