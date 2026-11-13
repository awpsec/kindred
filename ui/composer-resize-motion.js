// Reserve the natural height once; animate paint rather than relaying every
// animation frame through transcript padding and scroll restoration.
export function installComposerResizeMotion(form, editor, {allowed, chat}) {
  const surface=document.createElement('div');
  surface.className='composer-resize-surface';surface.setAttribute('aria-hidden','true');
  form.prepend(surface);form.classList.add('has-resize-surface');
  let previous=null,effects=[],generation=0;
  const stop=()=>{generation++;for(const effect of effects)effect.cancel();effects=[];};
  const snapshot=()=>({height:form.offsetHeight,surfaceHeight:surface.offsetHeight,width:form.offsetWidth,chat:chat(),
    reply:form.classList.contains('is-replying')});
  new ResizeObserver(()=>{
    const next=snapshot(),old=previous;previous=next;
    if(!old||old.height===next.height&&old.width===next.width)return;
    const enabled=!document.documentElement.hasAttribute('data-mobile')&&allowed()&&!document.hidden
      &&editor.dataset.composing!=='true'&&!form.classList.contains('is-morphing')
      &&old.chat===next.chat&&old.width===next.width&&old.reply===next.reply&&next.surfaceHeight>0;
    const visible=effects.length?old.surfaceHeight*new DOMMatrixReadOnly(getComputedStyle(surface).transform).m22:old.surfaceHeight;
    stop();
    if(!enabled||Math.abs(visible-next.surfaceHeight)<1)return;
    const options={duration:180,easing:'cubic-bezier(.22,1,.36,1)'};
    effects.push(surface.animate([{transform:`scaleY(${visible/next.surfaceHeight})`},{transform:'scaleY(1)'}],options));
    // Keep the live editor native. Transforming its wrapped text makes WebKit
    // alternate fractional grid heights and can retrigger ResizeObserver.
    const current=generation;
    Promise.all(effects.map(a=>a.finished)).then(()=>{if(generation===current)effects=[];}).catch(()=>{});
  }).observe(form);
  new MutationObserver(()=>{if(!allowed()||form.classList.contains('is-morphing'))stop();}).observe(form,{attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{if(!allowed()||document.documentElement.hasAttribute('data-mobile'))stop();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion','data-mobile']});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {stop,animation:()=>effects[0]||null};
}
