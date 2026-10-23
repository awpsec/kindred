// Docker owns port publishing in bridge mode. In Linux host mode, Kindred
// binds the selected addresses itself; allowed URLs are a separate policy.
export async function mountDockerNetwork(host,{api,dialog,onPair,reload=()=>location.reload()}) {
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
  let closed=false,dirty=false,busy=false,timer,controller;
  dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);controller?.abort();},{once:true});
  const status=el('p','Loading networking settings…','muted');status.setAttribute('role','status');host.append(status);
  const data=await api('admin/network');if(closed)return {canLeave:()=>true};
  const form=el('form',null,'hosted-network standalone-access'),controls=el('fieldset');form.noValidate=true;
  const button=(text,action)=>{const node=el('button',text,'outline-button');node.type='button';node.onclick=action;return node;};
  const label=(text,input,parent=controls)=>{const node=el('label',text,'network-field');input.setAttribute('aria-label',text);node.append(input);parent.append(node);return input;};
  const input=(type,value)=>{const node=el('input');node.type=type;node.value=value||'';return node;};
  const current=el('section',null,'network-current');
  current.append(el('strong','Connected here'),el('code',location.origin),el('span',location.protocol==='https:'?'HTTPS · encrypted connection on this device':'HTTP · this connection is not encrypted','muted'));
  let settings=data.pending?.settings||data.settings,checkVersion=0,checked=null;
  const setup=el('details',null,'network-setup');setup.append(el('summary','Set up access'));
  setup.append(el('p','Choose how people will connect. These steps configure the server host; saving an address below does not enable HTTPS or change Docker port publishing.','muted'));
  const choices=el('div',null,'network-setup-choices');choices.setAttribute('role','radiogroup');choices.setAttribute('aria-label','Connection setup');
  const guide=el('section',null,'network-setup-guide');guide.setAttribute('aria-live','polite');
  const radios={};
  for(const [value,title,help] of [['local','Only this server','Local use or an SSH tunnel.'],['tailnet','My devices with Tailscale','Private HTTPS · recommended.'],['public','Public HTTPS','A domain and an HTTPS proxy.'],['advanced','Advanced: choose networks','Direct listeners and allowed addresses.']]){
    const row=el('label',null,'access-choice'),radio=input('radio');radio.name='hosted-network-setup';radio.value=value;
    row.append(radio,el('strong',title),el('span',help,'muted'));choices.append(row);radios[value]=radio;radio.onchange=()=>drawGuide(value);
  }
  setup.append(choices,guide);
  const address=el('section',null,'network-address');address.append(el('h3','Server address'));
  const url=label('Primary server URL',input('url',settings.public_url),address);url.required=true;url.autocomplete='off';url.spellcheck=false;
  address.append(el('p','The address to enter in Kindred → Add account, or open in a browser. HTTPS must already be served at this address.','muted'));
  const hint=el('p',null,'network-url-hint');address.append(hint);
  const checkStatus=el('p','Not checked yet. A saved URL does not confirm that it works.','network-check-status');checkStatus.setAttribute('role','status');
  const copy=button('Copy address',()=>copyText(url.value.trim())),check=button('Check address',()=>checkAddress()),addressActions=el('div',null,'row-actions');addressActions.append(copy,check);address.append(addressActions,checkStatus);
  address.append(el('p','Checks run from the server. Open the address on the other device too; its Tailscale connection, DNS and firewall can differ.','muted small'));
  const advanced=el('details',null,'network-advanced');advanced.append(el('summary','Advanced network settings'));
  let access=null,tailnet=null;
  if(data.mode==='host') {
    access=el('select');for(const [value,text] of [['local','This Linux host only'],['tailnet','This host and Tailscale IP · HTTP'],['all','All IPv4 interfaces · HTTP']]){const option=el('option',text);option.value=value;access.append(option);}
    access.value=settings.access;label('Connection access',access,advanced);
    tailnet=label('This host’s Tailscale IP address',input('text',settings.tailnet_address),advanced);tailnet.placeholder='100.x.x.x';
    const showTailnet=()=>{tailnet.parentElement.hidden=access.value!=='tailnet';tailnet.required=access.value==='tailnet';};access.addEventListener('change',showTailnet);showTailnet();
    advanced.append(el('p','These are plain HTTP listeners. For Tailscale HTTPS or a host reverse proxy, keep the listener on this host only. A proxy can still share that listener.','muted'));
  } else advanced.append(el('p','Docker controls which interfaces can reach port 9444. Edit the ports mapping in your existing Compose project and recreate the server to change it. The container cannot inspect or change the host’s published ports.','muted'));
  const origins=el('textarea');origins.rows=3;origins.value=settings.allowed_origins.join('\n');label('Additional allowed URLs · one per line',origins,advanced);
  advanced.append(el('p','Allowed URLs permit browser connections from those addresses. They do not open ports, restrict connecting networks, or enable HTTPS.','muted'));
  const actions=el('div',null,'row-actions'),save=el('button','Save and restart','primary'),reset=button('Reset to Compose settings',()=>submit(true));save.type='submit';actions.append(save,reset);
  controls.append(current,setup,address,advanced,el('p','Saving restarts the server and may interrupt active tasks. Bot computers stay running. Changes persist; changing a Compose environment value overrides that saved field.','muted'),actions);form.append(controls);host.append(form,status);
  const phone=el('section',null,'access-phone'),pair=button('Connect mobile app',()=>{if(canLeave())onPair?.(settings.public_url);});
  phone.append(el('h3','Phone app'),el('p','Pair this workspace after checking its saved HTTPS address. Your phone must also be able to reach it.','muted'),pair);if(onPair)host.append(phone);
  function origin(value){try{const u=new URL(value.trim());return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null;}catch{return null;}}
  let lastDraft=url.value;
  function refreshAddress(){
    lastDraft=url.value;
    ++checkVersion;checked=null;check.disabled=false;check.textContent='Check address';
    const value=origin(url.value);copy.disabled=!value;pair.disabled=true;
    hint.textContent=value&&new URL(value).protocol==='https:'&&new URL(value).port==='9444'?'Port 9444 normally serves plain HTTP. Use the HTTPS port configured in your proxy. Tailscale Serve uses 443 by default, with no port in the client URL.':'';
    checkStatus.textContent='Not checked yet. A saved URL does not confirm that it works.';
  }
  async function copyText(value){try{await navigator.clipboard.writeText(value);status.textContent='Copied.';}catch{status.textContent='Could not copy. Select the address or command and copy it manually.';}}
  async function checkAddress(){
    const value=origin(url.value);if(!value){checkStatus.textContent='Enter a complete HTTP or HTTPS address without a path or credentials.';return;}
    const version=++checkVersion;checked=null;pair.disabled=true;check.disabled=true;check.textContent='Checking…';checkStatus.textContent='Checking this address from the server…';
    try{
      const result=await api('admin/network/check',{url:value});if(closed||version!==checkVersion)return;
      checked=result.state==='reachable'?value:null;
      checkStatus.textContent=result.message||'Could not confirm this address. Check the server and proxy configuration.';
      if(checked)checkStatus.textContent=(value.startsWith('https:')?'HTTPS verified':'HTTP · not encrypted')+' · Kindred answered from the server. Open this address on the other device and confirm the workspace before sharing it.';
      pair.disabled=checked!==origin(settings.public_url)||!checked?.startsWith('https:')||['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname);
    }catch(error){if(!closed&&version===checkVersion)checkStatus.textContent=error.status===404?'Update this server to check addresses here. You can still open the address on another device.':error.message||'Could not check the address. Try again.';}
    finally{if(!closed&&version===checkVersion){check.disabled=false;check.textContent='Check address';}}
  }
  function useAddress(value,local=false){
    url.value=value;if(local&&access){access.value='local';tailnet.value='';tailnet.parentElement.hidden=true;tailnet.required=false;}
    dirty=true;refreshAddress();url.focus();
  }
  function command(text,parent=guide){const block=el('div',null,'network-command'),code=el('code',text);block.append(code,button('Copy command',()=>copyText(text)));parent.append(block);}
  function drawGuide(mode){
    guide.replaceChildren();
    if(mode==='local'){
      guide.append(el('p',data.mode==='host'?'Keep the listener on this Linux host. Use an SSH tunnel to administer it from another computer.':'Keep Docker’s published port bound to 127.0.0.1 in your existing Compose project. Use an SSH tunnel to administer it remotely.'));
      let localPort=null;
      if(data.mode==='bridge'){
        command('KINDRED_BIND=127.0.0.1');
        const saved=origin(url.value),savedURL=saved?new URL(saved):null;
        localPort=label('Local host port',input('number',savedURL&&savedURL.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(savedURL.hostname)?savedURL.port||'80':'9444'),guide);localPort.min='1';localPort.max='65535';localPort.step='1';
        guide.append(el('p','Use the host port from your Compose ports mapping. Recreate the server if you change its binding.','muted'));
      }
      guide.append(el('p','An existing reverse proxy or Tailscale share can still expose a local listener. Changing the client address does not disable those services.','muted'),button('Use local address',()=>{if(localPort&&(!localPort.value||!localPort.reportValidity()))return;useAddress('http://127.0.0.1:'+(localPort?Number(localPort.value):9444),true);}));
    }else if(mode==='tailnet'){
      guide.append(el('p','Sign into Tailscale on the server and each device that will use Kindred. Run the following on the server host.'));
      const backendPort=label('Local host port',input('number','9444'),guide);backendPort.min='1';backendPort.max='65535';backendPort.step='1';backendPort.disabled=data.mode==='host';
      guide.append(el('p',data.mode==='host'?'The host listener uses port 9444.':'Use the host port from your Compose ports mapping, normally 9444. Keep KINDRED_BIND=127.0.0.1 and recreate the server if you change that binding.','muted'));
      command('tailscale serve status');
      guide.append(el('p','If HTTPS port 443 already has a root share, preserve it and choose a different HTTPS port. Do not replace another service’s route.','muted'));
      const httpsPort=label('HTTPS port',input('number','443'),guide);httpsPort.min='1';httpsPort.max='65535';httpsPort.step='1';
      const commands=el('div');guide.append(commands);
      const updateCommands=()=>{commands.replaceChildren();if(!backendPort.validity.valid||!httpsPort.validity.valid||!backendPort.value||!httpsPort.value)return;command('sudo tailscale serve --bg --https='+Number(httpsPort.value)+' --set-path=/ http://127.0.0.1:'+Number(backendPort.value),commands);};backendPort.oninput=httpsPort.oninput=updateCommands;updateCommands();
      guide.append(el('p','Follow Tailscale’s HTTPS prompt if shown. Copy the https:// address it prints into Primary server URL below, then check it. Do not add the backend port to that address.','muted'));
      guide.append(el('p','Use the host-only HTTP listener behind Serve. Keep any other application routes intact; do not enable the Caddy profile on the same HTTPS port.','muted'));
      if(access)guide.append(button('Use host-only listener',()=>{access.value='local';tailnet.value='';tailnet.parentElement.hidden=true;tailnet.required=false;dirty=true;status.textContent='Host-only listener selected. Save to apply after setting up HTTPS.';}));
    }else if(mode==='public'){
      guide.append(el('p','Point your domain at the server and configure an HTTPS reverse proxy with WebSocket support. Use its https:// address below. Keep the backend listener local.'));
      if(data.mode==='bridge'){
        command('KINDRED_DOMAIN=kindred.example.com\nKINDRED_PUBLIC_URL=https://kindred.example.com\nKINDRED_BIND=127.0.0.1');
        guide.append(el('p','Replace the example domain in your existing .env. If ports 80 and 443 are free, the standard Compose file includes Caddy:','muted'));command('docker compose --profile public up -d');
      }else guide.append(el('p','Use a proxy on the host that forwards to http://127.0.0.1:9444. The bridge-mode Caddy service cannot use server:9444 with this host-network installation.','muted'));
      guide.append(el('p','If you already use a proxy or Tailscale Serve, configure that service instead of starting a second listener on its port.','muted'));
    }else{
      guide.append(el('p','Use Advanced network settings below to edit HTTP listeners and allowed browser addresses. For encrypted access, configure Tailscale Serve or an HTTPS reverse proxy first.'));
      advanced.open=true;
    }
  }
  function applySettings(value) {
    settings=value;
    if(access){access.value=value.access;tailnet.value=value.tailnet_address;tailnet.parentElement.hidden=value.access!=='tailnet';tailnet.required=value.access==='tailnet';}
    url.value=value.public_url;origins.value=value.allowed_origins.join('\n');refreshAddress();
  }
  for(const node of [url,origins,access,tailnet].filter(Boolean))for(const event of ['input','change'])node.addEventListener(event,()=>{dirty=true;if(node===url&&url.value!==lastDraft)refreshAddress();});
  const configured=origin(settings.public_url),initialMode=configured?.startsWith('https:')?(new URL(configured).hostname.endsWith('.ts.net')?'tailnet':'public'):'tailnet';
  radios[initialMode].checked=true;setup.open=!configured?.startsWith('https:');drawGuide(initialMode);refreshAddress();
  const next=el('a');next.hidden=true;next.rel='noopener noreferrer';host.append(next);
  status.textContent='';
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
    if(busy)return;if(!resetDefaults&&(!url.reportValidity()||tailnet&&!tailnet.reportValidity()))return;
    refreshAddress();busy=true;controls.disabled=true;status.textContent='Saving networking settings…';
    let requestId;const requested=resetDefaults?data.defaults:values();
    try {
      // Private HTTP origins support getRandomValues but not randomUUID.
      const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
      requestId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
      const result=await api('admin/network',{revision:data.revision,request_id:requestId,settings:requested,reset:resetDefaults});
      if(closed)return;
      if(result.restarting)await reconnect(result.revision,result.settings);
      else{applySettings(result.settings);data.revision=result.revision;status.textContent='Settings saved. Use Check address to confirm access; saving does not enable HTTPS.';dirty=false;busy=false;controls.disabled=false;}
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
  function canLeave(){return !dirty||confirm('Discard unsaved networking changes?');}
  dialog.addEventListener('cancel',event=>{if(!canLeave())event.preventDefault();});
  return {canLeave};
}
