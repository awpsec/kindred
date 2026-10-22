// Kindred scheduling/identity adapter for the recovered renderer. No engine-owned RAF.
import {createMotionEngine,createStateController,resolveBody,renderSvgTree,commitSvgTree,createAppearance,fillScale,animationStates} from './grok-avatar-engine.mjs';
import {appearance,paint} from './catalog.js';
const instances=new Set();
// Leave room for authored motion without shrinking the body to 60% of its slot.
const artworkFill=.8, frameInterval=1000/60;
let frame=0,lastFrame=0,nextFrame=0,nextId=0,observer=null,mutations=null,themeObserver=null;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion=()=>preference.matches||document.documentElement.dataset.motion==='off';
const hash=s=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,1);
function cancel(){cancelAnimationFrame(frame);frame=0;lastFrame=0;nextFrame=0;}
function wake(){if(!frame&&!document.hidden&&[...instances].some(i=>i.active()))frame=requestAnimationFrame(tick);}
function tick(now){
 frame=0;if(document.hidden)return;
 if(lastFrame&&now<nextFrame-.5){wake();return;}
 const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/60;
 // Carry the deadline across refreshes: resetting it to now would turn a
 // 60 Hz cap into only 48 rendered frames/second on a 144 Hz display.
 nextFrame=nextFrame?nextFrame+Math.max(1,Math.floor((now-nextFrame)/frameInterval)+1)*frameInterval:now+frameInterval;
 lastFrame=now;
 for(const i of instances){if(!i.box.isConnected){i.detach();continue;}if(i.active())i.step(dt);}wake();
}
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
 const canvas=document.createElement('span');canvas.className='avatar-canvas';Object.assign(canvas.style,{position:'absolute',left:'50%',top:'50%',width:(fillScale(artworkFill)*100)+'%',height:(fillScale(artworkFill)*100)+'%',transform:'translate(-50%,-50%)',pointerEvents:'none'});box.append(canvas);
 const id='kindred-art-'+(++nextId),seed=hash(p.bot_id||p.id||p.seed||JSON.stringify([a.body,p.name||'']));
 const engine=createMotionEngine({body:resolveBody(a.body)}),controller=createStateController(engine,state,{seed,isCompact:size<48});
 let renderPaint,renderAppearance,idleTime=0,orbitScale=1,gazeHeld=false;
 // Faces follow activity. Ignore saved picker expressions from older clients.
 // A seek/rest can hold a morph at t=0; release it through the authored face API.
 // Compact named icons carry identity; full work indicators retain authored morphs.
 function syncMorph(){engine.setMorph(size<48?null:animationStates[controller.state]?.morph||null,{isInstant:isStill()});}
 function hold(release=false){const face=animationStates[controller.state]?.face||null;engine.holdFace(face);if(release)engine.setExpression(face||'neutral');}
 // Retain the scalar separately: the engine can replace its outgoing kind
 // during a rapid reversal. Following that weight directly would jump in size.
 function orbitTarget(snapshot){const morph=snapshot.morph;const weight=morph&&size>=48?Math.max(0,Math.min(1,morph.amount*((morph.kind==='orbit'?morph.swap:0)+(morph.outgoing==='orbit'?1-morph.swap:0)))):0;return 1+.75*weight;}
 function draw(snapshot=engine.frame()){
  const ink=paint(a,document.documentElement.dataset.theme==='dark');if(ink!==renderPaint){renderPaint=ink;renderAppearance=createAppearance(ink);}
  const transform=`translate(-50%,-50%) scale(${orbitScale.toFixed(4)})`;
  if(canvas.style.transform!==transform)canvas.style.transform=transform;
  commitSvgTree(canvas,renderSvgTree(snapshot,renderAppearance,size*fillScale(artworkFill),id,{displaySize:size,extent:'100%'}));dirty=false;
 }
 function releaseGaze(){if(!gazeHeld)return;gazeHeld=false;engine.setGaze(null);engine.setGazeAlways(false);settled=false;}
 function isStill(){return reducedMotion()||p.animated===false||controller.state==='sleeping';}
 function staticPose(){releaseGaze();engine.pause();engine.seek(0);hold(true);for(let j=0;j<60;j++)engine.advance(.1);const snapshot=engine.frame();orbitScale=orbitTarget(snapshot);settled=true;draw(snapshot);}
 const i={box,visible:false,
  active(){return connected&&!dead&&box.isConnected&&i.visible&&!document.hidden&&!isStill()&&!settled;},
  step(dt){const before=controller.state;controller.advance(dt);if(before!==controller.state){idleTime=0;syncMorph();hold();}if(controller.state==='idle'){idleTime+=dt;if(idleTime>=1.4)controller.setResting(true);}else idleTime=0;const playing=engine.isPlaying;engine.advance(dt);if(playing&&!engine.isPlaying)hold(true);const snapshot=engine.frame(),target=orbitTarget(snapshot);orbitScale+=(target-orbitScale)*(1-Math.exp(-dt/.1));if(Math.abs(orbitScale-target)<.0001)orbitScale=target;draw(snapshot);settled=engine.isSettled&&orbitScale===target;},
  refresh(){if(dead||!connected)return;if(document.hidden||!i.visible)releaseGaze();if(paint(a,document.documentElement.dataset.theme==='dark')!==renderPaint)dirty=true;const next=isStill();if(next!==still){still=next;if(still){hold();staticPose();}else {controller.setResting(true);controller.setResting(false);hold();settled=false;}}
   if(!document.hidden&&i.visible&&dirty){if(still)staticPose();else draw();}if(![...instances].some(v=>v.active()))cancel();else wake();},
  detach(){if(!connected)return;releaseGaze();connected=false;instances.delete(i);observer?.unobserve(box);disconnectGlobals();},
  attach(){if(dead||connected||!box.isConnected)return;connected=true;connectGlobals();instances.add(i);observer.observe(box);i.refresh();},
 };
 box._avatarHost=i;hold();still=isStill();if(still)staticPose();else draw();
 Object.assign(box.style,{width:size+'px',height:size+'px'});
 const api={
  connect:i.attach,
  update(next,nextSize=size){if(dead)return;const nextA=appearance(next),changed=JSON.stringify(nextA)!==JSON.stringify(a);p=next;if(changed){const old=a;a=nextA;if(a.body!==old.body)engine.setBody(resolveBody(a.body),{isInstant:isStill()});hold();dirty=true;settled=false;}if(size!==nextSize){size=nextSize;if(size<48)orbitScale=1;controller.setCompact(size<48);syncMorph();settled=false;box.style.width=size+'px';box.style.height=size+'px';dirty=true;}i.attach();i.refresh();},
  setState(next,eventKey=''){if(dead||(next===state&&!eventKey)||!animationStates[next])return;if(next===state&&eventKey)controller.setState('idle');state=next;idleTime=0;controller.setResting(false);controller.setState(next);syncMorph();hold();dirty=true;settled=false;box.dataset.avatarState=next;i.attach();i.refresh();},
  lookAt(point){if(dead)return;const allowed=point&&!isStill()&&!document.hidden&&i.visible;if(allowed){gazeHeld=true;engine.setGazeAlways(true);engine.setGaze(point);settled=false;}else releaseGaze();i.refresh();},
  poke(kind,opts){if(dead||isStill()||document.hidden||!i.visible)return;engine.poke(kind,opts);settled=false;wake();},
  destroy(){if(dead)return;dead=true;i.detach();delete box._avatarHost;canvas.remove();},
  get state(){return controller.state;},get profile(){return p;},
 };
 queueMicrotask(i.attach);return api;
}
