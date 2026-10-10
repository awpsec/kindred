import {calculateSheet} from './sheet-calculation.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(label,fn,text=label)=>{const b=el('button','artifact-format-button',text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;return b;};
const select=(label,options,fn)=>{const s=el('select');s.setAttribute('aria-label',label);for(const [value,text]of options)s.append(new Option(text,value));s.onchange=()=>fn(s.value);return s;};
const letters=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const fonts=[['Inter','Sans serif'],['Georgia','Serif'],['Arial','Arial'],['Courier New','Monospace']];
export function parseSheetPaste(text){
 const rows=[[]];let value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&(quoted||!value)){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
 else if(!quoted&&(c==='\t'||c==='\r'||c==='\n')){rows.at(-1).push(value);value='';if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;rows.push([]);}}
 else value+=c;}
 rows.at(-1).push(value);if(rows.length>1&&rows.at(-1).length===1&&rows.at(-1)[0]===''&&/[\r\n]$/.test(text))rows.pop();return rows;
}
export function createSheetEditor(value,onDirty=()=>{}){
 let rows=structuredClone(value.state.rows).map(r=>Array.isArray(r)?r.map(v=>String(v??'')):[]),styles=structuredClone(value.state.cellStyles||{}),selected=[0,0],anchor=[0,0],history=[],future=[],pending=null;
 if(!rows.length)rows=[['']];let cols=Math.max(1,...rows.map(r=>r.length));for(const row of rows)while(row.length<cols)row.push('');
 if(rows.length*cols>10000)throw Error('This sheet is too large for the editor (10,000 cells).');
 const root=el('div','artifact-visual-editor artifact-sheet-editor'),bar=el('div','artifact-format-toolbar'),formula=el('div','artifact-formula-bar'),address=el('span','','A1'),input=el('input'),viewport=el('div','artifact-sheet-viewport'),table=el('table','artifact-sheet-grid'),status=el('div','artifact-sheet-status');
 bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Sheet formatting');input.setAttribute('aria-label','Cell value');input.placeholder='Value or formula, e.g. =SUM(A1:A5)';input.title='Formulas: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS';status.setAttribute('role','status');table.setAttribute('aria-label','Spreadsheet');
 formula.append(address,el('span','artifact-formula-symbol','fx'),input);viewport.append(table);root.append(bar,formula,viewport,status);
 const snapshot=()=>JSON.stringify({rows,styles});
 const bounds=()=>[Math.min(anchor[0],selected[0]),Math.min(anchor[1],selected[1]),Math.max(anchor[0],selected[0]),Math.max(anchor[1],selected[1])];
 const each=fn=>{const [a,b,c,d]=bounds();for(let i=a;i<=c;i++)for(let j=b;j<=d;j++)fn(i,j);};
 function change(fn,redraw=true){const before=snapshot();fn();if(snapshot()!==before){history.push(before);if(history.length>100)history.shift();future=[];onDirty();}if(redraw)paint();else refreshValues();}
 function commit(){if(!pending)return;const {i,j,text}=pending;pending=null;change(()=>rows[i][j]=text,false);}
 function restore(from,to){commit();if(!from.length)return;to.push(snapshot());const s=JSON.parse(from.pop());rows=s.rows;styles=s.styles;cols=rows[0].length;selected=[Math.min(selected[0],rows.length-1),Math.min(selected[1],cols-1)];anchor=[...selected];onDirty();paint();}
 const key=()=>selected.join(':');const apply=patch=>{commit();change(()=>each((i,j)=>styles[i+':'+j]={...styles[i+':'+j],...patch}),false);};
 const font=select('Font family',fonts,fontFamily=>apply({fontFamily})),size=select('Font size',[10,12,14,16,18,20,24,28,32,40,48].map(n=>[String(n),String(n)]),n=>apply({fontSize:n+'px'}));
 bar.append(font,size,button('Bold',()=>apply({fontWeight:styles[key()]?.fontWeight==='700'?'400':'700'}),'B'),button('Italic',()=>apply({fontStyle:styles[key()]?.fontStyle==='italic'?'normal':'italic'}),'I'),select('Text alignment',[['left','Align left'],['center','Center'],['right','Align right']],textAlign=>apply({textAlign})),button('Undo',()=>restore(history,future),'↶'),button('Redo',()=>restore(future,history),'↷'));
 const colourControls=[];
 for(const [label,property]of [['Cell text color','color'],['Cell fill color','backgroundColor']]){
  const group=el('label','sheet-color-control'),glyph=el('span','sheet-color-glyph'),swatch=el('span','sheet-color-bar'),state=el('output','sheet-color-state'),color=el('input');group.title=label;glyph.setAttribute('aria-hidden','true');
  if(property==='color')glyph.textContent='A';else{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M4 10l8-8 8 8-8 8z M4 10h16 M5 4l4 4 M20 14s-2 3-2 4a2 2 0 004 0c0-1-2-4-2-4');svg.append(path);glyph.append(svg);}
  color.type='color';color.setAttribute('aria-label',label);color.title=label;color.onchange=()=>apply({[property]:color.value});glyph.append(swatch,color);group.append(glyph,state);bar.append(group);colourControls.push({property,color,swatch,state});
 }
 const removeFill=button('Remove cell fill',()=>apply({backgroundColor:''}),'No fill');bar.append(removeFill);
 const colourCanvas=document.createElement('canvas'),colourContext=colourCanvas.getContext('2d');colourCanvas.width=colourCanvas.height=1;
 const hex=css=>{colourContext.clearRect(0,0,1,1);colourContext.fillStyle='#000000';colourContext.fillStyle=css;colourContext.fillRect(0,0,1,1);return '#'+[...colourContext.getImageData(0,0,1,1).data].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');};
 const grow=(moreRows,moreCols)=>{commit();if((rows.length+moreRows)*(cols+moreCols)>10000){status.textContent='The editor supports up to 10,000 cells.';return;}change(()=>{cols+=moreCols;rows.forEach(r=>{while(r.length<cols)r.push('');});for(let i=0;i<moreRows;i++)rows.push(Array(cols).fill(''));});};
 bar.append(button('Add row',()=>grow(1,0)),button('Add column',()=>grow(0,1)),button('Clear cell',()=>{commit();change(()=>each((i,j)=>rows[i][j]=''),false);},'Clear'));
 function choose(i,j,extend=false){commit();selected=[i,j];if(!extend)anchor=[i,j];input.value=rows[i][j];updateSelection();}
 function updateSelection(){
  const [a,b,c,d]=bounds();address.textContent=letters(a===c&&b===d?selected[1]:b)+(a+1)+(a===c&&b===d?'':':'+letters(d)+(c+1));
  const st=styles[key()]||{};font.value=st.fontFamily||'Inter';size.value=String(parseFloat(st.fontSize)||16);bar.querySelector('[aria-label="Text alignment"]').value=st.textAlign||'left';
  for(const control of colourControls){const none=control.property==='backgroundColor'&&(!st.backgroundColor||st.backgroundColor==='transparent'),current=hex(st[control.property]|| (control.property==='color'?getComputedStyle(table.querySelector(`[data-row="${selected[0]}"][data-col="${selected[1]}"] input`)).color:'#ffffff'));control.color.value=current;control.swatch.style.backgroundColor=none?'transparent':current;control.swatch.classList.toggle('no-fill',none);control.state.textContent=none?'None':current;}
  removeFill.disabled=!st.backgroundColor||st.backgroundColor==='transparent';
  for(const [label,on]of [['Bold',st.fontWeight==='700'],['Italic',st.fontStyle==='italic']])bar.querySelector(`[aria-label="${label}"]`).setAttribute('aria-pressed',String(on));
  for(const td of table.querySelectorAll('td')){const i=Number(td.dataset.row),j=Number(td.dataset.col);td.classList.toggle('selected',i>=a&&i<=c&&j>=b&&j<=d);}
  status.textContent=`${rows.length} rows × ${cols} columns`+(a===c&&b===d?'':` · ${(c-a+1)*(d-b+1)} cells selected`);
 }
 function refreshValues(){const result=calculateSheet(rows);for(const td of table.querySelectorAll('td')){const i=Number(td.dataset.row),j=Number(td.dataset.col),cell=td.firstChild;
  if(document.activeElement!==cell)cell.value=String(result[i][j]);
  cell.classList.toggle('formula-error',rows[i][j].startsWith('=')&&String(result[i][j]).startsWith('#'));cell.title=rows[i][j].startsWith('=')?rows[i][j]:'';
  cell.removeAttribute('style');for(const prop of ['fontFamily','fontSize','fontWeight','fontStyle','textAlign','color','backgroundColor'])if(typeof styles[i+':'+j]?.[prop]==='string')cell.style[prop]=styles[i+':'+j][prop];
 }if(document.activeElement!==input)input.value=rows[selected[0]][selected[1]];updateSelection();}
 function paste(text,i,j){commit();const data=parseSheetPaste(text),nc=Math.max(cols,j+Math.max(...data.map(r=>r.length))),nr=Math.max(rows.length,i+data.length);if(nc*nr>10000){status.textContent='That paste would exceed 10,000 cells.';return;}
  change(()=>{while(rows.length<nr)rows.push(Array(cols).fill(''));cols=nc;rows.forEach(r=>{while(r.length<cols)r.push('');});data.forEach((r,a)=>r.forEach((v,b)=>rows[i+a][j+b]=v));anchor=[i,j];selected=[i+data.length-1,j+Math.max(...data.map(r=>r.length))-1];});}
 const onPaste=(e,i,j)=>{const text=e.clipboardData?.getData('text/plain');if(text?.includes('\t')||text?.includes('\n')){e.preventDefault();paste(text,i,j);}};
 input.oninput=()=>{pending={i:selected[0],j:selected[1],text:input.value};onDirty();};input.onchange=commit;input.onpaste=e=>onPaste(e,...selected);
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit();table.querySelector(`[data-row="${selected[0]}"][data-col="${selected[1]}"] input`)?.focus();}};
 table.addEventListener('copy',e=>{const [a,b,c,d]=bounds();if(a===c&&b===d)return;commit();const escape=v=>/[\t\n\r"]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;const text=rows.slice(a,c+1).map(row=>row.slice(b,d+1).map(escape).join('\t')).join('\n');e.clipboardData?.setData('text/plain',text);e.preventDefault();});
 function paint(){table.replaceChildren();const head=el('tr');head.append(el('th'));for(let j=0;j<cols;j++)head.append(el('th','',letters(j)));table.append(head);
  rows.forEach((row,i)=>{const tr=el('tr');tr.append(el('th','',String(i+1)));row.forEach((v,j)=>{const td=el('td');td.dataset.row=i;td.dataset.col=j;const cell=el('input');cell.setAttribute('aria-label',letters(j)+(i+1));cell.spellcheck=false;
   cell.onpointerdown=e=>{if(e.shiftKey){e.preventDefault();choose(i,j,true);}};
   cell.onfocus=()=>{choose(i,j);cell.value=rows[i][j];};cell.onblur=()=>{commit();refreshValues();};
   cell.oninput=()=>{pending={i,j,text:cell.value};input.value=cell.value;onDirty();};cell.onchange=commit;cell.onpaste=e=>onPaste(e,i,j);
   cell.onkeydown=e=>{if(!['Tab','Enter','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;
    const arrow=e.key.startsWith('Arrow');if(arrow&&!e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)&&cell.selectionStart!==cell.selectionEnd)return;
    if(e.shiftKey&&arrow){e.preventDefault();const ni=Math.max(0,Math.min(rows.length-1,selected[0]+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))),nj=Math.max(0,Math.min(cols-1,selected[1]+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));choose(ni,nj,true);return;}
    let ni=i,nj=j;if(e.key==='Enter')ni+=e.shiftKey?-1:1;else if(e.key==='Tab'){nj+=e.shiftKey?-1:1;if(nj===cols){nj=0;ni++;}else if(nj<0){nj=cols-1;ni--;}}
    else{ni+=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;nj+=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;}
    if(ni<0||ni>=rows.length||nj<0||nj>=cols)return;e.preventDefault();commit();table.querySelector(`[data-row="${ni}"][data-col="${nj}"] input`)?.focus();
   };td.append(cell);tr.append(td);});table.append(tr);});refreshValues();}
 paint();return {root,destroy(){},snapshot:()=>{commit();return {state:{...value.state,rows:rows.map(r=>[...r]),cellStyles:styles},source:sheetSource(),language:'html'};}};
}
export function sheetSource(){return `<!--kindred-sheet-v1--><style>body{margin:0;padding:24px;font:16px/1.6 Inter,system-ui,sans-serif}table{border-collapse:collapse;width:100%}td{border:1px solid #8886;padding:8px;min-width:100px;white-space:pre-wrap}</style><main><table id="sheet"></table></main><script>const calculateSheet=${calculateSheet.toString()};kindredArtifact.ready.then(s=>{const values=calculateSheet(s.rows||[]),t=document.getElementById('sheet');for(let i=0;i<values.length;i++){const tr=document.createElement('tr');for(let j=0;j<values[i].length;j++){const td=document.createElement('td');td.textContent=String(values[i][j]??'');const st=s.cellStyles?.[i+':'+j]||{};for(const p of ['fontFamily','fontSize','fontWeight','fontStyle','textAlign','color','backgroundColor'])if(typeof st[p]==='string')td.style[p]=st[p];tr.append(td);}t.append(tr);}});<\/script>`;}
