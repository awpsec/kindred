// Mobile bridges expose scoped sessions, account navigation and bounded exports
// through a user-selected save destination, never arbitrary paths or execution.
import './mobile-messages.js';
export function mobileSession(token, profileId = '') {
  if (!window.__KINDRED_MOBILE) return;
  if(profileId)window.__KINDRED_MOBILE_PROFILE=profileId;
  localStorage.removeItem('kindred-token');
  const payload={token,profile_id:profileId};
  if(window.webkit?.messageHandlers?.kindredSession)window.webkit.messageHandlers.kindredSession.postMessage(payload);
  else window.kindredNative?.postMessage(JSON.stringify({type:'session',...payload}));
}
export function mobileAccounts() {
  if(!window.__KINDRED_MOBILE)return false;
  if(window.webkit?.messageHandlers?.kindredAccounts)window.webkit.messageHandlers.kindredAccounts.postMessage({action:'open'});
  else window.kindredNative?.postMessage(JSON.stringify({type:'accounts'}));
  return true;
}
export function mobileConversationKey(profile=window.__KINDRED_MOBILE_PROFILE) {
  return window.__KINDRED_MOBILE && typeof profile==='string' && /^[a-zA-Z0-9-]{1,160}$/.test(profile)?'kindred-mobile-drafts-'+profile:null;
}
export function mobileRequestedChat() {
  if(!window.__KINDRED_MOBILE)return null;
  const id=new URLSearchParams(location.hash.slice(1)).get('kindred-chat');
  return id && /^[a-zA-Z0-9-]{1,160}$/.test(id)?id:null;
}
if(window.__KINDRED_MOBILE)document.documentElement.dataset.mobile='true';

// Android WebView does not implement blob downloads. Transfer bounded chunks to
// the native save-document picker; no server-supplied filesystem paths are used.
if(window.__KINDRED_MOBILE_PLATFORM==='android' && window.kindredNative){
  let active=null;
  window.kindredNative.onmessage=event=>{
    let value;try{value=JSON.parse(event.data);}catch{return;}
    if(value.id!==active?.id)return;
    if(value.error)active.fail(value.error);
    else if(value.stage==='ready')active.ready();
    else if(['saved','cancelled'].includes(value.stage))active.finish();
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[download]');
    if(!link||!link.href.startsWith('blob:'+location.origin+'/'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const report=message=>window.dispatchEvent(new CustomEvent('kindred-mobile-error',{detail:message}));
    if(active){report('Finish the current download first.');return;}
    const id=crypto.randomUUID();
    let ready,finish,error=null;
    const started=new Promise(resolve=>ready=resolve);
    // Resolve with a recorded error, avoiding unhandled rejections while chunks
    // are in flight. Only the owning transfer clears its timer and state.
    const done=new Promise(resolve=>finish=resolve);
    active={id,ready,finish,fail:message=>{error=new Error(message);ready();finish();}};
    const post=value=>window.kindredNative.postMessage(JSON.stringify({id,...value}));
    const timer=setTimeout(()=>{if(active?.id===id)active.fail('Download timed out. Please try again.');},300000);
    const transfer=async()=>{
      const blob=await(await fetch(link.href)).blob();
      if(blob.size>32*1024*1024)throw new Error('Mobile downloads are limited to 32 MB.');
      post({type:'download-start',name:link.download||'download',size:blob.size});
      await started;if(error)throw error;
      for(let offset=0;offset<blob.size;offset+=16384){
        const bytes=new Uint8Array(await blob.slice(offset,offset+16384).arrayBuffer());
        if(error)throw error;
        post({type:'download-chunk',data:btoa(String.fromCharCode(...bytes))});
      }
      post({type:'download-end'});await done;if(error)throw error;
    };
    void transfer().catch(error=>{post({type:'download-cancel'});report(error.message);}).finally(()=>{
      clearTimeout(timer);if(active?.id===id)active=null;
    });
  },true);
}
