// Mobile bridges expose scoped sessions, account navigation and bounded exports
// through a user-selected save destination, never arbitrary paths or execution.
import './mobile-messages.js';
export function mobileSession(token, profileId = '') {
  if (!window.__KINDRED_MOBILE) return;
  if(profileId)window.__KINDRED_MOBILE_PROFILE=profileId;
  localStorage.removeItem('kindred-token');
  const payload={token,profile_id:profileId};
  if(window.webkit?.messageHandlers?.kindredSession)window.webkit.messageHandlers.kindredSession.postMessage(payload);
  else window.kindredNative?.postMessage(JSON.stringify({type:'session',...payload}));
}
export function mobileAccounts() {
  if(!window.__KINDRED_MOBILE)return false;
  if(window.webkit?.messageHandlers?.kindredAccounts)window.webkit.messageHandlers.kindredAccounts.postMessage({action:'open'});
  else window.kindredNative?.postMessage(JSON.stringify({type:'accounts'}));
  return true;
}
export function mobileConversationKey(profile=window.__KINDRED_MOBILE_PROFILE) {
  return window.__KINDRED_MOBILE && typeof profile==='string' && /^[a-zA-Z0-9-]{1,160}$/.test(profile)?'kindred-mobile-drafts-'+profile:null;
}
export function mobileRequestedChat() {
  if(!window.__KINDRED_MOBILE)return null;
  const id=new URLSearchParams(location.hash.slice(1)).get('kindred-chat');
  return id && /^[a-zA-Z0-9-]{1,160}$/.test(id)?id:null;
}
export function mobileRequestedEvent() {
  if(!window.__KINDRED_MOBILE)return null;
  const id=new URLSearchParams(location.hash.slice(1)).get('kindred-event');
  return id && /^[0-9]{1,32}$/.test(id)?id:null;
}
if(window.__KINDRED_MOBILE)document.documentElement.dataset.mobile='true';

