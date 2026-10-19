import {DOMPurify} from './vendor.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=el('button','artifact-action',text);b.type='button';b.onclick=fn;return b;};
const iconButton=(label,path,action)=>{const b=button('',action);b.classList.add('document-icon-button');b.title=label;b.setAttribute('aria-label',label);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',path);svg.append(line);b.append(svg);return b;};
const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
// Zoom belongs to the reading surface, never to the surrounding app. Automatic
// fit is capped at actual size; an explicit zoom remains stable across resizing.
function documentZoom(body, surface, dimensions, apply, initialMode='page') {
 const scope=body.parentElement,toolbar=el('div','document-zoom');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Document zoom');
 let mode=initialMode,scale=1,manual=1,frame=0,disposed=false;
 const minus=button('−',()=>adjust(-.1)),plus=button('+',()=>adjust(.1)),value=el('output','document-zoom-value');
 minus.setAttribute('aria-label','Zoom out');plus.setAttribute('aria-label','Zoom in');value.setAttribute('aria-label','Zoom level');
 const fitPage=button('Fit page',()=>setMode('page')),fitWidth=button('Fit width',()=>setMode('width'));
 minus.title='Zoom out (Ctrl/Cmd −)';plus.title='Zoom in (Ctrl/Cmd +)';fitPage.title='Fit page (Ctrl/Cmd 0)';
 toolbar.append(minus,value,plus,fitPage,fitWidth);body.prepend(toolbar);
 function refresh(){
  frame=0;if(disposed)return;
  const size=dimensions(),css=getComputedStyle(surface);
  const width=surface.clientWidth-(parseFloat(css.paddingLeft)||0)-(parseFloat(css.paddingRight)||0);
  const height=surface.clientHeight-(parseFloat(css.paddingTop)||0)-(parseFloat(css.paddingBottom)||0);
  if(width<=0||height<=0||!size.width||!size.height)return;
  scale=mode==='manual'?manual:Math.max(.05,Math.min(1,width/size.width,mode==='page'?height/size.height:Infinity));
  apply(scale);value.textContent=Math.round(scale*100)+'%';
  minus.disabled=scale<=.25;plus.disabled=scale>=3;
  fitPage.setAttribute('aria-pressed',String(mode==='page'));fitWidth.setAttribute('aria-pressed',String(mode==='width'));
 }
 function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(refresh);}
 function setMode(next){mode=next;schedule();}
 function adjust(delta){manual=Math.max(.25,Math.min(3,Math.round(((mode==='manual'?manual:scale)+delta)*100)/100));mode='manual';schedule();}
 const key=event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest?.('input,textarea,[contenteditable="true"]'))return;
  if(['+','=','-','0'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='0')setMode(initialMode);else adjust(event.key==='-'?-.1:.1);}
 };
 const wheel=event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();event.stopPropagation();if(event.deltaY)adjust(event.deltaY<0?.1:-.1);};
 scope.addEventListener('keydown',key);surface.addEventListener('wheel',wheel,{passive:false});
 const observer=new ResizeObserver(schedule);observer.observe(surface);schedule();
 return {refresh:schedule,dispose:()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();scope.removeEventListener('keydown',key);surface.removeEventListener('wheel',wheel);toolbar.remove();}};
}
// Static Word content never navigates a subframe. WKWebView passes srcdoc
// navigation through the native origin guard, which correctly rejects it.
export function renderWordDocument(source,name){
 const page=el('article','document-word');page.setAttribute('aria-label',name+' document');
 const fragment=DOMPurify.sanitize(source,{RETURN_DOM_FRAGMENT:true,ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','sup','sub','ul','ol','li','table','thead','tbody','tr','th','td','blockquote','pre','hr','img'],ALLOWED_ATTR:['src','alt','colspan','rowspan'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});
 for(const image of fragment.querySelectorAll('img')){
  if(!/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(image.getAttribute('src')||'')){image.replaceWith(el('p','',image.alt||'Image unavailable in quick preview.'));continue;}
  image.onerror=()=>image.replaceWith(el('p','',image.alt||'Image unavailable in quick preview.'));
 }
 if(!fragment.textContent.trim()&&!fragment.querySelector('img'))throw Error('This document has no text or images that quick preview can display. Download to view the original.');
 // The shadow root isolates app/document styles, not security. The strict
 // sanitizer above removes active content, links, styles and author IDs.
 const root=page.attachShadow({mode:'open'}),style=el('style'),paper=el('div','paper');
 style.textContent=`
 :host{display:block;min-width:0;color-scheme:inherit;font:calc(15px * var(--text-scale,1))/1.65 system-ui}
 .paper{box-sizing:border-box;width:100%;max-width:820px;margin:0 auto;padding:36px 48px;background:var(--word-paper,#fff);color:var(--fg,#20242a);-webkit-text-fill-color:var(--fg,#20242a);text-align:left;text-indent:0;box-shadow:0 1px 4px #0001;overflow-wrap:anywhere}
 .paper *{box-sizing:border-box}
 h1,h2,h3{line-height:1.25}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}
 td,th{border:1px solid var(--line,#d5d9df);padding:8px}img{max-width:100%;height:auto}
 p,li,pre{overflow-wrap:anywhere}pre{white-space:pre-wrap}
 ul,ol{padding-inline-start:24px}blockquote{margin-inline:0;padding-inline-start:16px;border-left:3px solid var(--line,#d5d9df)}
 @media(max-width:500px){.paper{padding:24px}}
 `;
 paper.append(fragment);root.append(style,paper);return page;
}
// ZIP expansion limits are checked in the worker before layout rendering.
export async function renderWordLayout(buffer,name){
 const {renderDocx,unzipSync,zipSync,strFromU8,strToU8}=await import('./document-vendor.js');
 const files=unzipSync(new Uint8Array(buffer)),fonts=new Set();let fields=false,omitted=false;
 const parser=new DOMParser(),serializer=new XMLSerializer();
 for(const [path,bytes] of Object.entries(files)){
  if(!/\.(xml|rels)$/i.test(path))continue;
  const xml=parser.parseFromString(strFromU8(bytes),'application/xml');
  if(xml.querySelector('parsererror'))throw Error('The document contains invalid XML.');
  for(const node of [...xml.getElementsByTagName('*')]){
   if(node.localName==='Relationship'&&(node.getAttribute('TargetMode')==='External'||/^(?:[a-z]+:|\/\/)/i.test(node.getAttribute('Target')||''))){node.remove();omitted=true;}
   if(['altChunk','object'].includes(node.localName)){node.remove();omitted=true;}
   if(['instrText','fldSimple'].includes(node.localName))fields=true;
   if(node.localName==='rFonts')for(const attr of [...node.attributes])if(['ascii','hAnsi','eastAsia','cs'].includes(attr.localName)&&attr.value)fonts.add(attr.value);
   for(const attr of [...node.attributes])if(/(?:url\s*\(|@import|[<>])/i.test(attr.value))node.removeAttributeNode(attr);
  }
  files[path]=strToU8(serializer.serializeToString(xml));
 }
 const page=el('article','document-word');page.setAttribute('aria-label',name+' document');
 const root=page.attachShadow({mode:'open'}),styles=el('div'),paper=el('div','paper');
 await renderDocx(zipSync(files),paper,styles,{inWrapper:false,ignoreLastRenderedPageBreak:false,renderAltChunks:false,useBase64URL:true,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true});
 const clean=DOMPurify.sanitize(paper,{RETURN_DOM_FRAGMENT:true,ADD_TAGS:['style'],ADD_ATTR:['style'],FORBID_TAGS:['iframe','object','embed','script','form','input','button'],ALLOW_DATA_ATTR:false});
 for(const image of clean.querySelectorAll('img')){
  // JSZip gives embedded images a generic MIME type. Sniff the raster bytes
  // rather than dropping valid illustrations or admitting SVG/HTML payloads.
  const data=(image.getAttribute('src')||'').match(/^data:[^;,]*;base64,([a-z0-9+/=\s]+)$/i);let type='';
  if(data){const magic=atob(data[1].replace(/\s/g,'').slice(0,48));type=magic.startsWith('\x89PNG\r\n\x1a\n')?'png':magic.startsWith('\xff\xd8\xff')?'jpeg':/^GIF8[79]a/.test(magic)?'gif':magic.startsWith('BM')?'bmp':magic.startsWith('RIFF')&&magic.slice(8,12)==='WEBP'?'webp':'';}
  if(type)image.src='data:image/'+type+';base64,'+data[1];else{image.removeAttribute('src');image.alt=image.alt||'Unsupported document image';omitted=true;}
 }
 for(const link of clean.querySelectorAll('a'))if(!(link.getAttribute('href')||'').startsWith('#'))link.removeAttribute('href');
 const style=el('style');style.textContent=':host{display:block;overflow:auto;color-scheme:light;color:#000;-webkit-text-fill-color:currentColor;font:12pt "Times New Roman",serif}.paper{width:max-content;min-width:100%}section.docx{margin:0 auto 20px;box-shadow:0 1px 5px #0002;color:#000;background:white;flex-shrink:0}*{-webkit-text-fill-color:currentColor}';
 const embedded=[],aliases=new Map(),sheets=[];
 // Font faces in shadow-root styles are not supported consistently. Register
 // embedded fonts under private names so a report cannot change the app's fonts.
 for(const css of styles.querySelectorAll('style')){
  css.textContent=css.textContent.replace(/@import[^;]*;?/gi,'').replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi,'none');
  const sheet=new CSSStyleSheet();sheet.replaceSync(css.textContent);sheets.push([css,sheet]);
  for(const rule of sheet.cssRules)if(rule.type===CSSRule.FONT_FACE_RULE){
   const family=rule.style.fontFamily.replace(/^['"]|['"]$/g,''),src=rule.style.getPropertyValue('src');
   if(!/^url\(["']?data:[^)]*\)$/i.test(src))continue;
   const alias=aliases.get(family)||'KindredWord'+crypto.randomUUID().replaceAll('-','');aliases.set(family,alias);
   try{const face=await new FontFace(alias,src,{weight:rule.style.fontWeight||'normal',style:rule.style.fontStyle||'normal'}).load();document.fonts.add(face);embedded.push(face);}catch{omitted=true;}
  }
 }
 const mapFamily=value=>value.split(',').map(f=>{const name=f.trim().replace(/^['"]|['"]$/g,'');return aliases.has(name)?JSON.stringify(aliases.get(name)):f;}).join(',');
 for(const [css,sheet]of sheets){for(const rule of sheet.cssRules)if(rule.style?.fontFamily)rule.style.fontFamily=mapFamily(rule.style.fontFamily);css.textContent=[...sheet.cssRules].filter(rule=>rule.type!==CSSRule.FONT_FACE_RULE).map(rule=>rule.cssText).join('\n');}
 for(const node of clean.querySelectorAll('[style]')){if(node.style.fontFamily)node.style.fontFamily=mapFamily(node.style.fontFamily);for(const key of [...node.style])if(/url\s*\(/i.test(node.style.getPropertyValue(key)))node.style.removeProperty(key);}
 root.append(styles,style,clean);
 root.addEventListener('click',event=>{const link=event.target.closest?.('a[href^="#"]');if(!link)return;event.preventDefault();const id=link.getAttribute('href').slice(1);root.getElementById(id)?.scrollIntoView({block:'start'});});
 await document.fonts.ready;
 const measure=document.createElement('canvas').getContext('2d'),sample='mmmmmmmmmmWWWWiiii12345';
 const missing=[...fonts].filter(font=>!['serif','sans-serif','monospace','system-ui'].includes(font)&&['monospace','serif','sans-serif'].every(fallback=>{measure.font='32px '+fallback;const base=measure.measureText(sample).width;measure.font='32px '+JSON.stringify(aliases.get(font)||font)+','+fallback;return measure.measureText(sample).width===base;})).slice(0,8);
 const notes=['DOCX layout may differ from Word.'];
 if(missing.length)notes.push('Unavailable fonts: '+missing.join(', ')+'.');
 if(fields)notes.push('TOC and fields show saved values; page numbers are not recalculated.');
 if(omitted)notes.push('External or embedded active content was omitted.');
 notes.push('Use a PDF exported by the author for final pagination review.');
 // The caller connects zoom after mounting so the available height is real.
 let zoom=null;
 return {page,note:notes.join(' '),connectZoom:body=>{
  page.tabIndex=0;
  const content=root.querySelector('.paper');
  if(!content)return;
  content.style.minWidth='0';content.style.margin='0 auto';
  zoom=documentZoom(body,page,()=>({width:Math.max(0,...[...content.querySelectorAll('section.docx')].map(n=>n.offsetWidth)),height:Math.max(0,...[...content.querySelectorAll('section.docx')].map(n=>n.offsetHeight))}),scale=>{content.style.zoom=String(scale);});
 },dispose:()=>{zoom?.dispose();embedded.forEach(face=>document.fonts.delete(face));}};
}
// Keep the whole document in one scroll surface, but only retain canvases near
// the reader. Page placeholders preserve scroll position when canvases are freed.
function renderContinuousPdf(pdf, name, body, foot, paginatedWord, firstSize) {
 const viewport=el('div','document-pdf document-pdf-continuous');
 viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label',name+' pages');
 body.replaceChildren(viewport);
 let disposed=false,frame=0,rendering=false,active=null,zoomScale=0,revision=0,resolveReady;
 const ready=new Promise(resolve=>{resolveReady=resolve;});
 const pages=[],near=new Set();
 const release=entry=>{if(entry.canvas){entry.canvas.width=0;entry.canvas.height=0;entry.canvas.remove();entry.canvas=null;}};
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
 const renderNext=async()=>{
  if(rendering||disposed)return;rendering=true;
  try{
   while(!disposed){
    const mid=viewport.getBoundingClientRect().top+viewport.clientHeight/2;
    const entry=[...near].filter(p=>!p.canvas&&!p.failed).sort((a,b)=>Math.abs(a.node.getBoundingClientRect().top-mid)-Math.abs(b.node.getBoundingClientRect().top-mid))[0];
    if(!entry)break;
    const version=revision;let page=null,canvas=null;
    entry.node.setAttribute('aria-busy','true');
    try{
     page=await pdf.getPage(entry.number);if(disposed||version!==revision||!near.has(entry))continue;
     const natural=page.getViewport({scale:1});entry.size={width:natural.width*4/3,height:natural.height*4/3};entry.node.style.aspectRatio=natural.width+' / '+natural.height;entry.node.style.width=(entry.size.width*zoomScale)+'px';zoom.refresh();
     // Device scale sharpens text while a pixel ceiling bounds each canvas.
     const scale=Math.min(2,Math.max(1,devicePixelRatio||1))*entry.node.clientWidth/natural.width;
     const view=page.getViewport({scale:Math.min(scale,2200/natural.height,1800/natural.width)});
     canvas=el('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
     canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${name}, page ${entry.number}`);
     active={entry,task:page.render({canvasContext:canvas.getContext('2d'),viewport:view})};
     await active.task.promise;
     if(disposed||version!==revision||!near.has(entry))continue;
     entry.canvas=canvas;entry.node.append(canvas);canvas=null;resolveReady();schedule();
    }catch(error){
     if(!disposed&&version===revision&&near.has(entry)&&error.name!=='RenderingCancelledException'){
      entry.failed=true;entry.node.append(el('p','document-status','Could not render this page. Download to view the original.'));resolveReady();
     }
    }finally{
     if(canvas){canvas.width=0;canvas.height=0;}active=null;page?.cleanup();entry.node.removeAttribute('aria-busy');
    }
   }
  }finally{rendering=false;}
 };
 function update(){
  frame=0;if(disposed)return;
  const bounds=viewport.getBoundingClientRect(),height=viewport.clientHeight;
  const candidates=pages.filter(entry=>{const rect=entry.node.getBoundingClientRect();return rect.bottom>bounds.top-height&&rect.top<bounds.bottom+height;});
  // Render visible pages first; very short pages must not retain hundreds of canvases.
  candidates.sort((a,b)=>Math.abs(a.node.getBoundingClientRect().top-(bounds.top+height/2))-Math.abs(b.node.getBoundingClientRect().top-(bounds.top+height/2)));
  near.clear();for(const entry of candidates.slice(0,6))near.add(entry);
  for(const entry of pages)if(!near.has(entry))release(entry);
  if(active&&!near.has(active.entry))active.task.cancel();
  const atEnd=viewport.scrollTop>0&&viewport.scrollTop+height>=viewport.scrollHeight-2;
  const current=atEnd?pages.at(-1):pages.find(entry=>entry.node.getBoundingClientRect().bottom>bounds.top+Math.min(80,height/3))||pages.at(-1);
  if(current)foot.textContent=`Page ${current.number} of ${pdf.numPages}`+(paginatedWord?' · Document preview · Font substitutions may differ from Word.':' · PDF preview');
  void renderNext();
 }
 // A single lightweight placeholder per page makes keyboard and touch scrolling
 // work naturally, including jumping straight to a distant page.
 for(let number=1;number<=pdf.numPages;number++){
  const node=el('div','document-pdf-page');node.style.aspectRatio=firstSize.width+' / '+firstSize.height;node.setAttribute('data-page',String(number));
  node.setAttribute('role','group');node.setAttribute('aria-label',`Page ${number} of ${pdf.numPages}`);
  viewport.append(node);pages.push({node,number,size:firstSize,canvas:null,failed:false});
 }
 viewport.addEventListener('scroll',schedule,{passive:true});
 const zoom=documentZoom(body,viewport,()=>({width:Math.max(...pages.map(p=>p.size.width)),height:Math.max(...pages.map(p=>p.size.height))}),scale=>{
  if(scale!==zoomScale){
   // Keep the current page and position when zoom changes, including fit on resize.
   const bounds=viewport.getBoundingClientRect();
   const atEnd=viewport.scrollTop>0&&viewport.scrollTop+viewport.clientHeight>=viewport.scrollHeight-2;
   const anchor=pages.find(p=>p.node.getBoundingClientRect().bottom>bounds.top);
   const offset=anchor?(bounds.top-anchor.node.getBoundingClientRect().top)/anchor.node.clientHeight:0;
   zoomScale=scale;revision++;active?.task.cancel();
   for(const entry of pages){release(entry);entry.node.style.width=(entry.size.width*scale)+'px';}
   // A pending fit must not move an end-of-document navigation back a page.
   if(atEnd)viewport.scrollTop=viewport.scrollHeight;
   else if(anchor)viewport.scrollTop+=anchor.node.getBoundingClientRect().top-bounds.top+offset*anchor.node.clientHeight;
  }
  schedule();
 });
 return {ready,dispose:()=>{if(disposed)return;disposed=true;revision++;resolveReady();cancelAnimationFrame(frame);zoom.dispose();viewport.removeEventListener('scroll',schedule);active?.task.cancel();for(const entry of pages)release(entry);near.clear();}};
}
export async function openDocumentPreview({card,name,extension,getBlob,getPagePreview,download,createDownloadButton,renderMarkdown,artifactPreview,mount=null,onMount=null,onUnavailable=()=>{}}){
 const dialog=el(mount?'section':'dialog',mount?'document-inline':'document-dialog'),head=el('header','document-header'),body=el('div','document-body'),foot=el('footer','document-footer','Quick preview · Download for the original formatting.');
 const title=el('strong','',name);dialog.setAttribute('aria-label',name+' preview');
 const conversionAbort=new AbortController(),lifecycleAbort=new AbortController();let paginatedWord=false,conversionFailed=false;
 let closed=false,worker=null,pdfTask=null,timer=null,cancelWork=null,passwordRequired=false,wordDispose=null,pagesDispose=null;
 const cleanup=()=>{if(closed)return;closed=true;lifecycleAbort.abort();conversionAbort.abort();clearTimeout(timer);cancelWork?.();pagesDispose?.();wordDispose?.();worker?.terminate();pdfTask?.destroy().catch(()=>{});observer.disconnect();dialog.remove();};
 const handle={root:dialog,dispose:cleanup};
 // A modal is a reading session, not part of its transient transcript card.
 // Live progress may replace that card while the reader is on another page.
 // Inline studio previews still belong to their card and its lifecycle.
 const observer=new MutationObserver(()=>{if(!dialog.isConnected||(mount&&!card.isConnected))cleanup();});observer.observe(document.body,{childList:true,subtree:true});onMount?.(handle);
 const close=iconButton('Close','m6 6 12 12M6 18 18 6',()=>dialog.close());head.append(title,createDownloadButton?createDownloadButton({iconOnly:true}):iconButton('Download','M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',download),close);if(!mount)dialog.append(head);dialog.append(body,foot);(mount||document.body).append(dialog);
 dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('click',e=>{if(!mount&&e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 if(!mount){dialog.showModal();close.focus();}body.append(el('p','document-status','Preparing preview…'));
 try{
  let blob;
  if(extension==='docx'&&getPagePreview){
   body.firstChild.textContent='Laying out document…';
   timer=setTimeout(()=>conversionAbort.abort(),90000);
   try{blob=await getPagePreview(conversionAbort.signal);paginatedWord=true;extension='pdf';}catch{conversionFailed=true;}finally{clearTimeout(timer);}
   if(closed)return;
  }
  if(!blob)blob=await getBlob(lifecycleAbort.signal);if(closed)return;if(blob.size>(paginatedWord?32:8)*1024*1024)throw Error('Preview supports files up to 8 MB. Download to view this file.');
  if(['docx','xlsx'].includes(extension)){
   const buffer=await blob.arrayBuffer();if(closed)return;
   const result=await new Promise((resolve,reject)=>{cancelWork=()=>reject(Error('Preview closed.'));worker=new Worker(new URL('./document-worker.js',import.meta.url));timer=setTimeout(()=>{worker.terminate();reject(Error('This preview took too long. Download to view the file.'));},20000);worker.onmessage=({data})=>{cancelWork=null;clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data);};worker.onerror=()=>{cancelWork=null;clearTimeout(timer);worker.terminate();reject(Error('Unable to read this document. You can still download the original.'));};worker.postMessage({buffer,extension},[buffer]);});
   if(closed)return;body.replaceChildren();
   if(extension==='docx'){
    const rendered=await renderWordLayout(result.buffer,name);if(closed){rendered.dispose();return;}wordDispose=rendered.dispose;body.append(rendered.page);rendered.connectZoom(body);foot.textContent=(conversionFailed?'Quick preview · Page layout unavailable on this server. ':'')+rendered.note;
   }else{
    const tabs=el('div','document-sheets'),grid=el('div','document-grid');tabs.setAttribute('aria-label','Worksheets');grid.tabIndex=0;grid.setAttribute('role','region');body.append(tabs,grid);
    if(!result.sheets.length){body.append(el('p','document-status','No visible worksheets.'));return handle;}
    tabs.setAttribute('role','group');
    const select=index=>{const sheet=result.sheets[index];for(const [i,b] of [...tabs.children].entries())b.setAttribute('aria-pressed',String(i===index));grid.setAttribute('aria-label',sheet.name+' cells');const table=el('table'),columns=el('colgroup');columns.append(el('col'));for(const width of sheet.widths||[]){const col=el('col');col.style.width=width+'px';columns.append(col);}if(sheet.widths?.length){table.style.tableLayout='fixed';table.style.width=(40+sheet.widths.reduce((n,w)=>n+w,0))+'px';columns.firstChild.style.width='40px';}table.append(columns);const thead=el('thead'),tr=el('tr');tr.append(el('th','',''));for(let c=0;c<(sheet.rows[0]?.length||0);c++)tr.append(el('th','',letters(c)));thead.append(tr);table.append(thead);const tbody=el('tbody');sheet.rows.forEach((row,r)=>{const tr=el('tr');if(sheet.heights?.[r])tr.style.height=sheet.heights[r]+'px';tr.append(el('th','',String(r+1)));for(const cell of row){if(cell.covered)continue;const td=el('td','',cell.text);td.rowSpan=cell.rowSpan||1;td.colSpan=cell.colSpan||1;td.style.textAlign=cell.align||'left';td.style.whiteSpace=cell.wrap?'pre-wrap':'nowrap';td.style.verticalAlign=cell.vertical||'top';td.style.fontVariantNumeric='tabular-nums';if(cell.bold)td.style.fontWeight='650';if(cell.italic)td.style.fontStyle='italic';if(cell.underline)td.style.textDecoration='underline';if(cell.fontSize)td.style.fontSize=cell.fontSize+'pt';if(cell.color)td.style.color=cell.color;if(cell.fill)td.style.background=cell.fill;tr.append(td);}tbody.append(tr);});table.append(tbody);grid.replaceChildren(table);if(sheet.totalRows>200||sheet.totalColumns>40){const limit=el('p','document-truncation',`Showing rows 1–${sheet.rows.length} of ${sheet.totalRows}, columns 1–${sheet.rows[0]?.length||0} of ${sheet.totalColumns}. Download original for the remaining cells.`);limit.setAttribute('role','note');grid.append(limit);}foot.textContent=`${sheet.name} · Saved values, number/date formats and basic styling${result.truncatedSheets?' · First 30 visible sheets':''} · At most 200 rows × 40 columns per sheet. Formulas show saved results; charts, macros and conditional formatting are not displayed.`;};
    result.sheets.forEach((sheet,i)=>tabs.append(button(sheet.name,()=>select(i))));select(0);
   }
  }else if(extension==='pdf'){
   if(paginatedWord)foot.textContent='Document page preview · Font substitutions may differ from Word.';
   const {getDocument,GlobalWorkerOptions}=await import('./document-vendor.js');if(closed)return;GlobalWorkerOptions.workerSrc=new URL('./pdf-worker.js',import.meta.url).href;
   const data=new Uint8Array(await blob.arrayBuffer());if(closed)return;
   pdfTask=getDocument({data,isEvalSupported:false,useSystemFonts:true,useWasm:false,disableFontFace:false,maxImageSize:16000000,isOffscreenCanvasSupported:false});
   pdfTask.onPassword=()=>{passwordRequired=true;pdfTask.destroy().catch(()=>{});if(!closed)body.replaceChildren(el('p','document-status','This PDF is password protected. Download it to open with your password.'));};
   timer=setTimeout(()=>pdfTask.destroy().catch(()=>{}),20000);const pdf=await pdfTask.promise;clearTimeout(timer);if(closed)return;
   const first=await pdf.getPage(1);if(closed)return;const natural=first.getViewport({scale:4/3});first.cleanup();
   const pages=renderContinuousPdf(pdf,name,body,foot,paginatedWord,{width:natural.width,height:natural.height});pagesDispose=pages.dispose;await pages.ready;
  }else if(['html','htm','jsx'].includes(extension)){
   if(blob.size>256*1024)throw Error('Interactive preview supports files up to 256 KB.');const text=await blob.text();if(closed)return;const preview=artifactPreview(text,extension==='jsx'?'jsx':'html',name);body.replaceChildren(preview);preview.querySelector('button').click();
  }else if(['png','jpg','jpeg','webp','gif'].includes(extension)){
   const img=el('img','document-image');img.alt=name;const url=URL.createObjectURL(blob);img.onload=img.onerror=()=>URL.revokeObjectURL(url);dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});img.src=url;body.replaceChildren(img);
  }else{
   if(blob.size>256*1024)throw Error('Text preview supports files up to 256 KB. Download to view the full file.');const text=await blob.text();if(closed)return;const content=extension==='md'&&renderMarkdown?renderMarkdown(text):el('pre','deliverable-text',text);content.classList.add('document-prose');body.replaceChildren(content);
  }
 }catch(error){clearTimeout(timer);if(!closed&&/Original file (?:not found|identity changed|bytes changed)/.test(String(error.message||'')))onUnavailable();if(!closed&&!passwordRequired)body.replaceChildren(el('p','document-status',/Original file (?:not found|identity changed|bytes changed)/.test(String(error.message||''))?'The original file is no longer available.':'Preview unavailable. '+(error.message||'Download to view this file.')));}
 return handle;
}
