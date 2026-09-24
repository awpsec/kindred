import {avatarData} from './avatar-data.js';

// Oliver and Vivienne keep their own identities through every task state.
// Original, owner-reviewed vector artwork lives beside the ordinary avatars.
const NS='http://www.w3.org/2000/svg';
const node=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
export function tributeIdentity(profile={}) {
  const name=String(profile.name||'').trim().toLowerCase();
  const raw=String(profile.color||'').toLowerCase(),color=avatarData.vivid[raw]||raw;
  return Object.entries(avatarData.tributes).find(([,a])=>a.name.toLowerCase()===name&&a.shape===profile.shape&&a.color===color)?.[0]||'';
}
export function tributeState(action) {
  if(action==='rest'||action==='sleep')return 'rest';
  if(['idle','success','worry','waiting','queued'].includes(action))return 'idle';
  return 'working';
}
export function createTribute(box,p,kind,busy) {
  const svg=node('svg',{viewBox:'0 0 128 128',focusable:'false','shape-rendering':'geometricPrecision'});
  const reveal=node('g'),art=node('g',{'data-tribute-art':''}),original=node('g',{display:'none','data-tribute-original':''});
  // Static bundled artwork only: names and other profile text never become SVG.
  art.innerHTML=avatarData.tributes[kind].art;
  const ordinary=node('svg',{viewBox:'0 0 100 110',width:128,height:128});
  ordinary.append(node('path',{d:avatarData.paths[p.shape],fill:avatarData.tributes[kind].color}));
  const face=avatarData.faces[p.shape];
  for(const cx of [face.x-face.spread,face.x+face.spread])ordinary.append(node('ellipse',{cx,cy:face.y,rx:3.7,ry:7.1,fill:'#171b1d'}));
  original.append(ordinary);reveal.append(original,art);svg.append(reveal);box.append(svg);
  box.dataset.tribute=kind;
  if(p.animated===false)box.classList.remove('animated');
  const find=selector=>art.querySelector(selector);
  box._character={p,tribute:kind,action:busy?'working':'idle',workStartedAt:Date.now(),loopStartedAt:Date.now(),gazeSeed:Math.random()*900,frame:0,
    reveal,art,original,head:find('.head'),tongue:find('.tongue'),earL:find('.ear-l'),earR:find('.ear-r'),
    awake:find('.tribute-awake-eyes'),restEyes:find('.tribute-rest-eyes'),pant:find('.tribute-pant'),closedMouth:find('.tribute-closed-mouth'),
    tree:find('.tree'),leftLeaves:find('.left-leaves'),topLeaves:find('.top-leaves'),rightLeaves:find('.right-leaves')};
  applyTributeState(box,box._character.action);
}
function show(n,visible){if(n)n.setAttribute('display',visible?'inline':'none');}
export function applyTributeState(box,action) {
  const c=box._character,state=tributeState(action);
  c.action=state;box.dataset.action=state;box.classList.toggle('working',state==='working');
  show(c.awake,state!=='rest');show(c.restEyes,state==='rest');show(c.pant,state==='working');show(c.closedMouth,state!=='working');
}
export function startTributeReveal(box,startedAt,reduced) {
  const c=box._character;
  if(c.revealed||reduced||c.p.animated===false||Date.now()-startedAt>=600)return;
  c.revealed=true;c.revealAt=startedAt;box.dataset.revealing='true';
}
function keys(phase,frames) {
  for(let i=1;i<frames.length;i++)if(phase<=frames[i][0]){
    const [a,x]=frames[i-1],[b,y]=frames[i];return x+(y-x)*smooth((phase-a)/(b-a));
  }
  return frames.at(-1)[1];
}
export function renderTribute(box,now,reduced) {
  const c=box._character;
  reduced ||= c.p.animated===false || !box.classList.contains('animated');
  if(c.revealAt!=null){
    const t=reduced?1:Math.max(0,Math.min(1,(now-c.revealAt)/600));
    const scale=t<.4?1-.9*smooth(t/.4):t<.85?.1+.94*smooth((t-.4)/.45):1+.04*(1-smooth((t-.85)/.15));
    show(c.original,t<.4);show(c.art,t>=.4);
    c.reveal.setAttribute('transform',`translate(64 70) scale(${scale}) translate(-64 -70)`);
    if(t===1){c.revealAt=null;c.reveal.removeAttribute('transform');delete box.dataset.revealing;}
  }
  const seed=box.dataset.botId?[...box.dataset.botId].reduce((n,v)=>(n*31+v.charCodeAt(0))%1009,0):c.gazeSeed;
  const time=reduced?0:now/1000+seed;
  if(c.tribute==='oliver'){
    const pant=reduced?0:(1-Math.cos(time*Math.PI*2))/2;
    const rest=c.action==='rest',working=c.action==='working';
    const y=reduced?0:working?.7-1.4*pant:rest?(1+Math.cos(time*Math.PI/2))/2:.35*Math.sin(time*Math.PI/3);
    c.head.setAttribute('transform',`translate(0 ${y}) rotate(${rest?-4:0} 64 80)`);
    c.tongue.setAttribute('transform',`translate(0 ${working?1.5*pant:0})`);
    c.earL.setAttribute('transform',`rotate(${working&&!reduced?-1+2*pant:0} 38 35)`);
    c.earR.setAttribute('transform',`rotate(${working&&!reduced?1-2*pant:0} 90 35)`);
    const blink=time%6.3,opening=reduced||rest?1:blink<.12?1-.9*smooth(blink/.12):blink<.24?.1+.9*smooth((blink-.12)/.12):1;
    c.awake.setAttribute('transform',`translate(64 52) scale(1 ${opening}) translate(-64 -52)`);
  } else {
    const phase=(time%4)/4,working=c.action==='working'&&!reduced,idle=c.action==='idle'&&!reduced;
    const rotation=working?keys(phase,[[0,0],[.12,-1.7],[.23,1.4],[.33,-.7],[.42,.3],[.5,0],[1,0]]):idle?.3*Math.sin(time*Math.PI/3):0;
    c.tree.setAttribute('transform',`rotate(${rotation} 62 96)`);
    for(const [leaf,x,y,frames] of [
      [c.leftLeaves,47,70,[[0,0],[.14,-2.5],[.25,2],[.36,-1],[.5,0],[1,0]]],
      [c.topLeaves,63,44,[[0,0],[.1,-2],[.23,2.5],[.36,-.8],[.52,0],[1,0]]],
      [c.rightLeaves,78,56,[[0,0],[.17,-2],[.29,2],[.4,-.6],[.55,0],[1,0]]],
    ])leaf.setAttribute('transform',`rotate(${working?keys(phase,frames):0} ${x} ${y})`);
  }
}
