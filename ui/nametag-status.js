// The floating identity grows around live collaboration state. Only its small
// absolute shell changes size; neither transcript layout nor text is scaled.
export function createNametagStatus({heading,onStop}) {
  let shell,row,label,stop,current=null,frame=0,lastChat='',shown=false,pendingKey='';
  const desktop=()=>!document.documentElement.hasAttribute('data-kindred-ios')&&!document.documentElement.hasAttribute('data-mobile')&&matchMedia('(min-width:761px)').matches;
  function mount(){
    if(shell)return;
    shell=document.createElement('div');shell.className='nametag-shell';
    heading.before(shell);shell.append(heading);
    row=document.createElement('div');row.className='nametag-status';row.tabIndex=0;row.hidden=true;
    label=document.createElement('span');label.className='nametag-status-label';label.setAttribute('role','status');
    stop=document.createElement('button');stop.className='nametag-status-stop';stop.type='button';
    stop.setAttribute('aria-label','Interrupt collaboration');
    stop.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    stop.onclick=async()=>{
      const work=current;if(!work||stop.disabled||pendingKey)return;pendingKey=work.runIds.slice().sort().join(',');stop.disabled=true;
      try{await onStop(work);}finally{pendingKey='';if(stop)stop.disabled=!!current?.stopping;}
    };
    row.append(label,stop);shell.append(row);
    for(const event of ['pointerenter','pointerleave','focusin','focusout']){
      row.addEventListener(event,schedule);
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;layout();});}
  function layout(){
    if(!shell)return;
    if(!desktop()){
      shell.before(heading);shell.remove();shell=null;row=null;label=null;stop=null;
      document.documentElement.removeAttribute('data-nametag-status');return;
    }
    const reveal=!!current&&(row.matches(':hover')||row.matches(':focus-within')||matchMedia('(hover:none)').matches);
    shell.classList.toggle('reveal-stop',reveal);
    const headingText=heading.querySelector('#heading'),avatar=heading.querySelector('#header-avatar');
    const detailsHovered=heading.matches(':hover,:focus-visible');
    const titleWidth=(headingText?.scrollWidth||0)+(avatar?.offsetWidth||0)+7+24+(detailsHovered?20:0);
    const statusWidth=current?label.scrollWidth+24+(reveal?28:0):0;
    const available=Math.max(80,heading.closest('.conversation-header').clientWidth-(heading.closest('.group-conversation')?180:32));
    const width=Math.ceil(Math.min(available,Math.max(titleWidth,statusWidth)));
    shell.style.width=width+'px';shell.style.height=(heading.offsetHeight+(current?29:0))+'px';
  }
  function update(work,chat){
    current=work;
    if(!desktop()){layout();return;}
    mount();
    const changedChat=lastChat!==chat;lastChat=chat;
    shell.classList.toggle('nametag-instant',changedChat||!shown);
    shown=true;
    row.hidden=!work;
    if(!work&&row.contains(document.activeElement))heading.focus({preventScroll:true});
    label.textContent=work?.label||'';row.title=work?.label||'';
    stop.disabled=!!work?.stopping||!!pendingKey;stop.setAttribute('aria-label',work?'Interrupt '+work.label:'Interrupt collaboration');
    shell.classList.toggle('has-status',!!work);
    document.documentElement.toggleAttribute('data-nametag-status',!!work);
    layout();
    if(changedChat)requestAnimationFrame(()=>shell?.classList.remove('nametag-instant'));
    else shell.classList.remove('nametag-instant');
  }
  for(const event of ['pointerenter','pointerleave','focusin','focusout'])heading.addEventListener(event,schedule);
  addEventListener('resize',()=>{if(desktop())update(current,lastChat);else layout();});
  new MutationObserver(schedule).observe(heading.querySelector('#heading'),{subtree:true,childList:true,characterData:true});
  document.fonts?.ready.then(schedule);
  return {update};
}
