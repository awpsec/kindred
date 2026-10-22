// A command palette over existing navigation. The caller owns destinations and data;
// optional remote search must return the same item shape, never rendered HTML.
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
export function matchNavigationItems(items,query){
  const terms=normalize(query).split(/\s+/).filter(Boolean),seen=new Set();
  return items.filter(item=>item&&item.id&&typeof item.run==='function'&&!seen.has(item.id)&&seen.add(item.id)).map((item,index)=>{
    const title=normalize(item.title),haystack=normalize([item.title,item.subtitle,item.label,item.keywords,item.group].flat().join(' '));
    const score=terms.every(term=>haystack.includes(term))?(title===normalize(query)?3:title.startsWith(normalize(query))?2:1):0;
    return{item,index,score};
  }).filter(row=>!terms.length||row.score).sort((a,b)=>terms.length?b.score-a.score||a.index-b.index:a.index-b.index).map(row=>row.item);
}

/** Items: {id,title,subtitle?,label?,group?,keywords?,icon?:Node,run:Function}.
 * search(query,{signal}) is optional; its results are labeled by their own group.
 * refresh() reconciles current local items without resetting the query/selection.
 */
export function createNavigationSearch({getItems=()=>[],search,renderIcon,onError=console.error,onOpen,shortcut=true,shortcutLabel}={}){
  const dialog=el('dialog','navigation-search'),heading=el('div','navigation-search-heading'),input=el('input','navigation-search-input');
  const list=el('div','navigation-search-results'),status=el('div','navigation-search-status'),footer=el('div','navigation-search-footer');
  const id='navigation-search-'+Math.random().toString(36).slice(2),mac=/Mac|iPhone|iPad/.test(navigator.platform),mod=shortcutLabel||(mac?'⌘':'Ctrl');
  dialog.setAttribute('aria-label','Search Kindred');list.id=id+'-results';list.setAttribute('role','listbox');list.setAttribute('aria-label','Search results');
  input.type='search';input.placeholder='Search conversations and actions';input.autocomplete='off';input.spellcheck=false;
  input.setAttribute('aria-label','Search conversations and actions');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');
  const glass=el('span','navigation-search-glass');glass.setAttribute('aria-hidden','true');glass.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 4.5 4.5"/></svg>';
  const close=el('button','navigation-search-close','×');close.type='button';close.setAttribute('aria-label','Close search');
  heading.append(glass,input,close);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  footer.append(el('span','','↑ ↓ to navigate'),el('span','','↵ to open'),el('span','','esc to close'));
  dialog.append(heading,list,status,footer);document.body.append(dialog);
  let rows=[],selectedId=null,origin=null,timer=null,request=null,generation=0,presentation=0,remote=[],animation=null,closing=false,destroyed=false;
  const reduced=()=>document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  function invalidate(){++generation;clearTimeout(timer);timer=null;request?.abort();request=null;}
  function announce(message){status.textContent=message;status.hidden=!message;}
  function select(id,scroll=false){
    selectedId=id;for(const node of list.querySelectorAll('[role="option"]'))node.setAttribute('aria-selected',String(node.dataset.itemId===id));
    const selected=[...list.querySelectorAll('[role="option"]')].find(node=>node.dataset.itemId===id);
    if(selected){input.setAttribute('aria-activedescendant',selected.id);if(scroll)selected.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function paint(){
    if(!dialog.open||closing)return;
    const local=matchNavigationItems(getItems()||[],input.value),ids=new Set(local.map(item=>item.id));
    rows=[...local,...remote.filter(item=>item?.id&&typeof item.run==='function'&&!ids.has(item.id)&&ids.add(item.id))].slice(0,80);
    const previous=list.scrollTop,fragment=document.createDocumentFragment();let group=null;
    for(const [index,item]of rows.entries()){
      if(item.group&&item.group!==group){group=item.group;const label=el('div','navigation-search-group',group);label.setAttribute('role','presentation');fragment.append(label);}
      const row=el('button','navigation-search-result');row.type='button';row.tabIndex=-1;row.id=id+'-item-'+index;row.dataset.itemId=item.id;row.setAttribute('role','option');
      const picture=el('span','navigation-search-icon'),copy=el('span','navigation-search-copy'),title=el('span','navigation-search-title');
      const art=renderIcon?.(item)||item.icon;if(art instanceof Node)picture.append(art);else picture.textContent='⌕';picture.setAttribute('aria-hidden','true');
      title.append(el('span','navigation-search-name',item.title||'Untitled'));if(item.label)title.append(el('span','navigation-search-tag',item.label));copy.append(title);
      if(item.subtitle)copy.append(el('span','navigation-search-description',item.subtitle));row.append(picture,copy);
      if(index<9)row.append(el('kbd','navigation-search-shortcut',mod+String(index+1)));
      row.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&selectedId!==item.id)select(item.id);});
      row.addEventListener('click',()=>activate(item));fragment.append(row);
    }
    if(!rows.length){const empty=el('div','navigation-search-empty',input.value.trim()?'No matches. Try another name or action.':'No conversations yet.');fragment.append(empty);}
    list.replaceChildren(fragment);select(rows.some(item=>item.id===selectedId)?selectedId:rows[0]?.id||null);list.scrollTop=previous;
  }
  async function activate(item){
    if(closing||!item)return;
    const ticket=presentation;
    // Finish closing before opening another native modal, so focus cannot be
    // restored onto the old trigger after the destination has taken focus.
    if(!await hide()||ticket!==presentation||destroyed)return;try{await item.run();}catch(error){onError(error);}
  }
  function refresh({remoteSearch=false}={}){
    if(!dialog.open||closing||destroyed)return;
    if(remoteSearch){invalidate();remote=[];selectedId=null;list.scrollTop=0;announce('');}
    paint();
    const query=input.value.trim();if(!remoteSearch||!search||query.length<2)return;
    const ticket=generation;timer=setTimeout(async()=>{
      request=new AbortController();const signal=request.signal;announce('Searching…');
      try{const found=await search(query,{signal});if(ticket!==generation||!dialog.open||closing)return;remote=Array.isArray(found)?found:[];paint();announce(rows.length?`${rows.length} results`:'No matches.');}
      catch(error){if(ticket!==generation||signal.aborted||!dialog.open)return;announce('Search is unavailable. Your conversations and actions are still available.');onError(error);}
    },160);
  }
  function open(query=''){
    if(destroyed)return;
    presentation++;
    const wasOpen=dialog.open;animation?.cancel();animation=null;closing=false;
    if(!wasOpen){origin=document.activeElement;onOpen?.();dialog.showModal();}
    input.value=query;input.setAttribute('aria-expanded','true');refresh({remoteSearch:true});input.focus();input.setSelectionRange?.(query.length,query.length);
    if(!wasOpen&&!reduced())animation=dialog.animate([{opacity:0,transform:'translateY(-6px) scale(.985)'},{opacity:1,transform:'none'}],{duration:140,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  async function hide(){
    if(!dialog.open||closing)return false;
    closing=true;invalidate();input.setAttribute('aria-expanded','false');animation?.cancel();
    const leaving=!reduced()?dialog.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-4px) scale(.99)'}],{duration:100,easing:'ease-in'}):null;
    animation=leaving;if(leaving)try{await leaving.finished;}catch{return false;}
    if(!closing||destroyed)return false;dialog.close();animation=null;closing=false;remote=[];announce('');
    if(origin?.isConnected&&!origin.closest('[hidden]'))origin.focus({preventScroll:true});origin=null;return true;
  }
  function keydown(event){
    if(shortcut&&(event.metaKey||event.ctrlKey)&&!event.altKey&&event.key.toLowerCase()==='k'){
      if(document.querySelector('dialog[open]')&&!dialog.open)return;
      event.preventDefault();event.stopPropagation();if(dialog.open)void hide();else open();return;
    }
    if(!dialog.open||closing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void hide();return;}
    if(event.key==='Tab'){event.preventDefault();(document.activeElement===input?close:input).focus();return;}
    if((event.metaKey||event.ctrlKey)&&/^[1-9]$/.test(event.key)){event.preventDefault();void activate(rows[Number(event.key)-1]);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();const index=rows.findIndex(item=>item.id===selectedId),direction=event.key==='ArrowDown'?1:-1;
      if(rows.length)select(rows[(index+direction+rows.length)%rows.length].id,true);
    }else if(event.key==='Enter'&&!event.isComposing&&event.target===input){event.preventDefault();void activate(rows.find(item=>item.id===selectedId));}
  }
  input.addEventListener('input',()=>refresh({remoteSearch:true}));close.onclick=()=>void hide();
  dialog.addEventListener('cancel',event=>{event.preventDefault();void hide();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)void hide();});
  document.addEventListener('keydown',keydown);
  return{open,close:hide,refresh,element:dialog,get isOpen(){return dialog.open;},destroy(){destroyed=true;invalidate();animation?.cancel();dialog.close();dialog.remove();document.removeEventListener('keydown',keydown);}};
}
