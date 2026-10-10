// Device-local preferences. Recording begins only after an explicit microphone click.
export function createDictationUI({editor,send,composer,nativeInvoke,chatId,hasFiles,notice,icon}) {
  const nativeAvailable=()=>window.__KINDRED_NATIVE_DICTATION===true&&window.__KINDRED_DESKTOP?.platform==='macos';
  const iosCapability=()=>window.__KINDRED_IOS_DICTATION;
  const iosAvailable=()=>iosCapability()?.supported===true&&iosCapability()?.protocolVersion===1&&iosCapability()?.engine==='apple-on-device'&&iosCapability()?.onDeviceOnly===true&&typeof iosCapability()?.documentID==='string'&&iosCapability().documentID.length>0&&iosCapability().documentID.length<=128&&!!window.webkit?.messageHandlers?.kindredDictation;
  const key=iosAvailable()?'kindred-ios-dictation-v1':'kindred-dictation-v1';let preferences={enabled:iosAvailable(),model:iosAvailable()?'ios':'',microphone:'default'};
  try {const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved.enabled==='boolean'&&typeof saved.model==='string')preferences={...preferences,...saved};}catch{}
  if(iosAvailable())preferences.model='ios';
  if(typeof preferences.microphone!=='string'||preferences.microphone.length>512)preferences.microphone='default';
  if(preferences.model && !preferences.model.startsWith('local:') && !(preferences.model==='native'&&nativeAvailable()) && !(preferences.model==='ios'&&iosAvailable())){preferences.enabled=false;preferences.model='';}
  const usesIOS=()=>preferences.model==='ios'&&iosAvailable();
  const usesNative=()=>preferences.model==='native'&&nativeAvailable();
  const available=()=>window.__KINDRED_DICTATION_MODELS===true;
  const modelCatalogue=[['whistle','Whistle',16919407],['base','Base',59707625],['small','Small',190085487],['medium','Medium',539212467],['large-v3-turbo','Large v3 Turbo',574041195],['large-v3','Large v3',1081140203]];
  let settingsEvents=null,renderedStop=null;
  let generation=0,phase='idle',stream=null,context=null,processor=null,source=null,mute=null,chunks=[],samples=0,timer=null,native={phase:'off'},settings=null,poll=null,liveTimer=null,inflight=null,lastDecodedSpeech=0,lastAudibleSample=0,lastRequestAt=0,decodeDuration=0,session=null,rate=16000;
  // Utterance segmentation: completed utterances are kept as text and their audio
  // is excluded from later decodes. Boundaries are only placed inside verified
  // silence (every 20 ms frame below the floor), never between words.
  let utteranceStart=0,decodedStart=0,decodedEnd=0,decodedText='',pauses=[];
  const pauseSeconds=.8,padSeconds=.3;
  const mic=document.createElement('button');mic.type='button';mic.className='dictation-button';mic.hidden=true;send.before(mic);
  const status=document.createElement('span');status.className='dictation-status';status.setAttribute('role','status');status.hidden=true;mic.before(status);
  const statusLabel=document.createElement('span'),elapsed=document.createElement('span');elapsed.setAttribute('aria-hidden','true');elapsed.hidden=true;status.append(statusLabel,elapsed);
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='icon-button dictation-cancel';cancelButton.title='Cancel dictation';cancelButton.setAttribute('aria-label','Cancel dictation');cancelButton.append(icon('close'));cancelButton.hidden=true;mic.before(cancelButton);
  const save=()=>localStorage.setItem(key,JSON.stringify(preferences));
  let iosOperation=null,iosDeadline=null,iosTick=null,iosCaret=null,writingTranscript=false;
  const iosErrors={
    'on-device-unavailable':'On-device dictation is unavailable for this language.',
    'speech-denied':'Kindred needs microphone and speech recognition access to dictate. You can allow it in Settings.',
    'microphone-denied':'Kindred needs microphone and speech recognition access to dictate. You can allow it in Settings.',
    'speech-restricted':'Dictation is restricted on this iPhone.',
    'speech-timeout':'Speech permission did not respond. Try again.',
    'microphone-timeout':'Microphone permission did not respond. Try again.',
    'not-foreground':'Open Kindred to dictate.',
    'audio-start-failed':'The microphone could not start. Try again.',
    'recognizer-unavailable':'Dictation is temporarily unavailable. Try again in a moment.',
    'recognition-failed':'Dictation stopped. The words so far were kept.',
    'transcript-limit':'Dictation reached its text limit. The words so far were kept.',
    'audio-interrupted':'Dictation stopped. The words so far were kept.',
    timeout:'Transcription took too long. The words already shown have been kept.'
  };
  function iosOperationID(){
    // getRandomValues is available on supported private HTTP WKWebView origins.
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function iosMessage(action,operation=iosOperation){
    if(!iosAvailable())return false;
    const chat=operation?.chat||chatId();
    window.webkit.messageHandlers.kindredDictation.postMessage({action,...(operation?.id?{operationID:operation.id}:{}),...(chat?{chatID:chat}:{}),documentID:operation?.document||iosCapability().documentID});return true;
  }
  function iosWait(milliseconds){clearTimeout(iosDeadline);iosDeadline=setTimeout(()=>{if(iosOperation){if(phase==='recording'){void stop();notice('Dictation stops after 1 minute. Tap the microphone to continue.');}else{endIOS('cancel');notice(iosErrors.timeout,true);}}},milliseconds);}
  function endIOS(action,discard=false,restoreFocus=true){
    const operation=iosOperation;iosOperation=null;clearTimeout(iosDeadline);iosDeadline=null;clearInterval(iosTick);iosTick=null;
    if(operation&&action)iosMessage(action,operation);
    // Explicit Cancel removes this span; interruption commits the visible preview.
    if(discard&&session?.span?.isConnected){session.span.remove();session=null;editor.dispatchEvent(new Event('input',{bubbles:true}));}
    else if(session?.span?.isConnected)finishTranscript(false,restoreFocus&&operation?.focused===true);else session=null;
    generation++;phase='idle';render();
  }
  function iosEvent(event){
    const value=event.detail,operation=iosOperation;
    if(!operation||!value||value.operationID!==operation.id||value.documentID!==operation.document||value.chatID!==operation.chat||chatId()!==operation.chat||iosCapability()?.documentID!==operation.document)return;
    if(!Number.isSafeInteger(value.sequence)||value.sequence<=operation.sequence)return;
    if(!['authorizing','recording','finishing','partial','final','stopped','cancelled','error'].includes(value.phase))return;
    if(value.text!==undefined&&(typeof value.text!=='string'||new TextEncoder().encode(value.text).length>16384))return;
    operation.sequence=value.sequence;
    if(!session?.span?.isConnected||session.span.textContent!==(session.text?session.leading+session.text+session.trailing:'')){endIOS('cancel');return;}
    if(['partial','final','stopped','error','cancelled'].includes(value.phase)&&typeof value.text==='string')showTranscript(value.text||'',operation.generation);
    if(value.phase==='authorizing')phase='starting';
    if(value.phase==='recording'){phase='recording';operation.started=Date.now();elapsed.textContent=' 0:00';iosWait(60000);clearInterval(iosTick);iosTick=setInterval(()=>{const seconds=Math.floor((Date.now()-operation.started)/1000);elapsed.textContent=` ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;},1000);}
    if(value.phase==='finishing'){phase='finishing';iosWait(10000);if(value.errorCode==='duration-limit')notice('Dictation stops after 1 minute. Tap the microphone to continue.');}
    if(['final','stopped','cancelled','error'].includes(value.phase)){
      if(['final','stopped'].includes(value.phase)&&!session.text)notice('No speech detected. Try again.');
      if(value.phase==='cancelled'&&value.reason==='background')notice('Dictation stopped. The words so far were kept.');
      if(value.errorCode==='finalization-timeout')notice('Transcription took too long. The words already shown have been kept.',true);
      endIOS(null,value.phase==='cancelled'&&['cancelled','context-changed','account-changed','session-ended','navigation'].includes(value.reason||value.errorCode));if(value.phase==='error')notice(iosErrors[value.errorCode]||'Dictation stopped. The words already shown have been kept.',true,['speech-denied','microphone-denied'].includes(value.errorCode)?{label:'Open Settings',run:()=>iosMessage('settings')}:null);
    }else render();
  }
  window.addEventListener('kindred-ios-dictation',iosEvent);
  window.addEventListener('kindred-ios-dictation-capability',()=>{
    if(iosOperation&&(!iosAvailable()||iosOperation.document!==iosCapability()?.documentID||iosCapability()?.onDeviceAvailable!==true))endIOS('cancel',iosOperation.document!==iosCapability()?.documentID);
    renderedComposerState=null;render();
  });
  let iosChat=null;
  let renderedComposerState;
  function render(){
    if(iosOperation&&iosOperation.chat!==chatId())endIOS('cancel',true);
    if(usesIOS()&&iosChat!==chatId()){iosChat=chatId();iosMessage('context');}
    const active=phase!=='idle',text=!!editor.value?.trim()||hasFiles(),enabled=preferences.enabled&&(preferences.model!=='ios'||iosAvailable()&&iosCapability().onDeviceAvailable===true),primary=enabled&&!(iosOperation?iosOperation.content:text);
    const renderKey=JSON.stringify([enabled,text,phase,!!inflight,!!iosOperation?.content]);
    if(renderKey===renderedComposerState){if(settings?.isConnected)renderSettingsStatus();return;}
    renderedComposerState=renderKey;
    composer.classList.toggle('dictation-enabled',enabled);composer.classList.toggle('ios-dictation-content',!!iosOperation?.content);composer.classList.toggle('dictation-empty',primary);composer.classList.toggle('is-dictating',active);
    mic.hidden=!enabled;send.hidden=iosOperation?!iosOperation.content:primary||active;mic.classList.toggle('is-primary',primary);mic.classList.toggle('is-recording',phase==='recording'||!!iosOperation&&phase==='finishing');
    mic.disabled=phase==='starting'||phase==='finishing';send.disabled=active;send.setAttribute('aria-disabled',String(active));
    const label=phase==='recording'?'Stop dictating':usesIOS()&&iosCapability().onDeviceAvailable!==true?'On-device dictation unavailable':'Dictate';mic.title=label;mic.setAttribute('aria-label',label);mic.setAttribute('aria-pressed',String(phase==='recording'));
    const stopping=phase==='recording'||!!iosOperation&&phase==='finishing';
    // Status polling must not replace the SVG between pointer-down and pointer-up.
    if(renderedStop!==stopping){mic.replaceChildren(microphone(stopping));renderedStop=stopping;}
    status.hidden=!active;statusLabel.textContent=phase==='recording'?(usesIOS()?'Listening':inflight?'Listening · transcribing speech…':'Listening · live dictation'):phase==='starting'?'Opening microphone…':phase==='finishing'?(usesIOS()?'Finishing…':'Finishing transcription…'):'';elapsed.hidden=!iosOperation||phase!=='recording';cancelButton.hidden=!active;
    if(settings?.isConnected)renderSettingsStatus();
  }
  function microphone(stop=false){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','22');svg.setAttribute('height','22');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',stop?'M7 7h10v10H7z':'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3M9 22h6');path.setAttribute('fill',stop?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  async function release(){
    clearTimeout(timer);timer=null;clearTimeout(liveTimer);liveTimer=null;if(processor){processor.onaudioprocess=null;processor.disconnect();}source?.disconnect();mute?.disconnect();stream?.getTracks().forEach(track=>track.stop());stream=null;processor=null;source=null;mute=null;
    const closing=context;context=null;if(closing&&closing.state!=='closed')await deviceReply(closing.close(),'Audio cleanup timed out.',1500).catch(()=>{});
  }
  async function cancel(){
    if(iosOperation){endIOS('cancel',true);return;}
    generation++;phase='idle';chunks=[];samples=0;clearTimeout(liveTimer);liveTimer=null;
    if(session?.span?.isConnected){session.span.remove();editor.dispatchEvent(new Event('input',{bubbles:true}));}
    session=null;inflight=null;lastDecodedSpeech=0;lastAudibleSample=0;resetSegments();
    const closing=release(),stopping=available()?deviceReply(nativeInvoke('cancel_dictation'),'Cancellation timed out.',2000).catch(()=>{}):Promise.resolve();render();await Promise.all([closing,stopping]);
  }
  function resetSegments(){utteranceStart=0;decodedStart=0;decodedEnd=0;decodedText='';pauses=[];}
  function beginTranscript(conversation,thisGeneration,capturedRange=null){
    // Empty contenteditables often contain a leftover <br> or <div><br></div>.
    // Clear only an empty draft so these placeholders cannot become a blank line.
    if(!editor.value?.trim())editor.replaceChildren();
    const selection=getSelection(),range=capturedRange|| (selection?.rangeCount?selection.getRangeAt(0).cloneRange():document.createRange());
    if(!editor.contains(range.commonAncestorContainer)){range.selectNodeContents(editor);range.collapse(false);}else range.collapse(false);
    const before=range.cloneRange();before.selectNodeContents(editor);before.setEnd(range.startContainer,range.startOffset);
    const after=range.cloneRange();after.selectNodeContents(editor);after.setStart(range.endContainer,range.endOffset);
    const span=document.createElement('span');span.className='dictation-transcript';span.contentEditable='false';span.dataset.dictation='true';range.insertNode(span);
    session={generation:thisGeneration,conversation,span,leading:before.toString()&&!/\s$/.test(before.toString())?' ':'',trailing:after.toString()&&!/^\s/.test(after.toString())?' ':'',committed:'',current:'',text:''};
  }
  function showTranscript(text,thisGeneration){
    if(thisGeneration!==generation||session?.generation!==thisGeneration||session.conversation!==chatId()||!preferences.enabled||!session.span.isConnected)return;
    text=(text||'').trim();if(!text||text===session.current)return;
    session.current=text;text=session.text=[session.committed,text].filter(Boolean).join(' ');writingTranscript=true;session.span.textContent=session.leading+text+session.trailing;editor.dispatchEvent(new Event('input',{bubbles:true}));writingTranscript=false;
    // Follow the dictated words inside the editor, including WebKit's scrollable
    // contenteditable. Do not scroll the chat or steal the user's selection.
    const range=document.createRange();range.selectNodeContents(session.span.firstChild);range.collapse(false);
    const end=range.getBoundingClientRect(),box=editor.getBoundingClientRect();
    if(end.height&&end.bottom>box.bottom)editor.scrollTop+=end.bottom-box.bottom;
    else if(end.height&&end.top<box.top)editor.scrollTop-=box.top-end.top;
  }
  function finishTranscript(showEmptyNotice=true,restoreFocus=true){
    if(!session)return;const {span,text}=session;
    if(span.isConnected){
      const node=document.createTextNode(span.textContent);span.replaceWith(node);
      const range=document.createRange();range.setStartAfter(node);range.collapse(true);const selection=getSelection();if(restoreFocus){selection.removeAllRanges();selection.addRange(range);}
      editor.dispatchEvent(new Event('input',{bubbles:true}));if(restoreFocus)editor.focus({preventScroll:true});
    }
    session=null;if(!text&&showEmptyNotice)notice('No speech detected. Try again.');
  }
  // Audio from the current utterance start to its last speech plus a short pad.
  // Live previews also re-decode once when a confirmed pause needs its full pad
  // before the utterance can be committed; the final drain decodes new speech only.
  function snapshot(final=false){
    const pad=Math.ceil(rate*padSeconds),speech=lastAudibleSample;
    const fresh=speech>lastDecodedSpeech&&speech>utteranceStart;
    const repad=!final&&speech===lastDecodedSpeech&&speech>utteranceStart&&decodedStart===utteranceStart&&decodedEnd<speech+pad&&samples-speech>=rate*pauseSeconds;
    let end=Math.min(samples,speech+pad),bounded=false;
    if(preferences.model==='local:whistle'&&end-utteranceStart>rate*28){end=utteranceStart+Math.floor(rate*28);bounded=true;}
    // Finish at an observed pause before processing speech beyond that pause.
    const boundary=preferences.model==='local:whistle'&&pauses.find(p=>p>utteranceStart&&p+pad<=end&&!(decodedStart===utteranceStart&&!decodedText&&decodedEnd>=p+pad));
    if(boundary){end=boundary+pad;bounded=false;}
    if((!fresh&&!repad)||end-utteranceStart<rate*.2)return null;
    const recorded=[];let offset=0;
    for(const chunk of chunks){const from=Math.max(0,utteranceStart-offset),to=Math.min(chunk.length,end-offset);if(to>from)recorded.push(chunk.subarray(from,to));offset+=chunk.length;if(offset>=end)break;}
    return {recorded,start:utteranceStart,speech:Math.min(speech,boundary||end),end,bounded};
  }
  async function transcribeSnapshot({recorded,start,speech,end,bounded},thisGeneration){
    const audio=encodeWav(recorded,rate);lastRequestAt=performance.now();
    const began=performance.now();const result=await nativeInvoke('transcribe_dictation',{audio});
    // A result for audio from before the current utterance boundary is stale.
    if(thisGeneration!==generation||start!==utteranceStart)return;
    decodeDuration=performance.now()-began;
    if(bounded){
      // Commit only complete timestamped words, leaving lookahead audio for the
      // next window. Never split raw audio through a word at the 30-second cap.
      const words=(result.words||[]).filter(w=>typeof w.word==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start&&w.end<=24);
      if(!words.length)throw new Error('Whistle could not segment this recording. Try a shorter phrase or another engine.');
      const text=words.map(w=>w.word.trim()).join(' ');showTranscript(text,thisGeneration);
      session.committed=session.text;session.current='';decodedText='';
      utteranceStart=start+Math.floor(words.at(-1).end*rate);lastDecodedSpeech=utteranceStart;
      pauses=pauses.filter(p=>p>utteranceStart);return;
    }
    lastDecodedSpeech=speech;decodedStart=start;decodedEnd=end;decodedText=(result.text||'').trim();showTranscript(decodedText,thisGeneration);commitUtterance();
  }
  // Commit only when the latest decode of this utterance produced visible text,
  // covered all of its speech plus the pad, and that speech ended at a verified
  // pause. Otherwise the utterance stays open and later decodes include it.
  function commitUtterance(){
    const pad=Math.ceil(rate*padSeconds),speech=lastDecodedSpeech;
    if(!session||!decodedText||session.current!==decodedText||decodedStart!==utteranceStart||speech<=utteranceStart||decodedEnd<speech+pad)return;
    if(!pauses.includes(speech)&&!(speech===lastAudibleSample&&samples-speech>=rate*pauseSeconds))return;
    session.committed=session.text;session.current='';decodedText='';utteranceStart=speech+pad;pauses=pauses.filter(p=>p>utteranceStart);
  }
  function scheduleLive(thisGeneration,delay=Math.max(250,Math.min(2500,decodeDuration*.5),1000-(performance.now()-lastRequestAt))){
    if(phase!=='recording'||generation!==thisGeneration)return;
    liveTimer=setTimeout(async()=>{
      if(phase!=='recording'||generation!==thisGeneration)return;
      commitUtterance();const next=snapshot();if(!next){scheduleLive(thisGeneration,500);return;}
      // One decode at a time, with breathing room proportional to inference cost.
      const job=transcribeSnapshot(next,thisGeneration);inflight=job;render();
      try{await job;}catch(e){if(generation===thisGeneration&&phase==='recording'){finishTranscript(false);await cancel();fail(e);return;}}
      finally{if(inflight===job){inflight=null;render();}}
      scheduleLive(thisGeneration);
    },delay);
  }
  async function refreshNative(){
    if(!available())return;
    native=await nativeInvoke('dictation_status');render();
  }
  function watchNative(){
    clearInterval(poll);poll=null;
    if(preferences.enabled&&available()&&!usesNative()){
      let busy=false;poll=setInterval(async()=>{if(busy)return;busy=true;try{await refreshNative();}catch{}finally{busy=false;}},700);
    }
  }
  async function configure(){
    if(usesIOS()){await cancel();iosMessage('context');iosMessage('status');render();return;}
    await cancel();
    if(available())native=await nativeInvoke('configure_dictation',{enabled:preferences.enabled&&!usesNative(),modelName:usesNative()?'':preferences.model.replace(/^local:/,'')});
    watchNative();render();
  }
  async function start(){
    if(!preferences.enabled||!chatId()||phase!=='idle')return;
    const thisGeneration=++generation;phase='starting';if(!usesIOS())render();let stage='model';
    try {
      if(usesIOS()){
        if(iosCapability().onDeviceAvailable!==true)throw new Error(iosErrors['on-device-unavailable']);
        if(iosCapability().recognizerAvailable===false)throw new Error('Dictation is temporarily unavailable. Try again in a moment.');
        const capture=iosCaret;iosCaret=null;beginTranscript(chatId(),thisGeneration,capture?.range);
        iosOperation={id:iosOperationID(),chat:chatId(),document:iosCapability().documentID,generation:thisGeneration,sequence:0,content:!!editor.value?.trim()||hasFiles(),focused:capture?.focused===true};
        render();iosWait(30000);iosMessage('context');iosMessage('start');return;
      }
      if(usesNative()){
        editor.focus({preventScroll:true});
        await nativeInvoke('start_native_dictation');
        if(thisGeneration===generation){phase='idle';render();}
        return;
      }
      if(!available())throw new Error('Update the desktop app to use local dictation.');
      native=await deviceReply(nativeInvoke('dictation_status'),'The speech worker did not respond. Try again.',5000);
      if(thisGeneration!==generation||!preferences.enabled)return;
      if(native.phase!=='ready')throw new Error(native.error||(native.phase==='loading'?'Your dictation model is loading.':'Download and load a dictation model in General settings.'));
      if(!navigator.mediaDevices?.getUserMedia)throw new Error(window.__KINDRED_DESKTOP
        ? 'This desktop build cannot access the microphone. Update Kindred to a build with microphone capture support. Your downloaded Whisper models will be kept.'
        : !window.isSecureContext?'Microphone access requires a secure connection. Open Kindred over HTTPS or localhost.'
        : 'This browser does not support microphone capture. Use the Kindred desktop app or a browser with microphone support.');
      stage='microphone';
      const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,...(preferences.microphone!=='default'?{deviceId:{exact:preferences.microphone}}:{})},video:false});
      if(thisGeneration!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;stage='audio';context=new (window.AudioContext||window.webkitAudioContext)();await deviceReply(context.resume(),'The audio system did not respond. Check your microphone and output device, then retry.',10000);
      if(thisGeneration!==generation)return;
      source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);mute=context.createGain();mute.gain.value=0;chunks=[];samples=0;rate=context.sampleRate;
      processor.onaudioprocess=event=>{
        if(phase!=='recording')return;const data=event.inputBuffer.getChannelData(0),rate=context.sampleRate,remaining=Math.floor(rate*60)-samples;
        const chunk=new Float32Array(data.subarray(0,Math.max(0,remaining)));
        // Use the worker's conservative silence floor in short frames. Keep all
        // original audio, including quiet consonants; only trim the silent tail
        // of a decode and avoid decoding unchanged speech during a pause.
        const frame=Math.ceil(rate*.02);
        for(let i=0;i<chunk.length;i+=frame){const end=Math.min(chunk.length,i+frame);let energy=0;for(let j=i;j<end;j++)energy+=chunk[j]*chunk[j];if(energy/(end-i)>=0.0000004){if(lastAudibleSample&&samples+i-lastAudibleSample>=rate*pauseSeconds)pauses.push(lastAudibleSample);lastAudibleSample=samples+end;}}
        chunks.push(chunk);samples+=chunk.length;if(remaining<=data.length)void stop().catch(fail);
      };
      source.connect(processor);processor.connect(mute);mute.connect(context.destination);lastDecodedSpeech=0;lastAudibleSample=0;resetSegments();decodeDuration=0;lastRequestAt=performance.now();beginTranscript(chatId(),thisGeneration);phase='recording';render();scheduleLive(thisGeneration);timer=setTimeout(()=>void stop().catch(fail),60000);
    }catch(e){if(thisGeneration===generation){await cancel();throw new Error(e.name==='NotAllowedError'?'Microphone access was not allowed. Try again and allow it when prompted, or check microphone permissions in your device or browser settings.':['NotFoundError','OverconstrainedError'].includes(e.name)?'The selected microphone is unavailable. Choose another microphone or System Default in General settings.':stage==='audio'?'Microphone access was allowed, but the audio engine could not start. '+(window.__KINDRED_DESKTOP?.platform==='linux'?'Check the Linux GStreamer audio plugins and your output device. ':'Check your input and output devices. ')+(e.message?'Details: '+e.message.slice(0,200):'Then retry.'):e.message||'The microphone could not start.');}}
  }
  async function stop(){
    if(iosOperation){if(phase==='recording'){phase='finishing';iosWait(10000);iosMessage('stop');render();}return;}
    if(phase!=='recording')return;
    const thisGeneration=generation;
    // Freeze capture, then drain the in-flight result and any speech spoken
    // since its snapshot. Stop must not silently throw away the last words.
    // The final snapshot is taken after the in-flight result, which may have
    // committed an utterance and moved the boundary.
    const pending=inflight;
    phase='finishing';void release();render();
    try{
      await deviceReply((async()=>{
        // A failed live preview must not skip the final captured words. The final
        // snapshot still includes any audio that has not decoded successfully.
        let previewError;try{if(pending)await pending;}catch(error){previewError=error;}
        let drained=false;
        while(thisGeneration===generation){const finalSnapshot=snapshot(true);if(!finalSnapshot)break;await transcribeSnapshot(finalSnapshot,thisGeneration);drained=true;}
        if(!drained&&previewError)throw previewError;
      })(),'Transcription took too long. The words already shown have been kept.',Math.min(120000,Math.max(20000,15000+decodeDuration*1.5*(1+Math.ceil((lastAudibleSample-utteranceStart)/(24*rate))))));
    }catch(e){if(thisGeneration===generation)notice(e.message||'Transcription failed. The words already shown have been kept.',true);}
    if(thisGeneration!==generation)return;
    try{finishTranscript(false);}finally{await cancel();}
  }

  function fail(error){notice(error.message||'Dictation could not complete.',true);render();}
  mic.addEventListener('pointerdown',event=>{
    if(usesIOS()&&phase==='idle'){const selection=getSelection();iosCaret={focused:document.activeElement===editor,range:selection?.rangeCount?selection.getRangeAt(0).cloneRange():null};}
    if(usesNative()||usesIOS())event.preventDefault();
  });
  mic.onclick=()=>void (phase==='recording'?stop():start()).catch(fail);cancelButton.onclick=()=>void cancel();
  editor.addEventListener('input',()=>{
    if(iosOperation&&!writingTranscript&&(!session?.span?.isConnected||session.span.textContent!==(session.text?session.leading+session.text+session.trailing:'')))endIOS('cancel',false,false);
    render();
  });
  editor.addEventListener('beforeinput',()=>{
    if(!iosOperation)return;
    const selection=getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0);if(session?.span?.isConnected&&range.intersectsNode(session.span))endIOS('cancel',false,false);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&iosOperation)endIOS('cancel');});
  composer.addEventListener('submit',event=>{if(phase!=='idle'){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&phase!=='idle'){event.preventDefault();void cancel();}});
  window.addEventListener('pagehide',()=>{void cancel();clearInterval(poll);if(available())void nativeInvoke('configure_dictation',{enabled:false,modelName:''}).catch(()=>{});});
  function renderSettingsStatus(){
    if(preferences.model==='ios'){
      settings.querySelector('.dictation-model-row').hidden=true;settings.querySelector('.dictation-progress').hidden=true;
      const detail=settings.querySelector('.dictation-detail');detail.hidden=!preferences.enabled;
      detail.textContent=iosAvailable()&&iosCapability().onDeviceAvailable===true?"Speech is recognized on this iPhone. Audio isn't sent to Kindred.":`In-app dictation isn't available for ${iosCapability()?.locale||'this language'} on this iPhone. You can still use the keyboard's dictation.`;settings.querySelector('input[role=switch]').disabled=!iosAvailable()||iosCapability().onDeviceAvailable!==true;return;
    }
    const detail=settings.querySelector('.dictation-detail'),modelRow=settings.querySelector('.dictation-model-row'),picker=settings.querySelector('.whisper-picker'),engine=settings.querySelector('.dictation-engine');
    const progress=settings.querySelector('.dictation-progress');progress.hidden=!preferences.enabled||!native.downloading;progress.value=Math.min(100,Math.max(0,native.progress||0));
    modelRow.hidden=!preferences.enabled;detail.hidden=!preferences.enabled;engine.hidden=true;
    if(!preferences.enabled){detail.textContent='';return;}
    picker.disabled=!available()&&!nativeAvailable();
    const models=native.models||modelCatalogue.map(([id,name,bytes])=>({id,name,bytes}));
    const selected=models.find(m=>m.id===native.model),loaded=selected?.loaded;
    settings.querySelector('.whisper-picker-label').textContent=selected&&(loaded||native.phase==='loading')?selected.name:'Choose a dictation model';
    for(const row of settings.querySelectorAll('.whisper-model-entry')){
      const m=models.find(m=>m.id===row.dataset.model);if(!m){row.hidden=!!row.dataset.model;continue;}row.hidden=false;
      const choose=row.querySelector('.whisper-load'),download=row.querySelector('.whisper-download');
      row.classList.toggle('is-downloaded',!!m.downloaded);row.classList.toggle('is-loaded',!!m.loaded);
      choose.disabled=!m.downloaded;choose.setAttribute('aria-pressed',String(!!m.loaded));
      row.querySelector('.whisper-model-check').hidden=!m.loaded;
      download.hidden=!!m.downloaded&&!m.downloading;download.disabled=!!native.downloading&&!m.downloading;
      download.setAttribute('aria-label',m.downloading?'Cancel '+m.name+' download':'Download '+m.name);
      download.title=m.downloading?'Cancel download':'Download '+m.name;
      download.replaceChildren(icon(m.downloading?'close':'plus'));
      const size=row.querySelector('.whisper-model-size');size.textContent=m.downloading?(native.progress||0)+'%':native.phase==='loading'&&native.model===m.id?'Loading…':m.bytes>=1e9?(m.bytes/1e9).toFixed(2)+' GB':Math.round(m.bytes/1e6)+' MB';
    }
    if(usesNative()){
      settings.querySelector('.whisper-picker-label').textContent='Native (built-in)';
      progress.hidden=true;detail.textContent='Uses macOS Dictation and its system microphone and language settings.';return;
    }
    if(!available()){detail.textContent='Update the desktop app to use local dictation.';return;}
    if(native.supported===false){detail.textContent='Local dictation is unavailable on this platform.';return;}
    if(native.phase==='loading'){detail.textContent='Loading '+(selected?.name||'Whisper')+'…';}
    else if(native.phase==='error'){detail.textContent=native.error||'The model could not load. Select it to retry.';}
    else if(native.download_error){detail.textContent=native.download_error;}
    else if(native.downloading){detail.textContent='Downloading '+(models.find(m=>m.id===native.downloading)?.name||'model')+' · '+(native.progress||0)+'%';}
    else if(loaded){detail.textContent='';detail.hidden=true;}
    else{detail.textContent=models.some(m=>m.downloaded)?'Select a downloaded model to load it.':'Use + to download a model, then select it to load.';}
    if(loaded){
      engine.hidden=false;engine.classList.toggle('uses-gpu',!!native.gpu);engine.classList.toggle('uses-cpu',!native.gpu);
      const summary=engine.querySelector('summary'),label=engine.querySelector('.dictation-engine-label');
      label.textContent=native.gpu?'GPU':'CPU';summary.title=native.gpu?[native.backend,native.device].filter(Boolean).join(' · '):'Why CPU?';
      engine.querySelector('.dictation-engine-icon').replaceChildren(processorIcon(native.gpu));
      engine.querySelector('.dictation-engine-reason').textContent=native.gpu?[native.backend,native.device].filter(Boolean).join(' · '):native.fallback_reason||'No compatible GPU runtime/GPU identified on this device.';
    }
  }
  function processorIcon(gpu){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',gpu?'M3 6h18v12H3zM7 18v3M10 18v3M13 18v3M16 18v3M1 4v16M8 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M17 9h1M17 12h1M17 15h1':'M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  function deviceReply(promise,message,milliseconds=5000){
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));
  }
  function microphoneControl(){
    const row=document.createElement('div');if(iosAvailable()){row.hidden=true;return row;}row.className='setting-row microphone-setting';row.dataset.devicePreference='true';
    const title=document.createElement('span');title.className='setting-label';title.textContent='Microphone';
    const control=document.createElement('div');control.className='settings-device-control';
    const input=document.createElement('select');input.setAttribute('aria-label','Microphone');
    const hint=document.createElement('p');hint.className='muted small';hint.hidden=true;
    const retry=document.createElement('button');retry.type='button';retry.className='icon-button';retry.setAttribute('aria-label','Refresh microphones');retry.title='Refresh microphones';retry.append(icon('refresh'));retry.hidden=false;
    input.append(new Option('System Default','default'));
    if(navigator.mediaDevices?.getUserMedia)input.append(new Option('Choose a microphone…','__permission__'));
    if(preferences.microphone!=='default')input.append(new Option('Saved microphone',preferences.microphone));
    input.value=preferences.microphone;input.disabled=!navigator.mediaDevices?.getUserMedia;
    const picker=document.createElement('div');picker.className='microphone-picker';picker.append(retry,input);control.append(picker,hint);row.append(title,control);
    let refreshing=false;
    async function refresh(){
      if(refreshing)return;refreshing=true;retry.disabled=true;
      try{
        const devices=await deviceReply(navigator.mediaDevices?.enumerateDevices()||Promise.resolve([]),'Microphones did not respond. Your saved selection is unchanged.',3000);
        if(!row.isConnected)return;
        const options=[new Option('System Default','default')],inputs=devices.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default');
        for(const [index,device] of inputs.entries())options.push(new Option(device.label||'Microphone '+(index+1),device.deviceId));
        if(preferences.microphone!=='default'&&!inputs.some(d=>d.deviceId===preferences.microphone))options.push(new Option('Saved microphone · unavailable',preferences.microphone));
        if(preferences.enabled&&navigator.mediaDevices?.getUserMedia&&!inputs.some(d=>d.label))options.push(new Option('Choose a microphone…','__permission__'));
        input.replaceChildren(...options);input.value=preferences.microphone;input.disabled=!navigator.mediaDevices?.getUserMedia;hint.hidden=true;
      }catch(e){if(row.isConnected){hint.textContent=e.message;hint.hidden=false;retry.hidden=false;}}
      finally{refreshing=false;retry.disabled=false;}
    }
    retry.onclick=()=>void refresh();
    input.onchange=async()=>{
      if(input.value==='__permission__'){
        if(!preferences.enabled){await refresh();return;}
        input.disabled=true;try{const permission=await navigator.mediaDevices.getUserMedia({audio:true,video:false});permission.getTracks().forEach(t=>t.stop());}catch(e){notice(e.name==='NotAllowedError'?'Microphone permission was denied. You can still use System Default after allowing access.':e.message,true);}finally{input.disabled=false;await refresh();}return;
      }
      preferences.microphone=input.value;save();await cancel();
    };
    // Opening Settings must not enter the system media-device enumeration path.
    // Device discovery runs only after an explicit user action.
    return row;
  }
  function settingsSection(){
    settingsEvents?.abort();settingsEvents=new AbortController();
    const root=document.createElement('section');root.className='settings-section organized-settings dictation-settings';settings=root;const pane=document.createElement('div');pane.className='settings-pane';
    const heading=document.createElement('h3');heading.textContent='Dictation';
    const label=document.createElement('label');label.className='switch-row setting-row';const title=document.createElement('span');title.textContent='Enable dictation';const toggle=document.createElement('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.checked=preferences.enabled;label.append(title,toggle);
    const modelRow=document.createElement('div');modelRow.className='setting-row dictation-model-row';const modelLabel=document.createElement('span');modelLabel.className='setting-label';modelLabel.textContent='Engine';
    const control=document.createElement('div');control.className='whisper-control';
    const picker=document.createElement('button');picker.type='button';picker.className='whisper-picker';picker.setAttribute('aria-label','Dictation model');picker.setAttribute('aria-expanded','false');picker.setAttribute('aria-haspopup','dialog');
    const chosen=document.createElement('span');chosen.className='whisper-picker-label';picker.append(chosen,icon('chevron'));
    const menu=document.createElement('div');menu.className='whisper-model-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Dictation engines');
    const close=()=>{menu.hidden=true;picker.setAttribute('aria-expanded','false');};
    const openMenu=()=>{
      menu.hidden=false;picker.setAttribute('aria-expanded','true');
      const rect=picker.getBoundingClientRect(),height=menu.offsetHeight;
      menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,rect.right-menu.offsetWidth))+'px';
      menu.style.top=Math.max(12,rect.bottom+height+8>innerHeight?rect.top-height-5:rect.bottom+5)+'px';
    };
    picker.onclick=()=>{if(menu.hidden)openMenu();else close();};
    window.addEventListener('resize',close,{signal:settingsEvents.signal});
    document.querySelector('#settings-content')?.addEventListener('scroll',()=>{if(!menu.hidden)openMenu();},{signal:settingsEvents.signal});
    document.addEventListener('pointerdown',e=>{if(!control.contains(e.target))close();},{signal:settingsEvents.signal});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();close();picker.focus();}if(['ArrowDown','ArrowUp'].includes(e.key)&&control.contains(e.target)){e.preventDefault();if(menu.hidden)openMenu();const choices=[...menu.querySelectorAll('button:not(:disabled):not([hidden])')];const index=choices.indexOf(document.activeElement);choices[(index+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length]?.focus();}});
    if(nativeAvailable()){
      const row=document.createElement('div');row.className='whisper-model-entry';
      const choose=document.createElement('button');choose.type='button';choose.className='whisper-load';choose.textContent='Native (built-in)';
      choose.onclick=async()=>{preferences.model='native';save();close();try{await configure();}catch(e){fail(e);}};
      row.append(choose);menu.append(row);
    }
    for(const [id,name,bytes] of modelCatalogue){
      const row=document.createElement('div');row.className='whisper-model-entry';row.dataset.model=id;
      const choose=document.createElement('button');choose.type='button';choose.className='whisper-load';choose.setAttribute('aria-label','Load '+name);choose.disabled=true;
      const check=document.createElement('span');check.className='whisper-model-check';check.append(icon('check'));check.hidden=true;
      const text=document.createElement('span');text.textContent=name;const size=document.createElement('span');size.className='whisper-model-size';size.textContent=Math.round(bytes/1e6)+' MB';choose.append(text,check);
      choose.onclick=async()=>{preferences.model='local:'+id;save();close();try{await configure();}catch(e){fail(e);}};
      const download=document.createElement('button');download.type='button';download.className='whisper-download';download.append(icon('plus'));download.setAttribute('aria-label','Download '+name);
      download.onclick=async()=>{download.disabled=true;try{native=await nativeInvoke(native.downloading===id?'cancel_dictation_download':'download_dictation_model',native.downloading===id?{}:{modelName:id});render();}catch(e){fail(e);}finally{download.disabled=false;}};
      row.append(choose,size,download);menu.append(row);
    }
    const engine=document.createElement('details');engine.className='dictation-engine';engine.hidden=true;const summary=document.createElement('summary');
    const engineIcon=document.createElement('span');engineIcon.className='dictation-engine-icon';const engineLabel=document.createElement('span');engineLabel.className='dictation-engine-label';const caret=document.createElement('span');caret.className='dictation-engine-caret';caret.textContent='›';summary.append(engineIcon,engineLabel,caret);
    const reason=document.createElement('p');reason.className='dictation-engine-reason';engine.append(summary,reason);
    control.append(picker,menu,engine);modelRow.append(modelLabel,control);
    const detail=document.createElement('p');detail.className='muted small dictation-detail';
    const progress=document.createElement('progress');progress.className='dictation-progress';progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','Dictation model download');
    pane.append(label,modelRow,detail,progress);root.append(heading,pane);
    toggle.onchange=async()=>{preferences.enabled=toggle.checked;save();close();try{await configure();}catch(e){fail(e);}renderSettingsStatus();};
    const statusMessage=document.createElement('p');statusMessage.className='muted small';statusMessage.hidden=true;
    const retry=document.createElement('button');retry.type='button';retry.className='subtle-button';retry.textContent='Retry dictation status';retry.hidden=true;pane.append(statusMessage,retry);
    const check=async()=>{retry.hidden=true;try{
      const value=await deviceReply(nativeInvoke('dictation_status'),'Dictation did not respond. Other settings are still available.');
      if(settings!==root||!root.isConnected)return;native=value;statusMessage.hidden=true;renderSettingsStatus();
    }catch(e){if(settings===root&&root.isConnected){statusMessage.textContent=e.message;statusMessage.hidden=false;retry.hidden=false;}}};
    retry.onclick=()=>void check();renderSettingsStatus();if(available())void check();return root;
  }
  render();return {init:()=>configure().catch(fail),cancel,render,settingsSection,microphoneControl};
}

export function encodeWav(chunks,rate){
  const count=chunks.reduce((n,c)=>n+c.length,0);if(count<rate*.2)throw new Error('The recording was too short. Try speaking for a little longer.');
  const input=new Float32Array(count);let offset=0;for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.length;}
  const length=Math.min(960000,Math.floor(count*16000/rate)),bytes=new Uint8Array(44+length*2),view=new DataView(bytes.buffer);
  for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);
  view.setUint32(4,bytes.length-8,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,length*2,true);
  // Average each source interval when downsampling, avoiding simple sample dropping.
  for(let i=0;i<length;i++){const start=i*rate/16000,end=(i+1)*rate/16000;let total=0,weight=0;for(let j=Math.floor(start);j<Math.ceil(end)&&j<count;j++){const w=Math.min(end,j+1)-Math.max(start,j);total+=input[j]*w;weight+=w;}const sample=Math.max(-1,Math.min(1,total/weight));view.setInt16(44+i*2,sample*(sample<0?32768:32767),true);}
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
}
