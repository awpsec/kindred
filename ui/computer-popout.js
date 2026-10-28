// One passive computer view and one placement for the desktop app. The normal
// computer pane continues to own control, teaching and its expanded viewer.
const make=(tag,cls)=>{const n=document.createElement(tag);n.className=cls;return n;};
const corners=['top-left','top-right','bottom-left','bottom-right'];
const storageKey='kindred-computer-popout';
const ratio=16/9,margin=12;
export function createComputerPopout({mount,bounds,composer,header,sourcePanel,getContext,icon,connect,onDetach,onOpen,returnFocus}){
 let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
 if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const placement={enabled:saved.enabled===true,corner:corners.includes(saved.corner)?saved.corner:'top-right',width:Number.isFinite(saved.width)?Math.max(220,Math.min(1200,saved.width)):244};
 const layer=make('div','computer-popout-layer');layer.hidden=true;
 const window=make('section','computer-popout'),host=make('div','computer-popout-screen'),surface=make('button','computer-popout-open'),resize=make('button','computer-popout-resize'),dock=make('button','computer-popout-return'),status=make('span','computer-popout-status');
 const targets=corners.map(corner=>{const n=make('div','computer-popout-target');n.dataset.corner=corner;layer.append(n);return n;});
 window.setAttribute('aria-label','Floating computer');surface.type=resize.type=dock.type='button';
 resize.setAttribute('aria-label','Resize floating computer');resize.title='Drag to resize; use arrow keys to adjust';resize.append(icon('arrow',14));
 dock.setAttribute('aria-label','Return computer to side pane');dock.title='Return to side pane';dock.append(icon('dock',17));
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 window.append(host,surface,status,resize,dock);layer.append(window);bounds.append(layer);
 const toggle=make('button','icon-button computer-popout-toggle');toggle.type='button';toggle.setAttribute('aria-label','Pop out computer');toggle.title='Pop out computer';toggle.append(icon('external',17));sourcePanel.querySelector('.desktop-toolbar').append(toggle);
 let key='',generation=0,abort=null,cleanup=null,timer=0,retries=0,disposed=false,suspended=false,gesture=null,suppressClick=false,x=0,y=0,frame=0;
 const reduced=()=>document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const contextKey=c=>c.scope+'|'+c.bot.id;
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(placement));}catch{}}
 function reserveControls(){
  const r=bounds.getBoundingClientRect(),input=composer.getBoundingClientRect(),heading=header.getBoundingClientRect();
  layer.style.bottom=Math.max(0,input.height?r.bottom-input.top:0)+'px';
  layer.style.top=Math.max(0,heading.height?heading.bottom-r.top:0)+'px';
 }
 function size(){const max=Math.max(1,Math.min(layer.clientWidth-margin*2,(layer.clientHeight-margin*2)*ratio));const width=Math.max(Math.min(220,max),Math.min(placement.width,max));return {width,height:width/ratio};}
 function anchor(corner,s=size()){return {x:corner.endsWith('right')?layer.clientWidth-s.width-margin:margin,y:corner.startsWith('bottom')?layer.clientHeight-s.height-margin:margin};}
 function opposite(corner){return `${corner.startsWith('top')?'bottom':'top'}-${corner.endsWith('left')?'right':'left'}`;}
 function place(animate=false,free=null){
  if(layer.hidden)return;
  reserveControls();const s=size(),p=free||anchor(placement.corner,s);window.style.width=s.width+'px';
  x=Math.max(margin,Math.min(p.x,layer.clientWidth-s.width-margin));y=Math.max(margin,Math.min(p.y,layer.clientHeight-s.height-margin));
  window.classList.toggle('is-settling',animate&&!reduced());window.style.transform=`translate3d(${x}px,${y}px,0)`;window.dataset.corner=placement.corner;resize.dataset.corner=opposite(placement.corner);
 }
 function nearest(){return corners.reduce((best,corner)=>{const p=anchor(corner),distance=(p.x-x)**2+(p.y-y)**2;return distance<best.distance?{corner,distance}:best;},{corner:placement.corner,distance:Infinity}).corner;}
 function cancelStream(){
  generation++;clearTimeout(timer);timer=0;abort?.abort();abort=null;const stop=cleanup;cleanup=null;stop?.();host.replaceChildren();
 }
 function setStatus(value,text=''){
  window.dataset.status=value;status.textContent=text;status.hidden=value==='ready';host.classList.toggle('is-ready',value==='ready');
 }
 function visible(c){return c.available&&c.visible&&!c.normalOpen&&!document.hidden&&!suspended;}
 function begin(context){
  cancelStream();const revision=generation,controller=new AbortController();abort=controller;
  const current=()=>!disposed&&revision===generation&&!controller.signal.aborted&&!layer.hidden&&key===contextKey(context)&&visible(getContext())&&contextKey(getContext())===key;
  setStatus('connecting',`Opening ${context.bot.name}’s screen…`);
  const failed=error=>{
   if(!current())return;
   cancelStream();setStatus('unavailable',error?.screenLabel||'Screen unavailable · Click to open');
   const retryKey=key;timer=setTimeout(()=>{if(!layer.hidden&&key===retryKey)begin(getContext());},Math.min(15000,1500*2**Math.min(retries++,4)));
  };
  Promise.resolve().then(()=>connect({host,botId:context.bot.id,signal:controller.signal,onReady:()=>{if(current()){retries=0;setStatus('ready');}},onFailure:failed})).then(stop=>{if(current())cleanup=stop;else stop?.();},failed);
 }
 function sync(){
  if(disposed)return;
  const c=getContext();toggle.hidden=!c.available;toggle.disabled=!!c.disabled;
  const show=placement.enabled&&visible(c);
  if(!show){if(gesture)finishGesture(true);layer.hidden=true;if(key){key='';cancelStream();}return;}
  const next=contextKey(c);
  if(gesture&&next!==key)finishGesture(true);
  layer.hidden=false;surface.setAttribute('aria-label',`Open ${c.bot.name}’s computer. Drag to move; arrow keys to anchor.`);window.setAttribute('aria-label',`${c.bot.name}’s floating computer`);if(!gesture)place(window.classList.contains('is-settling'));
  if(next!==key){cancelStream();key=next;retries=0;setStatus('connecting',`Opening ${c.bot.name}’s screen…`);timer=setTimeout(()=>{timer=0;if(!layer.hidden&&key===next)begin(getContext());},100);}
 }
 function scheduleSync(){if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;sync();});}
 function finishGesture(cancel=false){
  if(!gesture)return;
  const active=gesture;gesture=null;
  if(cancel){placement.corner=active.corner;placement.width=active.width;}
  else if(active.kind==='drag'&&active.moved)placement.corner=nearest();
  if(active.kind==='drag')suppressClick=cancel||active.moved;
  window.classList.remove('is-dragging');layer.classList.remove('is-moving');for(const target of targets)target.classList.remove('is-target');
  if(active.button.hasPointerCapture(active.pointer))active.button.releasePointerCapture(active.pointer);
  if(active.kind==='drag'&&!active.moved&&!cancel)return;
  place(true);persist();
 }
 function start(event,kind){
  if(event.button!==0||!event.isPrimary||gesture)return;
  event.preventDefault();if(kind==='drag')suppressClick=false;
  const button=event.currentTarget;button.focus({preventScroll:true});button.setPointerCapture(event.pointerId);
  const transform=new DOMMatrixReadOnly(getComputedStyle(window).transform);
  gesture={kind,button,pointer:event.pointerId,px:event.clientX,py:event.clientY,x:transform.m41,y:transform.m42,actualWidth:size().width,width:placement.width,corner:placement.corner,moved:kind==='resize'};
 }
 surface.addEventListener('pointerdown',e=>start(e,'drag'));resize.addEventListener('pointerdown',e=>start(e,'resize'));
 function move(event){
  if(!gesture||event.pointerId!==gesture.pointer)return;
  const dx=event.clientX-gesture.px,dy=event.clientY-gesture.py;
  if(gesture.kind==='drag'){
   if(!gesture.moved&&Math.hypot(dx,dy)<6)return;
   gesture.moved=true;window.classList.add('is-dragging');layer.classList.add('is-moving');place(false,{x:gesture.x+dx,y:gesture.y+dy});const corner=nearest();for(const target of targets)target.classList.toggle('is-target',target.dataset.corner===corner);
  }else{
   const horizontal=placement.corner.endsWith('right')?-dx:dx,vertical=(placement.corner.startsWith('bottom')?-dy:dy)*ratio;
   const max=Math.min(layer.clientWidth-margin*2,(layer.clientHeight-margin*2)*ratio),delta=Math.abs(horizontal)>Math.abs(vertical)?horizontal:vertical;
   placement.width=Math.max(Math.min(220,max),Math.min(max,gesture.actualWidth+delta));place();
  }
 }
 function up(event){if(gesture?.pointer===event.pointerId)finishGesture(event.type==='pointercancel');}
 function lost(event){if(gesture?.pointer===event.pointerId)finishGesture(true);}
 layer.addEventListener('pointermove',move);layer.addEventListener('pointerup',up);layer.addEventListener('pointercancel',up);layer.addEventListener('lostpointercapture',lost);
 function keydown(event){if(event.key==='Escape'&&gesture){event.preventDefault();finishGesture(true);}}
 document.addEventListener('keydown',keydown);
 surface.addEventListener('click',event=>{
  if(event.detail&&suppressClick){suppressClick=false;event.preventDefault();return;}
  if(!gesture&&!layer.hidden)onOpen();
 });
 surface.addEventListener('keydown',event=>{
  const directions={ArrowLeft:['left',1],ArrowRight:['right',1],ArrowUp:['top',0],ArrowDown:['bottom',0]},direction=directions[event.key];if(!direction)return;
  event.preventDefault();const parts=placement.corner.split('-');parts[direction[1]]=direction[0];placement.corner=parts.join('-');place(true);persist();
 });
 resize.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const max=Math.min(layer.clientWidth-margin*2,(layer.clientHeight-margin*2)*ratio);
  placement.width=Math.max(Math.min(220,max),Math.min(max,size().width+(['ArrowRight','ArrowUp'].includes(event.key)?32:-32)));place();persist();
 });
 dock.addEventListener('click',()=>{finishGesture(true);placement.enabled=false;persist();sync();returnFocus?.();});
 toggle.addEventListener('click',()=>{if(toggle.disabled)return;placement.enabled=true;persist();onDetach();sync();surface.focus({preventScroll:true});});
 const observer=new MutationObserver(scheduleSync);observer.observe(sourcePanel,{attributes:true,attributeFilter:['hidden','inert','class']});observer.observe(mount,{attributes:true,attributeFilter:['hidden','inert'],childList:true});observer.observe(bounds.closest('.conversation'),{attributes:true,attributeFilter:['inert']});
 const resizeObserver=new ResizeObserver(()=>{if(!gesture)place();});for(const node of [bounds,composer,header])resizeObserver.observe(node);
 const visibility=()=>{if(document.hidden&&gesture)finishGesture(true);sync();};document.addEventListener('visibilitychange',visibility);
 const hide=()=>{suspended=true;sync();},show=()=>{suspended=false;sync();};globalThis.addEventListener('pagehide',hide);globalThis.addEventListener('pageshow',show);
 sync();
 return {sync,dispose(){if(disposed)return;finishGesture(true);disposed=true;cancelAnimationFrame(frame);cancelStream();observer.disconnect();resizeObserver.disconnect();document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);globalThis.removeEventListener('pagehide',hide);globalThis.removeEventListener('pageshow',show);layer.remove();toggle.remove();}};
}
