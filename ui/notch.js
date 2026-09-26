import {character, setActivity} from './characters.js';

const root=document.documentElement,card=document.querySelector('#alert'),content=document.querySelector('#open'),announce=document.querySelector('#announce');
const invoke=(action,id)=>window.__TAURI__.core.invoke('notch_action',{action,id:id||null});
const SWELL=3;
let current=null,shape=null,fade=null,veil=null,timer=null,closing=false,closingAction=null,arriving=false,revision=0,pending=false,again=false,pointer=false,focused=false;
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
// Reduce Motion (system or account) replaces morphs with short dissolves.
const motion=()=>!systemMotion.matches&&root.dataset.motion!=='off';
const engaged=()=>pointer||focused;
// WebKit may stop firing animation events in a background window; never wait forever.
const settle=(animation,limit)=>Promise.race([animation?.finished.catch(()=>{}),new Promise(r=>setTimeout(r,limit))]);
const idle=()=>[shape,fade,veil].every(a=>!a||a.playState==='finished');
function cancelMotion(){for(const a of [shape,fade,veil])a?.cancel();shape=fade=veil=null;arriving=false;}
// WAAPI has no spring easing. Sample a damped spring (response, damping ratio)
// into linear keyframes so arrival settles like AppKit/SwiftUI surfaces.
function spring(response,damping,steps=36){
  const w=2*Math.PI/response,decay=damping*w,wd=w*Math.sqrt(1-damping*damping);
  const duration=Math.log(400)/decay*1000;
  const at=t=>1-Math.exp(-decay*t)*(Math.cos(wd*t)+decay/wd*Math.sin(wd*t));
  return {duration,frames:Array.from({length:steps+1},(_,i)=>[i/steps,i===steps?1:at(i/steps*duration/1000)])};
}
// A fixed native window avoids compositor resize jumps. Morph only its black
// silhouette, keeping the camera clearance and the text's layout stationary.
function silhouette(progress,swell=0){
  const width=card.offsetWidth,top=parseFloat(root.style.getPropertyValue('--notch-top'))||32;
  const bridge=Math.min(parseFloat(root.style.getPropertyValue('--notch-bridge'))||176,width-16);
  const side=(width-bridge)/2+(8-(width-bridge)/2)*progress-swell;
  const height=top+32*progress+swell*.67,shoulder=Math.max(0,Math.min(8,side)),radius=Math.min(12+6*progress,height-shoulder),right=width-side;
  return `path("M ${side-shoulder} 0 Q ${side} 0 ${side} ${shoulder} L ${side} ${height-radius} Q ${side} ${height} ${side+radius} ${height} L ${right-radius} ${height} Q ${right} ${height} ${right} ${height-radius} L ${right} ${shoulder} Q ${right} 0 ${right+shoulder} 0 Z")`;
}
// Hover widens the shape slightly instead of magnifying text, keeping glyphs crisp.
const rest=()=>silhouette(1,pointer&&!closing?SWELL:0);
function settled(){card.style.clipPath=rest();card.style.opacity='';Object.assign(content.style,{opacity:'1',transform:'none',filter:'none'});}
function morph(frames,options){shape?.cancel();card.style.clipPath=frames.at(-1).clipPath;shape=card.animate(frames,options);shape.finished.catch(()=>{});return shape;}
function reshape(duration=220){
  const from=getComputedStyle(card).clipPath,to=rest();
  if(!motion()||!from.startsWith('path(')){shape?.cancel();shape=null;card.style.clipPath=to;return;}
  morph([{clipPath:from},{clipPath:to}],{duration,easing:'cubic-bezier(.3,.7,.2,1)'});
}
// Content drops out of / into the notch with a slight blur; dissolves only under Reduce Motion.
function text(visible,duration,delay=0){
  const still=!motion(),style=getComputedStyle(content),keys=still?['opacity']:['opacity','transform','filter'];
  const target=visible?{opacity:'1',transform:'none',filter:'none'}:{opacity:'0',transform:still?'none':'translateY(-3px) scale(.97)',filter:still?'none':'blur(3px)'};
  const from=Object.fromEntries(keys.map(k=>[k,style[k]])),to=Object.fromEntries(keys.map(k=>[k,target[k]]));
  fade?.cancel();fade=null;Object.assign(content.style,target);
  if(!duration)return Promise.resolve();
  fade=content.animate([from,to],{duration,delay,fill:'backwards',easing:visible?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,1,1)'});
  return settle(fade,duration+delay+80);
}
function dissolve(visible,duration){
  const from=getComputedStyle(card).opacity;veil?.cancel();card.style.opacity=visible?'':'0';
  veil=card.animate([{opacity:from},{opacity:visible?'1':'0'}],{duration,easing:'ease-out'});
  return settle(veil,duration+80);
}
function hide(){
  card.hidden=true;cancelMotion();card.style.opacity='';announce.textContent='';
  // A hidden window receives no pointerleave; the next alert must start unheld.
  pointer=focused=false;card.classList.remove('hovered');
}
async function close(action='dismiss',deliberate=false){
  if(!current||closing||(action==='dismiss'&&!deliberate&&engaged()))return;
  closing=true;closingAction=action;arriving=false;const id=current.id,ticket=++revision;clearTimeout(timer);
  // With another alert queued, hand the open shape to it instead of collapsing.
  const handoff=action==='dismiss'&&current.queued>0;
  if(handoff)await text(false,motion()?140:120);
  else if(motion()){
    const from=getComputedStyle(card).clipPath;void text(false,130);
    await settle(morph([{clipPath:from},{clipPath:silhouette(0)}],{duration:300,easing:'cubic-bezier(.45,0,.2,1)'}),380);
  }else await dissolve(false,140);
  if(ticket!==revision)return;
  if(!handoff)hide();
  current=null;closing=false;
  await invoke(action,id);await refresh();
}
function arm(){clearTimeout(timer);if(current&&!closing&&!engaged())timer=setTimeout(()=>void close().catch(()=>{}),3000);}
function populate(next){
  const name=next.avatar?.name||next.title;
  document.querySelector('#title').textContent=name;
  document.querySelector('#message').textContent='sent you a message.';
  card.setAttribute('aria-label',`${name} sent you a message. Open Kindred`);
  const avatar=character({...next.avatar,name},20);document.querySelector('#avatar').replaceChildren(avatar);
  setActivity(avatar,'idle');
  return name;
}
async function refresh(){
  if(pending){again=true;return;}pending=true;
  try{
    const next=await invoke('state');
    if(!next){++revision;current=null;closing=false;clearTimeout(timer);hide();return;}
    root.style.setProperty('--notch-top',next.layout.top+'px');root.dataset.notched=String(next.layout.notched);
    root.style.setProperty('--notch-bridge',(next.layout.bridge_width||176)+'px');
    if(current?.id===next.id){current.queued=next.queued|0;if(!closing&&idle())settled();return;}
    const replacing=!card.hidden,ticket=++revision;
    closing=false;clearTimeout(timer);current=next;
    root.dataset.motion=next.reduced_motion?'off':'on';
    if(replacing){
      // Cross-fade into the new alert inside the already open shape.
      if(getComputedStyle(content).opacity!=='0')await text(false,motion()?120:100);
      if(ticket!==revision)return;
    }else{
      cancelMotion();card.hidden=false;
      if(motion()){card.style.clipPath=silhouette(0);Object.assign(content.style,{opacity:'0',transform:'translateY(-4px) scale(.97)',filter:'blur(4px)'});}
      else{settled();card.style.opacity='0';}
    }
    const name=populate(next);
    // Populate before revealing the native window, then animate from its top edge.
    await invoke('present',next.id);
    if(current?.id!==next.id||ticket!==revision)return;
    announce.textContent=`${name} sent you a message.`;
    if(replacing){
      if(motion()){const from=getComputedStyle(card).clipPath,base=pointer?SWELL:0;morph([{clipPath:from},{clipPath:silhouette(1,base+2.5),offset:.4},{clipPath:rest()}],{duration:380,easing:'ease-in-out'});}
      else reshape();
      if(getComputedStyle(card).opacity!=='1')void dissolve(true,140);
      void text(true,motion()?240:140,motion()?60:0);
    }else if(motion()){
      arriving=true;const s=spring(.46,.8);
      const a=morph(s.frames.map(([offset,p])=>({offset,clipPath:silhouette(p)})),{duration:s.duration});
      void text(true,260,90);
      a.finished.then(()=>{if(ticket===revision&&arriving){arriving=false;if(pointer)reshape();}},()=>{});
    }else void dissolve(true,160);
    arm();
  }finally{pending=false;if(again){again=false;void refresh().catch(()=>{});}}
}
// Pointer hover or keyboard focus holds the alert and renews the native lease.
function engage(){
  card.classList.toggle('hovered',pointer);
  if(!current)return;
  if(engaged()){
    clearTimeout(timer);
    if(closing&&closingAction==='dismiss'){++revision;closing=false;void text(true,160);if(!motion())void dissolve(true,120);}
    void invoke('hold',current.id).catch(()=>{});
  }else{void invoke('release',current.id).catch(()=>{});arm();}
  if(!closing&&!arriving)reshape();
}
card.addEventListener('pointerenter',()=>{pointer=true;engage();});
card.addEventListener('pointerleave',()=>{pointer=false;engage();});
card.addEventListener('focus',()=>{focused=card.matches(':focus-visible');if(focused)engage();});
card.addEventListener('blur',()=>{if(focused){focused=false;engage();}});
card.onclick=()=>void close('open').catch(()=>{});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||!current)return;
  e.preventDefault();pointer=focused=false;card.classList.remove('hovered');
  void close('dismiss',true).catch(()=>{});
});
systemMotion.addEventListener('change',()=>{if(!motion()){cancelMotion();if(current&&!closing)settled();}});
await window.__TAURI__.event.listen('kindred-notch-changed',()=>void refresh().catch(()=>{}));
await refresh();
// Refresh screen geometry after docking, moving Kindred or removing a display.
// Native expiry still dismisses the surface if WebKit timers stop responding.
setInterval(()=>{if(current||!card.hidden){if(current&&engaged()&&!closing)void invoke('hold',current.id).catch(()=>{});void refresh().catch(()=>{});}},1000);
