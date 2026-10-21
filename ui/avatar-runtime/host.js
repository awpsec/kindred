// Kindred scheduling/identity adapter for the recovered renderer. No engine-owned RAF.
import {createMotionEngine,createStateController,resolveBody,renderSvgTree,commitSvgTree,createAppearance,fillScale,animationStates} from './grok-avatar-engine.mjs';
import {appearance,paint} from './catalog.js';
const instances=new Set();
let frame=0,lastFrame=0,nextId=0,observer=null,mutations=null,themeObserver=null;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion=()=>preference.matches||document.documentElement.dataset.motion==='off';
const hash=s=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,1);
function cancel(){cancelAnimationFrame(frame);frame=0;lastFrame=0;}
function wake(){if(!frame&&!document.hidden&&[...instances].some(i=>i.active()))frame=requestAnimationFrame(tick);}
function tick(now){frame=0;if(document.hidden)return;const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/30;if(lastFrame&&now-lastFrame<1000/30-1){wake();return;}lastFrame=now;for(const i of instances){if(!i.box.isConnected){i.detach();continue;}if(i.active())i.step(dt);}wake();}
function refresh(){cancel();for(const i of instances)i.refresh();wake();}
function connectGlobals(){if(observer)return;
 observer=new IntersectionObserver(entries=>{for(const {target,isIntersecting} of entries){const i=target._avatarHost;if(i){i.visible=isIntersecting;target.toggleAttribute('data-motion-offscreen',!isIntersecting);i.refresh();}}cancel();wake();});
 mutations=new MutationObserver(()=>{for(const i of instances)if(!i.box.isConnected)i.detach();});mutations.observe(document.documentElement,{childList:true,subtree:true});
 themeObserver=new MutationObserver(refresh);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-motion']});
 preference.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);
}
function disconnectGlobals(){if(instances.size)return;cancel();observer?.disconnect();mutations?.disconnect();themeObserver?.disconnect();observer=mutations=themeObserver=null;preference.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);}
export function mountArtwork(box,profile,size=44){
 let p=profile,a=appearance(p),state='idle',dead=false,connected=false,dirty=true,still=false,settled=false;
 const canvas=document.createElement('span');canvas.className='avatar-canvas';Object.assign(canvas.style,{position:'absolute',left:'50%',top:'50%',width:(fillScale(.6)*100)+'%',height:(fillScale(.6)*100)+'%',transform:'translate(-50%,-50%)',pointerEvents:'none'});box.append(canvas);
 const id='kindred-art-'+(++nextId),seed=hash(p.bot_id||p.id||p.seed||JSON.stringify([a.body,a.expression,p.name||'']));
 const engine=createMotionEngine({body:resolveBody(a.body)}),controller=createStateController(engine,state,{seed,isCompact:size<48});
 let renderPaint,renderAppearance,idleTime=0;
 function hold(){engine.holdFace(animationStates[controller.state]?.face||(a.expression==='neutral'?null:a.expression));}
 function draw(){const ink=paint(a,document.documentElement.dataset.theme==='dark');if(ink!==renderPaint){renderPaint=ink;renderAppearance=createAppearance(ink);}commitSvgTree(canvas,renderSvgTree(engine.frame(),renderAppearance,size*fillScale(.6),id,{displaySize:size,extent:'100%'}));dirty=false;}
 function isStill(){return reducedMotion()||p.animated===false;}
 function staticPose(){engine.pause();engine.seek(0);for(let j=0;j<60;j++)engine.advance(.1);settled=true;draw();}
 const i={box,visible:false,
  active(){return connected&&!dead&&box.isConnected&&i.visible&&!document.hidden&&!isStill()&&!settled;},
  step(dt){const before=controller.state;controller.advance(dt);if(before!==controller.state){idleTime=0;hold();}if(controller.state==='idle'){idleTime+=dt;if(idleTime>=1.4)controller.setResting(true);}else idleTime=0;engine.advance(dt);draw();settled=engine.isSettled;},
  refresh(){if(dead||!connected)return;if(paint(a,document.documentElement.dataset.theme==='dark')!==renderPaint)dirty=true;const next=isStill();if(next!==still){still=next;if(still){hold();staticPose();}else {controller.setResting(true);controller.setResting(false);hold();settled=false;}}
   if(!document.hidden&&i.visible&&dirty){if(still)staticPose();else draw();}if(![...instances].some(v=>v.active()))cancel();else wake();},
  detach(){if(!connected)return;connected=false;instances.delete(i);observer?.unobserve(box);disconnectGlobals();},
  attach(){if(dead||connected||!box.isConnected)return;connected=true;connectGlobals();instances.add(i);observer.observe(box);i.refresh();},
 };
 box._avatarHost=i;hold();still=isStill();if(still)staticPose();else draw();
 Object.assign(box.style,{width:size+'px',height:size+'px'});
 const api={
  connect:i.attach,
  update(next,nextSize=size){if(dead)return;const nextA=appearance(next),changed=JSON.stringify(nextA)!==JSON.stringify(a);p=next;if(changed){const old=a;a=nextA;if(a.body!==old.body)engine.setBody(resolveBody(a.body),{isInstant:isStill()});hold();dirty=true;settled=false;}if(size!==nextSize){size=nextSize;controller.setCompact(size<48);box.style.width=size+'px';box.style.height=size+'px';dirty=true;}i.attach();i.refresh();},
  setState(next,eventKey=''){if(dead||(next===state&&!eventKey)||!animationStates[next])return;if(next===state&&eventKey)controller.setState('idle');state=next;idleTime=0;controller.setResting(false);controller.setState(next);hold();dirty=true;settled=false;box.dataset.avatarState=next;i.attach();i.refresh();},
  poke(kind,opts){if(dead||isStill()||document.hidden||!i.visible)return;engine.poke(kind,opts);settled=false;wake();},
  destroy(){if(dead)return;dead=true;i.detach();delete box._avatarHost;canvas.remove();},
  get state(){return controller.state;},get profile(){return p;},
 };
 queueMicrotask(i.attach);return api;
}
