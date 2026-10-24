// Authenticated bytes only. Media URLs are local blobs; credentials never enter
// markup, URLs, a remote player, or downloaded filenames supplied by the server.
const raster={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',apng:'image/apng'};
const movies={mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
export function chatMediaType(file){
 const extension=(file.name||file.title||'').split('.').pop().toLowerCase(),mime=String(file.mime||'').split(';')[0].toLowerCase();
 const type=Object.values(raster).includes(mime)||Object.values(movies).includes(mime)?mime:raster[extension]||movies[extension];
 if(!type)return null;
 return {mime:type,video:type.startsWith('video/'),animated:['image/gif','image/webp','image/apng','image/avif'].includes(type)};
}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const controllers=new Set(),dialogs=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motion=()=>!reduced.matches&&document.documentElement.dataset.motion!=='off';
function updateVisibility(){for(const c of controllers)c.visibility();}
export function collectChatMedia(){for(const c of [...controllers])if(!c.root.isConnected)c.dispose();}
export function resetChatMedia(){for(const d of [...dialogs])d.close();for(const c of [...controllers])c.dispose();}
new MutationObserver(collectChatMedia).observe(document.body,{subtree:true,childList:true});
new MutationObserver(updateVisibility).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
document.addEventListener('visibilitychange',updateVisibility);reduced.addEventListener('change',updateVisibility);
function control(label,action,icon,name){const b=el('button','chat-media-control');b.type='button';b.setAttribute('aria-label',label);b.title=label;if(icon&&name)b.append(icon(name,18));else b.textContent=label;b.onclick=action;return b;}
function timeLabel(seconds){return Number.isFinite(seconds)?Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0'):'';}
function releaseVideo(video){video.pause();video.removeAttribute('src');video.load();}
function poster(image,canvas){
 const scale=Math.min(1,1400/image.naturalWidth,1400/image.naturalHeight);
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function mediaSurface(type,url,name,onError){
 const root=el('div','chat-media-surface'),image=el(type.video?'video':'img'),still=el('canvas','chat-media-still');
 let visible=false,ready=false,dead=false,paused=false,manualAnimation=false;
 image.setAttribute('aria-label',name);if(!type.video)image.alt=name;
 still.setAttribute('role','img');still.setAttribute('aria-label',name);still.hidden=true;
 const visibility=()=>{
  if(dead)return;
  if(type.video){if(!visible||document.hidden)image.pause();return;}
  if(!ready)return;
  const animate=visible&&!document.hidden&&(motion()||manualAnimation)&&!paused;
  if(type.animated){
   // Removing the animated source stops decoding; opacity/display alone does not.
   image.hidden=!animate;still.hidden=animate;
   if(animate&&!image.hasAttribute('src'))image.src=url;
   if(!animate&&image.hasAttribute('src'))image.removeAttribute('src');
   root.dataset.playing=String(animate);
  }
 };
 if(type.video){image.playsInline=true;image.preload='metadata';image.autoplay=false;}
 else{image.decoding='async';image.onload=()=>{if(dead)return;if(!ready){try{if(type.animated)poster(image,still);}catch{onError();return;}ready=true;root.classList.add('is-ready');}visibility();};}
 image.onerror=()=>{if(!dead&&image.hasAttribute('src'))onError();};
 root.append(image,still);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();},{threshold:0.01});observer.observe(root);
 const c={root,image,visibility,dispose(){if(dead)return;dead=true;observer.disconnect();if(type.video)releaseVideo(image);else image.removeAttribute('src');controllers.delete(c);},pause(value,explicit=false){paused=value;if(explicit)manualAnimation=!value;visibility();}};
 controllers.add(c);image.src=url;
 return c;
}
export function chatMedia(file,{getBlob,nativeSave,notice,icon,scope=''}){
 const type=chatMediaType(file);if(!type)return null;
 const name=file.name||file.title||'Screenshot',figure=el('figure','chat-media'),open=el('button','chat-media-open'),caption=el('figcaption'),label=el('span','chat-media-label',name),status=el('span','chat-media-status','Loading preview…');
 figure.dataset.fileSignature=JSON.stringify([scope,file.id,name,file.size??null,'inline-media']);figure.dataset.mediaKind=type.video?'video':type.mime==='image/gif'?'gif':'image';
 open.type='button';open.setAttribute('aria-label','Open '+(type.video?'video: ':'image: ')+name);
 const placeholder=el('span','chat-media-placeholder');placeholder.append(icon(type.video?'play':'image',24));open.append(placeholder);caption.append(label);figure.append(open,caption,status);status.setAttribute('role','status');
 let blobPromise,url,surface,loading=false,dead=false,seen=false,viewer;
 const bytes=()=>blobPromise||(blobPromise=Promise.resolve().then(()=>getBlob(file.id)).then(blob=>{
  if(!(blob instanceof Blob)||blob.size>8*1024*1024)throw Error('This media exceeds the chat preview limit.');
  return new Blob([blob],{type:type.mime});
 }).catch(error=>{blobPromise=null;throw error;}));
 const download=async()=>{try{if(nativeSave)await nativeSave(file.id);else saveBlob(await bytes(),/\.[a-z0-9]+$/i.test(name)?name:name+'.'+type.mime.split('/')[1]);}catch(e){notice(e.message||'Download unavailable.',true);}};
 const report=()=>{if(dead)return;status.replaceChildren(el('span','','Preview unavailable. '),control('Download',download));status.hidden=false;};
 const load=async()=>{
  if(loading||url||dead||!seen||!figure.isConnected)return;loading=true;
  try{
   const blob=await bytes();if(dead||!figure.isConnected)return;
   url=URL.createObjectURL(blob);surface=mediaSurface(type,url,name,report);surface.root.classList.add('chat-media-thumbnail');placeholder.remove();open.prepend(surface.root);status.hidden=true;
   if(type.video){
    surface.image.muted=true;surface.image.controls=false;surface.image.tabIndex=-1;
    const badge=el('span','chat-media-badge','Video'),play=el('span','chat-media-play');play.append(icon('play',22));open.append(play,badge);
    surface.image.addEventListener('loadedmetadata',()=>{badge.textContent=timeLabel(surface.image.duration)||'Video';try{surface.image.currentTime=Math.min(.01,surface.image.duration/2);}catch{};});
   }else if(type.mime==='image/gif')open.append(el('span','chat-media-badge','GIF'));
  }catch{report();}finally{loading=false;}
 };
 const observer=new IntersectionObserver(entries=>{seen=entries[0].isIntersecting;if(seen)void load();},{threshold:0.01});
 const c={root:figure,visibility(){surface?.pause(dialogs.size>0);},dispose(){if(dead)return;dead=true;observer.disconnect();surface?.dispose();if(url)URL.revokeObjectURL(url);url=null;blobPromise=null;controllers.delete(c);}};
 // Reconciliation builds disposable candidate rows. Only attach a loader after
 // a row is actually mounted; unchanged rows retain their existing media state.
 queueMicrotask(()=>{if(figure.isConnected){controllers.add(c);observer.observe(figure);}else c.dispose();});
 open.onclick=()=>{if(viewer?.isConnected){viewer.focus();return;}viewer=openChatMedia({name,type,getBlob:bytes,download,icon,origin:open});};
 return figure;
}
export function openChatMedia({name,type,getBlob,download,icon,origin}){
 const dialog=el('dialog','chat-media-dialog'),head=el('header','chat-media-heading'),title=el('span','chat-media-filename',name),body=el('div','chat-media-view'),status=el('p','chat-media-loading','Loading…');
 dialog.classList.toggle('is-video',type.video);
 dialog.setAttribute('aria-label',name);head.append(title,control('Download',()=>void download(),icon,'download'),control('Close',()=>dialog.close(),icon,'close'));body.append(status);dialog.append(head,body);
 let url,surface,dead=false,zoom=1;
 const cleanup=()=>{if(dead)return;dead=true;surface?.dispose();if(url)URL.revokeObjectURL(url);dialogs.delete(dialog);controllers.delete(lifetime);dialog.remove();updateVisibility();if(origin?.isConnected)origin.focus({preventScroll:true});};
 const lifetime={root:dialog,visibility(){surface?.visibility();},dispose:cleanup};
 dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('click',e=>{if(e.target===dialog||e.target===body)dialog.close();});
 document.body.append(dialog);dialogs.add(dialog);controllers.add(lifetime);dialog.showModal();updateVisibility();
 void (async()=>{
  try{
   const blob=await getBlob();if(dead||!dialog.isConnected)return;url=URL.createObjectURL(blob);
   const error=()=>{if(dead)return;status.replaceChildren(document.createTextNode(type.video?'This video cannot be played here. ':'This image cannot be displayed. '),control('Download',()=>void download()));status.hidden=false;};
   surface=mediaSurface(type,url,name,error);surface.root.classList.add('chat-media-full');body.append(surface.root);status.hidden=true;
   if(type.video){surface.image.controls=true;surface.image.preload='auto';surface.image.autoplay=false;surface.image.muted=false;dialog.classList.add('is-video');}
   else{
    const toolbar=el('div','chat-media-toolbar'),value=el('span','chat-media-zoom','Fit');
    const setZoom=n=>{zoom=Math.max(.5,Math.min(3,n));surface.root.style.setProperty('--media-zoom',zoom);value.textContent=zoom===1?'Fit':Math.round(zoom*100)+'%';body.classList.toggle('is-zoomed',zoom>1);};
    toolbar.append(control('Zoom out',()=>setZoom(zoom-.25),icon,'minus'),value,control('Zoom in',()=>setZoom(zoom+.25),icon,'plus'),control('Fit to window',()=>setZoom(1)));
    if(type.animated){let paused=!motion();surface.pause(paused);const toggle=control(paused?'Play animation':'Pause animation',()=>{paused=!paused;surface.pause(paused,true);toggle.textContent=paused?'Play animation':'Pause animation';toggle.setAttribute('aria-label',toggle.textContent);});if(type.mime==='image/gif'||type.mime==='image/webp'||type.mime==='image/apng'||type.mime==='image/avif')toolbar.append(toggle);}
    dialog.append(toolbar);body.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();setZoom(zoom+(event.deltaY<0?.1:-.1));},{passive:false});
   }
   const reveal=()=>{
    if(dead||!motion()||!origin?.isConnected)return;
    const from=origin.getBoundingClientRect(),to=surface.root.getBoundingClientRect();
    if(!from.width||!to.width)return;
    const frames=document.documentElement.hasAttribute('data-kindred-ios')?[{opacity:.5},{opacity:1}]:[{transform:`translate(${from.x-to.x}px,${from.y-to.y}px) scale(${Math.min(1,from.width/to.width)})`,opacity:.5},{transform:'none',opacity:1}];
    surface.root.animate(frames,{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
   };
   surface.image.addEventListener(type.video?'loadedmetadata':'load',reveal,{once:true});
  }catch{if(!dead)status.textContent='Media unavailable. Close and try again.';}
 })();
 return dialog;
}
