// Docker owns port publishing in bridge mode. In Linux host mode, Kindred
// binds the selected addresses itself; allowed URLs are a separate policy.
export async function mountDockerNetwork(host,{api,dialog,reload=()=>location.reload()}) {
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  let closed=false,dirty=false,busy=false,timer,controller;
  dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);controller?.abort();},{once:true});
  const status=el('p','Loading networking settings…','muted');status.setAttribute('role','status');host.append(status);
  const data=await api('admin/network');if(closed)return {canLeave:()=>true};
  const form=el('form',null,'profile-auth'),controls=el('fieldset');controls.style.cssText='border:0;padding:0;margin:0;display:grid;gap:16px';
  const label=(text,input)=>{const node=el('label',text);node.append(input);controls.append(node);return input;};
  const input=(type,value)=>{const node=el('input');node.type=type;node.value=value||'';return node;};
  const settings=data.pending?.settings||data.settings;
  let access=null,tailnet=null;
  if(data.mode==='host') {
    access=el('select');for(const [value,text] of [['local','This Linux host only'],['tailnet','This host and Tailscale'],['all','All IPv4 interfaces']]){const option=el('option',text);option.value=value;access.append(option);}
    access.value=settings.access;label('Connection access',access);
    tailnet=label('This host’s Tailscale IP address',input('text',settings.tailnet_address));tailnet.placeholder='100.x.x.x';
    const showTailnet=()=>{tailnet.parentElement.hidden=access.value!=='tailnet';tailnet.required=access.value==='tailnet';};access.addEventListener('change',showTailnet);showTailnet();
    controls.append(el('p','Tailscale must already be connected on the Linux host. Localhost remains available for server health and administration.','muted'));
  } else controls.append(el('p','Docker publishes this server’s port. To change which host interfaces are reachable, edit the ports entry in Compose and recreate the container. These URL settings do not change that network restriction.','muted'));
  const url=label('Primary server URL',input('url',settings.public_url));url.required=true;
  const origins=el('textarea');origins.rows=3;origins.value=settings.allowed_origins.join('\n');label('Additional allowed URLs · one per line',origins);
  controls.append(el('p','Use complete addresses, including the port when needed. Allowed URLs control browser connections; they do not replace the connection access setting. Use HTTPS for public access.','muted'));
  const actions=el('div',null,'row-actions'),save=el('button','Save and restart','primary'),reset=el('button','Reset to Compose settings','outline-button');save.type='submit';reset.type='button';actions.append(save,reset);controls.append(actions);form.append(controls);host.append(form);
  const next=el('a');next.hidden=true;next.rel='noopener noreferrer';host.append(next);
  status.textContent='Changes persist across restarts. Changing a Compose environment value overrides that saved field. Saving restarts the server and may interrupt active tasks; bot computers stay running.';
  form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});
  function values(){return {access:access?.value||'bridge',tailnet_address:tailnet?.value||'',public_url:url.value.trim(),allowed_origins:origins.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),confirmed_http_origins:settings.confirmed_http_origins.filter(s=>origins.value.split(/\r?\n/).map(s=>s.trim().replace(/\/$/,'')).includes(s))};}
  function destination(value){next.href=value.public_url;next.textContent='Open '+value.public_url;next.hidden=false;}
  async function reconnect(revision,value) {
    busy=true;controls.disabled=true;dirty=false;destination(value);
    const current=location.origin,allowed=[value.public_url,...value.allowed_origins].some(s=>s.replace(/\/$/,'')===current);
    if(!allowed){status.textContent='Settings saved. The server is restarting. This address is no longer allowed; open the new address below and sign in there.';return;}
    status.textContent='Settings saved. Connection will briefly close while the server restarts. Reconnecting…';
    const deadline=Date.now()+180000;
    async function poll(){
      if(closed)return;
      controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),2500);
      try {
        const response=await fetch('/identity/meta',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();
        const meta=await response.json();
        if(meta.docker_network?.revision===revision){status.textContent='Server ready. Refreshing…';reload();return;}
        if(meta.docker_network?.revision===data.revision){
          // Pending persists until restart. If it disappears while the old
          // generation remains active, startup rolled back even if no poll failed.
          const latest=await api('admin/network');
          if(!latest.pending){status.textContent='The new settings could not start. The previous settings were restored. Reopen Networking to try again.';return;}
        }
      }catch{}finally{clearTimeout(timeout);}
      if(Date.now()>=deadline){status.textContent='The server has not reconnected yet. Try the address below, or check the container logs. Your settings may already be saved.';return;}
      timer=setTimeout(poll,1000);
    }
    timer=setTimeout(poll,500);
  }
  async function submit(resetDefaults=false) {
    if(busy)return;if(!resetDefaults&&!form.reportValidity())return;
    busy=true;controls.disabled=true;status.textContent='Saving networking settings…';
    let requestId;const requested=resetDefaults?data.defaults:values();
    try {
      // Private HTTP origins support getRandomValues but not randomUUID.
      const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
      requestId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
      const result=await api('admin/network',{revision:data.revision,request_id:requestId,settings:requested,reset:resetDefaults});
      if(closed)return;
      if(result.restarting)await reconnect(result.revision,result.settings);
      else{status.textContent='Networking settings are up to date.';dirty=false;busy=false;controls.disabled=false;}
    }catch(error){
      if(closed)return;
      // Reconcile a lost response before allowing another save/restart.
      try {
        const latest=await api('admin/network');
        if(requestId&&(latest.revision===requestId||latest.pending?.revision===requestId)){await reconnect(requestId,latest.pending?.settings||latest.settings);return;}
      }catch{}
      status.textContent=error.status?error.message:'Connection interrupted while saving. Reopen Networking when the server returns to check whether the settings were saved.';
      busy=false;controls.disabled=false;
    }
  }
  form.addEventListener('submit',event=>{event.preventDefault();void submit();});reset.onclick=()=>void submit(true);
  if(data.pending)void reconnect(data.pending.revision,data.pending.settings);
  return {canLeave:()=>!dirty||confirm('Discard unsaved networking changes?')};
}
