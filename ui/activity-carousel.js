// A projection over retained transcript rows, not a second transcript. Keeping
// the original parents is essential for Gather, selections and embedded frames.
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
export const activityArrow=direction=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',direction<0?'m14 6-6 6 6 6':'m10 6 6 6-6 6');svg.append(path);return svg;};
const keyOf=n=>n.dataset.activityKey||(n.dataset.progressGroup?'job:'+n.dataset.progressGroup:n.dataset.message);
const eligible=n=>n.matches('.task-gather,.artifact-update-message,.collaboration-link,.activity-reminder-message');
const open=n=>!!n.querySelector('details[open]:not(.is-collapsing)');
function control(label,action,direction){const b=el('button','activity-page');b.type='button';b.setAttribute('aria-label',label);b.onclick=action;b.append(activityArrow(direction));return b;}

export function prepareActivityCarousels(area){
  // A refresh reuses navigation DOM too, including keyboard focus. These rows
  // are presentation-only, so they never enter transcript reconciliation.
  const focused=area.contains(document.activeElement)&&document.activeElement.closest('.activity-pager')?document.activeElement:null;
  for(const pager of area.querySelectorAll(':scope>.activity-pager'))pager.remove();
  const pager=focused?.closest('.activity-pager'),label=focused?.getAttribute('aria-label');
  return ()=>{if(!pager?.isConnected)return;const replacement=focused.isConnected&&!focused.disabled?focused:[...pager.querySelectorAll('button:not(:disabled)')].find(n=>n.getAttribute('aria-label')===label)||pager.querySelector('[aria-current="true"]');replacement?.focus({preventScroll:true});};
}
export function revealActivityItem(target){
  for(let n=target;n;n=n.parentElement)if(n._revealActivity){n._revealActivity();return;}
}
export function syncActivityCarousels(area,entry,{motion=()=>false,animate=false,following=()=>true,onNavigate=()=>{}}={}){
  entry.activityCarousels??=new Map();
  const groups=[];let group=null;
  for(const row of area.children){
    // Clear the previous projection without changing disclosure-owned hidden.
    delete row.dataset.activityHidden;delete row.dataset.activityItem;delete row._revealActivity;
    if(eligible(row)){
      if(!group){group=[];groups.push(group);}
      group.push({key:keyOf(row),row,rows:[row]});
    }else{
      const owner=row.dataset.taskCommentaryBlock||row.dataset.taskCommentary;
      const item=owner&&group?.find(i=>i.row.dataset.progressGroup===owner);
      if(item){item.rows.push(row);continue;}
      group=null;
    }
  }
  // A human request or ordinary message can interrupt a job's history. Hide
  // its later owned rows with that page too, without moving them across the
  // interruption or including the pending request in the carousel.
  const tails=new Map(groups.map(items=>[items,items.at(-1).rows.at(-1)]));
  const owners=new Map(groups.flatMap(items=>items.filter(i=>i.row.dataset.progressGroup).map(i=>[i.row.dataset.progressGroup,i])));
  for(const row of area.children){
    const item=owners.get(row.dataset.taskCommentaryBlock||row.dataset.taskCommentary);
    if(item&&!item.rows.includes(row))item.rows.push(row);
  }
  const prior=[...entry.activityCarousels.values()],next=new Map(),claimed=new Set();
  for(const items of groups){
    // A page boundary may prepend the beginning of a run. Match surviving
    // identity, never a numeric page index that can now mean another receipt.
    const keys=items.map(i=>i.key),saved=prior.find(s=>!claimed.has(s)&&keys.includes(s.selected))||prior.find(s=>!claimed.has(s)&&s.keys.some(k=>keys.includes(k)));
    const model=saved||{keys:[],selected:keys.at(-1),seen:new Set(keys)};
    claimed.add(model);
    const previous=items.find(i=>i.key===model.selected);
    // Older history is not a new arrival. Count only newly appended receipts,
    // retaining any already-unread live arrivals across cached renders.
    const oldKeys=new Set(model.keys),lastKnown=Math.max(-1,...keys.map((key,index)=>oldKeys.has(key)?index:-1));
    keys.forEach((key,index)=>{if(!oldKeys.has(key)&&(!animate||index<=lastKnown))model.seen.add(key);});
    const fresh=keys.filter(k=>!oldKeys.has(k)&&!model.seen.has(k));
    const selection=document.getSelection(),readerOwnsPage=previous?.rows.some(row=>row.contains(document.activeElement)||(!selection?.isCollapsed&&(row.contains(selection?.anchorNode)||row.contains(selection?.focusNode))));
    const wasLatest=model.selected===model.keys.at(-1);
    if(!keys.includes(model.selected))model.selected=keys.at(-1);
    else if(animate&&following()&&wasLatest&&fresh.length&&!readerOwnsPage&&!open(previous?.row||items[0].row))model.selected=keys.at(-1);
    model.keys=keys;model.items=items;next.set(keys[0],model);
    for(const item of items){
      item.row.classList.add('activity-receipt');
      const heading=item.row.querySelector('.summary-progress-heading');
      if(heading){
        // The back arrow replaces (rather than supplements) the old chevron.
        const chevron=heading.querySelector('.summary-progress-chevron');
        if(chevron&&!chevron.querySelector('svg')){chevron.replaceChildren(activityArrow(-1));chevron.dataset.activityBack='true';}
      }
    }
    const paint=(navigation=false,direction=1)=>{
      const index=keys.indexOf(model.selected),current=items[index];
      for(const item of items)for(const row of item.rows){row.dataset.activityHidden=String(item!==current);row.dataset.activityItem=item.key;row._revealActivity=()=>select(item.key,false);}
      if(!model.pager){
        const pager=el('nav','activity-pager');pager.setAttribute('aria-label','Conversation updates');
        const prev=control('Previous update',()=>model.select(-1),-1),dots=el('span','activity-dots'),count=el('span','activity-count'),nextButton=control('Next update',()=>model.select(1),1),newButton=el('button','activity-new');newButton.type='button';
        newButton.onclick=()=>model.latest();pager.append(prev,dots,nextButton,count,newButton);model.pager=pager;
      }
      const [prev,dots,nextButton,count,newButton]=model.pager.children;
      const pagerFocused=model.pager.contains(document.activeElement),focusedControl=document.activeElement;
      prev.disabled=index===0;nextButton.disabled=index===items.length-1;
      count.setAttribute('aria-live',navigation?'polite':'off');count.setAttribute('aria-atomic','true');
      count.textContent=`${index+1} / ${items.length}`;count.setAttribute('aria-label',`Update ${index+1} of ${items.length}`);
      const limit=5,start=Math.max(0,Math.min(index-2,items.length-limit));
      // No unbounded dot row, even when dozens of receipts arrive together.
      const dotFocused=dots.contains(document.activeElement);
      dots.replaceChildren();
      for(let i=start;i<Math.min(items.length,start+limit);i++){
        const dot=el('button','activity-dot');dot.type='button';dot.setAttribute('aria-label',`Show update ${i+1} of ${items.length}`);dot.setAttribute('aria-current',String(i===index));dot.onclick=()=>select(keys[i]);dots.append(dot);
      }
      if(dotFocused)dots.querySelector('[aria-current="true"]')?.focus({preventScroll:true});
      if(index===items.length-1)keys.forEach(k=>model.seen.add(k));else model.seen.add(model.selected);
      const unseen=keys.filter(k=>!model.seen.has(k)&&k!==model.selected).length;
      newButton.textContent=unseen+' new '+(unseen===1?'update':'updates');newButton.hidden=!unseen;
      model.pager.hidden=items.length<2;
      const lastRow=tails.get(items);
      if(model.pager.previousElementSibling!==lastRow)lastRow.after(model.pager);
      if(pagerFocused&&(!model.pager.contains(document.activeElement)||focusedControl.disabled))dots.querySelector('[aria-current="true"]')?.focus({preventScroll:true});
      if(navigation&&motion()){
        for(const row of current.rows){
          if(!row.getClientRects().length)continue;
          row._activityMotion?.cancel();
          const animation=row.animate([{opacity:.25,transform:`translateX(${direction*8}px)`},{opacity:1,transform:'translateX(0)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
          row._activityMotion=animation;animation.onfinish=()=>{animation.cancel();delete row._activityMotion;};
        }
      }
    };
    const select=(key,user=true)=>{
      if(key===model.selected)return;
      const previous=items.find(i=>i.key===model.selected),offset=previous.row.getBoundingClientRect().top-area.getBoundingClientRect().top;
      const direction=keys.indexOf(key)>keys.indexOf(model.selected)?1:-1;
      previous.rows.forEach(row=>row._activityMotion?.cancel());
      model.selected=key;paint(user,direction);
      if(user)onNavigate(items.find(i=>i.key===key).row,offset);
    };
    model.select=delta=>select(keys[Math.max(0,Math.min(keys.length-1,keys.indexOf(model.selected)+delta))]);model.latest=()=>select(keys.at(-1));
    // Arrows only apply when navigation owns focus; never steal editing keys.
    if(model.pager)model.pager.onkeydown=null;
    paint(animate&&fresh.length>0&&model.selected===keys.at(-1));
    model.pager.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();model.select(e.key==='ArrowLeft'?-1:1);(model.pager.querySelector('.activity-dot[aria-current="true"]'))?.focus({preventScroll:true});}};
  }
  entry.activityCarousels=next;
}
