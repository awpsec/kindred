// Browser updates are hosted-server operations, separate from native client updates.
export function createServerUpdater({token,currentVersion,uiVersion,newerVersion,beforeReload,reload=()=>location.reload(),changed=()=>{}}){
  let latest=null,checked=0,checking=false,dialog=null,timer=null,waiting=false,target=null;
  async function request(body){
    const response=await fetch('/identity/server-update',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Object.assign(Error(response.status===404?'This server needs a host-updater installation before it supports browser updates.':response.status===401||response.status===403?'Sign in as a server administrator to update.':'Could not check server updates. Try again.'),{rejected:true});
    const data=await response.json();if(data.error&&data.phase!=='failed')throw Object.assign(Error(data.error),{rejected:true});return data;
  }
  function available(){return !!latest?.supported&&newerVersion(latest.version,currentVersion());}
  async function check(force=false){
    if(!token()||checking||(!force&&Date.now()-checked<60000))return;
    checking=true;checked=Date.now();try{latest=await request();changed();}catch{/* Discovery must not interrupt chat. */}finally{checking=false;}
  }
  function open(){
    if(dialog?.isConnected){dialog.focus();return;}
    const d=document.createElement('dialog');dialog=d;d.className='profile-dialog server-update-dialog';d.setAttribute('aria-label','Update Kindred');
    const heading=document.createElement('h2');heading.textContent='Update Kindred';
    const close=document.createElement('button');close.className='dialog-close icon-button';close.textContent='×';close.setAttribute('aria-label','Close');close.onclick=()=>d.close();
    const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');status.textContent='Checking for updates…';
    const progress=document.createElement('progress');progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','Server update progress');
    const action=document.createElement('button');action.className='primary';action.textContent='Update & restart';action.disabled=true;
    d.append(heading,close,status,progress,action);document.body.append(d);d.showModal();
    d.addEventListener('close',()=>{clearTimeout(timer);timer=null;d.remove();});
    const refreshInterface=()=>{try{beforeReload();reload();}catch{waiting=false;status.textContent='Could not save your draft for restart. Copy it before reloading.';progress.hidden=true;}};
    async function poll(){
      if(!d.isConnected)return;
      try{
        const data=await request();latest=data;changed();
        if(data.phase==='failed'){waiting=false;progress.hidden=true;action.disabled=false;action.textContent='Retry update';action.onclick=install;status.textContent=data.error||'The update failed. Check the host updater log.';return;}
        if(waiting&&['complete','idle'].includes(data.phase)){
          // A successful HTTP response alone is not enough: verify the new server version.
          const response=await fetch('/api/status',{headers:{Authorization:'Bearer '+token()},cache:'no-store',signal:AbortSignal.timeout(8000)});
          if(!response.ok)throw Error('Waiting for your session to reconnect…');
          const server=await response.json();
          if(server.version===target||newerVersion(server.version,target)){status.textContent='Updated. Reopening your workspace…';refreshInterface();return;}
        }
        if(waiting&&data.phase==='idle'){waiting=false;status.textContent='The update did not start. Check again to retry.';}
        const active=['downloading','installing','restarting'].includes(data.phase);
        if(active){waiting=true;target=data.version;progress.hidden=false;progress.value=data.progress||0;action.disabled=true;status.textContent={downloading:'Downloading and verifying the update…',installing:'Installing the update…',restarting:'Restarting Kindred. Reconnecting automatically…'}[data.phase];}
        else if(!waiting){
          progress.hidden=true;action.disabled=false;
          if(available()){status.textContent='Kindred '+data.version+' is available. The server will briefly disconnect while it restarts.';action.textContent='Update & restart';action.onclick=install;}
          else if(newerVersion(currentVersion(),uiVersion)){status.textContent='Your server is already updated. Load its new interface to finish.';action.textContent='Load updated interface';action.onclick=refreshInterface;}
          else{status.textContent=data.supported?'Kindred is up to date.':data.message;action.textContent='Check again';action.onclick=poll;}
        }
        if(waiting)timer=setTimeout(poll,2000);
      }catch(error){
        if(waiting){
          // Do not repeat POST after a dropped connection: the supervisor may already be installing.
          if(error.rejected||latest?.phase==='failed'){waiting=false;progress.hidden=true;action.disabled=false;action.textContent='Check again';action.onclick=poll;status.textContent=error.message;}
          else{status.textContent='Reconnecting to Kindred… This will continue automatically.';timer=setTimeout(poll,3000);}
        }else{status.textContent=error.message;action.disabled=false;action.textContent='Try again';action.onclick=poll;if(newerVersion(currentVersion(),uiVersion)){status.textContent='The server interface has updated. Load it to continue.';action.textContent='Load updated interface';action.onclick=refreshInterface;}}
      }
    }
    async function install(){
      action.disabled=true;waiting=true;target=latest.version;
      try{beforeReload();}catch{waiting=false;action.disabled=false;status.textContent='Could not save your draft for restart. Copy it before updating.';return;}
      progress.hidden=false;progress.removeAttribute('value');status.textContent='Starting the update…';
      try{const data=await request({version:target});latest=data;if(!data.supported){waiting=false;throw Error(data.message);}timer=setTimeout(poll,500);}
      catch(error){if(error.rejected)waiting=false;if(waiting){status.textContent='Checking whether the update started…';timer=setTimeout(poll,2000);}else{status.textContent=error.message;progress.hidden=true;action.disabled=false;action.textContent='Check again';action.onclick=poll;}}
    }
    void poll();
  }
  return {check,open,available};
}
