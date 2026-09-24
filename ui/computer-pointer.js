// Click receipts supplement the actual cursor rendered by the view-only VNC stream.
// Coordinates are measured against the displayed canvas, including letterboxing.
export function computerClickIndicator(host, status, botId) {
  const ring=document.createElement('span');ring.className='computer-click-indicator';
  ring.setAttribute('aria-hidden','true');ring.hidden=true;host.append(ring);
  let lastId='',stopped=false,timer,hide;
  function paint(){
    if(stopped)return;
    const data=status(),point=data.computer_pointer,canvas=host.querySelector('canvas');
    if(data.takeover||!canvas||point?.bot_id!==botId()){ring.hidden=true;}
    else if(point?.id && point.id!==lastId){
      lastId=point.id;
      if(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<1280&&point.y>=0&&point.y<800&&Math.abs(Date.now()/1000-point.created)<4){
        const bounds=canvas.getBoundingClientRect(),base=host.getBoundingClientRect();
        ring.style.left=(bounds.left-base.left+point.x/1280*bounds.width)+'px';
        ring.style.top=(bounds.top-base.top+point.y/800*bounds.height)+'px';
        ring.hidden=false;ring.classList.remove('pulse');void ring.offsetWidth;ring.classList.add('pulse');
        clearTimeout(hide);hide=setTimeout(()=>ring.hidden=true,900);
      }
    }
    timer=setTimeout(paint,100);
  }
  paint();return()=>{stopped=true;clearTimeout(timer);clearTimeout(hide);ring.remove();};
}
