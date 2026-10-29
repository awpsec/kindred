// The server owns credentials, the call transcript and its idempotent chat handoff.
export function createVoiceUI({api,composer,editor,send,bot,chatId,icon,avatar,notice,openSettings,cancelDictation,onEnded=()=>{}}){
  const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const button=(label,symbol,run,cls='')=>{const b=node('button','voice-control '+cls);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(symbol,18));b.onclick=run;return b;};
  let config=null,settings=null,revision=0,operation=null,clock=null,loading=null;
  const startButton=button('Start voice call','voice',()=>void start(),'voice-start');startButton.hidden=true;send.before(startButton);
  const tray=node('div','voice-call-tray');tray.hidden=true;tray.setAttribute('role','group');tray.setAttribute('aria-label','Voice call');
  const portrait=node('span','voice-avatar'),copy=node('div','voice-call-copy'),status=node('div','voice-call-state'),time=node('div','voice-call-time','0:00');status.setAttribute('role','status');copy.append(status,time);
  const wave=node('span','voice-wave');wave.setAttribute('aria-hidden','true');for(let i=0;i<5;i++)wave.append(node('i'));
  const mute=button('Mute microphone','mic',()=>setMuted(!operation?.muted),'voice-mute'),end=button('End call','phone-off',()=>void endCall(),'voice-end');tray.append(portrait,copy,wave,mute,end);composer.append(tray);
  const stamp=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  const native=()=>window.__KINDRED_IOS_VOICE?.protocolVersion===1&&window.webkit?.messageHandlers?.kindredVoice;
  const postNative=(action,extra={})=>native()?.postMessage({action,documentID:window.__KINDRED_IOS_VOICE.documentID,...extra});
  function render(){
    const active=!!operation,ready=!!config?.configured&&config.enabled&&!!bot()&&chatId()?.startsWith('dm-')&&!composer.matches('.has-files,.is-replying,.is-answering,.is-request-activating,.is-dictating');
    composer.classList.toggle('is-voice-calling',active);composer.classList.toggle('voice-ready',ready&&!editor.value?.trim());
    startButton.hidden=!ready||active||!!editor.value?.trim();tray.hidden=!active;
    if(active){status.textContent=operation.phase==='connecting'?'Connecting…':operation.phase==='ending'?'Ending call…':operation.muted?'Microphone muted':operation.bot.name+(Date.now()<operation.speakingUntil?' is speaking':' is listening');time.textContent=stamp(operation.started?Math.max(0,Math.floor(((operation.endedAt||Date.now())-operation.started)/1000)):0);mute.disabled=operation.phase!=='active';if(mute.dataset.muted!==String(operation.muted)){mute.dataset.muted=String(operation.muted);mute.replaceChildren(icon(operation.muted?'mic-off':'mic',18));}mute.title=operation.muted?'Unmute microphone':'Mute microphone';mute.setAttribute('aria-pressed',String(operation.muted));mute.setAttribute('aria-label',operation.muted?'Unmute microphone':'Mute microphone');tray.dataset.speaking=String(Date.now()<operation.speakingUntil);}
    if(settings?.isConnected){const enabled=settings.querySelector('input'),select=settings.querySelector('select');enabled.checked=!!config?.enabled;enabled.disabled=!config?.configured||active;select.disabled=!config?.configured||!config?.enabled||active;settings.querySelector('.voice-summary-state').textContent=!config?'Unavailable':!config.configured?'Not connected':config.enabled?'On':'Off';}
    composer.dispatchEvent(new CustomEvent('kindred-voice-layout',{bubbles:true}));
  }
  async function init(){
    const current=++revision;config=null;render();
    try{const result=await api('/voice/settings');if(current!==revision)return;config=result;render();return result;}catch{if(current===revision){config=null;render();}}
  }
  function settingsSection(){
    settings=node('section','settings-section voice-settings');const details=node('details','settings-pane voice-options'),summary=node('summary');summary.append(icon('chevron',14),node('span','','Voice (OpenAI API)'),node('span','muted small','Experimental'),node('span','muted small voice-summary-state'));
    const body=node('div','voice-settings-body'),enabled=node('input');enabled.type='checkbox';enabled.disabled=true;enabled.setAttribute('role','switch');const label=node('label','setting-row','Enable voice calls');label.append(enabled);
    const select=node('select');select.disabled=true;select.setAttribute('aria-label','Voice');const voiceRow=node('label','setting-row','Voice');voiceRow.append(select);
    const note=node('p','muted small'),context=node('p','muted small','Your bot receives the conversation after the call.'),error=node('p','muted small');error.setAttribute('role','status');
    const connect=node('button','subtle-button','Connect OpenAI in Connections');connect.type='button';connect.onclick=()=>openSettings('connections');
    body.append(label,voiceRow,note,context,error,connect);details.append(summary,body);settings.append(details);
    const populate=()=>{select.replaceChildren();for(const voice of config?.voices||[]){const option=node('option','',voice.name);option.value=voice.id;select.append(option);}select.value=config?.voice||'';note.textContent=config?.configured?'AI voice · Uses your OpenAI API credits. Works with any bot.':'Connect an OpenAI API key to enable calls.';connect.hidden=!!config?.configured;render();};
    const save=async()=>{enabled.disabled=true;select.disabled=true;error.textContent='';const current=revision;try{const result=await api('/voice/settings','PUT',{enabled:enabled.checked,voice:select.value});if(current!==revision)return;config=result;}catch(e){if(current===revision)error.textContent=e.message;}finally{if(current===revision)populate();}};
    enabled.onchange=save;select.onchange=save;populate();void init().then(populate);return settings;
  }
  function releaseAudio(op){
    clearInterval(op.ping);clearTimeout(op.timeout);op.stream?.getTracks().forEach(track=>track.stop());op.capture?.disconnect();op.source?.disconnect();
    for(const source of op.playing||[])try{source.stop();}catch{}op.playing?.clear();void op.audio?.close().catch(()=>{});op.audio=null;
  }
  function complete(op,message){
    if(operation!==op)return;operation=null;clearInterval(clock);releaseAudio(op);op.socket?.close();render();
    if(message)notice(message,true);onEnded();
  }
  function event(op,value){
    if(operation!==op)return;
    if(value.type==='started'){if(op.phase==='ending')return;op.phase='active';op.started=value.started_ms||Date.now();if(typeof value.muted==='boolean')op.muted=value.muted;clearTimeout(op.timeout);render();}
    else if(value.type==='audio'&&op.phase==='active'){
      try{const raw=atob(value.data);if(raw.length>96000||raw.length%2)throw Error('Invalid audio');const samples=new Float32Array(raw.length/2);for(let i=0;i<samples.length;i++){let n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);if(n>32767)n-=65536;samples[i]=n/32768;}const context=op.audio;if(!context)return;const at=Math.max(context.currentTime+.02,op.nextAudio||0);if(at-context.currentTime>3)throw Error('Audio playback fell behind');const buffer=context.createBuffer(1,samples.length,24000);buffer.copyToChannel(samples,0);const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);op.playing.add(source);source.onended=()=>op.playing.delete(source);source.start(at);op.nextAudio=at+buffer.duration;op.speakingUntil=Date.now()+(op.nextAudio-context.currentTime)*1000;}catch{void endCall('Audio playback stopped. Call again to reconnect.');}
    }else if(value.type==='speaking'){op.speakingUntil=Date.now()+1200;}
    else if(value.type==='mute'){op.muted=value.muted===true;render();}
    else if(value.type==='ending'){op.phase='ending';op.endedAt=op.endedAt||Date.now();render();}
    else if(value.type==='ended')complete(op,value.saved===false?'Your call ended, but its transcript is still waiting to be saved.':op.error);
    else if(value.type==='error'){op.error=value.message||'The voice connection ended.';if(value.terminal===true)complete(op,op.error);}
  }
  async function start(){
    if(operation)return;if(!config?.enabled||!config.configured){openSettings('general');return;}
    const selected=bot(),chat=chatId();if(!selected||!chat?.startsWith('dm-'))return;
    cancelDictation();editor.blur();
    const op=operation={phase:'connecting',bot:selected,chat,muted:false,started:0,speakingUntil:0,playing:new Set(),generation:revision,native:!!native()};portrait.replaceChildren(avatar(selected));render();clock=setInterval(render,1000);
    try{
      // Request permission before creating a billable transport; no auto reconnect.
      if(!op.native){if(!navigator.mediaDevices?.getUserMedia)throw Error('This app cannot access the microphone. Check microphone permissions.');op.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});if(operation!==op){releaseAudio(op);return;}try{op.audio=new AudioContext({sampleRate:24000});}catch{op.audio=new AudioContext();}await op.audio.resume();}
      const call=await api('/voice/start','POST',{chat_id:chat});if(operation!==op){releaseAudio(op);return;}op.id=call.id;
      op.timeout=setTimeout(()=>{void endCall('The call did not connect. Try again.');},25000);
      if(op.native){const art=portrait.firstElementChild;postNative('start',{id:call.id,ticket:call.ticket,chatID:chat,botName:selected.name,shape:art?.dataset.avatarBody||art?.dataset.shape||selected.profile?.shape||'round',color:art?.dataset.avatarColor||selected.profile?.color||'#2475ff'});return;}
      await op.audio.audioWorklet.addModule('/voice-audio-worklet.js');if(operation!==op){releaseAudio(op);return;}
      const url=new URL('/voice',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',call.ticket);
      const socket=op.socket=new WebSocket(url);socket.onmessage=e=>{try{event(op,JSON.parse(e.data));}catch{void endCall('The call connection returned unreadable data.');}};
      socket.onclose=()=>{if(operation===op)complete(op,op.phase==='ending'?op.error:'Call disconnected. The transcript so far is kept.');};socket.onerror=()=>{op.error='Could not connect the call. Check your OpenAI API key and connection.';};
      socket.onopen=()=>{if(operation!==op){socket.close();return;}op.ping=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},10000);};
      op.stream.getAudioTracks().forEach(track=>track.addEventListener?.('ended',()=>{if(operation===op&&op.phase==='active')void endCall('Microphone access ended. Call again when it is available.');},{once:true}));
      op.source=op.audio.createMediaStreamSource(op.stream);op.capture=new AudioWorkletNode(op.audio,'kindred-voice-capture');const silent=op.audio.createGain();silent.gain.value=0;op.source.connect(op.capture).connect(silent).connect(op.audio.destination);
      op.capture.port.onmessage=e=>{if(operation!==op||op.phase!=='active'||socket.readyState!==1)return;if(socket.bufferedAmount>128000){void endCall('The call connection is too slow. Try again.');return;}const bytes=new Uint8Array(e.data);let s='';for(const byte of bytes)s+=String.fromCharCode(byte);socket.send(JSON.stringify({type:'audio',data:btoa(s)}));};
    }catch(e){if(operation===op)complete(op,e.name==='NotAllowedError'?'Allow microphone access to make a call.':e.message||'The call could not start.');else releaseAudio(op);}
  }
  function setMuted(value){const op=operation;if(!op||op.phase!=='active')return;op.muted=value;if(op.native)postNative('mute',{id:op.id,muted:value});else{op.capture?.port.postMessage({muted:value});op.stream?.getAudioTracks().forEach(t=>t.enabled=!value);op.socket?.send(JSON.stringify({type:'mute',muted:value}));}render();}
  async function endCall(message){const op=operation;if(!op||op.phase==='ending')return;op.phase='ending';op.endedAt=Date.now();op.error=message;releaseAudio(op);render();if(op.native)postNative('end',{id:op.id});else if(op.socket?.readyState===1)op.socket.send(JSON.stringify({type:'end'}));else{complete(op,message);return;}op.timeout=setTimeout(()=>complete(op,message),16000);}
  function reset(){revision++;config=null;const old=operation;void endCall();if(old)complete(old);render();}
  window.addEventListener('kindred-ios-voice',e=>{if(operation?.native&&e.detail?.id===operation.id&&e.detail.documentID===window.__KINDRED_IOS_VOICE?.documentID)event(operation,e.detail);});
  window.addEventListener('pagehide',()=>{void endCall();});editor.addEventListener('input',render);
  const syncNative=()=>{if(operation?.native&&operation.id&&!document.hidden)postNative('status',{id:operation.id});};
  document.addEventListener('visibilitychange',syncNative);window.addEventListener('focus',syncNative);
  return {init,render,settingsSection,reset,endCall,canNavigate:target=>{if(operation&&target!==operation.chat){notice('Finish your call with '+operation.bot.name+' before switching chats.');return false;}return true;}};
}
