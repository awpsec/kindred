// Keep startup recovery independent of the application's module graph.
(() => {
  let failed=false,finished=false,timer;
  const status=()=>document.getElementById('startup-status');
  const render=()=>{
    const box=status();if(!box||!failed||finished)return;
    box.hidden=false;box.setAttribute('role','alert');
    const title=document.createElement('strong');title.textContent='Kindred couldn’t finish opening.';
    const help=document.createElement('p');help.textContent='Your accounts and workspace data are unchanged. Try again after the server is ready.';
    const retry=document.createElement('button');retry.className='outline-button';retry.textContent='Try again';retry.onclick=()=>location.reload();
    box.replaceChildren(title,help,retry);
    if(window.__KINDRED_DESKTOP){
      const browser=document.createElement('a');browser.className='subtle-button';browser.textContent='Open in browser';browser.href=location.origin;browser.target='_blank';browser.rel='noopener noreferrer';box.append(browser);
    }
  };
  const fail=()=>{if(finished||failed)return;failed=true;clearTimeout(timer);render();};
  const error=event=>{if(event.target?.tagName==='SCRIPT'||event instanceof ErrorEvent)fail();};
  const rejection=()=>fail();
  window.__KINDRED_STARTUP={get failed(){return failed;},fail,finish(){
    if(failed)return false;
    finished=true;clearTimeout(timer);window.removeEventListener('error',error,true);window.removeEventListener('unhandledrejection',rejection);
    delete document.documentElement.dataset.starting;const box=status();if(box)box.hidden=true;return true;
  }};
  window.addEventListener('error',error,true);window.addEventListener('unhandledrejection',rejection);
  document.addEventListener('DOMContentLoaded',render,{once:true});
  timer=setTimeout(fail,30000);
})();
