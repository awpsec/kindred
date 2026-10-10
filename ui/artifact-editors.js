// Native Kindred documents/sheets. Custom applications keep their source editor.
import {DOMPurify,marked} from './vendor.js';
import {createSheetEditor} from './sheet-editor.js';
export {sheetSource} from './sheet-editor.js';
const DOC='<!--kindred-document-v1-->';
export function visualArtifactKind(v){
 if((v.kind==='document'||(!v.kind&&v.language==='markdown'))&&(v.language==='markdown'||v.source?.startsWith(DOC)))return 'document';
 if(v.kind==='sheet'&&Array.isArray(v.state?.rows)&&(v.source?.includes('kindred-sheet-v1')||v.source?.includes('let rows=[];kindredArtifact.ready')))return 'sheet';
 return null;
}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(label,fn,text=label)=>{const b=el('button','artifact-format-button',text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;return b;};
const select=(label,options,fn)=>{const s=el('select');s.setAttribute('aria-label',label);s.title=label;for(const [value,text] of options)s.append(new Option(text,value));s.onchange=()=>fn(s.value);return s;};
const fonts=[['Inter','Sans serif'],['Georgia','Serif'],['Arial','Arial'],['Courier New','Monospace']];
const sizes=[10,12,14,16,18,20,24,28,32,40,48].map(n=>[String(n),String(n)]);
const clean=html=>DOMPurify.sanitize(html,{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','textarea','select','iframe','video','audio'],FORBID_ATTR:['id','class'],ALLOW_DATA_ATTR:false});
const paperStyle='body{margin:0;padding:24px;font:16px/1.6 Inter,system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:820px;margin:auto}p{margin:.5em 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #8886;padding:8px;vertical-align:top}img{max-width:100%;height:auto}blockquote{border-left:3px solid #8886;padding-left:16px;margin-left:0}pre{white-space:pre-wrap}';
export async function createArtifactEditor(value,{onDirty=()=>{}}={}){
 if(visualArtifactKind(value)==='sheet')return createSheetEditor(value,onDirty);
 const {Editor,StarterKit,TextStyleKit,TextAlign,TableKit,Image}=await import('./editor-vendor.js');
 const root=el('div','artifact-visual-editor'),toolbar=el('div','artifact-format-toolbar'),canvas=el('div','artifact-document-canvas'),surface=el('div','artifact-document-surface');
 toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Document formatting');canvas.append(surface);
 const layout=el('div','artifact-document-layout'),status=el('div','artifact-document-status');layout.setAttribute('role','group');layout.setAttribute('aria-label','Page layout');status.setAttribute('role','status');
 const savedPage=value.state?.kindredDocument?.page||{},page={size:savedPage.size==='a4'?'a4':'letter',orientation:savedPage.orientation==='landscape'?'landscape':'portrait',margins:['normal','narrow'].includes(savedPage.margins)?savedPage.margins:'normal'};
 const pageCSS=()=>{let [w,h]=page.size==='a4'?[794,1123]:[816,1056];if(page.orientation==='landscape')[w,h]=[h,w];return {w,h,padding:page.margins==='narrow'?48:96};};
 const applyPage=()=>{const {w,h,padding}=pageCSS();surface.style.setProperty('--document-width',w+'px');surface.style.setProperty('--document-height',h+'px');surface.style.setProperty('--document-padding',padding+'px');};
 for(const [label,key,options]of [['Page size','size',[['letter','US Letter'],['a4','A4']]],['Orientation','orientation',[['portrait','Portrait'],['landscape','Landscape']]],['Page margins','margins',[['normal','Normal margins'],['narrow','Narrow margins']]]]){const choice=select(label,options,v=>{page[key]=v;applyPage();onDirty();});choice.value=page[key];layout.append(choice);}applyPage();
 const pagePanel=el('details','artifact-page-options'),pageSummary=el('summary','','Page');pagePanel.append(pageSummary,layout);root.append(toolbar,pagePanel,canvas,status);
 const narrowPage=matchMedia('(max-width:760px)');const placePage=()=>{const focused=layout.contains(document.activeElement);pagePanel.open=!narrowPage.matches;if(narrowPage.matches){toolbar.append(pagePanel);if(focused)pageSummary.focus();}else root.insertBefore(pagePanel,canvas);};narrowPage.addEventListener('change',placePage);placePage();
 let content=value.language==='markdown'?marked.parse(value.source||''):new DOMParser().parseFromString(value.source,'text/html').querySelector('main')?.innerHTML||'';
 const editor=new Editor({element:surface,extensions:[StarterKit.configure({link:{openOnClick:false}}),TextStyleKit,TextAlign.configure({types:['heading','paragraph']}),TableKit,Image.configure({allowBase64:false})],content:clean(content),editorProps:{attributes:{'aria-label':'Document content',role:'textbox','aria-multiline':'true',spellcheck:'true'},transformPastedHTML:clean},onUpdate:()=>onDirty()});
 const active=[];
 const command=(label,text,run,mark)=>{const b=button(label,()=>run(editor.chain().focus()).run(),text);b.onpointerdown=e=>e.preventDefault();if(mark)active.push([b,mark]);toolbar.append(b);return b;};
 const block=select('Paragraph style',[['p','Normal text'],['1','Heading 1'],['2','Heading 2'],['3','Heading 3']],v=>{const c=editor.chain().focus();(v==='p'?c.setParagraph():c.setHeading({level:Number(v)})).run();});
 const font=select('Font family',fonts,v=>editor.chain().focus().setFontFamily(v).run());
 const size=select('Font size',sizes,v=>editor.chain().focus().setFontSize(v+'px').run());size.value='16';toolbar.append(block,font,size);
 command('Bold','B',c=>c.toggleBold(),'bold').style.fontWeight='700';command('Italic','I',c=>c.toggleItalic(),'italic').style.fontStyle='italic';command('Underline','U',c=>c.toggleUnderline(),'underline').style.textDecoration='underline';
 command('Bulleted list','• List',c=>c.toggleBulletList(),'bulletList');command('Numbered list','1. List',c=>c.toggleOrderedList(),'orderedList');
 toolbar.append(select('Text alignment',[['left','Align left'],['center','Center'],['right','Align right'],['justify','Justify']],v=>editor.chain().focus().setTextAlign(v).run()));
 command('Undo','↶',c=>c.undo());command('Redo','↷',c=>c.redo());
 const more=el('details','artifact-format-more');more.append(el('summary','','More'));const extras=el('div','artifact-format-extras');
 const linkField=el('input');linkField.type='url';linkField.placeholder='https://';linkField.setAttribute('aria-label','Link address');
 extras.append(linkField,button('Apply link',()=>{const href=linkField.value.trim();if(!/^(https?:\/\/|mailto:)/i.test(href)){linkField.setCustomValidity('Use an https, http or mailto address.');linkField.reportValidity();return;}linkField.setCustomValidity('');editor.chain().focus().extendMarkRange('link').setLink({href}).run();more.open=false;}),button('Remove link',()=>editor.chain().focus().unsetLink().run()),button('Insert table',()=>{editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run();more.open=false;}),button('Add table row',()=>editor.chain().focus().addRowAfter().run()),button('Add table column',()=>editor.chain().focus().addColumnAfter().run()),button('Delete table row',()=>editor.chain().focus().deleteRow().run()),button('Delete table column',()=>editor.chain().focus().deleteColumn().run()),button('Toggle header row',()=>editor.chain().focus().toggleHeaderRow().run()),button('Delete table',()=>editor.chain().focus().deleteTable().run()),button('Clear formatting',()=>editor.chain().focus().unsetAllMarks().clearNodes().run()));
 const color=el('input');color.type='color';color.setAttribute('aria-label','Text color');color.oninput=()=>editor.chain().focus().setColor(color.value).run();extras.append(color);more.append(extras);toolbar.append(more);
 const update=()=>{for(const [b,mark] of active)b.setAttribute('aria-pressed',String(editor.isActive(mark)));block.value=String(editor.getAttributes('heading').level||'p');font.value=editor.getAttributes('textStyle').fontFamily||'Inter';size.value=String(parseFloat(editor.getAttributes('textStyle').fontSize)||16);const text=editor.getText().trim();status.textContent=(text?text.split(/\s+/).length:0)+' words · '+text.length+' characters';for(const name of ['Add table row','Add table column','Delete table row','Delete table column','Toggle header row','Delete table'])extras.querySelector('[aria-label="'+name+'"]').disabled=!editor.isActive('table');};editor.on('selectionUpdate',update);editor.on('transaction',update);update();
 return {root,destroy:()=>{narrowPage.removeEventListener('change',placePage);editor.destroy();},snapshot:()=>{const html=editor.getHTML(),{w,h,padding}=pageCSS(),source=DOC+'<style>'+paperStyle+`body{padding:${padding}px}main{max-width:${w-padding*2}px;min-height:${h-padding*2}px}@page{size:${page.size==='a4'?'A4':'letter'} ${page.orientation};margin:${page.margins==='narrow'?'0.5in':'1in'}}`+'</style><main>'+html+'</main>'; return {language:'html',source,state:{...value.state,kindredDocument:{version:1,html,page:{...page},document:editor.getJSON()}}};}};
}
