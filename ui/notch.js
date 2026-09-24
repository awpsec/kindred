import {character, setActivity} from './characters.js';

const root=document.documentElement,card=document.querySelector('#alert'),content=document.querySelector('#open');
const invoke=(action,id)=>window.__TAURI__.core.invoke('notch_action',{action,id:id||null});
let current=null,animation=null,contentAnimation=null,timer=null,closing=false,revision=0,pending=false,again=false,hovered=false,closingAction=null;
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
const motion=()=>!systemMotion.matches&&root.dataset.motion!=='off';
function cancelMotion(){animation?.cancel();contentAnimation?.cancel();animation=null;contentAnimation=null;}
// A fixed native window avoids compositor resize jumps. Morph only its black
// silhouette, keeping the camera clearance and the text's layout stationary.
function silhouette(progress){
  const width=card.offsetWidth,top=parseFloat(root.style.getPropertyValue('--notch-top'))||32;
  const bridge=Math.min(parseFloat(root.style.getPropertyValue('--notch-bridge'))||176,width-16);
  const side=(width-bridge)/2+(8-(width-bridge)/2)*progress;
  const height=top+32*progress,shoulder=8,radius=Math.min(12+6*progress,height-shoulder),right=width-side;
  return `path("M ${side-shoulder} 0 Q ${side} 0 ${side} ${shoulder} L ${side} ${height-radius} Q ${side} ${height} ${side+radius} ${height} L ${right-radius} ${height} Q ${right} ${height} ${right} ${height-radius} L ${right} ${shoulder} Q ${right} 0 ${right+shoulder} 0 Z")`;
}
function settled(){card.style.clipPath=silhouette(1);content.style.opacity='1';content.style.transform='none';}
async function close(action='dismiss'){
  if(!current||closing||(action==='dismiss'&&hovered))return;
  closing=true;closingAction=action;const id=current.id,ticket=++revision;clearTimeout(timer);
  const from=getComputedStyle(card).clipPath,opacity=getComputedStyle(content).opacity,transform=getComputedStyle(content).transform;cancelMotion();
  if(motion()){
    animation=card.animate([{clipPath:from},{clipPath:silhouette(0)}],{duration:300,easing:'cubic-bezier(.4,0,.75,.25)',fill:'forwards'});
    contentAnimation=content.animate([{opacity,transform},{opacity:0,transform:'translateY(-4px)'}],{duration:140,easing:'ease-out',fill:'forwards'});
    await Promise.race([animation.finished.catch(()=>{}),new Promise(r=>setTimeout(r,360))]);
  }
  if(ticket!==revision)return;
  card.hidden=true;cancelMotion();current=null;closing=false;
  await invoke(action,id);await refresh();
}
function arm(){clearTimeout(timer);if(current&&!closing&&!hovered)timer=setTimeout(()=>void close().catch(()=>{}),3000);}
async function refresh(){
  if(pending){again=true;return;}pending=true;
  try{
    const next=await invoke('state');
    if(!next){++revision;current=null;closing=false;hovered=false;card.classList.remove('hovered');card.hidden=true;clearTimeout(timer);cancelMotion();return;}
    root.style.setProperty('--notch-top',next.layout.top+'px');root.dataset.notched=String(next.layout.notched);
    root.style.setProperty('--notch-bridge',(next.layout.bridge_width||176)+'px');
    if(current?.id===next.id){if(!closing&&(!animation||animation.playState==='finished')){cancelMotion();settled();}return;}
    ++revision;closing=false;clearTimeout(timer);cancelMotion();current=next;
    root.dataset.motion=next.reduced_motion?'off':'on';
    const name=next.avatar?.name||next.title;
    document.querySelector('#title').textContent=name;
    document.querySelector('#message').textContent='sent you a message.';
    card.setAttribute('aria-label',`${name} sent you a message. Open Kindred`);
    const avatar=character({...next.avatar,name:next.avatar?.name||next.title},20);document.querySelector('#avatar').replaceChildren(avatar);
    card.hidden=false;setActivity(avatar,'idle');
    if(motion()){card.style.clipPath=silhouette(0);content.style.opacity='0';content.style.transform='translateY(4px)';}else settled();
    // Populate before revealing the native window, then animate from its top edge.
    await invoke('present',next.id);
    if(current?.id!==next.id)return;
    if(motion()){
      card.style.clipPath=silhouette(1);content.style.opacity='1';content.style.transform='none';
      animation=card.animate([{clipPath:silhouette(0),offset:0},{clipPath:silhouette(1.015),offset:.76},{clipPath:silhouette(1),offset:1}],{duration:440,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
      contentAnimation=content.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,delay:90,easing:'ease-out',fill:'both'});
      animation.finished.catch(()=>{});contentAnimation.finished.catch(()=>{});
    }
    arm();
  }finally{pending=false;if(again){again=false;void refresh().catch(()=>{});}}
}
function hold(value){
  hovered=value;card.classList.toggle('hovered',value);
  if(!current)return;
  if(value){clearTimeout(timer);if(closing&&closingAction==='dismiss'){++revision;closing=false;cancelMotion();settled();}void invoke('hold',current.id).catch(()=>{});}
  else{void invoke('release',current.id).catch(()=>{});arm();}
}
card.addEventListener('pointerenter',()=>hold(true));
card.addEventListener('pointerleave',()=>hold(false));
card.onclick=()=>void close('open').catch(()=>{});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hold(false);void close().catch(()=>{});}});
systemMotion.addEventListener('change',()=>{if(!motion()){cancelMotion();if(current&&!closing)settled();}});
await window.__TAURI__.event.listen('kindred-notch-changed',()=>void refresh().catch(()=>{}));
await refresh();
// Refresh screen geometry after docking, moving Kindred or removing a display.
// Native expiry still dismisses the surface if WebKit timers stop responding.
setInterval(()=>{if(current){if(hovered&&!closing)void invoke('hold',current.id).catch(()=>{});void refresh().catch(()=>{});}},1000);
