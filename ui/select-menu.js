// Keep the real select as the form control; paint its picker in Kindred's theme.
// Native values, change handlers, labels and programmatic form updates still work.
export function installThemedSelects(root=document) {
  let opened=null,menu=null,active=-1,rows=[],typeahead='',typingTimer,search=null,list=null,empty=null;
  function close(focus=false){
    const previous=opened;opened?.setAttribute('aria-expanded','false');opened?.removeAttribute('aria-controls');opened?.removeAttribute('aria-activedescendant');
    opened=null;menu?.remove();menu=null;search=null;list=null;empty=null;rows=[];clearTimeout(typingTimer);typeahead='';
    if(focus&&previous?.isConnected)previous.focus({preventScroll:true});
  }
  function position(){
    if(!opened?.isConnected||opened.disabled||!opened.getClientRects().length){close();return;}
    const r=opened.getBoundingClientRect(),gap=6,margin=10;
    menu.style.width=Math.min(Math.max(r.width,210),innerWidth-2*margin)+'px';
    menu.style.maxHeight=Math.min(320,Math.max(innerHeight-r.bottom-gap-margin,r.top-gap-margin))+'px';
    const h=menu.getBoundingClientRect().height,w=menu.getBoundingClientRect().width;
    menu.style.left=Math.max(margin,Math.min(r.right-w,innerWidth-w-margin))+'px';
    menu.style.top=(innerHeight-r.bottom>=h+gap+margin?r.bottom+gap:Math.max(margin,r.top-h-gap))+'px';
  }
  function highlight(index,scroll=true){
    active=index;opened?.removeAttribute('aria-activedescendant');search?.removeAttribute('aria-activedescendant');if(!rows.length)return;
    rows.forEach((row,i)=>row.classList.toggle('is-active',i===index));
    const row=rows[index];
    if(row){
      opened.setAttribute('aria-activedescendant',row.id);search?.setAttribute('aria-activedescendant',row.id);
      // Scroll only the picker. scrollIntoView can also move its dialog and page.
      if(scroll){const item=row.getBoundingClientRect(),bounds=menu.getBoundingClientRect(),top=bounds.top+menu.clientTop+5+(search?.offsetHeight||0),bottom=bounds.top+menu.clientTop+menu.clientHeight-5;
        if(item.top<top)menu.scrollTop-=top-item.top;else if(item.bottom>bottom)menu.scrollTop+=item.bottom-bottom;
      }
    }
  }
  function move(delta){
    for(let step=1;step<=rows.length;step++){
      const i=(active+delta*step+rows.length*2)%rows.length;
      if(!rows[i].hidden&&rows[i].getAttribute('aria-disabled')!=='true'){highlight(i);return;}
    }
  }
  function choose(index){
    const option=opened?.options[index];if(!option||option.disabled||option.parentElement?.disabled)return;
    const select=opened,changed=select.selectedIndex!==index;select.selectedIndex=index;close(true);
    if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function show(select){
    if(select.disabled||select.multiple||select.size>1)return;
    if(opened===select){close();return;}close();opened=select;
    menu=document.createElement('div');menu.className='themed-select-menu';menu.id='kindred-select-picker';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',select.getAttribute('aria-label')||select.labels?.[0]?.textContent||'Options');
    // A modal dialog's top layer also contains its picker.
    (select.closest('dialog')||document.body).append(menu);select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',menu.id);
    list=menu;
    if(select.dataset.searchable==='true'){
      menu.setAttribute('role','presentation');
      search=document.createElement('input');search.type='search';search.className='themed-select-search';search.placeholder='Search models…';search.setAttribute('aria-label','Search models');search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-expanded','true');search.autocomplete='off';
      list=document.createElement('div');list.id=menu.id+'-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',menu.getAttribute('aria-label'));search.setAttribute('aria-controls',list.id);select.setAttribute('aria-controls',list.id);
      empty=document.createElement('div');empty.className='themed-select-empty';empty.setAttribute('role','status');empty.textContent='No matching models';empty.hidden=true;menu.append(search,list,empty);
      search.oninput=filter;
      search.onkeydown=event=>{
        if(event.isComposing)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
        else if(event.key==='Tab')close(true);
        else if(event.key==='Enter'){event.preventDefault();choose(active);}
        else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}
      };
    }
    let group=null;
    [...select.options].forEach((option,index)=>{
      const parent=option.parentElement,newGroup=parent.tagName==='OPTGROUP'?parent:null;
      if(newGroup&&newGroup!==group){const title=document.createElement('div');title.className='themed-select-group';title.textContent=newGroup.label;list.append(title);}group=newGroup;
      const row=document.createElement('div');row.className='themed-select-option';row.id='kindred-select-option-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled||newGroup?.disabled||false));
      const name=document.createElement('span');name.textContent=option.label;row.append(name);if(option.selected){const check=document.createElement('span');check.className='select-check';check.textContent='✓';check.setAttribute('aria-hidden','true');row.append(check);}
      row.onpointermove=()=>{if(row.getAttribute('aria-disabled')!=='true')highlight(index,false);};row.onmousedown=e=>e.preventDefault();row.onclick=e=>{e.stopPropagation();choose(index);};list.append(row);rows.push(row);
    });
    position();highlight(select.selectedIndex);(search||select).focus({preventScroll:true});
  }
  function filter(){
    const normalize=value=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');
    const terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);
    rows.forEach((row,i)=>{const option=opened.options[i],text=normalize(option.label+' '+option.value);row.hidden=!terms.every(term=>text.includes(term));});
    for(const title of list.querySelectorAll('.themed-select-group')){let next=title.nextElementSibling;title.hidden=true;while(next&&!next.classList.contains('themed-select-group')){if(!next.hidden)title.hidden=false;next=next.nextElementSibling;}}
    empty.hidden=rows.some(row=>!row.hidden);highlight(rows.findIndex(row=>!row.hidden&&row.getAttribute('aria-disabled')!=='true'),false);menu.scrollTop=0;position();
  }
  function enhance(select){
    if(select.dataset.themedSelect||select.multiple||select.size>1)return;select.dataset.themedSelect='true';select.setAttribute('aria-expanded','false');
    let down=false;
    select.addEventListener('mousedown',event=>{if(event.button!==0)return;event.preventDefault();down=true;show(select);});
    select.addEventListener('click',event=>{event.preventDefault();if(!down)show(select);down=false;});
    select.addEventListener('keydown',event=>{
      if(event.key==='Tab'){close();return;}
      if(event.key==='Escape'&&opened){event.preventDefault();event.stopPropagation();close(true);return;}
      if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
        event.preventDefault();if(opened!==select){show(select);return;}
        if(event.key==='Enter'||event.key===' '){choose(active);return;}
        if(event.key==='Home')active=-1;else if(event.key==='End')active=0;
        move(event.key==='ArrowUp'||event.key==='End'?-1:1);return;
      }
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        event.preventDefault();if(opened!==select)show(select);if(search){search.value+=event.key;filter();return;}clearTimeout(typingTimer);typeahead+=event.key.toLocaleLowerCase();typingTimer=setTimeout(()=>typeahead='',700);
        const index=[...select.options].findIndex((o,i)=>!o.disabled&&!o.parentElement.disabled&&o.label.toLocaleLowerCase().startsWith(typeahead));if(index>=0)highlight(index);
      }
    });
  }
  function scan(records=[]){
    root.querySelectorAll('select').forEach(enhance);
    if(opened&&records.some(record=>opened.contains(record.target))){const select=opened;close();show(select);}
    else if(opened)position();
  }
  new MutationObserver(scan).observe(root,{childList:true,subtree:true});scan();
  document.addEventListener('pointerdown',event=>{if(opened&&event.target!==opened&&!menu?.contains(event.target))close();},true);
  document.addEventListener('focusin',event=>{if(opened&&event.target!==opened&&!menu?.contains(event.target))close();});
  document.addEventListener('scroll',event=>{if(opened&&!menu?.contains(event.target))position();},true);
  document.addEventListener('close',()=>close(),true);window.addEventListener('resize',()=>{if(opened)position();});
  return {close};
}
