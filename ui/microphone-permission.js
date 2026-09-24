// Injected by the Linux desktop before page scripts; also works with older servers.
(()=>{
 if(window.top!==window)return;
 window.__KINDRED_MICROPHONE_PERMISSION=true;
 // WebKit caches device grants internally. Check native Kindred consent before
 // every capture so "Ask again next time" applies without restarting the app.
 const media=navigator.mediaDevices, capture=media?.getUserMedia?.bind(media);
 let captureGeneration=0;const tracks=new Set();
 const stop=()=>{captureGeneration++;for(const track of tracks)track.stop();tracks.clear();};
 window.addEventListener('kindred-microphone-revoked',stop);window.addEventListener('pagehide',stop);
 if(capture)media.getUserMedia=async constraints=>{
  const generation=captureGeneration;
  if(constraints?.audio&&!constraints?.video){
   try{await window.__TAURI__.core.invoke('microphone_permission',{request:true});}
   catch(e){throw new DOMException(String(e),'NotAllowedError');}
  }
  const stream=await capture(constraints);
  if(generation!==captureGeneration){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Microphone permission was reset.','NotAllowedError');}
  for(const track of tracks)if(track.readyState==='ended')tracks.delete(track);
  stream.getAudioTracks().forEach(t=>tracks.add(t));return stream;
 };
 let pending=null;
 function dismiss(id){if(pending?.id!==id)return;const d=pending.dialog;pending=null;d.close();d.remove();}
 window.addEventListener('kindred-microphone-settled',event=>dismiss(event.detail?.id));
 window.addEventListener('kindred-microphone-permission',event=>{
  const {id,origin}=event.detail||{};if(!id||origin!==location.origin||pending?.id===id)return;
  if(pending)dismiss(pending.id);
  const dialog=document.createElement('dialog');dialog.className='text-dialog microphone-permission';dialog.style.width='min(440px, calc(100vw - 32px))';
  dialog.setAttribute('aria-labelledby','microphone-permission-title');dialog.setAttribute('aria-describedby','microphone-permission-description');
  const title=document.createElement('h2');title.id='microphone-permission-title';title.textContent='Allow microphone access?';
  const description=document.createElement('p');description.id='microphone-permission-description';description.textContent='Kindred uses your microphone for local dictation. Audio stays on this computer and recording stops when you finish or cancel.';
  description.style.margin='12px 0';
  const scope=document.createElement('p');scope.className='muted small';scope.textContent='Always allow remembers this account and server on this computer. Change it in General settings.';
  const actions=document.createElement('div');actions.className='dialog-actions';
  Object.assign(actions.style,{display:'flex',justifyContent:'flex-end',flexWrap:'wrap',gap:'8px',marginTop:'16px'});
  const cancel=document.createElement('button');cancel.type='button';cancel.className='outline-button';cancel.textContent='Not now';cancel.autofocus=true;
  const allow=document.createElement('button');allow.type='button';allow.className='outline-button';allow.textContent='Allow this session';
  const always=document.createElement('button');always.type='button';always.className='primary';always.textContent='Always allow';
  pending={id,dialog};let deciding=false;
  const decide=async (allowed,remember=false)=>{
   if(deciding)return;deciding=true;allow.disabled=true;always.disabled=true;cancel.disabled=true;
   try{await window.__TAURI__.core.invoke('decide_microphone_permission',{requestId:id,allowed,remember});dismiss(id);window.dispatchEvent(new Event('kindred-microphone-permission-changed'));}
   catch{description.textContent='Microphone permission could not be saved. Close this prompt and try again.';cancel.disabled=false;allow.disabled=false;always.disabled=false;deciding=false;}
  };
  cancel.onclick=()=>void decide(false);allow.onclick=()=>void decide(true);always.onclick=()=>void decide(true,true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();void decide(false);});
  dialog.addEventListener('close',()=>{if(pending?.id===id)void decide(false);});
  actions.append(cancel,allow,always);dialog.append(title,description,scope,actions);document.body.append(dialog);dialog.showModal();
 });
})();
