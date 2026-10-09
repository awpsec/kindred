// Recipient chips for email draft review. Recipient text is never discarded:
// anything that is not a complete address stays in the field as typed and
// blocks saving until the user finishes or removes it.
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const ORDER=['to','cc','bcc'],NAMES={to:'To',cc:'Cc',bcc:'Bcc'};
const DRAG_TYPE='application/x-kindred-recipient';
let serial=0;const uid=prefix=>`${prefix}-${++serial}`;
const reducedMotion=()=>document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;

export function validAddress(value){
 if(typeof value!=='string'||value.length>254||!/^[\x21-\x7e]+$/.test(value))return false;
 const parts=value.split('@');if(parts.length!==2)return false;
 const [local,domain]=parts;
 return !!local&&!!domain&&!/[<>(),;:"\\[\]]/.test(value)&&!local.startsWith('.')&&!local.endsWith('.')&&!value.includes('..')&&domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

// Split on commas, semicolons and line breaks outside quoted names and <>.
export function splitRecipients(text){
 const tokens=[];let current='',quoted=false,angle=false,escaped=false;
 for(const ch of String(text??'')){
  if(escaped){current+=ch;escaped=false;continue;}
  if(ch==='\\'&&quoted){current+=ch;escaped=true;continue;}
  if(ch==='"'&&!angle)quoted=!quoted;else if(ch==='<'&&!quoted)angle=true;else if(ch==='>'&&!quoted)angle=false;
  if(!quoted&&!angle&&/[,;\r\n]/.test(ch)){tokens.push(current);current='';continue;}
  current+=ch;
 }
 return {tokens,rest:current,open:quoted||angle};
}
export function parseRecipient(token){
 const text=String(token??'').trim();if(!text)return null;
 const named=text.match(/^(?:"((?:[^"\\]|\\.)*)"|([^<>"]*?))\s*<\s*(?:mailto:)?([^<>\s]+)\s*>$/i);
 if(named){const name=(named[1]!==undefined?named[1].replace(/\\(.)/g,'$1'):named[2]).trim();return validAddress(named[3])?{name,address:named[3],raw:text}:null;}
 const bare=text.replace(/^mailto:/i,'');
 return validAddress(bare)?{name:'',address:bare,raw:bare===text?text:''}:null;
}
export function parseRecipients(text){
 const {tokens,rest}=splitRecipients(text),recipients=[],invalid=[];
 for(const token of [...tokens,rest]){if(!token.trim())continue;const r=parseRecipient(token);if(r)recipients.push(r);else invalid.push(token.trim());}
 return {recipients,invalid};
}
const quoteName=name=>/[",;<>@()[\]:\\.]/.test(name)?'"'+name.replace(/["\\]/g,'\\$&')+'"':name;
export function formatRecipient(r){if(r.raw)return r.raw;return r.name?`${quoteName(r.name)} <${r.address}>`:r.address;}

// fields: [{key:'to'|'cc'|'bcc', label, text, array, encoding}]. Returns
// {element, fields, validate(), changes(), commit()}; changes() only lists
// edited fields, keyed by the email alias the server expects.
export function emailRecipients({fields,api}){
 const root=el('div','email-recipients'),hint=el('span','recipient-sr','Use Left and Right Arrow to move between recipients. Delete removes a recipient. Enter opens options to move it to another field.');hint.id=uid('recipient-hint');root.append(hint);
 const state=new Map(),order=ORDER.filter(k=>fields.some(f=>f.key===k));let dragging=null,contactsOff=false;const cache=new Map();
 const all=()=>[...state.values()].flatMap(f=>f.items);
 const signature=f=>JSON.stringify([f.items.map(r=>[r.name,r.address.toLowerCase()]),f.input.value.trim()]);
 const toggles=el('div','recipient-toggles');
 const reveal=(f,focus)=>{f.row.classList.remove('is-collapsed');f.toggle?.remove();if(!toggles.childElementCount)toggles.remove();if(focus)f.input.focus();};

 for(const key of order){
  const desc=fields.find(f=>f.key===key),f={key,label:desc.label||NAMES[key],items:[],nodes:new Map()};
  const row=el('div','recipient-row'),head=el('div','recipient-head'),label=el('label','',f.label),box=el('div','recipient-box'),list=el('ul','recipient-list'),input=el('input','recipient-input'),note=el('p','recipient-note');list.setAttribute('role','list');
  input.id=uid('recipient-'+key);label.htmlFor=input.id;input.type='text';input.name=key;input.autocomplete='off';input.spellcheck=false;input.maxLength=8000;input.dataset.editLabel=f.label;
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');note.id=uid('recipient-note');note.hidden=true;input.setAttribute('aria-describedby',note.id);
  const options=el('ul','recipient-suggestions');options.id=uid('recipient-options');options.setAttribute('role','listbox');options.hidden=true;input.setAttribute('aria-controls',options.id);
  box.append(list,input,options);head.append(label);row.append(head,box,note);root.append(row);
  Object.assign(f,{row,head,box,list,input,note,options});state.set(key,f);
  const initial=parseRecipients(desc.text||'');for(const r of initial.recipients)insert(f,r,{animate:false});
  input.value=initial.invalid.join(', ');f.initial=signature(f);
  if(key!==order[0]&&!f.items.length&&!input.value){row.classList.add('is-collapsed');const t=el('button','recipient-toggle',f.label);t.type='button';t.onclick=()=>reveal(f,true);toggles.append(t);f.toggle=t;}
  wireInput(f);wireDrop(f);
 }
 if(toggles.childElementCount)state.get(order[0]).head.append(toggles);

 // Leaving a field only marks unfinished text; the explanation appears on
 // Enter or Save so the layout does not shift under a pending click.
 function setNote(f,text,{quiet=false}={}){f.note.textContent=quiet?'':text||'';f.note.hidden=quiet||!text;f.input.setAttribute('aria-invalid',text?'true':'false');f.box.classList.toggle('is-invalid',!!text);}
 function chipFor(f,r){
  const li=el('li','recipient-chip'),text=el('span','recipient-chip-text',r.name||r.address),sr=el('span','recipient-sr',r.name?` ${r.address}`:'');
  // Tapping or clicking a chip opens Move to/Edit/Remove: the touch and
  // keyboard alternative to dragging between fields.
  li.tabIndex=-1;li.draggable=true;li.dataset.address=r.address;li.title=formatRecipient(r);li.setAttribute('aria-describedby',hint.id);li.setAttribute('aria-haspopup','menu');
  const remove=el('button','recipient-chip-remove');remove.type='button';remove.tabIndex=-1;
  remove.append(el('span','recipient-sr',`Remove ${r.address}`),el('span','recipient-chip-glyph','×'));
  remove.onclick=e=>{e.stopPropagation();removeItem(f,r,{focus:'input'});};
  li.onclick=()=>{if(!li.classList.contains('is-leaving'))openMenu(f,r,li);};
  li.append(text,sr,remove);
  li.addEventListener('keydown',e=>chipKey(e,f,r));
  li.addEventListener('dragstart',e=>{dragging={from:f,item:r};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData(DRAG_TYPE,r.address);e.dataTransfer.setData('text/plain',formatRecipient(r));li.classList.add('is-dragging');root.classList.add('is-dragging');});
  li.addEventListener('dragend',()=>{dragging=null;li.classList.remove('is-dragging');root.classList.remove('is-dragging');for(const x of state.values())x.box.classList.remove('is-drop-target');});
  return li;
 }
 function insert(f,r,{before=null,animate=true}={}){
  const index=before?f.items.indexOf(before):-1;if(index>=0)f.items.splice(index,0,r);else f.items.push(r);
  const li=chipFor(f,r);f.nodes.set(r,li);f.list.insertBefore(li,before?f.nodes.get(before):null);
  if(animate&&!reducedMotion())li.classList.add('is-entering'),li.addEventListener('animationend',()=>li.classList.remove('is-entering'),{once:true});
  return li;
 }
 function flash(li){if(!li||reducedMotion())return;li.classList.remove('is-duplicate');void li.offsetWidth;li.classList.add('is-duplicate');li.addEventListener('animationend',()=>li.classList.remove('is-duplicate'),{once:true});}
 function add(f,r,opts){
  const existing=f.items.find(x=>x.address.toLowerCase()===r.address.toLowerCase());
  if(existing){flash(f.nodes.get(existing));return f.nodes.get(existing);}
  return insert(f,r,opts);
 }
 function detach(f,r){
  const li=f.nodes.get(r),i=f.items.indexOf(r);if(i<0)return;f.items.splice(i,1);f.nodes.delete(r);
  if(!li)return;li.removeAttribute('tabindex');li.draggable=false;
  if(reducedMotion())li.remove();else{li.classList.add('is-leaving');li.addEventListener('animationend',()=>li.remove(),{once:true});setTimeout(()=>li.remove(),400);}
 }
 function removeItem(f,r,{focus}={}){
  const i=f.items.indexOf(r);detach(f,r);
  const target=focus==='previous'?f.items[i-1]||f.items[i]:focus==='next'?f.items[i]||f.items[i-1]:null;
  (target?f.nodes.get(target):f.input).focus();
 }
 function move(from,r,toKey,{before=null,focus=false}={}){
  const to=state.get(toKey);if(!to||(to===from&&before===r))return;
  reveal(to,false);detach(from,r);const li=add(to,r,{before:before&&to.items.includes(before)?before:null});
  if(focus)li?.focus();
 }
 function edit(f,r){
  const text=formatRecipient(r);removeItem(f,r);
  f.input.value=f.input.value.trim()?`${text}, ${f.input.value.trim()}`:text;f.input.focus();f.input.setSelectionRange(text.length,text.length);
 }
 function chipKey(e,f,r){
  const i=f.items.indexOf(r),go=x=>(x?f.nodes.get(x):f.input).focus();
  if(e.key==='Backspace'){e.preventDefault();removeItem(f,r,{focus:'previous'});}
  else if(e.key==='Delete'){e.preventDefault();removeItem(f,r,{focus:'next'});}
  else if(e.key==='ArrowLeft'){e.preventDefault();if(i>0)go(f.items[i-1]);}
  else if(e.key==='ArrowRight'){e.preventDefault();go(f.items[i+1]);}
  else if(e.key==='Home'){e.preventDefault();go(f.items[0]);}
  else if(e.key==='End'){e.preventDefault();go(null);}
  else if(e.key==='F2'){e.preventDefault();edit(f,r);}
  else if(e.key==='Enter'||e.key===' '||e.key==='ContextMenu'||(e.key==='F10'&&e.shiftKey)){e.preventDefault();openMenu(f,r,f.nodes.get(r));}
 }

 let menu=null;
 function closeMenu(restore){if(!menu)return;const {node,chip,off}=menu;menu=null;node.remove();off();if(restore&&chip.isConnected)chip.focus();}
 function openMenu(f,r,chip){
  closeMenu();const node=el('div','recipient-menu');node.setAttribute('role','menu');node.id=uid('recipient-menu');
  const item=(text,run)=>{const b=el('button','recipient-menu-item',text);b.type='button';b.setAttribute('role','menuitem');b.tabIndex=-1;b.onclick=e=>{e.stopPropagation();closeMenu(false);run();};node.append(b);};
  for(const key of order)if(key!==f.key)item(`Move to ${state.get(key).label}`,()=>move(f,r,key,{focus:true}));
  item('Edit address',()=>edit(f,r));item('Remove',()=>removeItem(f,r,{focus:'input'}));
  const items=[...node.children];
  node.addEventListener('keydown',e=>{
   const i=items.indexOf(document.activeElement);
   if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}
   else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
   else if(e.key==='Home'){e.preventDefault();items[0].focus();}
   else if(e.key==='End'){e.preventDefault();items.at(-1).focus();}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);}
   else if(e.key==='Tab'){e.preventDefault();closeMenu(true);}
  });
  const outside=e=>{if(!node.contains(e.target))closeMenu(false);};
  document.addEventListener('pointerdown',outside,true);
  menu={node,chip,off:()=>document.removeEventListener('pointerdown',outside,true)};
  f.box.append(node);
  node.style.left=Math.max(0,Math.min(chip.offsetLeft,f.box.clientWidth-node.offsetWidth))+'px';node.style.top=(chip.offsetTop+chip.offsetHeight+4)+'px';
  items[0].focus();
 }

 function commitText(f,{all=false}={}){
  const {tokens,rest}=splitRecipients(f.input.value),keep=[];
  for(const token of all?[...tokens,rest]:tokens){if(!token.trim())continue;const r=parseRecipient(token);if(r)add(f,r);else keep.push(token.trim());}
  // While typing, keep the separator after unfinished text so the next
  // address is not run into it.
  const next=all?keep.join(', '):keep.length?keep.join(', ')+', '+rest.trimStart():rest.trimStart();
  if(next!==f.input.value)f.input.value=next;
  return !next.trim();
 }
 function wireInput(f){
  const {input}=f;let timer=0,request=0,active=-1,shown=[];
  const close=()=>{f.options.hidden=true;f.options.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;shown=[];};
  const highlight=i=>{active=i;[...f.options.children].forEach((o,j)=>o.setAttribute('aria-selected',String(j===i)));const o=f.options.children[i];if(o){input.setAttribute('aria-activedescendant',o.id);o.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');};
  const pick=contact=>{add(f,{name:contact.name&&contact.name!==contact.email?contact.name:'',address:contact.email,raw:''});input.value='';close();setNote(f,'');input.focus();};
  const render=contacts=>{
   const taken=new Set(all().map(r=>r.address.toLowerCase()));shown=contacts.filter(c=>validAddress(c?.email)&&!taken.has(c.email.toLowerCase())).slice(0,6);
   if(!shown.length||document.activeElement!==input)return close();
   f.options.replaceChildren(...shown.map((c,i)=>{const o=el('li','recipient-suggestion');o.id=f.options.id+'-'+i;o.setAttribute('role','option');o.setAttribute('aria-selected','false');
    if(c.name&&c.name!==c.email)o.append(el('span','recipient-suggestion-name',c.name));o.append(el('span','recipient-suggestion-address',c.email));
    o.addEventListener('pointerdown',e=>e.preventDefault());o.onclick=()=>pick(c);return o;}));
   f.options.hidden=false;input.setAttribute('aria-expanded','true');highlight(-1);
  };
  const lookup=()=>{
   clearTimeout(timer);const q=input.value.trim();
   if(!api||contactsOff||!q||q.length>100||/[,;<>"]/.test(q))return close();
   if(cache.has(q.toLowerCase()))return render(cache.get(q.toLowerCase()));
   const ticket=++request;
   timer=setTimeout(async()=>{
    try{const reply=await api('/email-contacts?q='+encodeURIComponent(q));const contacts=Array.isArray(reply?.contacts)?reply.contacts:[];cache.set(q.toLowerCase(),contacts);if(ticket===request&&input.value.trim()===q)render(contacts);}
    catch(error){if([404,405,501].includes(error?.status)||/valid response/.test(error?.message||''))contactsOff=true;if(ticket===request)close();}
   },140);
  };
  input.addEventListener('input',e=>{
   if(e.isComposing)return;setNote(f,'');
   const {tokens,rest}=splitRecipients(input.value);
   if(tokens.length)commitText(f);
   else if(/\s$/.test(rest)&&parseRecipient(rest))commitText(f,{all:true});
   lookup();
  });
  input.addEventListener('paste',e=>{
   const text=e.clipboardData?.getData('text/plain');if(!text)return;e.preventDefault();
   const start=input.selectionStart??input.value.length,end=input.selectionEnd??start,pasted=text.replace(/\r?\n|\r/g,', ');
   input.value=input.value.slice(0,start)+pasted+input.value.slice(end);setNote(f,'');
   commitText(f,{all:true});close();
  });
  input.addEventListener('keydown',e=>{
   if(e.isComposing)return;
   const open=!f.options.hidden&&shown.length;
   if(open&&e.key==='ArrowDown'){e.preventDefault();highlight((active+1)%shown.length);}
   else if(open&&e.key==='ArrowUp'){e.preventDefault();highlight(active<=0?shown.length-1:active-1);}
   else if(open&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
   else if(open&&active>=0&&(e.key==='Enter'||e.key==='Tab')){e.preventDefault();pick(shown[active]);}
   else if(e.key==='Enter'&&input.value.trim()){e.preventDefault();close();if(!commitText(f,{all:true}))setNote(f,'Enter a complete email address, such as name@example.com.');}
   else if((e.key==='Backspace'||e.key==='ArrowLeft')&&!input.value&&f.items.length){e.preventDefault();f.nodes.get(f.items.at(-1)).focus();}
  });
  input.addEventListener('blur',()=>{close();if(!commitText(f,{all:true}))setNote(f,'invalid',{quiet:true});});
  f.box.addEventListener('pointerdown',e=>{if(e.target===f.box||e.target===f.list){e.preventDefault();input.focus();}});
 }
 function wireDrop(f){
  const accepts=e=>dragging||[...(e.dataTransfer?.types||[])].includes('text/plain');
  f.box.addEventListener('dragover',e=>{if(!accepts(e))return;e.preventDefault();e.dataTransfer.dropEffect=dragging?'move':'copy';f.box.classList.add('is-drop-target');});
  f.box.addEventListener('dragleave',e=>{if(!f.box.contains(e.relatedTarget))f.box.classList.remove('is-drop-target');});
  f.box.addEventListener('drop',e=>{
   f.box.classList.remove('is-drop-target');if(!accepts(e))return;e.preventDefault();
   const over=e.target.closest?.('.recipient-chip'),before=over?f.items.find(r=>f.nodes.get(r)===over):null;
   if(dragging){const {from,item}=dragging;dragging=null;root.classList.remove('is-dragging');if(before!==item)move(from,item,f.key,{before});return;}
   const text=e.dataTransfer.getData('text/plain');if(!text)return;reveal(f,false);
   const {recipients,invalid}=parseRecipients(text.replace(/\r?\n|\r/g,', '));for(const r of recipients)add(f,r);
   if(invalid.length)f.input.value=[f.input.value.trim(),...invalid].filter(Boolean).join(', ');
  });
 }

 const fieldAdapter=f=>({
  key:f.key,label:f.label,input:f.input,
  get value(){return f.items.map(formatRecipient).join(', ');},
  get changed(){return signature(f)!==f.initial;},
  validate(){
   if(f.input.value.trim()){commitText(f,{all:true});}
   const pending=f.input.value.trim();
   if(pending){setNote(f,'Enter a complete email address, such as name@example.com.');return {key:f.key,message:`Finish or remove “${pending.length>60?pending.slice(0,57)+'…':pending}” in ${f.label} before saving.`,focus:()=>f.input.focus()};}
   if(this.value.length>8000)return {key:f.key,message:`${f.label} has too many recipients to save.`,focus:()=>f.input.focus()};
   setNote(f,'');return null;
  },
 });
 const adapters=Object.fromEntries(order.map(k=>[k,fieldAdapter(state.get(k))]));
 return {
  element:root,fields:adapters,
  commit(){for(const f of state.values())commitText(f,{all:true});},
  // First problem among edited fields; untouched fields are never re-saved.
  validate(){for(const a of Object.values(adapters)){if(!a.changed)continue;const problem=a.validate();if(problem)return problem;}return null;},
  changes(){return Object.fromEntries(Object.values(adapters).filter(a=>a.changed).map(a=>[a.key,a.value]));},
  get value(){return Object.fromEntries(Object.values(adapters).map(a=>[a.key,a.value]));},
 };
}
