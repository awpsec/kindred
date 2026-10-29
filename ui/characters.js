// Supplied Grok Bot artwork/runtime; see avatar-runtime/PROVENANCE.json and THIRD-PARTY-NOTICES.md.
import {avatarCatalog,pickerBodies,expressions,palettes,appearance,selectAppearance} from './avatar-runtime/catalog.js';
import {mountArtwork,reducedMotion} from './avatar-runtime/host.js';
import {tributeIdentity,tributeState,createTribute,applyTributeState,startTributeReveal,renderTribute} from './tributes.js';
export {appearance as avatarAppearance,selectAppearance,expressions,palettes};
export const shapes=pickerBodies;
export const colors=palettes.map(p=>[p.label,p.value,p.id]);
export const defaultProfile={label:'',description:'',shape:'round',color:'#2475ff',eyes:'curious',animated:true,pinned:false,archived:false,notifications:true};
export function newAvatarProfile(seed='') {const n=[...seed].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0);return selectAppearance({...defaultProfile},{body:seed?avatarCatalog.defaults[n%avatarCatalog.defaults.length]:'blob',expression:'neutral',palette:'blue',custom_color:null});}
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
const seenTerminals=new Map();
const actions={think:'thinking',investigate:'searching',read:'reading',write:'writing',stream:'streaming',terminal:'running',hammer:'working',saw:'working',drill:'working',wrench:'working',clock:'working',mail:'sending',working:'working',rest:'sleeping',worry:'confused',sleep:'idle',coffin:'powering-down',success:'finished'};
export function activityState(activity,now=Date.now()/1000,lastActive=0){
 const a=activity||{},busy=['queued','running','awaiting_user','awaiting_approval','cancelling'].includes(a.status);
 const timestamp=Math.max(+a.last_active_at||0,+a.completed_at||0,+a.finished_at||0,lastActive||0),online=busy||(timestamp>0&&now-timestamp<1800);
 let action='idle';
 if(['awaiting_user','awaiting_approval'].includes(a.status)||(a.status==='running'&&(a.local?.phase==='awaiting_approval'||['user','approval'].includes(a.awaiting))))action='blocked';
 else if(a.stale||a.offline||a.reconnecting)action='idle';
 else if(a.status==='cancelling')action='powering-down';
 else if(a.status==='running')action=a.shape==='think'&&a.model_progress_state==='writing'?'streaming':actions[a.shape]||(['waiting','blocked'].includes(a.shape)?a.shape:'working');
 else if(a.status==='queued')action='idle';
 else if(a.commands>0)action='waiting';
 else if(a.run_id&&now-timestamp>=0&&now-timestamp<8&&['completed','failed','interrupted'].includes(a.status))action=a.status==='completed'?'finished':'failed';
 else if(a.status==='cancelled')action='idle';
 else action=online?'idle':'sleeping';
 return {action,label:a.label||(online?'Ready when you are':'Resting'),online,runId:a.run_id,settledAt:timestamp*1000};
}
const tributes=new Set();let tributeFrame=0,tributeObserver=null,tributeRemoval=null,tributeMotion=null;
const tributePreference=matchMedia('(prefers-reduced-motion: reduce)');
function releaseTribute(box){tributes.delete(box);tributeObserver?.unobserve(box);if(!tributes.size){cancelAnimationFrame(tributeFrame);tributeFrame=0;tributeObserver?.disconnect();tributeRemoval?.disconnect();tributeMotion?.disconnect();tributeObserver=tributeRemoval=tributeMotion=null;document.removeEventListener('visibilitychange',refreshTributes);tributePreference.removeEventListener('change',refreshTributes);}}
function tributeTick(){tributeFrame=0;for(const box of tributes){if(!box.isConnected||!box._character?.tribute){releaseTribute(box);continue;}if(box._tributeVisible&&!document.hidden)renderTribute(box,Date.now(),reducedMotion());}queueTributes();}
function queueTributes(){if(!tributeFrame&&!document.hidden&&!reducedMotion()&&[...tributes].some(b=>b._tributeVisible&&b._character?.p.animated!==false))tributeFrame=requestAnimationFrame(tributeTick);}
function refreshTributes(){cancelAnimationFrame(tributeFrame);tributeFrame=0;for(const box of tributes){if(!box.isConnected||!box._character?.tribute){releaseTribute(box);continue;}if(box._tributeVisible&&!document.hidden)renderTribute(box,Date.now(),reducedMotion());}queueTributes();}
function startTribute(box){if(!box.isConnected)return;if(!tributeObserver){tributeObserver=new IntersectionObserver(es=>{for(const e of es)e.target._tributeVisible=e.isIntersecting;refreshTributes();});tributeRemoval=new MutationObserver(()=>{for(const b of tributes)if(!b.isConnected||!b._character?.tribute)releaseTribute(b);});tributeRemoval.observe(document.documentElement,{childList:true,subtree:true});tributeMotion=new MutationObserver(refreshTributes);tributeMotion.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});document.addEventListener('visibilitychange',refreshTributes);tributePreference.addEventListener('change',refreshTributes);}if(!tributes.has(box)){tributes.add(box);tributeObserver.observe(box);}queueTributes();}

