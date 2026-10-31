// The server owns credentials, the call transcript, private work session and one recap.
// Tones are original, short state cues, never recordings from another application.
const callTones={connecting:[[392,0,.09],[494,.12,.09]],connected:[[523,0,.11],[659,.13,.11]],ended:[[494,0,.12],[330,.14,.12]],error:[[330,0,.14],[262,.17,.14]]};
// Each position has a fixed profile. Only current PCM energy changes its height;
// this is a meter, never a scrolling recording of previous audio samples.
export function voiceWaveLevels(input,output,count,reduceMotion=false){
  const clean=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  input=clean(input);output=clean(output);count=Math.max(8,Math.min(40,Math.floor(count)||8));
  const speaker=input>.006?'input':output>.006?'output':'quiet',level=speaker==='input'?input:output;
  const energy=speaker==='quiet'?0:reduceMotion ? .5 : Math.min(1,Math.sqrt(level)*2.7);
  const shape=Array.from({length:count},(_,i)=>{
    const x=(i+.5)/count,profile=(.48+.52*Math.sin(Math.PI*x))*(.70+.30*Math.cos(i*1.83)**2);
    return Number((.107+.893*energy*profile).toFixed(3));
  });
  return {speaker,input:speaker==='input'?shape:Array(count).fill(0),output:speaker==='input'?Array(count).fill(0):shape};
}
export function createVoiceUI({api,composer,editor,send,bot,chatId,icon,avatar,notice,openSettings,cancelDictation,onEnded=()=>{}}){
  const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const button=(label,symbol,run,cls='')=>{const b=node('button','voice-control '+cls);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(symbol,18));b.onclick=run;return b;};
  let config=null,settings=null,callOptions=null,revision=0,operation=null,clock=null,preview=null,effects=null,effectsIdle=null,cueRevision=0,trayMotion=null,trayClosing=false,positionFrame=0,waveCount=0;
  const cueNodes=new Map();
  const startButton=button('Start voice call','voice',()=>void start(),'voice-start');startButton.hidden=true;send.before(startButton);
  const tray=node('div','voice-call-tray');tray.hidden=true;tray.setAttribute('role','group');tray.setAttribute('aria-label','Voice call');
  const conversation=composer.closest('.conversation')||composer.parentElement,header=conversation.querySelector('.conversation-header');
  const layer=node('div','voice-call-overlay'),portrait=node('span','voice-avatar'),activity=node('div','voice-call-activity'),copy=node('div','voice-call-copy'),status=node('div','voice-call-state'),time=node('div','voice-call-time','0:00');status.setAttribute('role','status');copy.append(status,time);
  const wave=node('span','voice-wave');wave.setAttribute('aria-hidden','true');
  const outputWave=node('span','voice-wave-output'),inputWave=node('span','voice-wave-input');wave.append(outputWave,inputWave);activity.append(wave,copy);
  const gear=button('Voice options','settings',()=>void showSettings(),'voice-settings-button'),mute=button('Mute microphone','mic',()=>setMuted(!operation?.muted),'voice-mute'),end=button('End call','close',()=>void endCall(),'voice-end');tray.append(portrait,activity,gear,mute,end);layer.append(tray);conversation.append(layer);
  const stamp=n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
  const native=()=>window.__KINDRED_IOS_VOICE?.protocolVersion===1&&window.webkit?.messageHandlers?.kindredVoice;
  const postNative=(action,extra={})=>native()?.postMessage({action,documentID:window.__KINDRED_IOS_VOICE.documentID,...extra});
  const reducedMotion=()=>document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function showSettings(){
    if(callOptions?.open)return;stopPreview();
    const owner=callOptions=node('dialog','text-dialog voice-call-options'),title=node('h2','','Voice options');
    title.id='voice-call-options-title';owner.setAttribute('aria-labelledby',title.id);
    const head=node('div','dialog-heading'),close=button('Close voice options','close',()=>owner.close());close.className='icon-button';close.autofocus=true;head.append(title,close);
    const voice=node('select'),pace=node('select');voice.setAttribute('aria-label','Voice');pace.setAttribute('aria-label','Speaking pace');
    const group=node('div','settings-pane'),voiceRow=node('label','setting-row'),paceRow=node('label','setting-row');voiceRow.append(node('span','setting-label','Voice'),voice);paceRow.append(node('span','setting-label','Speaking pace'),pace);group.append(voiceRow,paceRow);
    const note=node('p','muted small'),error=node('p','voice-options-error muted small');error.setAttribute('role','status');
    owner.append(head,group,note,error);document.body.append(owner);
    const populate=()=>{
      voice.replaceChildren(...(config?.voices||[]).map(v=>{const option=node('option','',v.name);option.value=v.id;return option;}));voice.value=config?.voice||'';
      pace.replaceChildren(...['slower','normal','faster'].map(value=>{const option=node('option','',value[0].toUpperCase()+value.slice(1));option.value=value;return option;}));pace.value=config?.pace||'normal';
      voice.disabled=pace.disabled=!config?.configured||owner.dataset.saving==='true';
      note.textContent=operation?'Voice changes on your next call. Pace updates now.':'Voice and pace apply to your next call.';
    };
    const save=async()=>{
      if(owner.dataset.saving==='true')return;const current=revision,changes={enabled:!!config?.enabled,voice:voice.value,pace:pace.value};
      owner.dataset.saving='true';error.textContent='';populate();
      try{const result=await api('/voice/settings','PUT',changes);if(current!==revision)return;config=result;}
      catch(e){if(current===revision&&owner.isConnected)error.textContent=e.message||'Voice options could not be saved.';}
      finally{owner.dataset.saving='false';if(current===revision&&owner.isConnected){populate();render();}}
    };
    voice.onchange=save;pace.onchange=save;
    owner.addEventListener('click',e=>{if(e.target===owner){const r=owner.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)owner.close();}});
    owner.addEventListener('close',()=>{owner.remove();if(callOptions===owner)callOptions=null;if(!tray.hidden)gear.focus({preventScroll:true});},{once:true});
    // Focusing a select from this gesture opens the system picker in WKWebView.
    // Show the options first; the user opens a picker by tapping its own row.
    populate();owner.showModal();close.focus({preventScroll:true});
  }
  function resizeWave(){
    const count=Math.max(8,Math.min(40,Math.floor((wave.clientWidth+3)/6)));if(count===waveCount)return;waveCount=count;
    for(const part of [inputWave,outputWave])part.replaceChildren(...Array.from({length:count},()=>node('i')));
    if(operation)paintWave(operation);
  }
  function paintWave(op){
    const values=voiceWaveLevels(op.visualInput||0,op.visualOutput||0,waveCount,reducedMotion());wave.dataset.speaker=values.speaker;
    for(const [part,levels] of [[outputWave,values.output],[inputWave,values.input]]){
      for(let i=0;i<part.children.length;i++){
        const scale=String(levels[i]||0),bar=part.children[i];
        if(bar.dataset.level!==scale){bar.dataset.level=scale;bar.style.transform='scaleY('+scale+')';}
      }
    }
  }
  function preserveReading(change){
    const history=conversation.querySelector('.messages'),height=history?.scrollHeight,offset=history?.scrollTop,bottom=history&&height-history.clientHeight-offset<4;
    change();
    if(history&&history.scrollHeight!==height)history.scrollTo({top:bottom?history.scrollHeight:Math.max(0,offset+history.scrollHeight-height),behavior:'instant'});
  }
  function positionTray(){
    positionFrame=0;if(tray.hidden||!conversation.isConnected)return;
    const base=conversation.getBoundingClientRect(),head=header?.getBoundingClientRect(),layout=window.__KINDRED_IOS_LAYOUT||{};
    let left=base.left+12,right=base.right-12,top=head?.height?head.bottom+6:base.top+Math.max(64,Number(layout.topInset)||0);
    const reserved=(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions||[]).filter(r=>r&&r.active!==false&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0);
    // The front display's camera, not the toolbar's union of buttons, defines
    // its optical center. Keep the same 12px gap at both usable screen edges.
    if(layout.isDuo&&!layout.isDuoInner)for(const r of reserved){if(r.kind==='occlusion'&&r.x>base.left+base.width/2&&r.x<base.right)right=Math.min(right,r.x-12);}
    // Duo's rail is localized, so a bottom composer inset cannot place a top
    // call pill. Project the actual rail/camera/division rectangles instead.
    const panes=[...(conversation.parentElement?.querySelectorAll(':scope > .details-panel:not([hidden]),:scope > .computer-panel:not([hidden])')||[])].filter(p=>['absolute','fixed'].includes(getComputedStyle(p).position)).map(p=>{
      // The pane's finite entry motion must not leave call controls underneath
      // it between layout ticks. Reserve its final fixed frame immediately.
      const style=p.style,r=p.getBoundingClientRect();return p.classList.contains('pane-layout-frame')?{x:parseFloat(style.left),y:parseFloat(style.top),width:parseFloat(style.width),height:parseFloat(style.height),pane:true}:{...r.toJSON(),pane:true};
    });
    const regions=[...panes,window.__KINDRED_IOS_TOOLBAR,...reserved].filter(r=>r&&r.active!==false&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0);
    for(const r of regions){
      if(r.y>=top+tray.offsetHeight||r.y+r.height<=top||r.x>=right||r.x+r.width<=left)continue;
      const before=r.x-left,after=right-r.x-r.width;
      if(Math.max(before,after)<240&&!r.pane){top=r.y+r.height+8;continue;}
      if(r.pane&&Math.max(before,after)<52)continue;
      if(before>=after)right=r.x-12;else left=r.x+r.width+12;
    }
    tray.dataset.compact=String(panes.length>0&&right-left<280);
    const values={left:Math.max(0,left-base.left)+'px',right:Math.max(0,base.right-right)+'px',top:Math.max(0,top-base.top)+'px'};
    for(const [key,value] of Object.entries(values))if(layer.style[key]!==value)layer.style[key]=value;
    const clearance=Math.max(0,top-base.top+tray.offsetHeight+10)+'px';if(conversation.style.getPropertyValue('--voice-clearance')!==clearance)preserveReading(()=>conversation.style.setProperty('--voice-clearance',clearance));
  }
  const queuePosition=()=>{if(!tray.hidden&&!positionFrame)positionFrame=requestAnimationFrame(positionTray);};
  const boundsObserver=new ResizeObserver(queuePosition);boundsObserver.observe(conversation);if(header)boundsObserver.observe(header);boundsObserver.observe(tray);
  const paneObserver=new MutationObserver(queuePosition);for(const pane of conversation.parentElement?.querySelectorAll(':scope > .details-panel,:scope > .computer-panel')||[]){boundsObserver.observe(pane);paneObserver.observe(pane,{attributes:true,attributeFilter:['class','style','hidden']});}
  new ResizeObserver(resizeWave).observe(wave);
  for(const name of ['resize','kindred-ios-layout','kindred-ios-toolbar','kindred-native-geometry'])window.addEventListener(name,queuePosition);
  function showTray(){
    if(!tray.hidden&&!trayClosing)return;trayMotion?.cancel();trayMotion=null;trayClosing=false;
    preserveReading(()=>{tray.hidden=false;tray.inert=false;tray.removeAttribute('aria-hidden');positionTray();resizeWave();});
    if(!reducedMotion())trayMotion=tray.animate([{opacity:0,transform:'translateY(-12px) scale(.94)'},{opacity:1,transform:'none'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  function hideTray(immediate=false){
    if(tray.hidden||trayClosing&&!immediate)return;trayMotion?.cancel();trayMotion=null;trayClosing=true;tray.inert=true;tray.setAttribute('aria-hidden','true');
    const finish=()=>preserveReading(()=>{tray.hidden=true;trayClosing=false;trayMotion=null;conversation.style.removeProperty('--voice-clearance');});
    if(immediate||reducedMotion()){finish();return;}
    const motion=trayMotion=tray.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-18px) scale(.86)'}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
    motion.finished.then(()=>{if(trayMotion===motion){finish();motion.cancel();}}).catch(()=>{});
  }
  function levels(op){
    if(operation!==op||document.hidden)return;const now=Date.now();
    if(!op.native){const at=op.audio?.currentTime||0;while(op.outputLevels?.length&&op.outputLevels[0].end<=at)op.outputLevels.shift();const current=op.outputLevels?.[0];op.outputLevel=current&&current.at<=at?current.rms:0;}
    else if(now-(op.nativeLevelAt||0)>250){op.inputLevel=0;op.outputLevel=0;}
    const active=op.phase==='active'&&!op.captureProblem,input=active&&!op.muted&&now-(op.native?op.nativeLevelAt||0:op.lastFrame||0)<250?op.inputLevel||0:0,output=active?op.outputLevel||0:0;
    const speaking=output>.006;if(speaking)op.speakingUntil=now+150;
    const wasSpeaking=tray.dataset.speaking==='true';if(wasSpeaking!==(now<op.speakingUntil))render();
    const hearing=String(input>.006);if(tray.dataset.hearing!==hearing)tray.dataset.hearing=hearing;
    const interval=reducedMotion()?250:100;if(now-(op.lastVisualAt||0)<interval)return;op.lastVisualAt=now;
    op.visualInput=input;op.visualOutput=output;paintWave(op);
  }
  const audioContext=()=>{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('Audio is unavailable in this app.');return new Context({latencyHint:'interactive'});};
  const bounded=(promise,ms,message)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));};
  function effectsContext(){
    clearTimeout(effectsIdle);if(!effects||effects.state==='closed')effects=audioContext();
    // Called directly by the click handler, before permission/network awaits.
    const ready=effects.resume();ready.catch(()=>{});return {context:effects,ready};
  }
  function idleEffects(){clearTimeout(effectsIdle);effectsIdle=setTimeout(()=>{if(!preview&&!cueNodes.size)void effects?.suspend().catch(()=>{});},800);}
  function stopTones(){cueRevision++;for(const [source,gain] of cueNodes){source.onended=null;try{source.stop();source.disconnect();gain.disconnect();}catch{}}cueNodes.clear();}
  function cue(kind,op){
    if(op?.native)return;try{
      const {context,ready}=effectsContext();stopTones();const version=cueRevision;
      void ready.then(()=>{if(version!==cueRevision||effects!==context||context.state!=='running'||(operation!==op&&!['ended','error'].includes(kind)))return;
        for(const [frequency,delay,duration] of callTones[kind]){const source=context.createOscillator(),gain=context.createGain(),at=context.currentTime+.015+delay;source.type='sine';source.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);source.connect(gain).connect(context.destination);cueNodes.set(source,gain);source.onended=()=>{cueNodes.delete(source);source.disconnect();gain.disconnect();idleEffects();};source.start(at);source.stop(at+duration+.015);}
      }).catch(()=>{});
    }catch{} // A cue must never prevent ending or starting a call.
  }
  function finalCue(op,error){if(op.cueEnded)return;op.cueEnded=true;cue(error?'error':'ended',op);}
  function renderPreview(){
    const control=settings?.querySelector('.voice-preview');if(!control)return;
    const active=!!preview,label=active?'Stop voice preview':'Preview '+(config?.voices?.find(v=>v.id===config.voice)?.name||'voice');
    control.disabled=!config?.configured||!!operation||settings.dataset.saving==='true';control.title=label;control.setAttribute('aria-label',label);control.setAttribute('aria-pressed',String(active));control.setAttribute('aria-busy',String(preview?.phase==='loading'));control.replaceChildren(icon(active?'stop':'play',16));
  }
  function stopPreview(){const old=preview;preview=null;if(old){clearInterval(old.check);old.controller.abort();if(old.source){old.source.onended=null;try{old.source.stop();old.source.disconnect();}catch{}}}renderPreview();idleEffects();}
  async function previewVoice(){
    if(preview){stopPreview();return;}if(operation||!config?.configured||!config.voice)return;
    const error=settings.querySelector('.voice-settings-error');error.textContent='';const current=revision,owner=settings;
    const sample=preview={controller:new AbortController(),phase:'loading'};renderPreview();
    sample.check=setInterval(()=>{if(!owner.isConnected||!owner.querySelector('details').open)stopPreview();},250);
    try{
      const {context,ready}=effectsContext();await bounded(ready,3000,'Audio playback is paused. Try preview again.');if(preview!==sample)return;
      const blob=await api('/voice/preview','POST',{voice:config.voice},{responseType:'blob',maxBlobBytes:1500000,signal:sample.controller.signal,timeoutMs:35000});
      if(preview!==sample||current!==revision)return;if(!blob.type.startsWith('audio/'))throw Error('The voice preview could not be played.');
      const buffer=await context.decodeAudioData(await blob.arrayBuffer());if(preview!==sample||current!==revision)return;
      if(context.state!=='running')await bounded(context.resume(),3000,'Audio playback is paused. Try preview again.');if(preview!==sample||current!==revision)return;
      const source=sample.source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.onended=()=>{if(preview===sample)stopPreview();};sample.phase='playing';source.start();renderPreview();
    }catch(e){if(preview===sample&&current===revision){stopPreview();error.textContent=e.message||'The voice preview could not be played.';}}
  }
  function render(){
    const active=!!operation,ready=!!config?.configured&&config.enabled&&!!bot()&&chatId()?.startsWith('dm-')&&!composer.matches('.has-files,.is-replying,.is-answering,.is-request-activating,.is-dictating');
    const changed=composer.classList.contains('is-voice-calling')!==active;
    composer.classList.toggle('is-voice-calling',active);composer.classList.toggle('voice-ready',ready&&!active&&!editor.value?.trim());
    startButton.hidden=!ready||active||!!editor.value?.trim();if(active&&operation.phase!=='ending')showTray();else hideTray();
    if(active){status.textContent=operation.phase==='connecting'?'Connecting…':operation.phase==='ending'?'Ending call…':operation.muted?'Microphone muted':operation.captureProblem||(matchMedia('(max-width: 600px)').matches?(Date.now()<operation.speakingUntil?'Speaking…':'Listening…'):operation.bot.name+(Date.now()<operation.speakingUntil?' is speaking':' is listening'));time.textContent=stamp(operation.started?Math.max(0,Math.floor(((operation.endedAt||Date.now())-operation.started)/1000)):0);mute.disabled=operation.phase!=='active';if(mute.dataset.muted!==String(operation.muted)){mute.dataset.muted=String(operation.muted);mute.replaceChildren(icon(operation.muted?'mic-off':'mic',18));}mute.title=operation.muted?'Unmute microphone':'Mute microphone';mute.setAttribute('aria-pressed',String(operation.muted));mute.setAttribute('aria-label',operation.muted?'Unmute microphone':'Mute microphone');tray.dataset.speaking=String(Date.now()<operation.speakingUntil);}
    const showingStatus=String(active&&(operation.phase==='connecting'||!!operation.captureProblem));if(tray.dataset.status!==showingStatus)tray.dataset.status=showingStatus;
    if(active)portrait.title=operation.bot.name+' · '+time.textContent;
    if(settings?.isConnected){const enabled=settings.querySelector('input');enabled.checked=!!config?.enabled;enabled.disabled=!config?.configured||active||settings.dataset.saving==='true';for(const select of settings.querySelectorAll('select')){select.disabled=!config?.configured||settings.dataset.saving==='true';select.value=select.classList.contains('voice-pace')?(config?.pace||'normal'):(config?.voice||'');}settings.querySelector('.voice-next-call').hidden=!active;settings.querySelector('.voice-summary-state').textContent=!config?'Unavailable':!config.configured?'Not connected':config.enabled?'On':'Off';renderPreview();}
    if(changed)composer.dispatchEvent(new CustomEvent('kindred-voice-layout',{bubbles:true}));
  }
  async function init(){
    const current=++revision;config=null;stopPreview();render();
    try{const result=await api('/voice/settings');if(current!==revision)return;config=result;render();return result;}catch{if(current===revision){config=null;render();}}
  }
  function settingsSection(){
    stopPreview();settings=node('section','settings-section voice-settings');const details=node('details','settings-pane voice-options'),summary=node('summary');summary.append(icon('chevron',14),node('span','','Voice (OpenAI API)'),node('span','muted small','Experimental'),node('span','muted small voice-summary-state'));
    const body=node('div','voice-settings-body'),enabled=node('input');enabled.type='checkbox';enabled.disabled=true;enabled.setAttribute('role','switch');const label=node('label','setting-row','Enable voice calls');label.append(enabled);
    const select=node('select','voice-choice');select.disabled=true;select.setAttribute('aria-label','Voice');const voiceRow=node('div','setting-row'),voiceLabel=node('span','','Voice'),choices=node('div','voice-selection'),play=button('Preview voice','play',()=>void previewVoice(),'voice-preview');choices.append(select,play);voiceRow.append(voiceLabel,choices);
    const pace=node('select','voice-pace'),paceRow=node('label','setting-row','Speaking pace');pace.setAttribute('aria-label','Speaking pace');for(const value of ['slower','normal','faster']){const option=node('option','',value[0].toUpperCase()+value.slice(1));option.value=value;pace.append(option);}paceRow.append(pace);
    const nextCall=node('p','muted small voice-next-call','Voice changes apply to your next call. Speaking pace updates during this call.');nextCall.hidden=!operation;
    const note=node('p','muted small'),context=node('p','muted small','Talk and get results in the call. A short recap with useful links appears in chat afterward.'),error=node('p','muted small voice-settings-error');error.setAttribute('role','status');
    const connect=node('button','subtle-button','Connect OpenAI in Connections');connect.type='button';connect.onclick=()=>openSettings('connections');
    body.append(label,voiceRow,paceRow,nextCall,note,context,error,connect);details.append(summary,body);settings.append(details);details.addEventListener('toggle',()=>{if(!details.open)stopPreview();});
    const owner=settings;
    const populate=()=>{if(settings!==owner)return;select.replaceChildren();for(const voice of config?.voices||[]){const option=node('option','',voice.name);option.value=voice.id;select.append(option);}select.value=config?.voice||'';note.textContent=config?.configured?'AI voice · Calls, tools, recaps and previews use your OpenAI API credits.':'Connect an OpenAI API key to enable calls.';connect.hidden=!!config?.configured;render();};
    const save=async()=>{if(owner.dataset.saving==='true')return;const changes={enabled:enabled.checked,voice:select.value,pace:pace.value};stopPreview();owner.dataset.saving='true';render();error.textContent='';const current=revision;try{const result=await api('/voice/settings','PUT',changes);if(current!==revision)return;config=result;}catch(e){if(current===revision)error.textContent=e.message;}finally{owner.dataset.saving='false';if(current===revision)populate();}};
    enabled.onchange=save;select.onchange=save;pace.onchange=save;populate();void init().then(populate);return settings;
  }
  function releaseAudio(op){
    clearInterval(op.ping);clearInterval(op.captureWatch);clearInterval(op.levelWatch);clearTimeout(op.timeout);op.cancelCapture?.();op.cancelCapture=null;
    if(op.audio)op.audio.onstatechange=null;op.capture&&(op.capture.onprocessorerror=null);op.capture?.disconnect();op.source?.disconnect();op.silent?.disconnect();op.stream?.getTracks().forEach(track=>track.stop());
    for(const source of op.playing||[])try{source.stop();}catch{}op.playing?.clear();void op.audio?.close().catch(()=>{});op.audio=null;
  }
  function complete(op,message){
    if(operation!==op)return;finalCue(op,message);operation=null;clearInterval(clock);releaseAudio(op);op.socket?.close();render();
    if(message)notice(message,true);onEnded();
  }
  function event(op,value){
    if(operation!==op)return;
    if(value.type==='started'){if(op.phase==='ending')return;const fresh=op.phase!=='active';op.phase='active';op.started=value.started_ms||Date.now();if(typeof value.muted==='boolean')op.muted=value.muted;clearTimeout(op.timeout);if(fresh)cue('connected',op);render();}
    else if(value.type==='audio'&&op.phase==='active'){
      try{const raw=atob(value.data);if(raw.length>96000||raw.length%2)throw Error('Invalid audio');const samples=new Float32Array(raw.length/2);for(let i=0;i<samples.length;i++){let n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);if(n>32767)n-=65536;samples[i]=n/32768;}const context=op.audio;if(!context)return;const at=Math.max(context.currentTime+.02,op.nextAudio||0);if(at-context.currentTime>3)throw Error('Audio playback fell behind');const buffer=context.createBuffer(1,samples.length,24000);buffer.copyToChannel(samples,0);const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);op.playing.add(source);source.onended=()=>op.playing.delete(source);source.start(at);op.nextAudio=at+buffer.duration;
        // GPT Live also streams silent PCM. Meter actual scheduled sound, not
        // packet arrival, so idle audio cannot look or read as bot speech.
        for(let offset=0;offset<samples.length;offset+=960){let sum=0,count=0;const end=Math.min(samples.length,offset+960);for(let i=offset;i<end;i+=4){sum+=samples[i]*samples[i];count++;}op.outputLevels.push({at:at+offset/24000,end:at+end/24000,rms:Math.sqrt(sum/count)});}
      }catch{void endCall('Audio playback stopped. Call again to reconnect.');}
    }else if(value.type==='levels'&&op.native){op.nativeLevelAt=Date.now();op.inputLevel=Number.isFinite(value.input)?Math.max(0,Math.min(1,value.input)):0;op.outputLevel=Number.isFinite(value.output)?Math.max(0,Math.min(1,value.output)):0;levels(op);}
    else if(value.type==='speaking'&&op.native){op.speakingUntil=Date.now()+150;}
    else if(value.type==='mute'){op.muted=value.muted===true;if(op.muted){op.visualInput=0;paintWave(op);tray.dataset.hearing='false';}render();}
    else if(value.type==='options_error'){const error=callOptions?.querySelector('.voice-options-error')||settings?.querySelector('.voice-settings-error');if(error?.isConnected)error.textContent=value.message;else notice(value.message,true);}
    else if(value.type==='ending'){op.phase='ending';op.endedAt=op.endedAt||Date.now();render();}
    else if(value.type==='ended')complete(op,value.saved===false?'Your call ended, but its transcript is still waiting to be saved.':op.error);
    else if(value.type==='error'){op.error=value.message||'The voice connection ended.';if(value.terminal===true)complete(op,op.error);}
  }
  function captureHealth(op){
    if(operation!==op||op.phase==='ending'||!op.audio)return;
    const now=Date.now(),track=op.stream?.getAudioTracks()[0];
    if(track?.readyState==='ended'){void endCall('Microphone access ended. Call again when it is available.');return;}
    if(op.audio.state!=='running'){
      op.captureProblem='Reconnecting microphone…';render();
      if(!op.resuming){op.resuming=true;void bounded(op.audio.resume(),3000,'Microphone audio is paused. Call again to reconnect.').then(()=>{if(operation!==op||op.phase==='ending')return;if(op.audio?.state!=='running')throw Error('Microphone audio is paused. Call again to reconnect.');op.lastFrame=Date.now();op.captureProblem='';render();}).catch(e=>{if(operation===op)void endCall(e.message);}).finally(()=>op.resuming=false);}
      return;
    }
    const unavailable=!op.muted&&track?.muted;
    if(unavailable){op.unavailableSince||=now;op.captureProblem='Microphone unavailable';}else{op.unavailableSince=0;op.captureProblem='';}
    if(op.firstFrame&&!op.muted&&((op.unavailableSince&&now-op.unavailableSince>4000)||now-op.lastFrame>5000))void endCall('Your microphone stopped sending audio. Check your input device, then call again.');
  }
  async function prepareCapture(op){
    if(!navigator.mediaDevices?.getUserMedia)throw Error('This app cannot access the microphone. Check microphone permissions.');
    // WebKit needs activation in the click, not after the permission prompt. Use
    // the device's rate; the worklet converts every supported rate to 24 kHz.
    op.audio=audioContext();const unlocked=op.audio.resume();unlocked.catch(()=>{});
    op.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(operation!==op){releaseAudio(op);return;}
    await bounded(unlocked,3000,'Microphone audio is paused. Call again to reconnect.');
    await bounded(op.audio.resume(),3000,'Microphone audio is paused. Call again to reconnect.');
    if(operation!==op){releaseAudio(op);return;}if(op.audio.state!=='running')throw Error('Microphone audio is paused. Call again to reconnect.');
    await bounded(op.audio.audioWorklet.addModule('/voice-audio-worklet.js'),5000,'Microphone audio could not start. Try calling again.');if(operation!==op){releaseAudio(op);return;}
    const firstFrame=new Promise((resolve,reject)=>{op.captureReady=resolve;op.cancelCapture=()=>reject(Error('Call cancelled.'));});
    // Attach rejection handling before cancellation or processor errors can fire.
    const ready=bounded(firstFrame,6000,'Your microphone is not sending audio. Check your input device, then call again.');ready.catch(()=>{});
    op.source=op.audio.createMediaStreamSource(op.stream);op.capture=new AudioWorkletNode(op.audio,'kindred-voice-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});op.silent=op.audio.createGain();op.silent.gain.value=0;
    op.capture.port.onmessage=e=>{
      if(operation!==op||op.phase==='ending'||!(e.data instanceof ArrayBuffer)||e.data.byteLength!==1920)return;
      op.lastFrame=Date.now();const track=op.stream.getAudioTracks()[0];
      if(!op.firstFrame&&!track?.muted&&track?.readyState!=='ended'){op.firstFrame=true;op.captureReady();op.cancelCapture=null;}
      if(op.phase!=='active'||op.socket?.readyState!==1)return;
      if(op.socket.bufferedAmount>128000){void endCall('The call connection is too slow. Try again.');return;}
      const bytes=new Uint8Array(e.data),samples=new Int16Array(e.data);let s='',sum=0;for(const byte of bytes)s+=String.fromCharCode(byte);for(let i=0;i<samples.length;i+=4)sum+=(samples[i]/32768)**2;op.inputLevel=Math.sqrt(sum/(samples.length/4));
      op.socket.send(JSON.stringify({type:'audio',data:btoa(s)}));
    };
    op.capture.onprocessorerror=()=>{op.cancelCapture?.();if(operation===op)void endCall('Microphone audio stopped. Call again to reconnect.');};
    op.audio.onstatechange=()=>captureHealth(op);op.captureWatch=setInterval(()=>captureHealth(op),1000);
    op.stream.getAudioTracks().forEach(track=>track.addEventListener?.('ended',()=>{if(operation===op)void endCall('Microphone access ended. Call again when it is available.');},{once:true}));
    op.source.connect(op.capture).connect(op.silent).connect(op.audio.destination);
    // A connected provider is not proof of a working microphone. Require actual
    // PCM frames (silence is valid) before creating the billable provider session.
    await ready;
  }
  async function start(){
    if(operation)return;if(!config?.enabled||!config.configured){openSettings('general');return;}
    const selected=bot(),chat=chatId();if(!selected||!chat?.startsWith('dm-'))return;
    stopPreview();cancelDictation();editor.blur();
    const op=operation={phase:'connecting',bot:selected,chat,muted:false,started:0,speakingUntil:0,outputLevels:[],visualInput:0,visualOutput:0,playing:new Set(),generation:revision,native:!!native()};
    // A completed WKWebView preview must yield its audio session to native calls.
    if(op.native){stopTones();clearTimeout(effectsIdle);void effects?.close().catch(()=>{});effects=null;}
    portrait.replaceChildren(avatar(selected));tray.setAttribute('aria-label','Voice call with '+selected.name);syncWaveColor();paintWave(op);render();clock=setInterval(render,1000);op.levelWatch=setInterval(()=>levels(op),100);cue('connecting',op);
    try{
      if(!op.native)await prepareCapture(op);if(operation!==op){releaseAudio(op);return;}
      const call=await api('/voice/start','POST',{chat_id:chat});if(operation!==op){releaseAudio(op);return;}op.id=call.id;
      op.timeout=setTimeout(()=>{void endCall('The call did not connect. Try again.');},25000);
      if(op.native){const art=portrait.firstElementChild;postNative('start',{id:call.id,ticket:call.ticket,chatID:chat,botName:selected.name,shape:art?.dataset.avatarBody||art?.dataset.shape||selected.profile?.shape||'round',color:art?.dataset.avatarColor||selected.profile?.color||'#2475ff'});return;}
      const url=new URL('/voice',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',call.ticket);
      const socket=op.socket=new WebSocket(url);socket.onmessage=e=>{try{event(op,JSON.parse(e.data));}catch{void endCall('The call connection returned unreadable data.');}};
      socket.onclose=()=>{if(operation===op)complete(op,op.phase==='ending'?op.error:'Call disconnected. The transcript so far is kept.');};socket.onerror=()=>{op.error='Could not connect the call. Check your OpenAI API key and connection.';};
      socket.onopen=()=>{if(operation!==op){socket.close();return;}op.ping=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},10000);};
    }catch(e){if(operation===op)complete(op,e.name==='NotAllowedError'?'Allow microphone access to make a call.':e.message||'The call could not start.');else releaseAudio(op);}
  }
  function setMuted(value){const op=operation;if(!op||op.phase!=='active')return;op.muted=value;op.lastFrame=Date.now();if(value){op.visualInput=0;paintWave(op);tray.dataset.hearing='false';}if(op.native)postNative('mute',{id:op.id,muted:value});else{op.capture?.port.postMessage({muted:value});op.stream?.getAudioTracks().forEach(t=>t.enabled=!value);if(op.socket?.readyState===1)op.socket.send(JSON.stringify({type:'mute',muted:value}));}render();}
  async function endCall(message){const op=operation;if(!op||op.phase==='ending')return;op.phase='ending';op.endedAt=Date.now();op.error=message;finalCue(op,message);releaseAudio(op);render();if(op.native&&op.id)postNative('end',{id:op.id});else if(op.socket?.readyState===1)op.socket.send(JSON.stringify({type:'end'}));else{complete(op,message);return;}op.timeout=setTimeout(()=>complete(op,message),16000);}
  function reset(){revision++;callOptions?.close();config=null;stopPreview();const old=operation;void endCall();if(old)complete(old);hideTray(true);stopTones();clearTimeout(effectsIdle);void effects?.close().catch(()=>{});effects=null;render();}
  function syncWaveColor(){wave.style.setProperty('--voice-color',portrait.firstElementChild?.dataset.avatarColor||operation?.bot.profile?.color||'var(--fg)');}
  new MutationObserver(syncWaveColor).observe(portrait,{subtree:true,attributes:true,attributeFilter:['data-avatar-color']});
  window.addEventListener('kindred-ios-voice',e=>{if(operation?.native&&e.detail?.id===operation.id&&e.detail.documentID===window.__KINDRED_IOS_VOICE?.documentID)event(operation,e.detail);});
  window.addEventListener('pagehide',()=>{stopPreview();void endCall();stopTones();void effects?.close().catch(()=>{});effects=null;});editor.addEventListener('input',render);
  const syncNative=()=>{if(operation?.native&&operation.id&&!document.hidden)postNative('status',{id:operation.id});else if(operation&&!document.hidden)captureHealth(operation);};
  document.addEventListener('visibilitychange',syncNative);window.addEventListener('focus',syncNative);
  return {init,render,settingsSection,reset,endCall,canNavigate:target=>{if(operation&&target!==operation.chat){notice('Finish your call with '+operation.bot.name+' before switching chats.');return false;}return true;}};
}
