// Shared bot-center chrome. The application retains ownership of the existing
// detail and computer panes, their resize state and the single RFB connection.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const tabs=['details','library','computer'];
const title=value=>value[0].toUpperCase()+value.slice(1);
const timestamp=value=>Number.isFinite(Number(value))?Number(value):0;
export function libraryItems(messages=[]){
 const items=[];
 for(const message of messages){
  const common={created:timestamp(message.created),sender:message.sender||'',seq:message.seq};
  for(const file of message.files||[])if(file?.id)items.push({...common,key:'upload:'+file.id,kind:'upload',file,created:timestamp(file.created)||common.created});
  for(const file of message.attachments||[])if(file?.id)items.push({...common,key:'attachment:'+file.id,kind:'attachment',file,created:timestamp(file.created)||common.created});
  if(message.workspace_artifact?.id){const file=message.workspace_artifact;items.push({...common,key:'artifact:'+file.id,kind:'artifact',file});}
 }
 return items;
}
// History pagination is independent from the transcript window. A bounded batch
// never silently claims completeness, and repeated cursors cannot loop forever.
export function createLibraryPager({readPage,onChange=()=>{},pageBudget=4}){
 let context=null,items=new Map(),seenCursors=new Set(),cursor=null,hasMore=true,loaded=false,loading=false,error='',request=null,revision=0;
 const snapshot=()=>({items:[...items.values()].sort((a,b)=>b.created-a.created||a.key.localeCompare(b.key)),hasMore,loaded,loading,error});
 function publish(){onChange(snapshot());}
 function merge(values){for(const item of values||[]){const old=items.get(item.key);items.set(item.key,old?{...old,...item,created:Math.max(old.created||0,item.created||0)}:item);}}
 function reset(next,seeds=[]){request?.abort();revision++;context=next;items=new Map();seenCursors=new Set();merge(seeds);cursor=null;hasMore=true;loaded=false;loading=false;error='';publish();}
 async function load(){
  if(!context||loading||!hasMore)return;
  const current=revision,selected=context,abort=new AbortController();request=abort;loading=true;error='';publish();
  try{
   const initialCount=items.size;
   for(let page=0;page<pageBudget;page++){
    const data=await readPage(selected.chatId,{limit:100,...(cursor==null?{}:{before:cursor})},abort.signal);
    if(abort.signal.aborted||current!==revision)return;
    const messages=Array.isArray(data.messages)?data.messages:[];merge(libraryItems(messages));
    const next=data.page?.first??messages[0]?.seq??null;
    hasMore=!!data.page?.has_before;loaded=true;
    if(hasMore&&(next==null||seenCursors.has(String(next))))throw Error('Earlier files could not be loaded. Try again.');
    if(next!=null)seenCursors.add(String(next));cursor=next;publish();
    if(!hasMore||items.size>initialCount)break;
   }
  }catch(e){if(!abort.signal.aborted&&current===revision)error=e.message||'Could not load files. Try again.';}
  finally{if(current===revision){loading=false;request=null;publish();}}
 }
 return {reset,load,snapshot,seed(values){merge(values);publish();},cancel(){request?.abort();revision++;request=null;loading=false;publish();},dispose(){request?.abort();revision++;context=null;items.clear();}};
}
function fileName(item){return item.file.name||item.file.title||'Shared file';}
function fileKind(item){const ext=fileName(item).split('.').pop().toLowerCase(),mime=item.file.mime||'';return item.kind==='artifact'?'Artifact':/^image\//.test(mime)||['png','jpg','jpeg','gif','webp','avif'].includes(ext)||(!item.file.kind&&item.kind==='attachment')?'Image':/^video\//.test(mime)||['mp4','webm','mov'].includes(ext)?'Video':['xlsx','xls','csv'].includes(ext)?'Spreadsheet':['docx','doc','pdf','md','txt'].includes(ext)?'Document':'File';}
function groupName(created,now=new Date()){
 const date=new Date(created*1000),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=new Date(date.getFullYear(),date.getMonth(),date.getDate());
 if(!created)return 'Earlier';
 const age=(today-day)/86400000;return age<1?'Today':age<7?'This week':age<31?'This month':'Earlier';
}
function sizeLabel(size){return Number.isFinite(size)?size<1024?size+' B':size<1048576?(size/1024).toFixed(1)+' KB':(size/1048576).toFixed(1)+' MB':'';}
export function createBotCenter({detailsPanel,computerPanel,detailsContent,getContext,createAvatar,onNavigate,onSettings,onClose,readPage,seedItems=()=>[],onOpenItem,onDownloadItem,getPreview,icon}){
 let context={},identity='',scope='',disposed=false,hoverTimer=0,hoverAbort=null,preview=null,previewOwner=null,previewRevision=0;
 const panes=[detailsPanel,computerPanel],parts=new Map(),rows=new Map(),thumbnailQueue=new Set(),thumbnailRequests=new Map();let thumbnailEpoch=0,thumbnailActive=0;
 const thumbnails=new IntersectionObserver(entries=>{for(const entry of entries){const row=entry.target;row.thumbnailVisible=entry.isIntersecting;if(entry.isIntersecting&&!row.thumbnailReady&&fileKind(row.item)==='Image')thumbnailQueue.add(row);else if(!entry.isIntersecting)thumbnailQueue.delete(row);}pumpThumbnails();},{root:detailsPanel,rootMargin:'40px'});
 const library=el('section','bot-center-library');library.id='bot-center-library';library.setAttribute('aria-label','Chat library');library.hidden=true;
 const list=el('div','bot-library-list'),status=el('p','bot-library-status'),more=el('button','bot-library-more','Load earlier files');
 status.setAttribute('role','status');more.type='button';library.append(list,status,more);detailsContent.after(library);
 function mediaIcon(kind,size){
  if(icon&&['Image','Video','Artifact'].includes(kind))return icon(kind==='Image'?'image':kind==='Video'?'play':'folder',size);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');for(const [key,value]of Object.entries({viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);path.setAttribute('d',kind==='Spreadsheet'?'M5 3h9l5 5v13H5z M14 3v5h5 M8 11h8v7H8z M8 14h8 M12 11v7':'M5 3h9l5 5v13H5z M14 3v5h5 M8 12h8 M8 15h8 M8 18h5');svg.append(path);return svg;
 }
 function button(label,fn,glyph){const b=el('button','bot-center-icon');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(icon&&glyph)b.append(icon(glyph,18));else b.textContent=label;b.onclick=fn;return b;}
 for(const panel of panes){
  const root=el('div','bot-center-heading'),actions=el('div','bot-center-actions'),avatar=el('div','bot-center-avatar'),name=el('strong','bot-center-name'),label=el('span','bot-center-label'),nav=el('div','bot-center-tabs');
  actions.append(button('Bot settings',()=>onSettings?.(),'settings'),button('Close bot center',()=>onClose?.(panel),'close'));
  nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Bot center');
  for(const tab of tabs){const b=el('button','bot-center-tab',title(tab));b.type='button';b.dataset.tab=tab;b.id=panel.id+'-tab-'+tab;b.setAttribute('role','tab');b.setAttribute('aria-controls',tab==='computer'?'computer-panel':tab==='library'?'bot-center-library':'details-content');b.onclick=()=>navigate(tab);nav.append(b);}
  nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const old=Math.max(0,tabs.indexOf(document.activeElement?.dataset.tab));const index=event.key==='Home'?0:event.key==='End'?2:(old+(event.key==='ArrowLeft'?2:1))%3;nav.children[index].focus();navigate(tabs[index]);});
  root.append(actions,avatar,name,label,nav);panel.prepend(root);parts.set(panel,{root,avatar,name,label,nav,profile:null});
 }
 async function navigate(tab){hidePreview();await onNavigate?.(tab);sync();const target=tab==='computer'?computerPanel:detailsPanel;parts.get(target).nav.querySelector('[data-tab="'+tab+'"]')?.focus({preventScroll:true});}
 async function raster(blob,maxWidth,maxHeight,signal){
  if(signal.aborted||!(blob instanceof Blob)||blob.size>8*1024*1024||!/^image\/(png|jpeg|gif|webp|avif)$/.test(blob.type))return null;
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});if(signal.aborted)return null;const canvas=el('canvas'),scale=Math.min(1,maxWidth/image.naturalWidth,maxHeight/image.naturalHeight);canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;}finally{image.src='';URL.revokeObjectURL(url);}
 }
 function clearThumbnails(){thumbnailEpoch++;thumbnailQueue.clear();for(const request of thumbnailRequests.values())request.abort();thumbnailRequests.clear();}
 function pumpThumbnails(){
  if(disposed||library.hidden||!getPreview)return;
  while(thumbnailActive<2&&thumbnailQueue.size){const row=thumbnailQueue.values().next().value;thumbnailQueue.delete(row);if(!row.isConnected||row.thumbnailReady||thumbnailRequests.has(row))continue;
   const abort=new AbortController(),epoch=thumbnailEpoch;thumbnailRequests.set(row,abort);thumbnailActive++;
   void(async()=>{try{const canvas=await raster(await getPreview(row.item,abort.signal),52,52,abort.signal);if(canvas&&epoch===thumbnailEpoch&&row.isConnected){canvas.setAttribute('aria-hidden','true');row.glyph.replaceChildren(canvas);row.thumbnailReady=true;}}catch{}finally{if(thumbnailRequests.get(row)===abort)thumbnailRequests.delete(row);thumbnailActive--;pumpThumbnails();}})();
  }
 }
 function hidePreview(){clearTimeout(hoverTimer);hoverTimer=0;hoverAbort?.abort();hoverAbort=null;previewRevision++;if(previewOwner)previewOwner.removeAttribute('aria-describedby');previewOwner=null;preview?.remove();preview=null;}
 function positionPreview(){if(!preview||!previewOwner?.isConnected)return hidePreview();const rect=previewOwner.getBoundingClientRect(),width=Math.min(288,innerWidth-24);preview.style.width=width+'px';preview.style.left=Math.max(12,Math.min(innerWidth-width-12,rect.right-width))+'px';const height=preview.offsetHeight;preview.style.top=Math.max(12,Math.min(innerHeight-height-12,rect.top-height-8))+'px';}
 async function showPreview(row,item){
  hidePreview();if(!row.isConnected||library.hidden||document.hidden)return;
  const revision=previewRevision,abort=new AbortController();hoverAbort=abort;previewOwner=row;preview=el('div','bot-library-preview');preview.id='bot-library-hover-preview';preview.setAttribute('role','tooltip');row.setAttribute('aria-describedby',preview.id);
  const visual=el('div','bot-library-preview-visual'),kind=fileKind(item),meta=el('div','bot-library-preview-copy');
  visual.append(mediaIcon(kind,32));meta.append(el('span','bot-library-preview-kind',kind),el('strong','',fileName(item)),el('span','bot-library-preview-date',item.created?new Date(item.created*1000).toLocaleString():''));preview.append(visual,meta);document.body.append(preview);positionPreview();
  // Only a static raster is decoded for hover. No GIF/video playback, document
  // renderer or remote preview frame is started by simply crossing a row.
  if(kind!=='Image'||!getPreview)return;
  try{const blob=await getPreview(item,abort.signal);if(abort.signal.aborted||revision!==previewRevision||!(blob instanceof Blob)||blob.size>8*1024*1024||!/^image\/(png|jpeg|gif|webp|avif)$/.test(blob.type))return;
   const canvas=await raster(blob,560,360,abort.signal);if(!canvas||abort.signal.aborted||revision!==previewRevision)return;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fileName(item));visual.replaceChildren(canvas);visual.classList.add('has-image');positionPreview();
  }catch{/* Metadata remains useful when a preview cannot be decoded. */}
 }
 function renderLibrary(value){
  if(disposed)return;
  const wanted=new Set(),groups=new Map();
  for(const item of value.items){
   wanted.add(item.key);let row=rows.get(item.key);
   if(!row){row=el('div','bot-library-row');row.dataset.fileKey=item.key;const open=el('button','bot-library-open'),glyph=el('span','bot-library-glyph'),copy=el('span','bot-library-name');open.type='button';open.append(glyph,copy);const download=button('Download',()=>onDownloadItem?.(row.item),'download');download.classList.add('bot-library-download');row.append(open,download);row.open=open;row.glyph=glyph;row.copy=copy;row.download=download;
    open.onclick=()=>{hidePreview();onOpenItem?.(row.item,open);};open.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>void showPreview(open,row.item),220);});open.addEventListener('pointerleave',hidePreview);open.addEventListener('focus',()=>{clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>void showPreview(open,row.item),220);});open.addEventListener('blur',hidePreview);rows.set(item.key,row);
   }
   row.item=item;const name=fileName(item),kind=fileKind(item);row.copy.textContent=name;row.open.setAttribute('aria-label','Open '+name);row.open.title=name;row.download.title='Download '+name;row.download.setAttribute('aria-label','Download '+name);row.download.hidden=item.kind==='artifact'||!onDownloadItem;row.glyph.dataset.kind=kind.toLowerCase();if(row.glyph.dataset.rendered!==kind){row.glyph.replaceChildren();row.glyph.append(mediaIcon(kind,19));row.glyph.dataset.rendered=kind;}row.dataset.metadata=kind+(sizeLabel(item.file.size)?' · '+sizeLabel(item.file.size):'');
   const group=groupName(item.created);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(row);
  }
  for(const [key,row] of rows)if(!wanted.has(key)){thumbnails.unobserve(row);thumbnailQueue.delete(row);thumbnailRequests.get(row)?.abort();row.remove();rows.delete(key);}
  // Reconcile group containers and rows in place. Existing focus and scroll are
  // retained while a new share or an older history page arrives.
  const oldGroups=new Map([...list.children].map(n=>[n.dataset.group,n]));let at=0;
  for(const [name,members] of groups){let section=oldGroups.get(name);if(!section){section=el('section','bot-library-group');section.dataset.group=name;section.append(el('h3','',name),el('div','bot-library-group-items'));}if(list.children[at]!==section)list.insertBefore(section,list.children[at]||null);at++;const target=section.lastElementChild;for(let i=0;i<members.length;i++)if(target.children[i]!==members[i])target.insertBefore(members[i],target.children[i]||null);for(const child of [...target.children])if(!members.includes(child))child.remove();oldGroups.delete(name);}
  for(const section of oldGroups.values())section.remove();
  for(const row of rows.values())if(!row.thumbnailObserved){row.thumbnailObserved=true;thumbnails.observe(row);}pumpThumbnails();
  status.textContent=value.error||(value.loading?'Loading files…':!value.items.length?(value.hasMore?'No files in this part of the conversation yet.':'Files and photos shared in this chat appear here.'):'');status.classList.toggle('is-error',!!value.error);status.hidden=!status.textContent;
  more.hidden=!value.hasMore&&!value.error;more.disabled=value.loading;more.textContent=value.error?'Retry loading files':value.loading?'Loading…':value.loaded?'Load earlier files':'Load files';library.setAttribute('aria-busy',String(value.loading));
 }
 const pager=createLibraryPager({readPage,onChange:renderLibrary});more.onclick=()=>void pager.load();
 function sync(){
  if(disposed)return;context=getContext()||{};const enabled=!!context.enabled&&!!context.bot,tab=tabs.includes(context.tab)?context.tab:'details';
  for(const [panel,part] of parts){panel.classList.toggle('has-bot-center',enabled);part.root.hidden=!enabled;for(const b of part.nav.children){const selected=b.dataset.tab===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}}
  detailsContent.hidden=enabled&&tab==='library';library.hidden=!enabled||tab!=='library';
  if(!enabled){hidePreview();pager.cancel();return;}
  const nextScope=JSON.stringify([context.scope,context.chatId]);if(nextScope!==scope){scope=nextScope;hidePreview();clearThumbnails();for(const row of rows.values())thumbnails.unobserve(row);rows.clear();list.replaceChildren();pager.reset(context,seedItems(context));library.scrollTop=0;}else pager.seed(seedItems(context));
  const nextIdentity=JSON.stringify(context.bot);if(nextIdentity!==identity){identity=nextIdentity;for(const part of parts.values()){if(part.profile?.dataset.botId===context.bot.id&&part.profile.updateProfile)part.profile.updateProfile(context.bot);else{part.profile=createAvatar(context.bot);part.avatar.replaceChildren(part.profile);}part.name.textContent=context.bot.name||'Bot';part.label.textContent=context.bot.profile?.label||context.bot.label||'';part.label.hidden=!part.label.textContent;}}
  if(tab==='library'&&!pager.snapshot().loaded&&!pager.snapshot().loading)void pager.load();
 }
 const lifecycle=new AbortController();window.addEventListener('resize',hidePreview,{signal:lifecycle.signal});document.addEventListener('scroll',hidePreview,{capture:true,passive:true,signal:lifecycle.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePreview();},{signal:lifecycle.signal});document.addEventListener('keydown',event=>{if(event.key==='Escape')hidePreview();},{signal:lifecycle.signal});
 return {sync,library,pager,hidePreview,dispose(){disposed=true;hidePreview();clearThumbnails();thumbnails.disconnect();pager.dispose();lifecycle.abort();for(const [panel,part]of parts){panel.classList.remove('has-bot-center');part.root.remove();}library.remove();detailsContent.hidden=false;}};
}