export function character(profile={},size=44,busy=false){
 const p={...defaultProfile,...profile},box=document.createElement('span');box.className='character artwork-character';box.setAttribute('aria-hidden','true');box.style.display='inline-block';box.style.position='relative';box.style.width=size+'px';box.style.height=size+'px';box.dataset.shape=p.avatar?.body||p.shape;
 if(p.bot_id)box.dataset.botId=p.bot_id;
 box.style.setProperty('--bot-fill',p.color);const tribute=tributeIdentity(p);
 if(tribute){box.classList.add('animated');createTribute(box,p,tribute,busy);renderTribute(box,Date.now(),reducedMotion());queueMicrotask(()=>startTribute(box));return box;}
 box._character={p,action:'idle'};box._artwork=mountArtwork(box,p,size);box.dataset.action='idle';if(busy)setActivity(box,'working');return box;
}
export function updateCharacter(box,p,size){if(!box)return character(p,size);if(box._artwork&&!tributeIdentity(p)){box._character.p={...defaultProfile,...p};box.dataset.shape=appearance(p).body;box._artwork.update(box._character.p,size);return box;}if(JSON.stringify(box._character?.p)===JSON.stringify({...defaultProfile,...p}))return box;box._artwork?.destroy();return character(p,size);}

export function replaceCharacter(container,profile,size){const old=container.querySelector(':scope > .character');if(old?._artwork&&!tributeIdentity(profile)){updateCharacter(old,profile,size);return old;}if(old&&JSON.stringify(old._character?.p)===JSON.stringify({...defaultProfile,...profile}))return old;old?._artwork?.destroy();const next=character(profile,size);container.replaceChildren(next);if(next.dataset.tribute&&old?.dataset.tribute!==next.dataset.tribute)revealCharacter(next);return next;}
export function setActivity(box,action='idle',options={}){
 const c=box?._character;if(!c)return;
 if(c.tribute){const next=tributeState(action);if(c.action!==next)applyTributeState(box,next);renderTribute(box,Date.now(),reducedMotion());startTribute(box);return;}
 let next=actions[action]||action,eventKey='';
 if(next==='finished'||next==='failed'){
   eventKey=options.runId?box.dataset.botId+'|'+options.runId:'';
   if((eventKey&&seenTerminals.has(eventKey)&&(c.terminal!==eventKey||c.action!==next))||options.immediate||document.hidden||(options.settledAt&&Date.now()-options.settledAt>=8000))next='idle';
   if(eventKey){seenTerminals.set(eventKey,Date.now());if(seenTerminals.size>2048)seenTerminals.delete(seenTerminals.keys().next().value);}
 }
 const newEvent=eventKey&&c.terminal!==eventKey;
 if(c.action===next&&!newEvent)return;c.action=next;if(eventKey)c.terminal=eventKey;box.dataset.action=next;box._artwork.setState(next,newEvent?eventKey:'');
}
// Only explicitly bound surfaces react to the pointer. No global mouse listener.
export function followCharacterPointer(surface,findCharacter){
 if(surface._characterPointerBound)return;surface._characterPointerBound=true;
 let previous=null;
 const reset=()=>{previous?._artwork?.lookAt(null);previous=null;};
 surface.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'){reset();return;}
  const box=findCharacter();if(previous!==box){reset();previous=box;}
  if(!box?._artwork)return;
  // Match the authored renderer: full gaze at two avatar widths from center.
  const rect=box.getBoundingClientRect(),reach=Math.max(1,rect.width)*2;
  if(!rect.width||!rect.height){reset();return;}
  box._artwork.lookAt([Math.max(-1,Math.min(1,(event.clientX-rect.left-rect.width/2)/reach)),Math.max(-1,Math.min(1,(rect.top+rect.height/2-event.clientY)/reach))]);
 },{passive:true});
 for(const type of ['pointerleave','pointercancel','close'])surface.addEventListener(type,reset);
}
export function syncCharacter(box){if(box?._artwork)box._artwork.connect();else if(box?._character?.tribute)startTribute(box);}
export function renderCharacterMotion(box,now=Date.now()){if(box?._character?.tribute)renderTribute(box,now,reducedMotion());else syncCharacter(box);}
export function revealCharacter(box,startedAt=Date.now()){if(box?._character?.tribute){startTributeReveal(box,startedAt,reducedMotion());startTribute(box);}}
export function arriveCharacter(box,startedAt=Date.now()){if(box?._character?.arrived)return;if(!box?._character)return;box._character.arrived=true;if(box._character.tribute){revealCharacter(box,startedAt);return;}if(!reducedMotion()&&box._character.p.animated!==false&&Date.now()-startedAt<1150)box.animate([{opacity:0},{opacity:1}],{duration:350,easing:'ease-out'});}
export function departCharacter(box){if(box?._character?.tribute){setActivity(box,'idle');return;}setActivity(box,'powering-down');if(box&&!reducedMotion()&&box._character?.p.animated!==false)box.animate([{opacity:1},{opacity:0}],{duration:600,delay:500,fill:'forwards'});}
export function idleCompanion(box){setActivity(box,'idle');}
const iconPaths = {
  image: "M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M16 7h.01",
  minus: "M5 12h14",
  calendar: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z",
  list: "M4 6h.01M4 12h.01M4 18h.01M9 6h12M9 12h12M9 18h12",
  reply: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
  smile: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 14q4 5 8 0",
  download: "M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5",
  network: "M4 7h5l4 5h7M4 17h5l4-5M17 9l3 3-3 3",
  marketplace: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 13v9M13 17.5h9",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  settings:
    "m9 3-.5 3-2 1.2L4 6l-2 3.5 2.5 1.8v2.4L2 15.5 4 19l2.5-1.2 2 1.2.5 3h6l.5-3 2-1.2L20 19l2-3.5-2.5-1.8v-2.4L22 9.5 20 6l-2.5 1.2-2-1.2L15 3H9ZM15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  computer: "M3 4h18v13H3zM8 21h8M12 17v4",
  bot: "M3 4h18v13H3zM8 21h8M12 17v4M8 9h1M15 9h1M9 13h6",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  chevronUp: "m5 15 7-7 7 7",
  chevronDown: "m5 9 7 7 7-7",
  "chevrons-right": "m5 5 7 7-7 7m7-14 7 7-7 7",
  back: "m15 5-7 7 7 7",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 3",
  send: "M12 20V4m-7 7 7-7 7 7",
  voice: "M4 9v6m4-10v14m4-16v18m4-16v14m4-10v6",
  phone: "M5 3h4l2 5-3 2c2 3 3 4 6 6l2-3 5 2v4c0 2-2 3-4 2C8 18 3 13 3 6c0-2 0-3 2-3",
  "phone-off": "M3 13c5-5 13-5 18 0v5h-5v-4c-3-1-5-1-8 0v4H3z",
  mic: "M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V4M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8",
  "mic-off": "M2 2l20 20M9 9v2a3 3 0 0 0 5 2M9 4a3 3 0 0 1 6 0v5M5 10v1a7 7 0 0 0 12 5M19 10v1c0 .6-.1 1.2-.2 1.7M12 18v4M8 22h8",
  stop: "M6 6h12v12H6z",
  external: "M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7",
  dock: "M3 4h18v16H3zM15 4v16M6 12h6m-3-3 3 3-3 3",
  link: "M10 14l4-4M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2",
  paste: "M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3M9 3h6v4H9zM8 12h8M8 16h6",
  copy: "M9 9h12v12H9zM5 15H3V3h12v2",
  check: "m5 12 4 4L19 6",
  edit: "m15 4 5 5M3 21l5-1L21 7l-5-5L3 15v6",
  pin: "M9 3h6M10 3v6l-4 5v2h12v-2l-4-5V3M12 16v6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4ZM12 6v16",
  arrow: "M7 17 17 7M7 7h10v10",
  refresh: "M20 8a8 8 0 1 0 1 7M20 3v5h-5",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  restore: "M3 10a9 9 0 1 1 2.6 8M3 4v6h6",
  archive: "M3 3h18v5H3V3ZM5 8v13h14V8M9 12h6",
  trash: "M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3",
  pause: "M8 5v14M16 5v14",
  "bell-off": "M3 3l18 18 M10 21h4 M6 6a6 6 0 0 0 0 2c0 7-3 7-3 9h14 M18 13c-.5-1.2 0-3 0-5a6 6 0 0 0-9-5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  play: "m7 4 14 8-14 8V4",
  key: "M10 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0M10 10h12M18 10v4M21 10v3",
  folder: "M2 5h8l2 3h10v13H2V5",
  paperclip: "m8 14 8-8a3 3 0 0 1 4 4L9 21a5 5 0 0 1-7-7L14 2",
  pointer: "m5 3 14 9-7 1-3 7-4-17Z",
  record: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10",
};
export function icon(name, size = 18) {
  const svg = el("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.classList.add("icon");
  if(name==='more')for(const cx of [5,12,19])svg.append(el('circle',{cx,cy:12,r:1.3,fill:'currentColor',stroke:'none'}));
  else svg.append(el("path", { d: iconPaths[name] || iconPaths.more }));
  return svg;
}