// Android WebView does not implement blob downloads. Transfer bounded chunks to
// the native save-document picker; no server-supplied filesystem paths are used.
if(window.__KINDRED_MOBILE_PLATFORM==='android' && window.kindredNative){
  let active=null;
  window.kindredNative.onmessage=event=>{
    let value;try{value=JSON.parse(event.data);}catch{return;}
    if(value.id!==active?.id)return;
    if(value.error)active.fail(value.error);
    else if(value.stage==='ready')active.ready();
    else if(['saved','cancelled'].includes(value.stage))active.finish();
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[download]');
    if(!link||!link.href.startsWith('blob:'+location.origin+'/'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const report=message=>window.dispatchEvent(new CustomEvent('kindred-mobile-error',{detail:message}));
    if(active){report('Finish the current download first.');return;}
    const id=crypto.randomUUID();
    let ready,finish,error=null;
    const started=new Promise(resolve=>ready=resolve);
    // Resolve with a recorded error, avoiding unhandled rejections while chunks
    // are in flight. Only the owning transfer clears its timer and state.
    const done=new Promise(resolve=>finish=resolve);
    active={id,ready,finish,fail:message=>{error=new Error(message);ready();finish();}};
    const post=value=>window.kindredNative.postMessage(JSON.stringify({id,...value}));
    const timer=setTimeout(()=>{if(active?.id===id)active.fail('Download timed out. Please try again.');},300000);
    const transfer=async()=>{
      const blob=await(await fetch(link.href)).blob();
      if(blob.size>32*1024*1024)throw new Error('Mobile downloads are limited to 32 MB.');
      post({type:'download-start',name:link.download||'download',size:blob.size});
      await started;if(error)throw error;
      for(let offset=0;offset<blob.size;offset+=16384){
        const bytes=new Uint8Array(await blob.slice(offset,offset+16384).arrayBuffer());
        if(error)throw error;
        post({type:'download-chunk',data:btoa(String.fromCharCode(...bytes))});
      }
      post({type:'download-end'});await done;if(error)throw error;
    };
    void transfer().catch(error=>{post({type:'download-cancel'});report(error.message);}).finally(()=>{
      clearTimeout(timer);if(active?.id===id)active=null;
    });
  },true);
}

// Native iOS owns edge recognition and touch cancellation; the shared document
// owns route eligibility, retained views and the interactive visual transition.
export function installMobileNavigation({route,back,resized,computerGeometryValid,inputAvailabilityChanged}) {
  if(window.__KINDRED_MOBILE_PLATFORM!=='ios')return;
  const html=document.documentElement,shell=document.querySelector('#app');
  const edge=document.createElement('div');edge.className='ios-computer-edge';edge.setAttribute('aria-hidden','true');document.querySelector('#computer-panel').append(edge);for(const type of ['pointerdown','pointerup','click'])edge.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
  let revision=0,signature='',gesture=null,lastSize='',settleFrame=0,resizeFrame=0,layoutHeight=0,layoutWidth=0,windowShape='';
  const paneKey='kindred-ios-duo-panes-v1';
  let panes={sidebar:210,computer:280,hidden:false},paneDrag=null;
  try{const saved=JSON.parse(localStorage.getItem(paneKey)||'null');if(saved&&Number.isFinite(saved.sidebar)&&saved.sidebar>=160&&saved.sidebar<=600&&Number.isFinite(saved.computer)&&saved.computer>=240&&saved.computer<=800&&typeof saved.hidden==='boolean')panes=saved;}catch{}
  const savePanes=()=>{try{localStorage.setItem(paneKey,JSON.stringify(panes));}catch{}};
  const visible=n=>!!n&&!n.hidden&&n.getClientRects().length>0;
  const blocked=(allowSelection=false)=>shell.dataset.mobileResizing==='true'||!!document.querySelector('dialog[open]')||(!allowSelection&&!!getSelection()?.toString())||[...document.querySelectorAll('[role=menu],.identity-menu,.composer-menu,.message-action-menu,#new-menu,.mention-options,.command-options,#content form')].some(visible);
  function state(){const r=route(),target=blocked()?'none':r.target;return {...r,target};}
  function clear(){if(!gesture)return;for(const animation of gesture.animations||[])animation.cancel();for(const n of gesture.nodes){n.style.removeProperty('transform');n.style.removeProperty('opacity');n.style.removeProperty('will-change');}shell.classList.remove('ios-edge-preview');shell.removeAttribute('data-edge-target');gesture=null;}
  function publish(){const r=state(),s=r.key+'|'+r.target;if(s===signature)return;signature=s;revision++;clear();window.webkit?.messageHandlers?.kindredNavigation?.postMessage({target:r.target,revision});}
  // Native toolbar taps share retained navigation with edge gestures.
  window.__KINDRED_MOBILE_BACK=target=>{
    if(blocked(true)||!['chat-list','bot-chat'].includes(target))return false;
    if(target==='bot-chat'&&!visible(document.querySelector('#computer-panel')))return false;
    if(target==='chat-list'&&(html.dataset.iosLayout!=='compact'||route().target!=='chat-list'))return false;
    clear();document.activeElement?.blur();back(target);publish();return true;
  };
  function geometry(force=false){
    // Keyboard-only visual viewport changes do not alter the layout size class.
    const style=getComputedStyle(shell),w=(shell.clientWidth||innerWidth)-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0),h=document.documentElement.clientHeight||innerHeight,scale=parseFloat(getComputedStyle(html).getPropertyValue('--text-scale'))||1,duo=window.__KINDRED_IOS_LAYOUT?.isDuo===true,inner=duo&&window.__KINDRED_IOS_LAYOUT?.isDuoInner===true,computerOpen=visible(document.querySelector('#computer-panel')),minChat=(duo?(computerOpen?20:24):32)*15*scale,computerWidth=duo?(inner?panes.computer:280):Math.max(360,w*.42),size=[w,h,scale,computerOpen,duo,inner,panes.sidebar,panes.computer,panes.hidden].join('|');
    if(size===lastSize&&force!==true)return;
    lastSize=size;clear();
    const native=window.__KINDRED_NATIVE_GEOMETRY,shape=native?native.windowWidth+'x'+native.windowHeight:'',typing=document.activeElement?.matches('input,textarea,[contenteditable=true]');
    // SwiftUI can also shorten the host above the keyboard. Retain the class
    // when the native window is unchanged and an editor still has focus.
    const keyboardHost=typing&&shape&&shape===windowShape&&layoutWidth===w&&layoutHeight>h;
    if(!keyboardHost){layoutHeight=h;layoutWidth=w;}windowShape=shape;
    const regions=duo?native?.reservedRegions||[]:[];
    if(paneDrag&&(!inner||regions.some(r=>r.kind==='division')||shape!==paneDrag.shape)){paneDrag.cancel();return;}
    let sidebarWidth=duo?(inner?Math.min(panes.sidebar,Math.max(160,w-minChat)):210):300,paneWidth=inner?Math.min(computerWidth,Math.max(240,w-minChat)):computerWidth,gap=0;
    const contentLeft=shell.getBoundingClientRect().left+(parseFloat(style.paddingLeft)||0);
    const division=duo?native?.reservedRegions?.filter(r=>r.kind==='division'&&r.height>r.width).map(r=>({...r,x:r.x-contentLeft})).find(r=>r.x>0&&r.x+r.width<w):null;
    let side=computerOpen&&layoutHeight>=480&&w-paneWidth>=minChat;
    let list=layoutHeight>=480&&w-sidebarWidth-(side?paneWidth:0)>=minChat&&!(inner&&panes.hidden);
    if(division){
      gap=division.width;paneWidth=w-division.x-gap;
      side=computerOpen&&division.x>=minChat&&paneWidth>=280;
      list=!computerOpen&&division.x>=210&&paneWidth>=minChat&&!(inner&&panes.hidden);
      sidebarWidth=division.x;
      if(!side&&!list)gap=0;
    }
    html.style.setProperty('--ios-sidebar-width',sidebarWidth+'px');
    html.style.setProperty('--ios-computer-width',paneWidth+'px');
    html.style.setProperty('--ios-division-gap',gap+'px');
    const regular=list||(inner&&panes.hidden&&layoutHeight>=480&&w-(side?paneWidth:0)>=minChat);
    html.dataset.iosLayout=regular?'regular':'compact';html.dataset.iosSidebarHidden=String(regular&&!list);html.dataset.iosShort=String(layoutHeight<480);html.dataset.iosComputer=side?'side':'overlay';
    if(window.__KINDRED_NATIVE_GEOMETRY)html.dataset.nativeSafeArea='host';
    if(html.dataset.iosLayout==='regular')shell.classList.remove('sidebar-open');
    shell.dataset.mobileResizing='true';inputAvailabilityChanged?.();cancelAnimationFrame(settleFrame);resized?.();
    let previous='';
    const validate=()=>{
      const canvas=document.querySelector('#desktop canvas:not(.desktop-glass)'),rect=canvas?.getBoundingClientRect(),stamp=rect?[rect.x,rect.y,rect.width,rect.height].join('|'):'none';
      if(!paneDrag&&previous===stamp&&computerGeometryValid?.()===true){delete shell.dataset.mobileResizing;inputAvailabilityChanged?.();publish();return;}
      previous=stamp;settleFrame=requestAnimationFrame(validate);
    };
    settleFrame=requestAnimationFrame(validate);publish();
  }
  window.__KINDRED_DUO_PANES={toggleList(){
    if(!window.__KINDRED_IOS_LAYOUT?.isDuoInner||blocked(true))return;
    panes.hidden=html.dataset.iosSidebarHidden!=='true';savePanes();geometry(true);
  }};
  // Inner-display separators use native available bounds rather than desktop
  // breakpoints/rail widths. A full hide always has a native restore button.
  for(const [kind,parent] of [['sidebar',shell.querySelector('.sidebar')],['computer',document.querySelector('#computer-panel')]]){
    if(!parent)continue;
    const handle=document.createElement('div');handle.className='ios-duo-resizer';handle.dataset.pane=kind;handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',kind==='sidebar'?'Resize chat list':'Resize bot computer');parent.append(handle);
    const limits=()=>{
      const style=getComputedStyle(shell),width=shell.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0),scale=parseFloat(getComputedStyle(html).getPropertyValue('--text-scale'))||1;
      const computer=visible(document.querySelector('#computer-panel')),side=html.dataset.iosComputer==='side',list=html.dataset.iosLayout==='regular'&&html.dataset.iosSidebarHidden!=='true';
      const other=kind==='sidebar'?(computer&&side?parseFloat(html.style.getPropertyValue('--ios-computer-width'))||280:0):(list?parseFloat(html.style.getPropertyValue('--ios-sidebar-width'))||210:0);
      const min=kind==='sidebar'?160:240,max=Math.max(min,width-(computer?300:360)*scale-other);
      handle.setAttribute('aria-valuemin',kind==='sidebar'?'0':String(min));handle.setAttribute('aria-valuemax',String(Math.round(max)));
      return {min,max,width};
    };
    const allowed=()=>window.__KINDRED_IOS_LAYOUT?.isDuoInner===true&&!(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions||[]).some(r=>r.kind==='division')&&!blocked(true)&&!document.querySelector('#computer-panel')?.classList.contains('expanded');
    const apply=(raw,l)=>{panes[kind]=Math.max(l.min,Math.min(l.max,raw));if(kind==='sidebar')panes.hidden=raw<80;geometry(true);handle.setAttribute('aria-valuenow',String(Math.round(panes.hidden&&kind==='sidebar'?0:panes[kind])));};
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||paneDrag||!allowed())return;
      event.preventDefault();event.stopPropagation();clear();
      const before={...panes},l=limits(),start=parent.getBoundingClientRect().width,x=event.clientX,id=event.pointerId,shape=windowShape;
      const shield=document.createElement('div');shield.className='pane-resize-shield';shield.setAttribute('aria-hidden','true');document.body.append(shield);
      html.classList.add('pane-resizing');handle.setPointerCapture(id);let ended=false;
      const move=e=>{if(e.pointerId===id)apply(start+(e.clientX-x)*(kind==='sidebar'?1:-1),l);};
      const end=commit=>{
        if(ended)return;ended=true;paneDrag=null;
        handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel);handle.removeEventListener('lostpointercapture',cancel);document.removeEventListener('keydown',escape,true);
        if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);shield.remove();html.classList.remove('pane-resizing');
        if(commit)savePanes();else panes=before;geometry(true);
      };
      const up=e=>{if(e.pointerId===id)end(true);},cancel=()=>end(false),escape=e=>{if(e.key==='Escape'){e.preventDefault();end(false);}};
      paneDrag={shape,cancel};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);document.addEventListener('keydown',escape,true);
      shell.dataset.mobileResizing='true';inputAvailabilityChanged?.();
    });
    handle.addEventListener('keydown',event=>{
      if(!allowed()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const l=limits(),raw=event.key==='Home'?(kind==='sidebar'?0:l.min):event.key==='End'?l.max:parent.getBoundingClientRect().width+(event.key==='ArrowRight'?1:-1)*(kind==='sidebar'?1:-1)*(event.shiftKey?64:16);
      apply(raw,l);savePanes();
    });
  }
  window.__KINDRED_EDGE_BACK=message=>{
    if(!message||typeof message.id!=='string'||!/^[0-9a-f-]{36}$/i.test(message.id)||!Number.isSafeInteger(message.revision)||message.revision!==revision||!Number.isFinite(message.progress)||message.progress<0||message.progress>1)return false;
    const r=state();if(r.target==='none') {clear();publish();return false;}
    if(message.phase==='begin'){
      if(gesture)return false;
      if(!Number.isFinite(message.x)||!Number.isFinite(message.y)||message.x<0||message.x>20||message.y<0||message.y>innerHeight)return false;
      const hit=document.elementFromPoint(message.x,message.y);if(!hit||hit.closest('canvas'))return false;for(let n=hit;n&&n!==shell;n=n.parentElement)if(n.scrollWidth>n.clientWidth+1&&['auto','scroll'].includes(getComputedStyle(n).overflowX))return false;
      const source=document.querySelector(r.target==='bot-chat'?'#computer-panel':'.conversation'),destination=document.querySelector(r.target==='bot-chat'?'.conversation':'.sidebar');if(!source||!destination)return false;
      document.activeElement?.blur();gesture={id:message.id,revision,target:r.target,key:r.key,nodes:[source,destination],width:source.getBoundingClientRect().width};shell.classList.add('ios-edge-preview');shell.dataset.edgeTarget=r.target;
    }
    if(!gesture||gesture.id!==message.id||gesture.revision!==revision||gesture.key!==r.key||gesture.target!==r.target)return false;
    if(gesture.ending)return false;const [source,destination]=gesture.nodes,reduced=html.dataset.motion==='off'||matchMedia('(prefers-reduced-motion:reduce)').matches;
    if(message.phase==='begin'||message.phase==='update'){
      if(reduced)source.style.opacity=String(1-message.progress*.3);
      else{source.style.transform=`translateX(${message.progress*gesture.width}px)`;destination.style.transform=`translateX(${(message.progress-1)*gesture.width*.3}px)`;}
      return true;
    }
    if(!['finish','cancel'].includes(message.phase))return false;
    const commit=message.phase==='finish'&&message.commit===true,target=gesture.target;
    // Navigate once after the visual completion; invalidation cancels this effect.
    gesture.ending=true;const current=gesture,timing={duration:reduced?150:commit?250:200,easing:'ease-out',fill:'forwards'};
    const animations=[source.animate(reduced?[{opacity:getComputedStyle(source).opacity},{opacity:commit?0:1}]:[{transform:getComputedStyle(source).transform},{transform:`translateX(${commit?gesture.width:0}px)`}],timing)];
    if(!reduced)animations.push(destination.animate([{transform:getComputedStyle(destination).transform},{transform:`translateX(${commit?0:-gesture.width*.3}px)`}],timing));
    gesture.animations=animations;Promise.all(animations.map(animation=>animation.finished)).then(()=>{if(gesture!==current)return;if(commit&&state().key===current.key&&!blocked())back(target);clear();publish();}).catch(()=>{if(gesture===current)clear();});return true;
  };
  new MutationObserver(()=>geometry()).observe(html,{attributes:true,attributeFilter:['style']});
  new MutationObserver(()=>{geometry();publish();}).observe(document.querySelector('#computer-panel'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(publish).observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});
  new MutationObserver(publish).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
  document.addEventListener('selectionchange',publish);window.addEventListener('resize',geometry);window.visualViewport?.addEventListener('resize',geometry);window.addEventListener('kindred-native-geometry',()=>geometry(true));const observedResize=()=>{shell.dataset.mobileResizing='true';inputAvailabilityChanged?.();cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>geometry(true));};new ResizeObserver(observedResize).observe(shell);new ResizeObserver(observedResize).observe(document.querySelector('#desktop'));
  for(const type of ['pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','click','touchstart','touchmove','touchend','gesturestart','gesturemove','gestureend','wheel','keydown','keyup'])document.addEventListener(type,e=>{if(shell.dataset.mobileResizing==='true'&&e.target.closest?.('#desktop')){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
  geometry();publish();
}
