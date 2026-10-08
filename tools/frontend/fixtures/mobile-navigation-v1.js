// Historical iOS navigation installer from Kindred 5de3462.
// Retained to test the native presentation adapter against deployed v1 servers.
export function installMobileNavigation({route,back,resized,computerGeometryValid,inputAvailabilityChanged}) {
  if(window.__KINDRED_MOBILE_PLATFORM!=='ios')return;
  const html=document.documentElement,shell=document.querySelector('#app');
  const edge=document.createElement('div');edge.className='ios-computer-edge';edge.setAttribute('aria-hidden','true');document.querySelector('#computer-panel').append(edge);for(const type of ['pointerdown','pointerup','click'])edge.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();});
  let revision=0,signature='',gesture=null,lastSize='',settleFrame=0,resizeFrame=0,layoutHeight=0,layoutWidth=0,windowShape='';
  const visible=n=>!!n&&!n.hidden&&n.getClientRects().length>0;
  const blocked=(allowSelection=false)=>shell.dataset.mobileResizing==='true'||!!document.querySelector('dialog[open]')||(!allowSelection&&!!getSelection()?.toString())||[...document.querySelectorAll('[role=menu],.identity-menu,.composer-menu,.message-action-menu,#new-menu,.mention-options,.command-options,#content form')].some(visible);
  function state(){const r=route(),target=blocked()?'none':r.target;return {...r,target};}
  function clear(){if(!gesture)return;gesture.animation?.cancel();for(const n of gesture.nodes){n.style.removeProperty('transform');n.style.removeProperty('opacity');n.style.removeProperty('will-change');}shell.classList.remove('ios-edge-preview');shell.removeAttribute('data-edge-target');gesture=null;}
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
    const style=getComputedStyle(shell),w=(shell.clientWidth||innerWidth)-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0),h=document.documentElement.clientHeight||innerHeight,scale=parseFloat(getComputedStyle(html).getPropertyValue('--text-scale'))||1,duo=window.__KINDRED_IOS_LAYOUT?.isDuo===true,minChat=(duo?24:32)*15*scale,computerWidth=duo?Math.max(280,w>=850?280:w*.46):Math.max(360,w*.42),computerOpen=visible(document.querySelector('#computer-panel')),size=[w,h,scale,computerOpen,duo].join('|');
    if(size===lastSize&&force!==true)return;
    lastSize=size;clear();
    const native=window.__KINDRED_NATIVE_GEOMETRY,shape=native?native.windowWidth+'x'+native.windowHeight:'',typing=document.activeElement?.matches('input,textarea,[contenteditable=true]');
    // SwiftUI can also shorten the host above the keyboard. Retain the class
    // when the native window is unchanged and an editor still has focus.
    const keyboardHost=typing&&shape&&shape===windowShape&&layoutWidth===w&&layoutHeight>h;
    if(!keyboardHost){layoutHeight=h;layoutWidth=w;}windowShape=shape;
    let sidebarWidth=duo?210:300,paneWidth=computerWidth,gap=0;
    const contentLeft=shell.getBoundingClientRect().left+(parseFloat(style.paddingLeft)||0);
    const division=duo?native?.reservedRegions?.filter(r=>r.kind==='division'&&r.height>r.width).map(r=>({...r,x:r.x-contentLeft})).find(r=>r.x>0&&r.x+r.width<w):null;
    let side=computerOpen&&layoutHeight>=480&&w-paneWidth>=minChat;
    let list=layoutHeight>=480&&w-sidebarWidth-(side?paneWidth:0)>=minChat;
    if(division){
      gap=division.width;paneWidth=w-division.x-gap;
      side=computerOpen&&division.x>=minChat&&paneWidth>=280;
      list=!computerOpen&&division.x>=210&&paneWidth>=minChat;
      sidebarWidth=division.x;
      if(!side&&!list)gap=0;
    }
    html.style.setProperty('--ios-sidebar-width',sidebarWidth+'px');
    html.style.setProperty('--ios-computer-width',paneWidth+'px');
    html.style.setProperty('--ios-division-gap',gap+'px');
    html.dataset.iosLayout=list?'regular':'compact';html.dataset.iosShort=String(layoutHeight<480);html.dataset.iosComputer=side?'side':'overlay';
    if(window.__KINDRED_NATIVE_GEOMETRY)html.dataset.nativeSafeArea='host';
    if(html.dataset.iosLayout==='regular')shell.classList.remove('sidebar-open');
    shell.dataset.mobileResizing='true';inputAvailabilityChanged?.();cancelAnimationFrame(settleFrame);resized?.();
    let previous='';
    const validate=()=>{
      const canvas=document.querySelector('#desktop canvas:not(.desktop-glass)'),rect=canvas?.getBoundingClientRect(),stamp=rect?[rect.x,rect.y,rect.width,rect.height].join('|'):'none';
      if(previous===stamp&&computerGeometryValid?.()===true){delete shell.dataset.mobileResizing;inputAvailabilityChanged?.();publish();return;}
      previous=stamp;settleFrame=requestAnimationFrame(validate);
    };
    settleFrame=requestAnimationFrame(validate);publish();
  }
  window.__KINDRED_EDGE_BACK=message=>{
    if(!message||typeof message.id!=='string'||!/^[0-9a-f-]{36}$/i.test(message.id)||!Number.isSafeInteger(message.revision)||message.revision!==revision||!Number.isFinite(message.progress)||message.progress<0||message.progress>1)return false;
    const r=state();if(r.target==='none') {clear();publish();return false;}
    if(message.phase==='begin'){
      if(gesture)return false;
      if(!Number.isFinite(message.x)||!Number.isFinite(message.y)||message.x<0||message.x>20||message.y<0||message.y>innerHeight)return false;
      const hit=document.elementFromPoint(message.x,message.y);if(!hit||hit.closest('canvas'))return false;for(let n=hit;n&&n!==shell;n=n.parentElement)if(n.scrollWidth>n.clientWidth+1&&['auto','scroll'].includes(getComputedStyle(n).overflowX))return false;
      const source=document.querySelector(r.target==='bot-chat'?'#computer-panel':'.conversation'),destination=document.querySelector(r.target==='bot-chat'?'.conversation':'.sidebar');if(!source||!destination)return false;
      document.activeElement?.blur();gesture={id:message.id,revision,target:r.target,key:r.key,nodes:[source,destination],width:shell.clientWidth};shell.classList.add('ios-edge-preview');shell.dataset.edgeTarget=r.target;
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
    gesture.ending=true;const current=gesture,animation=source.animate(reduced?[{opacity:getComputedStyle(source).opacity},{opacity:commit?0:1}]:[{transform:getComputedStyle(source).transform},{transform:`translateX(${commit?gesture.width:0}px)`}],{duration:reduced?150:commit?250:200,easing:'ease-out'});
    gesture.animation=animation;animation.finished.then(()=>{if(gesture!==current)return;if(commit&&state().key===current.key&&!blocked())back(target);clear();publish();}).catch(()=>{if(gesture===current)clear();});return true;
  };
  new MutationObserver(()=>geometry()).observe(html,{attributes:true,attributeFilter:['style']});
  new MutationObserver(()=>{geometry();publish();}).observe(document.querySelector('#computer-panel'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(publish).observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});
  new MutationObserver(publish).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
  document.addEventListener('selectionchange',publish);window.addEventListener('resize',geometry);window.visualViewport?.addEventListener('resize',geometry);window.addEventListener('kindred-native-geometry',()=>geometry(true));const observedResize=()=>{shell.dataset.mobileResizing='true';inputAvailabilityChanged?.();cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>geometry(true));};new ResizeObserver(observedResize).observe(shell);new ResizeObserver(observedResize).observe(document.querySelector('#desktop'));
  for(const type of ['pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','click','touchstart','touchmove','touchend','gesturestart','gesturemove','gestureend','wheel','keydown','keyup'])document.addEventListener(type,e=>{if(shell.dataset.mobileResizing==='true'&&e.target.closest?.('#desktop')){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
  geometry();publish();
}
