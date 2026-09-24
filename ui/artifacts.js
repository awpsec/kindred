// Untrusted HTML and JSX never enter the authenticated chat DOM.
import {hljs,marked} from './vendor.js';
const LIMIT=256*1024;
const element=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function control(text,action){const b=element('button','artifact-action',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await action();}finally{b.disabled=false;}};return b;}
function download(text,name,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
export function loadArtifactFrame(frame,document){
 // Navigate to a sandboxed response with an independent CSP. Inline srcdoc
 // inherits the app's policy, which intentionally disallows inline scripts.
 frame.addEventListener('load',()=>frame.contentWindow?.postMessage({kind:'kindred-artifact-document',document},'*'),{once:true});
 frame.src=new URL('./artifact-frame.html',import.meta.url).href;
}
// Embed trusted bundled fonts so opaque-origin previews need no network access.
let fontStyles;
function bundledFontStyles(){
 if(!fontStyles)fontStyles=Promise.all([
  ['Inter','InterVariable.woff2','100 900','normal','woff2'],
  ['Inter','InterVariable-Italic.woff2','100 900','italic','woff2'],
  ['Liberation Mono','LiberationMono-Regular.ttf','400','normal','truetype'],
  ['Liberation Mono','LiberationMono-Bold.ttf','700','normal','truetype'],
  ['Liberation Mono','LiberationMono-Italic.ttf','400','italic','truetype'],
  ['Liberation Mono','LiberationMono-BoldItalic.ttf','700','italic','truetype'],
 ].map(async([family,file,weight,style,format])=>{
  const response=await fetch(new URL('./fonts/'+file,import.meta.url));if(!response.ok)throw Error('Unable to load Kindred artifact fonts. Please retry.');
  const blob=await response.blob();const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  return '@font-face{font-family:"'+family+'";src:url("'+data+'") format("'+format+'");font-weight:'+weight+';font-style:'+style+';font-display:swap}';
 })).then(styles=>styles.join('')).catch(error=>{fontStyles=null;throw error;});
 return fontStyles;
}
export function inferArtifactLanguage(source,fallback='markdown'){
 const text=source.trim();
 if(/^(?:#{1,6}\s|```)/.test(text))return 'markdown';
 if(/^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(text))return 'html';
 if(/\b(?:import\s+[\s\S]+?\s+from\s*['"]|export\s+default\b|ReactDOM\.|React\.createElement\b)/.test(text)||/\b(?:function|const|let)\s+[A-Z]\w*[\s\S]*?(?:return\s*\(?\s*<|=>\s*\(?\s*<)/.test(text))return 'jsx';
 if(/^<(?:[a-z][\w-]*)(?:\s|>)/.test(text))return 'html';
 return text? 'markdown':fallback;
}
export async function artifactDocument(source,language,bootstrap=''){
 language=inferArtifactLanguage(source,language);
 if((window.__TAURI__||window.__TAURI_INTERNALS__)&&(!window.__KINDRED_FILE_DELIVERY||!window.__KINDRED_ARTIFACT_FRAME))throw new Error('Update Kindred to display interactive artifacts in the app. You can open them in a browser.');
 if(new TextEncoder().encode(source).length>LIMIT)throw new Error('Preview supports files up to 256 KB. Download this file to open it locally.');
 // No same-origin, top-navigation, popups, forms, downloads or native IPC rights.
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
 const fonts=await bundledFontStyles();
 const head=`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>${fonts}:root{--font-sans:Inter,system-ui,sans-serif;--font-mono:"Liberation Mono",monospace}body{margin:24px;font:15px/1.5 var(--font-sans);color:#202225;background:#fff}button,input,select,textarea{font:inherit}code,pre,kbd,samp{font-family:var(--font-mono)}button{cursor:pointer}pre{white-space:pre-wrap}*{box-sizing:border-box}</style>${bootstrap?'<script>'+escapeScript(bootstrap)+'</script>':''}`;
 if(language==='html'){
  // Preserve full documents rather than nesting a second html/head/body tree.
  if(/<head\b[^>]*>/i.test(source))return source.replace(/<head\b[^>]*>/i,match=>match+head);
  if(/<html\b[^>]*>/i.test(source))return source.replace(/<html\b[^>]*>/i,match=>match+'<head>'+head+'</head>');
  return '<!doctype html><html><head>'+head+'</head><body>'+source+'</body></html>';
 }
 const {transform,runtime}=await import('./artifact-vendor.js');
 const code=transform(source,{filename:'artifact.jsx',presets:[['react',{runtime:'classic'}]],plugins:['transform-modules-commonjs'],sourceType:'module'}).code;
 const boot=`const exports={};const module={exports};function require(name){if(name==='react')return React;if(name==='react-dom/client'||name==='react-dom')return ReactDOM;throw new Error('This preview supports React only. Remove the external import: '+name);}try{${code}\nconst Component=module.exports.default||exports.default||(typeof App!=='undefined'?App:null);if(Component)ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));else if(!document.getElementById('root').childNodes.length)throw new Error('Export a default React component or define App.');}catch(error){document.getElementById('root').textContent='Preview error: '+error.message;}`;
 return '<!doctype html><html><head>'+head+'</head><body><div id="root"></div><script>'+escapeScript(runtime)+'</script><script>'+escapeScript(boot)+'</script></body></html>';
}
export function artifactPreview(source,language,name='Artifact'){
 const box=element('section','artifact-preview'),header=element('div','artifact-toolbar'),status=element('span','artifact-label',name),stage=element('div','artifact-stage');
 let frame=null;
 const show=control('Preview',async()=>{
  if(frame){frame.remove();frame=null;show.textContent='Preview';stage.replaceChildren();return;}
  stage.textContent='Preparing preview…';
  try{const doc=await artifactDocument(source,language);frame=element('iframe','artifact-frame');frame.title=name+' preview';frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");loadArtifactFrame(frame,doc);stage.replaceChildren(frame);show.textContent='Close preview';}
  catch(error){stage.replaceChildren(element('p','artifact-error',error.message));}
 });
 header.append(status,show,control('Download',()=>download(source,name.match(/\.(html?|jsx)$/i)?name:name+'.'+language,language==='html'?'text/html':'text/plain')));
 box.append(header,element('p','artifact-hint','Interactive preview · isolated from your chat and connected accounts'),stage);return box;
}
// Shards are message-local interactive views, not hosted/shared documents.
export function inlineShard(source,language,name='Interactive view'){
 const box=element('section','inline-shard');box.dataset.shardSignature=JSON.stringify([language,source]);box.setAttribute('aria-label',name);
 box.append(element('span','shard-loading','Building view…'));
 let frame=null,disposed=false,started=false,visibility=null,removal=null;
 const receive=e=>{
  if(!frame||e.source!==frame.contentWindow||e.origin!=='null'||disposed)return;
  if(e.data?.kind==='kindred-shard-size'&&Number.isFinite(e.data.height))frame.style.height=Math.max(64,Math.min(480,Math.ceil(e.data.height)))+'px';
 };
 async function mount(){
  if(started||disposed||!box.isConnected)return;started=true;visibility?.disconnect();
  try{
   const css=getComputedStyle(document.documentElement),theme={background:css.getPropertyValue('--surface').trim(),color:css.getPropertyValue('--fg').trim(),scheme:css.colorScheme};
   const bridge=`(()=>{const theme=${JSON.stringify(theme)};const style=document.createElement('style');style.textContent=':root{color-scheme:'+theme.scheme+'}body{margin:0;padding:16px;background:'+theme.background+';color:'+theme.color+'}';document.head.append(style);addEventListener('DOMContentLoaded',()=>{let queued=false;const size=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;parent.postMessage({kind:'kindred-shard-size',height:document.body.getBoundingClientRect().height},'*');});};new ResizeObserver(size).observe(document.body);size();});})();`;
   const doc=await artifactDocument(source,language,bridge);if(disposed||!box.isConnected)return;
   frame=element('iframe','artifact-frame shard-frame');frame.title=name;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");loadArtifactFrame(frame,doc);box.replaceChildren(frame);
  }catch(error){if(!disposed)box.replaceChildren(element('p','shard-error','This view could not render. '+error.message));}
 }
 // Render reconciliation creates disposable nodes. Only mounted, visible shards run code.
 queueMicrotask(()=>{if(!box.isConnected)return;window.addEventListener('message',receive);visibility=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void mount();},{rootMargin:'100px'});visibility.observe(box);removal=new MutationObserver(()=>{if(!box.isConnected){disposed=true;visibility.disconnect();removal.disconnect();window.removeEventListener('message',receive);}});removal.observe(document.body,{childList:true,subtree:true});});
 return box;
}
function completedFences(text){
 const found=new Set();
 function walk(tokens){for(const token of tokens){if(token.type==='code'){
  const lines=token.raw.trimEnd().split('\n'),opening=lines[0]?.match(/^\s*(`{3,}|~{3,})/),closing=lines.at(-1)?.match(/^\s*(`{3,}|~{3,})\s*$/);
  if(lines.length>1&&opening&&closing&&opening[1][0]===closing[1][0]&&closing[1].length>=opening[1].length)found.add((token.lang||'').toLowerCase()+'\0'+token.text.trimEnd());
 }if(token.tokens)walk(token.tokens);if(token.items)for(const item of token.items)if(item.tokens)walk(item.tokens);}}
 walk(marked.lexer(text));return found;
}
export function enhanceMarkdown(root,{sourceText}={}){
 let complete=null;
 for(const input of root.querySelectorAll('input')){if(input.type!=='checkbox'){input.remove();continue;}input.disabled=true;input.setAttribute('aria-label',input.checked?'Completed item':'Pending item');input.closest('li')?.classList.add('markdown-task');}
 for(const table of root.querySelectorAll('table')){const wrap=element('div','markdown-table');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Table');table.replaceWith(wrap);wrap.append(table);}
 for(const pre of root.querySelectorAll('pre')){
  const code=pre.querySelector('code');if(!code)continue;
  const language=(code.className.match(/(?:^|\s)language-([\w-]+)/)?.[1]||'text').toLowerCase(),source=code.textContent;
  if(['html','jsx','react','shard-html','shard-jsx'].includes(language)){
   if(sourceText!==undefined&&!complete)complete=completedFences(sourceText);
   if(complete&&!complete.has(language+'\0'+source.trimEnd())){pre.replaceWith(element('span','shard-loading','Building view…'));continue;}
   pre.replaceWith(inlineShard(source,language.includes('html')?'html':'jsx'));continue;
  }
  // Retain language metadata without accepting arbitrary author-controlled classes.
  code.className='';if(source.length<=LIMIT&&hljs.getLanguage(language))code.innerHTML=hljs.highlight(source,{language,ignoreIllegals:true}).value;const box=element('div','markdown-code'),bar=element('div','code-toolbar');
  bar.append(element('span','code-language',language),control('Copy code',async()=>{try{await navigator.clipboard.writeText(source);bar.querySelector('button').textContent='Copied';setTimeout(()=>{if(bar.isConnected)bar.querySelector('button').textContent='Copy code';},1800);}catch{bar.querySelector('button').textContent='Copy unavailable';}}));
  pre.replaceWith(box);box.append(bar,pre);
 }
}
const fileSvg=(path)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);return svg;};
const savedDownloads=new Map();
export function fileCard(attachment,{getBlob,nativeSave,nativeReveal,notice,renderMarkdown}){
 const name=attachment.name||attachment.title||'File',extension=name.split('.').pop().toLowerCase(),card=element('section','deliverable-card'),heading=element('div','deliverable-heading'),badge=element('span','deliverable-type'),copy=element('div','deliverable-copy');
 const kind=['xlsx','xls','csv'].includes(extension)?'sheet':['docx','doc','md','txt'].includes(extension)?'word':extension==='pdf'?'pdf':'file';card.dataset.kind=kind;badge.dataset.kind=kind;badge.title=extension.toUpperCase()+' file';
 badge.append(fileSvg(kind==='sheet'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 11h8v7H8z M8 14h8 M12 11v7':kind==='word'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 15h8 M8 18h5':kind==='pdf'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 17c4-6 3-8 2-7s1 8 5 6-6-1-7 1':'M5 3h10l4 4v14H5z M14 3v5h5'));
 card.dataset.fileSignature=JSON.stringify([attachment.id,name,attachment.size??null,attachment.source_url||null]);card.setAttribute('aria-label','File: '+name);copy.title=name;copy.append(element('strong','deliverable-name',name),element('span','deliverable-size',extension.toUpperCase()+(Number.isFinite(attachment.size)?' · '+(attachment.size<1024?attachment.size+' B':attachment.size<1048576?(attachment.size/1024).toFixed(1)+' KB':(attachment.size/1048576).toFixed(1)+' MB'):'')));heading.append(badge,copy);card.append(heading);
 const actions=element('div','deliverable-actions'),split=element('div','deliverable-split'),downloadControls=new Set(),announcement=element('span','download-announcement');
 announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');card.append(announcement);
 const storageKey='kindred-file-saved:'+attachment.id;let saved=nativeSave?savedDownloads.get(attachment.id)?.receipt:null,savedAt=nativeSave?savedDownloads.get(attachment.id)?.at:0;
 if(nativeSave&&!savedAt)try{const at=Number(localStorage.getItem(storageKey));if(Number.isFinite(at)&&at>0&&at<=Date.now())savedAt=at;}catch{}
 let phase=savedAt?'saved':'idle',confirmed=!!savedAt;
 const folderLabel=/Mac/.test(navigator.platform)?'Show in Finder':'Show in folder',reveal=control('',async()=>{try{await nativeReveal(saved);}catch(e){notice(String(e.message||e),true);}});reveal.classList.add('deliverable-reveal');reveal.setAttribute('aria-label',folderLabel);reveal.title=folderLabel;reveal.append(fileSvg('M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'));reveal.hidden=!saved;
 const paintDownload=b=>{
  b.dataset.state=phase;b.disabled=phase==='saving'||phase==='saved';b.setAttribute('aria-busy',String(phase==='saving'));
  const label=phase==='saving'?'Downloading':phase==='saved'?(nativeSave?'Saved':'Download started'):phase==='error'?'Retry download':'Download';b.setAttribute('aria-label',label);b.replaceChildren(element('span','',label));
  if(phase==='saving'){const dots=element('span','download-dots');dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(element('span','','.'));b.append(dots);}
  if(phase==='saved'){const check=fileSvg('m5 12 4 4L19 6');check.classList.add('download-check');b.append(check);}
  b.title=phase==='saved'?(nativeSave?'Saved to Downloads '+new Date(savedAt).toLocaleString()+'. Use Download again for another copy.':'Sent to your browser. Check browser downloads for the saved file.'):phase==='saving'?'Downloading '+name:label+' '+name;
 };
 const updateDownloads=()=>{for(const b of downloadControls){if(!b.isConnected){downloadControls.delete(b);continue;}paintDownload(b);}again.hidden=!confirmed;again.disabled=phase==='saving';more.hidden=[...menu.children].every(n=>n.hidden);};
 const save=async(force=false)=>{
  if(phase==='saving'||(phase==='saved'&&!force))return;phase='saving';announcement.textContent='Downloading '+name+'…';updateDownloads();
  try{
   if(nativeSave){
    const receipt=await nativeSave(attachment.id);if(typeof receipt!=='string'||!receipt)throw Error('The app did not confirm this download. Try again.');
    saved=receipt;savedAt=Date.now();savedDownloads.set(attachment.id,{receipt,at:savedAt});if(savedDownloads.size>256)savedDownloads.delete(savedDownloads.keys().next().value);
    try{localStorage.setItem(storageKey,String(savedAt));}catch{}
    if(nativeReveal)reveal.hidden=false;announcement.textContent=name+' saved to Downloads.';
   }else{
    const blob=await getBlob(attachment.id),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);announcement.textContent='Download started for '+name+'. Check browser downloads.';
   }
   confirmed=true;phase='saved';
  }catch(e){phase=confirmed?'saved':'error';announcement.textContent='Could not download '+name+'. '+String(e.message||e);notice(announcement.textContent,true);}
  finally{updateDownloads();}
 };
 const createDownloadButton=()=>{for(const b of downloadControls)if(!b.isConnected)downloadControls.delete(b);const b=element('button','artifact-action file-download');b.type='button';b.onclick=()=>void save();downloadControls.add(b);paintDownload(b);return b;};
 const downloadButton=createDownloadButton();split.append(downloadButton);actions.append(split);if(nativeReveal)actions.append(reveal);heading.append(actions);
 const menu=element('div','deliverable-menu');menu.setAttribute('popover','auto');menu.setAttribute('aria-label','File actions');
 const more=element('button','artifact-action deliverable-more');more.type='button';more.title='More file actions';more.setAttribute('aria-label','More file actions');more.setAttribute('aria-expanded','false');more.popoverTargetElement=menu;more.append(fileSvg('m7 10 5 5 5-5'));
 let menuTracking,menuObserver;
 const stopMenuTracking=()=>{menuTracking?.abort();menuObserver?.disconnect();};
 const positionMenu=()=>{if(!more.isConnected){stopMenuTracking();return;}const r=more.getBoundingClientRect(),clip=more.closest('#content')?.getBoundingClientRect();if(r.bottom<(clip?.top||0)||r.top>(clip?.bottom||innerHeight)){menu.hidePopover();return;}menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,r.bottom+menu.offsetHeight+8>innerHeight?r.top-menu.offsetHeight-6:r.bottom+6))+'px';};
 menu.addEventListener('toggle',e=>{const open=e.newState==='open';more.setAttribute('aria-expanded',String(open));stopMenuTracking();if(open){positionMenu();menu.querySelector('button:not([hidden]),a:not([hidden])')?.focus({preventScroll:true});menuTracking=new AbortController();menuObserver=new MutationObserver(()=>{if(!more.isConnected)stopMenuTracking();});menuObserver.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',positionMenu,{signal:menuTracking.signal});document.addEventListener('scroll',positionMenu,{capture:true,passive:true,signal:menuTracking.signal});}});
 const previewable=['docx','xlsx','pdf','html','htm','jsx','md','txt','csv','json','png','jpg','jpeg','webp','gif'].includes(extension);
 if(previewable)menu.append(control('Preview',async()=>{try{menu.hidePopover();more.focus();const {openDocumentPreview}=await import('./document-preview.js');if(!card.isConnected)return;await openDocumentPreview({card,name,extension,getBlob:()=>getBlob(attachment.id),createDownloadButton,renderMarkdown,artifactPreview});}catch(error){notice('Preview unavailable. '+error.message,true);}}));
 try{const u=new URL(attachment.source_url);if(u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname)&&!u.username&&!u.password){const a=element('a','artifact-action','Open in Google Drive');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.onclick=()=>menu.hidePopover();menu.append(a);}}catch{}
 const again=control('Download again',async()=>{menu.hidePopover();await save(true);});again.hidden=!confirmed;menu.append(again);more.hidden=[...menu.children].every(n=>n.hidden);split.append(more);card.append(menu);return card;
}
