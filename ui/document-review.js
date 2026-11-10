import {openDocumentPreview,setDocumentPreviewHost} from './document-preview.js';

// One reading session per conversation. The renderer stays mounted while its
// containing pane changes size; neither a transcript refresh nor expansion
// reparents an iframe or restarts document conversion.
export function createDocumentReview({mount,icon,getContext,prepare,beginLayout,motionAllowed,returnFocus}){
 const element=(tag,cls)=>{const n=document.createElement(tag);n.className=cls;return n;};
 const pane=element('aside','document-review'),head=element('header','document-review-header'),title=element('strong','document-review-title'),actions=element('div','document-review-actions'),tabs=element('div','document-review-tabs'),stage=element('div','document-review-stage');
 pane.hidden=true;pane.setAttribute('aria-label','File review');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Open files');
 const control=(name,symbol,action)=>{const b=element('button','icon-button');b.type='button';b.setAttribute('aria-label',name);b.title=name;b.append(icon(symbol));b.onclick=action;return b;};
 const expand=control('Enlarge preview','expand',event=>transition(()=>{full=!full;layout();},{keyboard:event.detail===0}));
 const dismiss=control('Close preview','close',event=>close({keyboard:event.detail===0}));
 head.append(title,actions,expand,dismiss);pane.append(head,tabs,stage);mount.append(pane);
 const files=new Map(),identities=new WeakMap(),media=matchMedia('(prefers-reduced-motion: reduce)');
 let opened=false,full=false,active=null,scope=null,opener=null,effects=[],timer=0,settleLayout=null;
 let width=mount.clientWidth,height=mount.clientHeight;
 const moving=()=>[mount.querySelector('.conversation-header'),mount.querySelector('.conversation-history'),mount.querySelector('#composer-area')].filter(Boolean);
 const snapshot=()=>moving().map(node=>({node,rect:node.getBoundingClientRect()}));
 const clearEffects=()=>{clearTimeout(timer);for(const a of effects){a.onfinish=null;a.oncancel=null;a.cancel();}effects=[];pane.style.cssText='';pane.classList.remove('document-review-exiting');};
 function disposeFiles(){for(const entry of files.values())entry.handle?.dispose();files.clear();stage.replaceChildren();tabs.replaceChildren();actions.replaceChildren();active=null;}
 function finish(){clearEffects();if(!opened){pane.hidden=true;disposeFiles();}settleLayout?.();settleLayout=null;}
 function layout(){
  mount.classList.toggle('has-document-review',opened);mount.classList.toggle('document-review-full',opened&&full);
  pane.inert=!opened;pane.hidden=false;
  for(const n of moving())n.inert=opened&&full;
  expand.setAttribute('aria-label',full?'Return to conversation':'Enlarge preview');expand.title=expand.getAttribute('aria-label');expand.replaceChildren(icon(full?'chevrons-right':'expand'));
 }
 function transition(change,{keyboard=false,animate=true}={}){
  const surface=mount.querySelector('.composer-resize-surface'),oldSurface=surface?.getBoundingClientRect();
  const before=snapshot(),oldPane=pane.hidden?null:pane.getBoundingClientRect(),wasOpen=opened;
  clearEffects();settleLayout?.();settleLayout=beginLayout();change();
  // Reserve final geometry once. No width/height animation or per-frame layout.
  const after=snapshot();width=mount.clientWidth;height=mount.clientHeight;
  settleLayout?.();
  if(!animate||keyboard||!motionAllowed()||media.matches){finish();return;}
  const timing={duration:240,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
  for(const target of after){
   const prior=before.find(x=>x.node===target.node)?.rect,r=target.rect;if(!prior||!r.width||!prior.width)continue;
   const x=prior.left+prior.width/2-r.left-r.width/2,y=prior.top-r.top;
   if(Math.abs(x)+Math.abs(y)>.5)effects.push(target.node.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],timing));
  }
  if(surface&&oldSurface?.width){const next=surface.getBoundingClientRect();if(next.width&&next.height)effects.push(surface.animate([{transform:`scale(${oldSurface.width/next.width},${oldSurface.height/next.height})`},{transform:'none'}],timing));}
  if(opened){effects.push(pane.animate([{opacity:wasOpen ? .65 : 0,transform:'translateX(18px)'},{opacity:1,transform:'none'}],timing));}
  else if(oldPane){
   const box=mount.getBoundingClientRect();pane.classList.add('document-review-exiting');
   Object.assign(pane.style,{left:(oldPane.left-box.left)+'px',top:(oldPane.top-box.top)+'px',right:'auto',bottom:'auto',width:oldPane.width+'px',height:oldPane.height+'px'});
   effects.push(pane.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX(18px)'}],{...timing,duration:180}));
  }
  if(!effects.length){finish();return;}
  // The finalizer also covers webviews that lose a finish event.
  timer=setTimeout(finish,timing.duration+100);
 }
 function close({keyboard=false,animate=true,restore=true}={}){
  if(!opened){if(!animate)finish();return;}
  const focus=pane.contains(document.activeElement);
  transition(()=>{opened=false;full=false;layout();},{keyboard,animate});
  if(restore&&(focus||keyboard)){if(opener?.isConnected)opener.focus({preventScroll:true});else returnFocus();}
 }
 function sync(){const context=getContext();if(opened&&(!context.enabled||context.key!==scope))close({animate:false,restore:false});}
 function select(key){
  active=key;const entry=files.get(key);title.textContent=entry.options.name;title.title=entry.options.name;
  actions.replaceChildren();if(entry.options.createDownloadButton)actions.append(entry.options.createDownloadButton({iconOnly:true}));else if(entry.options.download)actions.append(control('Download','download',()=>entry.options.download()));
  for(const [id,item] of files){item.mount.hidden=id!==key;item.tab.setAttribute('aria-pressed',String(id===key));}
 }
 function host(options){
  const context=getContext();if(!context.enabled||!options.card?.closest('.conversation,#details-panel'))return null;
  sync();const key=options.card.dataset.fileSignature||identities.get(options.card)||Symbol(options.name);identities.set(options.card,key);
  opener=options.card.querySelector('.file-preview')||document.activeElement;
  const keyboard=opener?.matches(':focus-visible')||false;
  transition(()=>{prepare();opened=true;scope=context.key;layout();},{keyboard,animate:!opened});
  if(files.has(key)){select(key);return Promise.resolve(files.get(key).handle);}
  if(files.size>=4){const oldest=[...files.keys()].find(id=>id!==active)||files.keys().next().value;const prior=files.get(oldest);prior.handle?.dispose();prior.mount.remove();prior.tab.remove();files.delete(oldest);}
  const container=element('div','document-review-file'),tab=element('button','document-review-tab');tab.type='button';tab.textContent=options.name;tab.title=options.name;tab.onclick=()=>select(key);
  const entry={options,mount:container,tab,handle:null};files.set(key,entry);stage.append(container);tabs.append(tab);select(key);
  const pending=openDocumentPreview({...options,mount:container,independent:true,onMount:handle=>{entry.handle=handle;options.onMount?.(handle);}});
  if(keyboard)dismiss.focus({preventScroll:true});
  return pending;
 }
 setDocumentPreviewHost(host);
 mount.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented||!opened||document.querySelector('dialog[open],:popover-open'))return;event.preventDefault();event.stopPropagation();if(full)transition(()=>{full=false;layout();expand.focus({preventScroll:true});},{keyboard:true});else close({keyboard:true});});
 const resize=new ResizeObserver(()=>{const w=mount.clientWidth,h=mount.clientHeight;if(w!==width||h!==height){width=w;height=h;finish();}});resize.observe(mount);
 const visibility=new MutationObserver(sync);visibility.observe(mount,{attributes:true,attributeFilter:['inert']});visibility.observe(mount.parentElement,{attributes:true,attributeFilter:['hidden']});
 const motion=new MutationObserver(()=>{if(!motionAllowed())finish();});motion.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
 media.addEventListener('change',()=>{if(media.matches)finish();});document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});window.addEventListener('blur',finish);
 return {close,sync};
}
