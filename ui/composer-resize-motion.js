// Reserve the natural height once; animate paint rather than relaying every
// animation frame through transcript padding and scroll restoration.
export function installComposerResizeMotion(form, editor, {allowed, chat}) {
  const surface=document.createElement('div');
  surface.className='composer-resize-surface';surface.setAttribute('aria-hidden','true');
  form.prepend(surface);form.classList.add('has-resize-surface');
  let previous=null,effects=[],generation=0,editorFrame=0,editorPose=null;
  const stop=()=>{
    generation++;cancelAnimationFrame(editorFrame);editorFrame=0;
    for(const effect of effects)effect.cancel();effects=[];editorPose=null;
    editor.style.removeProperty('top');editor.style.removeProperty('left');editor.style.removeProperty('clip-path');
  };
  const snapshot=()=>({height:form.offsetHeight,surfaceHeight:surface.offsetHeight,width:form.offsetWidth,chat:chat(),
    reply:form.classList.contains('is-replying'),editorTop:editor.offsetTop-(editorPose?.y||0),editorLeft:editor.offsetLeft-(editorPose?.x||0),editorHeight:editor.offsetHeight,editorWidth:editor.offsetWidth});
  new ResizeObserver(()=>{
    const next=snapshot(),old=previous;previous=next;
    if(!old||old.height===next.height&&old.width===next.width)return;
    const enabled=!document.documentElement.hasAttribute('data-mobile')&&allowed()&&!document.hidden
      &&editor.dataset.composing!=='true'&&!form.classList.contains('is-morphing')
      &&old.chat===next.chat&&old.width===next.width&&old.reply===next.reply&&next.surfaceHeight>0;
    const visible=effects.length?old.surfaceHeight*new DOMMatrixReadOnly(getComputedStyle(surface).transform).m22:old.surfaceHeight;
    const startEditor={
      x:old.editorLeft-next.editorLeft+(editorPose?.x||0),
      y:old.editorTop-old.height-next.editorTop+next.height+(editorPose?.y||0),
      width:editorPose?.width??old.editorWidth,height:editorPose?.height??old.editorHeight,
    };
    stop();
    if(!enabled||Math.abs(visible-next.surfaceHeight)<1)return;
    const options={duration:180,easing:'cubic-bezier(.22,1,.36,1)'};
    effects.push(surface.animate([{transform:`scaleY(${visible/next.surfaceHeight})`},{transform:'scaleY(1)'}],options));
    // The compact-to-multiline grid change moves the editor before paint.
    // Follow the surface clock with relative offsets on this small editor only.
    // Keep the live editor untransformed. Whole-pixel line boxes in CSS
    // stabilize its grid measurement; the draft is never scaled or cloned.
    // Reveal new lines only as the writing area opens around them.
    const current=generation,animation=effects[0],pixel=1/(window.devicePixelRatio||1);
    const trackEditor=()=>{
      if(generation!==current)return;
      const timing=animation.effect.getComputedTiming();
      const progress=animation.playState==='finished'||animation.currentTime>=timing.endTime?1:timing.progress??0;
      const remaining=1-progress;
      const x=Math.round(startEditor.x*remaining/pixel)*pixel;
      const y=Math.ceil(startEditor.y*remaining/pixel)*pixel;
      const width=next.editorWidth+(startEditor.width-next.editorWidth)*remaining;
      const height=next.editorHeight+(startEditor.height-next.editorHeight)*remaining;
      editorPose={x,y,width,height};
      editor.style.left=x+'px';editor.style.top=y+'px';
      editor.style.clipPath=`inset(0px ${Math.max(0,next.editorWidth-width)}px ${Math.max(0,next.editorHeight-height)}px 0px)`;
      if(progress>=1){editor.style.removeProperty('top');editor.style.removeProperty('left');editor.style.removeProperty('clip-path');editorPose=null;editorFrame=0;return;}
      editorFrame=requestAnimationFrame(trackEditor);
    };
    trackEditor();
    Promise.all(effects.map(a=>a.finished)).then(()=>{if(generation===current)effects=[];}).catch(()=>{});
  }).observe(form);
  new MutationObserver(()=>{if(!allowed()||form.classList.contains('is-morphing'))stop();}).observe(form,{attributes:true,attributeFilter:['class']});
  let textScale=document.documentElement.style.getPropertyValue('--text-scale');
  new MutationObserver(()=>{
    const nextScale=document.documentElement.style.getPropertyValue('--text-scale');
    if(nextScale!==textScale){textScale=nextScale;stop();previous=snapshot();}
    if(!allowed()||document.documentElement.hasAttribute('data-mobile'))stop();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion','data-mobile','style']});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',stop);
  window.addEventListener('kindred-interface-font-change',()=>{stop();previous=snapshot();});
  document.fonts.ready.then(()=>{if(!effects.length)previous=snapshot();});
  editor.addEventListener('compositionstart',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {stop,animation:()=>effects[0]||null};
}
