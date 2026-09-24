import {DOMPurify} from './vendor.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=el('button','artifact-action',text);b.type='button';b.onclick=fn;return b;};
const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
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
 return {page,note:notes.join(' '),dispose:()=>embedded.forEach(face=>document.fonts.delete(face))};
}
export async function openDocumentPreview({card,name,extension,getBlob,download,createDownloadButton,renderMarkdown,artifactPreview}){
 const dialog=el('dialog','document-dialog'),head=el('header','document-header'),body=el('div','document-body'),foot=el('footer','document-footer','Quick preview · Download for the original formatting.');
 const title=el('strong','',name);dialog.setAttribute('aria-label',name+' preview');
 let closed=false,worker=null,pdfTask=null,timer=null,cancelWork=null,passwordRequired=false,wordDispose=null;
 const cleanup=()=>{if(closed)return;closed=true;clearTimeout(timer);cancelWork?.();wordDispose?.();worker?.terminate();pdfTask?.destroy().catch(()=>{});observer.disconnect();dialog.remove();};
 const observer=new MutationObserver(()=>{if(!card.isConnected)cleanup();});observer.observe(document.body,{childList:true,subtree:true});
 const close=button('Close',()=>dialog.close());head.append(title,createDownloadButton?createDownloadButton():button('Download',download),close);dialog.append(head,body,foot);card.append(dialog);
 dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.showModal();close.focus();body.append(el('p','document-status','Preparing preview…'));
 try{
  const blob=await getBlob();if(closed)return;if(blob.size>8*1024*1024)throw Error('Preview supports files up to 8 MB. Download to view this file.');
  if(['docx','xlsx'].includes(extension)){
   const buffer=await blob.arrayBuffer();if(closed)return;
   const result=await new Promise((resolve,reject)=>{cancelWork=()=>reject(Error('Preview closed.'));worker=new Worker(new URL('./document-worker.js',import.meta.url));timer=setTimeout(()=>{worker.terminate();reject(Error('This preview took too long. Download to view the file.'));},20000);worker.onmessage=({data})=>{cancelWork=null;clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data);};worker.onerror=()=>{cancelWork=null;clearTimeout(timer);worker.terminate();reject(Error('Unable to read this document. You can still download the original.'));};worker.postMessage({buffer,extension},[buffer]);});
   if(closed)return;body.replaceChildren();
   if(extension==='docx'){
    const rendered=await renderWordLayout(result.buffer,name);if(closed){rendered.dispose();return;}wordDispose=rendered.dispose;body.append(rendered.page);foot.textContent=rendered.note;
   }else{
    const tabs=el('div','document-sheets'),grid=el('div','document-grid');tabs.setAttribute('aria-label','Worksheets');grid.tabIndex=0;grid.setAttribute('role','region');body.append(tabs,grid);
    if(!result.sheets.length){body.append(el('p','document-status','No visible worksheets.'));return;}
    const select=index=>{const sheet=result.sheets[index];for(const [i,b] of [...tabs.children].entries())b.setAttribute('aria-pressed',String(i===index));grid.setAttribute('aria-label',sheet.name+' cells');const table=el('table'),thead=el('thead'),tr=el('tr');tr.append(el('th','',''));for(let c=0;c<(sheet.rows[0]?.length||0);c++)tr.append(el('th','',letters(c)));thead.append(tr);table.append(thead);const tbody=el('tbody');sheet.rows.forEach((row,r)=>{const tr=el('tr');tr.append(el('th','',String(r+1)));for(const cell of row){const td=el('td','',cell.text);if(cell.bold)td.style.fontWeight='650';tr.append(td);}tbody.append(tr);});table.append(tbody);grid.replaceChildren(table);foot.textContent=`${sheet.name} · ${sheet.totalRows} rows × ${sheet.totalColumns} columns${sheet.totalRows>200||sheet.totalColumns>40?' · Showing the first 200 rows and 40 columns':''}${result.truncatedSheets?' · First 30 visible sheets':''} · Formulas show saved results.`;};
    result.sheets.forEach((sheet,i)=>tabs.append(button(sheet.name,()=>select(i))));select(0);
   }
  }else if(extension==='pdf'){
   const {getDocument,GlobalWorkerOptions}=await import('./document-vendor.js');if(closed)return;GlobalWorkerOptions.workerSrc=new URL('./pdf-worker.js',import.meta.url).href;
   const data=new Uint8Array(await blob.arrayBuffer());if(closed)return;
   pdfTask=getDocument({data,isEvalSupported:false,useSystemFonts:true,useWasm:false,disableFontFace:false,maxImageSize:16000000,isOffscreenCanvasSupported:false});
   pdfTask.onPassword=()=>{passwordRequired=true;pdfTask.destroy().catch(()=>{});if(!closed)body.replaceChildren(el('p','document-status','This PDF is password protected. Download it to open with your password.'));};
   timer=setTimeout(()=>pdfTask.destroy().catch(()=>{}),20000);const pdf=await pdfTask.promise;clearTimeout(timer);if(closed)return;body.replaceChildren();let pageNumber=1,busy=false;
   const controls=el('div','document-pages'),label=el('span'),canvasWrap=el('div','document-pdf');
   const render=async()=>{
    if(busy||closed)return;busy=true;previous.disabled=next.disabled=true;canvasWrap.setAttribute('aria-busy','true');
    try{
     const page=await pdf.getPage(pageNumber);if(closed)return;
     const viewport=page.getViewport({scale:1}),scale=Math.min(2,1600/viewport.width,2200/viewport.height),view=page.getViewport({scale}),canvas=el('canvas');
     canvas.width=view.width;canvas.height=view.height;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${name}, page ${pageNumber}`);
     await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;page.cleanup();if(closed)return;
     canvasWrap.replaceChildren(canvas);canvasWrap.scrollTop=0;label.textContent=`Page ${pageNumber} of ${pdf.numPages}`;
    }catch(e){if(!closed)body.replaceChildren(el('p','document-status','Could not render this page. Download to view the original.'));}
    finally{busy=false;canvasWrap.removeAttribute('aria-busy');previous.disabled=pageNumber===1;next.disabled=pageNumber===pdf.numPages;}
   };
   const previous=button('Previous page',()=>{pageNumber--;render();}),next=button('Next page',()=>{pageNumber++;render();});controls.append(previous,label,next);body.append(controls,canvasWrap);await render();
  }else if(['html','htm','jsx'].includes(extension)){
   if(blob.size>256*1024)throw Error('Interactive preview supports files up to 256 KB.');const text=await blob.text();if(closed)return;const preview=artifactPreview(text,extension==='jsx'?'jsx':'html',name);body.replaceChildren(preview);preview.querySelector('button').click();
  }else if(['png','jpg','jpeg','webp','gif'].includes(extension)){
   const img=el('img','document-image');img.alt=name;const url=URL.createObjectURL(blob);img.onload=img.onerror=()=>URL.revokeObjectURL(url);dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});img.src=url;body.replaceChildren(img);
  }else{
   if(blob.size>256*1024)throw Error('Text preview supports files up to 256 KB. Download to view the full file.');const text=await blob.text();if(closed)return;const content=extension==='md'&&renderMarkdown?renderMarkdown(text):el('pre','deliverable-text',text);content.classList.add('document-prose');body.replaceChildren(content);
  }
 }catch(error){clearTimeout(timer);if(!closed&&!passwordRequired)body.replaceChildren(el('p','document-status','Preview unavailable. '+(error.message||'Download to view this file.')));}
}
