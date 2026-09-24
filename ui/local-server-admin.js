// Bundled native controls also work when the connected server UI is older.
(()=>{
  if(window.top!==window||!window.__KINDRED_PROFILE_HOST||location.origin!=='http://127.0.0.1:9444')return;
  const invoke=(command)=>window.__TAURI__.core.invoke(command);
  function statusReply(){let timer;return Promise.race([invoke('standalone_status'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The local server status did not respond.')),8000);})]).finally(()=>clearTimeout(timer));}
  const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
  const install=()=>{
    for(const dialog of document.querySelectorAll('dialog.profile-dialog')){
      if(dialog.querySelector('.profile-dialog-heading h2')?.textContent!=='Server administration')continue;
      let section=dialog.querySelector('.local-server-admin');
      if(section?.dataset.nativeLocalAdmin){for(const duplicate of dialog.querySelectorAll('.local-server-admin:not([data-native-local-admin])'))duplicate.remove();continue;}
      if(!section){section=node('section','local-server-admin');dialog.querySelector('.profile-dialog-heading').after(section);}
      section.dataset.nativeLocalAdmin='true';section.replaceChildren();
      const style=node('style');style.textContent=`.local-server-admin{padding:0 0 24px;margin-bottom:24px;border-bottom:1px solid var(--line)}.local-server-admin .local-update-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.local-server-admin h3{margin:0;font-size:14px}.local-server-admin .local-update-version{font-size:12px;margin:5px 0 0;color:var(--muted)}.local-server-admin .local-update-message{font-size:13px;margin:14px 0 0;overflow-wrap:anywhere}.local-server-admin progress{display:block;width:100%;height:5px;margin-top:16px;accent-color:var(--text);border-radius:4px}.local-server-admin [hidden]{display:none!important}.local-server-admin details{font-size:12px;margin-top:12px}.local-server-admin pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:120px;overflow:auto}.local-server-admin button{margin:0;flex-shrink:0}`;
      const row=node('div','local-update-row'),copy=node('div'),title=node('h3','','Local server'),version=node('p','local-update-version','Checking version…');copy.append(title,version);
      const button=node('button','outline-button','Update local server');button.type='button';button.disabled=true;
      const message=node('p','local-update-message');message.setAttribute('role','status');message.hidden=true;
      const progress=node('progress');progress.setAttribute('aria-label','Local server update progress');progress.hidden=true;
      const details=node('details'),summary=node('summary','','Update details'),log=node('pre');details.append(summary,log);details.hidden=true;
      row.append(copy,button);section.append(style,row,progress,message,details);
      let state=null,timer,busy=false,epoch=0;
      function render(value){
        state=value;const working=value.status==='working',pending=value.status==='awaiting_restart';
        button.disabled=busy||working;button.textContent=working?'Updating…':pending?'Restart Kindred and server':value.status==='error'?'Retry update':'Update local server';
        if(value.local_server)version.textContent='Version '+value.local_server.version+' · App '+value.local_server.desktop_version;
        else if(!working)version.textContent='On this computer';
        progress.hidden=!working&&!pending;progress.max=value.stage_count||5;
        if(Number.isFinite(value.completed_stages))progress.value=value.completed_stages;else progress.removeAttribute('value');
        const text=pending?'Ready to restart.':working?(value.stage||'Preparing update…'):value.status==='error'?value.message:value.status==='ready'?'Local server is up to date.':'';
        message.hidden=!text;message.textContent=text||'';progress.setAttribute('aria-valuetext',text||'');
        details.hidden=!value.detail;log.textContent=value.detail||'';
      }
      async function poll(){
        const current=epoch;
        try{const value=await statusReply();if(current===epoch)render(value||{status:'idle'});}
        catch(e){message.hidden=false;message.textContent='Could not check update progress. '+String(e?.message||e);}
        finally{if(section.isConnected){clearTimeout(timer);timer=setTimeout(poll,state?.status==='working'?1000:5000);}}
      }
      button.onclick=async()=>{
        if(button.disabled)return;
        const restart=state?.status==='awaiting_restart';busy=true;epoch++;clearTimeout(timer);button.disabled=true;
        message.hidden=false;message.textContent=restart?'Restarting the server…':'Preparing update…';
        try{await invoke(restart?'restart_local_server':'prepare_local_server');}
        catch(e){message.textContent=String(e?.message||e);busy=false;button.disabled=false;return;}
        busy=false;await poll();
      };
      void poll();
    }
  };
  const start=()=>{install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
