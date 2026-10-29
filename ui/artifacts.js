import {fileDownload} from './file-downloads.js';
// Untrusted HTML and JSX never enter the authenticated chat DOM.
import {hljs,marked} from './vendor.js';
export const ARTIFACT_SOURCE_MAX_BYTES=4*1024*1024;
export const ARTIFACT_STATE_MAX_BYTES=2*1024*1024;
const HIGHLIGHT_MAX_CHARS=256*1024;
const element=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function control(text,action){const b=element('button','artifact-action',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await action();}finally{b.disabled=false;}};return b;}
function download(text,name,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
export function loadArtifactFrame(frame,document){
 // Navigate to a sandboxed response with an independent CSP. Inline srcdoc
 // inherits the app's policy, which intentionally disallows inline scripts.
 frame.addEventListener('load',()=>frame.contentWindow?.postMessage({kind:'kindred-artifact-document',document},'*'));
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
 const text=source.trim().replace(/^(?:<!--[\s\S]*?-->\s*)+/, '').trimStart();
 if(/^(?:#{1,6}\s|```)/.test(text))return 'markdown';
 if(/^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(text))return 'html';
 if(/\b(?:import\s+[\s\S]+?\s+from\s*['"]|export\s+default\b|ReactDOM\.|React\.createElement\b)/.test(text)||/\b(?:function|const|let)\s+[A-Z]\w*[\s\S]*?(?:return\s*\(?\s*<|=>\s*\(?\s*<)/.test(text))return 'jsx';
 if(/^<(?:[a-z][\w-]*)(?:\s|>)/.test(text))return 'html';
 return text? 'markdown':fallback;
}
export async function artifactDocument(source,language,bootstrap=''){
 language=inferArtifactLanguage(source,language);
 if((window.__TAURI__||window.__TAURI_INTERNALS__)&&(!window.__KINDRED_FILE_DELIVERY||!window.__KINDRED_ARTIFACT_FRAME))throw new Error('Update Kindred to display interactive artifacts in the app. You can open them in a browser.');
 if(new TextEncoder().encode(source).length>ARTIFACT_SOURCE_MAX_BYTES)throw new Error('This preview is too large (limit about 4 MB of text). Download this file or split it into smaller artifacts.');
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
 const boot=`const exports={};const module={exports};function require(name){if(name==='react')return React;if(name==='react-dom/client'||name==='react-dom')return ReactDOM;throw new Error('This preview supports React only. Remove the external import: '+name);}try{${code}\nconst Component=module.exports.default||exports.default||(typeof App!=='undefined'?App:null);if(Component)ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));else if(!document.getElementById('root').childNodes.length)throw new Error('Export a default React component or define App.');}catch(error){document.getElementById('root').textContent='Preview error: '+error.message;dispatchEvent(new CustomEvent('kindred-preview-error',{detail:String(error.message)}));}`;
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
// The bridge only reports presentation state. It cannot call host/native APIs.
function shardBridge(theme){
 const send=(kind,extra={})=>parent.postMessage({kind,...extra},'*');
 const apply=next=>{
  if(!next||typeof next!=='object')return;
  const root=document.documentElement;
  for(const key of ['surface','fg','muted','accent','border'])if(typeof next[key]==='string')root.style.setProperty('--'+key,next[key]);
  if(typeof next.font==='string')root.style.setProperty('--font-sans',next.font);
  if(typeof next.fontSize==='string')root.style.setProperty('--widget-font-size',next.fontSize);
  if(next.scheme==='dark'||next.scheme==='light')root.style.colorScheme=next.scheme;
 };
 const style=document.createElement('style');
 style.textContent='html{height:auto;overflow:auto}body{margin:0;padding:16px;background:var(--surface);color:var(--fg);font:var(--widget-font-size,14px)/1.5 var(--font-sans);overflow-wrap:anywhere}button,input,select,textarea{font:inherit;color:inherit}button,input,select,textarea{accent-color:var(--accent)}button{touch-action:manipulation}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}img,svg,canvas{max-width:100%}@media(pointer:coarse){button,input,select{min-height:44px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}';
 document.head.append(style);apply(theme);
 addEventListener('message',e=>{if(e.source===parent&&e.data?.kind==='kindred-shard-theme')apply(e.data.theme);});
 const error=value=>send('kindred-shard-error',{message:String(value?.message||value||'This view could not start.').slice(0,240)});
 addEventListener('error',e=>{if(e.message)error(e.message);});
 addEventListener('unhandledrejection',e=>error(e.reason));
 addEventListener('kindred-preview-error',e=>error(e.detail));
 addEventListener('DOMContentLoaded',()=>{
  let queued=false,settled=false;
  const size=()=>{if(queued||!settled)return;queued=true;requestAnimationFrame(()=>{queued=false;send('kindred-shard-size',{height:document.body.getBoundingClientRect().height});});};
  new ResizeObserver(size).observe(document.body);
  // React commits after DOMContentLoaded. Measure only after its first paint and
  // bundled fonts settle, then freeze the outer height so later edits cannot move chat.
  Promise.resolve(document.fonts?.ready).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{settled=true;size();send('kindred-shard-ready');})));
 });
}
function shardTheme(){
 const css=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
 return {surface:css.getPropertyValue('--surface').trim(),fg:css.getPropertyValue('--fg').trim(),muted:css.getPropertyValue('--muted').trim(),accent:css.getPropertyValue('--accent').trim()||css.getPropertyValue('--fg').trim(),border:css.getPropertyValue('--line').trim(),scheme:css.colorScheme.includes('dark')?'dark':'light',font:body.fontFamily,fontSize:body.fontSize};
}
// Shards are temporary, message-local interactive views, not saved artifacts.
export function inlineShard(source,language,name='Interactive view'){
 const box=element('section','inline-shard'),stage=element('div','shard-stage'),status=element('span','shard-loading','Building view…'),actions=element('div','shard-actions'),sourcePanel=element('div','shard-source');
 box.dataset.shardSignature=JSON.stringify([language,source]);box.setAttribute('aria-label',name);status.setAttribute('role','status');
 const sourcePre=element('pre','',source);sourcePre.tabIndex=0;sourcePre.setAttribute('aria-label','View source');
 sourcePanel.append(element('p','shard-note','Temporary view. Leaving this chat, reloading, or retrying resets your inputs. Save a separate artifact to keep them.'),sourcePre);sourcePanel.hidden=true;
 let frame=null,disposed=false,started=false,visibility=null,removal=null,themeObserver=null,timer=null,generation=0,naturalHeight=180,collapsedHeight=null,expanded=false,failed=false;
 const expand=control('Expand',()=>{expanded=!expanded;expand.textContent=expanded?'Collapse':'Expand';expand.setAttribute('aria-expanded',String(expanded));box.classList.toggle('shard-expanded',expanded);size();});
 expand.setAttribute('aria-expanded','false');expand.title='Show more of this view';
 const showSource=control('Source',()=>{sourcePanel.hidden=!sourcePanel.hidden;showSource.setAttribute('aria-expanded',String(!sourcePanel.hidden));});showSource.setAttribute('aria-expanded','false');
 const retry=control('Retry',()=>mount(true));retry.hidden=true;retry.title='Restart this view and reset its inputs';actions.append(expand,showSource,retry);box.append(stage,status,actions,sourcePanel);
 function size(){if(frame){const height=expanded?Math.max(240,Math.min(800,window.innerHeight*.75)):(collapsedHeight??180);frame.style.height=height+'px';}}
 function fail(error){if(disposed||failed)return;failed=true;clearTimeout(timer);box.dataset.state='error';status.className='shard-error';status.textContent='This view could not load. '+String(error?.message||error||'Try again or view its source.').slice(0,240);status.hidden=false;stage.hidden=true;retry.hidden=false;expand.disabled=true;}
 const receive=e=>{
  if(!frame||e.source!==frame.contentWindow||e.origin!=='null'||disposed)return;
  if(e.data?.kind==='kindred-shard-size'&&Number.isFinite(e.data.height)&&e.data.height>0){naturalHeight=Math.ceil(e.data.height);if(collapsedHeight===null)collapsedHeight=Math.max(120,Math.min(320,naturalHeight));size();}
  if(e.data?.kind==='kindred-shard-ready'&&!failed){clearTimeout(timer);box.dataset.state='ready';status.hidden=true;lastTheme='';theme();}
  if(e.data?.kind==='kindred-shard-error')fail(typeof e.data.message==='string'?e.data.message:'Try again or view its source.');
 };
 let lastTheme='';
 function theme(){if(!frame)return;const value=shardTheme(),key=JSON.stringify(value);if(key===lastTheme)return;lastTheme=key;frame?.contentWindow?.postMessage({kind:'kindred-shard-theme',theme:value},'*');}
 async function mount(reset=false){
  if((started&&!reset)||disposed||!box.isConnected)return;started=true;visibility?.disconnect();const attempt=++generation;
  clearTimeout(timer);failed=false;frame?.remove();frame=null;lastTheme='';naturalHeight=180;collapsedHeight=null;stage.hidden=false;status.hidden=false;status.className='shard-loading';status.textContent='Building view…';retry.hidden=true;expand.disabled=false;box.dataset.state='loading';
  timer=setTimeout(()=>fail('Try again or view its source.'),12000);
  try{
   const doc=await artifactDocument(source,language,'('+shardBridge.toString()+')('+JSON.stringify(shardTheme())+');');if(disposed||attempt!==generation||!box.isConnected||failed)return;
   frame=element('iframe','artifact-frame shard-frame');frame.title=name;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");loadArtifactFrame(frame,doc);stage.replaceChildren(frame);size();
  }catch(error){if(attempt===generation)fail(error);}
 }
 // Disposable reconciliation nodes never run. Keep mounted frames intact on updates.
 queueMicrotask(()=>{if(!box.isConnected)return;window.addEventListener('message',receive);window.addEventListener('resize',size);visibility=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void mount();},{rootMargin:'100px'});visibility.observe(box);themeObserver=new MutationObserver(theme);for(const target of [document.documentElement,document.body])themeObserver.observe(target,{attributes:true,attributeFilter:['style','class','data-theme','data-accent']});removal=new MutationObserver(()=>{if(!box.isConnected){disposed=true;generation++;clearTimeout(timer);visibility.disconnect();removal.disconnect();themeObserver.disconnect();window.removeEventListener('message',receive);window.removeEventListener('resize',size);}});removal.observe(document.body,{childList:true,subtree:true});});
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
  if(['shard-html','shard-jsx'].includes(language)){
   if(sourceText!==undefined&&!complete)complete=completedFences(sourceText);
   if(complete&&!complete.has(language+'\0'+source.trimEnd())){pre.replaceWith(element('span','shard-loading','Building view…'));continue;}
   pre.replaceWith(inlineShard(source,language.includes('html')?'html':'jsx'));continue;
  }
  // Retain language metadata without accepting arbitrary author-controlled classes.
  code.className='';if(source.length<=HIGHLIGHT_MAX_CHARS&&hljs.getLanguage(language))code.innerHTML=hljs.highlight(source,{language,ignoreIllegals:true}).value;const box=element('div','markdown-code'),bar=element('div','code-toolbar');
  bar.append(element('span','code-language',language),control('Copy code',async()=>{try{await navigator.clipboard.writeText(source);bar.querySelector('button').textContent='Copied';setTimeout(()=>{if(bar.isConnected)bar.querySelector('button').textContent='Copy code';},1800);}catch{bar.querySelector('button').textContent='Copy unavailable';}}));
  pre.replaceWith(box);box.append(bar,pre);
 }
}
const fileSvg=(path)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);return svg;};
export function fileCard(attachment,{getBlob,getPagePreview,nativeSave,nativeLookup,nativeReveal,nativeOpen,downloadScope,folderLabel,notice,renderMarkdown}){
 const name=attachment.name||attachment.title||'File',extension=name.split('.').pop().toLowerCase(),card=element('section','deliverable-card'),heading=element('div','deliverable-heading'),badge=element('span','deliverable-type'),copy=element('div','deliverable-copy');
 const markdownFile=['md','markdown'].includes(extension);
 const kind=markdownFile?'source':['xlsx','xls','csv'].includes(extension)?'sheet':['docx','doc','txt'].includes(extension)?'word':extension==='pdf'?'pdf':'file';card.dataset.kind=kind;badge.dataset.kind=kind;badge.title=extension.toUpperCase()+' file';
 badge.append(fileSvg(kind==='sheet'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 11h8v7H8z M8 14h8 M12 11v7':kind==='word'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 15h8 M8 18h5':kind==='source'?'m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12':kind==='pdf'?'M5 3h10l4 4v14H5z M14 3v5h5 M8 17c4-6 3-8 2-7s1 8 5 6-6-1-7 1':'M5 3h10l4 4v14H5z M14 3v5h5'));
 card.dataset.fileSignature=JSON.stringify([attachment.id,name,attachment.size??null,attachment.source_url||null]);card.setAttribute('aria-label','File: '+name);copy.title=name;copy.append(element('strong','deliverable-name',name),element('span','deliverable-size',extension.toUpperCase()+(Number.isFinite(attachment.size)?' · '+(attachment.size<1024?attachment.size+' B':attachment.size<1048576?(attachment.size/1024).toFixed(1)+' KB':(attachment.size/1048576).toFixed(1)+' MB'):'')));heading.append(badge,copy);card.append(heading);
 const actions=element('div','deliverable-actions'),announcement=element('span','download-announcement');
 announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');card.append(announcement);
 const delivery=fileDownload(attachment,{getBlob,nativeSave,nativeLookup,nativeReveal,downloadScope,folderLabel,notice});delivery.watch(announcement);
 const createDownloadButton=()=>delivery.createButton();actions.append(createDownloadButton());heading.append(actions);
 // Markdown keeps its default-app action on the filename, without a third icon.
 if(markdownFile&&nativeSave&&nativeOpen){const title=copy.querySelector('strong'),open=control(name,async()=>{open.disabled=true;try{const receipt=await delivery.ensureSaved();if(receipt){await nativeOpen(receipt);announcement.textContent='Sent '+name+' to your default app.';}}catch(error){notice('Could not open '+name+'. '+error.message,true);}finally{open.disabled=false;}});open.className='deliverable-name deliverable-open';open.title='Open '+name+' in your default app';open.setAttribute('aria-label','Open '+name);title.replaceWith(open);}
 const previewable=['docx','xlsx','pdf','html','htm','jsx','md','markdown','txt','csv','json','png','jpg','jpeg','webp','gif'].includes(extension);
 const preview=control('',async()=>{try{const {openDocumentPreview}=await import('./document-preview.js');if(!card.isConnected)return;await openDocumentPreview({card,name,extension,getBlob:signal=>getBlob(attachment.id,{signal}),getPagePreview:getPagePreview?(signal)=>getPagePreview(attachment.id,signal):null,createDownloadButton,renderMarkdown,artifactPreview});}catch(error){notice('Preview unavailable. '+error.message,true);}});
 preview.className='artifact-action document-icon-button file-preview';preview.setAttribute('aria-label','Preview');preview.title=previewable?'Preview '+name:'Preview unavailable for this file type';preview.disabled=!previewable;preview.append(fileSvg('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'));actions.append(preview);
 try{const u=new URL(attachment.source_url);if(u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname)&&!u.username&&!u.password){const a=element('a','deliverable-source','Open in Google Drive');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';copy.append(a);}}catch{}
 return card;
}
