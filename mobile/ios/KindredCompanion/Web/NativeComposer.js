// Installed only by the trusted iOS host. UIKit owns foreground editing and
// glass; the retained page owns drafts, menus, files, dictation and delivery.
window.__kindredCreateNativeComposer=({documentID,schedule,allowed})=>{
  const form=document.querySelector('#composer'),editor=document.querySelector('#prompt');
  const actions=new Map(),keys=new WeakMap(),images=new WeakMap();let serial=0,active=false,ack=0,context='',saved=null;
  const originalFocus=editor.focus.bind(editor),originalBlur=editor.blur.bind(editor);
  const key=node=>{if(!keys.has(node))keys.set(node,'item-'+(++serial));return keys.get(node);};
  const visible=node=>node?.isConnected&&!node.closest('[hidden],[inert]')&&node.getClientRects().length&&getComputedStyle(node).visibility==='visible';
  const contextKey=()=>{const selected=document.querySelector('.bot-link.active[data-sidebar-id],.pinned-bot.active[data-sidebar-id]');return selected?selected.dataset.sidebarKind+':'+selected.dataset.sidebarId+'|'+(form.classList.contains('is-answering')?'answer':'message'):null;};
  const rect=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100);};
  const value=()=>typeof editor.value==='string'?editor.value:editor.textContent;
  const select=range=>{
    const wanted=Array.isArray(range)?range:[value().length,0],walk=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT),nodes=[];
    for(let n; n=walk.nextNode();)nodes.push(n);
    const point=offset=>{for(const n of nodes){if(offset<=n.length)return [n,Math.max(0,offset)];offset-=n.length;}return [editor,editor.childNodes.length];};
    const r=document.createRange();r.setStart(...point(wanted[0]));r.setEnd(...point(wanted[0]+wanted[1]));const s=getSelection();s.removeAllRanges();s.addRange(r);
  };
  const write=(text,range,composing=false)=>{
    if(typeof text!=='string'||text.length>256000)return false;
    const changed=value()!==text;
    if(changed){
      const mentions=[...editor.querySelectorAll('[data-mention]')].map(n=>({id:n.dataset.mention,name:n.dataset.name,channel:n.dataset.channel}));
      editor.value=text;
      if(mentions.length){
        const source=editor.firstChild;
        if(source?.nodeType===Node.TEXT_NODE){
          const fragment=document.createDocumentFragment();let position=0;
          const matches=mentions.flatMap(m=>{const token=(m.channel?'#':'@')+m.name,out=[];let at=text.indexOf(token);while(at>=0){out.push({at,token,m});at=text.indexOf(token,at+token.length);}return out;}).sort((a,b)=>a.at-b.at);
          for(const {at,token,m} of matches){if(at<position)continue;fragment.append(document.createTextNode(text.slice(position,at)));const span=document.createElement('span');span.dataset.mention=m.id;span.dataset.name=m.name;if(m.channel)span.dataset.channel=m.channel;span.contentEditable='false';span.textContent=token;fragment.append(span);position=at+token.length;}
          fragment.append(document.createTextNode(text.slice(position)));editor.replaceChildren(fragment);
        }
      }
    }
    select(range);editor.dataset.composing=String(composing);
    if(changed)editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',isComposing:composing}));
    return true;
  };
  const request=action=>window.webkit.messageHandlers.kindredAccounts.postMessage({action:'native-composer-focus',document:documentID,context:contextKey(),focused:action});
  editor.focus=options=>active?request(true):originalFocus(options);
  editor.blur=()=>active?request(false):originalBlur();
  const symbol=node=>node.id==='composer-actions'?'plus':node.id==='send'?'arrow.up':node.classList.contains('dictation-button')?(node.classList.contains('is-recording')?'stop.fill':'mic'):node.classList.contains('composer-image-open')?'photo':/cancel|remove|close/i.test(node.getAttribute('aria-label')||node.title||'')?'xmark':'';
  const snapshot=covered=>{
    if(covered||!allowed()||!visible(form))return null;
    const next=contextKey();if(!next)return null;
    if(next!==context){context=next;ack=0;}
    actions.clear();const items=[],commandMenu=document.querySelector('#command-options');
    commandMenu?.toggleAttribute('data-ios-native-popup',active);
    const suggestions=[form.querySelector('#mention-options:not([hidden])'),commandMenu?.hidden?null:commandMenu].find(visible);
    for(const button of form.querySelectorAll('button')){
      if(!visible(button)||button.closest('#mention-options,.command-options'))continue;
      const id=key(button);actions.set(id,button);items.push({id,kind:'button',text:(button.getAttribute('aria-label')||button.title||button.textContent).slice(0,4000),symbol:symbol(button),rect:rect(button),font:parseFloat(getComputedStyle(button).fontSize)||16,enabled:!button.disabled,primary:button.id==='send'||button.classList.contains('is-primary')});
    }
    // Non-editing foreground (reply excerpts, filenames and dictation status).
    const walker=document.createTreeWalker(form,NodeFilter.SHOW_TEXT);
    for(let n;n=walker.nextNode();){
      const parent=n.parentElement;if(!n.textContent.trim()||parent.closest('#prompt,button,svg,#composer-hint,#mention-options,.command-options')||!visible(parent))continue;
      const r=document.createRange();r.selectNode(n);const b=r.getBoundingClientRect(),p=parent.getBoundingClientRect();if(!b.width||!b.height)continue;
      const left=Math.max(b.left,p.left),top=Math.max(b.top,p.top),right=Math.min(b.right,p.right),bottom=Math.min(b.bottom,p.bottom);
      if(right<=left||bottom<=top)continue;
      items.push({id:key(n),kind:'label',text:n.textContent.slice(0,4000),symbol:'',rect:[left,top,right-left,bottom-top],font:parseFloat(getComputedStyle(parent).fontSize)||13});
    }
    for(const button of suggestions?.querySelectorAll('button')||[]){
      if(!visible(button))continue;const id=key(button);actions.set(id,button);items.push({id,kind:'suggestion',text:button.innerText.slice(0,4000),symbol:'',rect:rect(button),font:parseFloat(getComputedStyle(button).fontSize)||16,enabled:!button.disabled});
    }
    if(suggestions===commandMenu){
      for(const label of commandMenu.querySelectorAll('.command-menu-heading,.command-empty,.command-menu-footer')){
        if(visible(label))items.push({id:key(label),kind:'suggestion-label',text:label.textContent.slice(0,4000),symbol:'',rect:rect(label),font:parseFloat(getComputedStyle(label).fontSize)||13});
      }
    }
    for(const image of form.querySelectorAll('img')){
      if(!visible(image)||!image.complete||!image.naturalWidth)continue;
      try{let encoded=images.get(image);if(!encoded||encoded.src!==image.currentSrc){const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;canvas.getContext('2d').drawImage(image,0,0,80,80);encoded={src:image.currentSrc,data:canvas.toDataURL('image/jpeg',.8).split(',')[1]};images.set(image,encoded);}
        items.push({id:key(image),kind:'image',text:image.alt||'',image:encoded.data,symbol:'',rect:rect(image),font:13});}catch{}
    }
    if(items.length>80)return null;
    const css=getComputedStyle(editor),style=getComputedStyle(form),selection=getSelection();let selected;
    if(selection?.rangeCount){const r=selection.getRangeAt(0);if(editor.contains(r.startContainer)&&editor.contains(r.endContainer)){const before=r.cloneRange();before.selectNodeContents(editor);before.setEnd(r.startContainer,r.startOffset);selected=[before.toString().length,r.toString().length];}}
    return {context,text:value(),placeholder:editor.dataset.placeholder||'Message',rect:rect(form),editor:rect(editor),scroller:rect(document.querySelector('#content')),
      radius:Math.min(64,parseFloat(style.borderTopLeftRadius)||28),font:parseFloat(css.fontSize),line:parseFloat(css.lineHeight)||24,
      inset:[css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft].map(n=>parseFloat(n)||0),dark:document.documentElement.dataset.theme!=='light',ack,items,selection:selected,...(suggestions?{popup:{rect:rect(suggestions),height:suggestions.scrollHeight,offset:suggestions.scrollTop}}:{}),editing:editor.getAttribute('aria-disabled')!=='true'};
  };
  const setActive=wanted=>{
    if(wanted===active)return;
    active=wanted;
    document.querySelector('#command-options')?.toggleAttribute('data-ios-native-popup',active);
    if(active){
      const transferFocus=document.activeElement===editor;
      saved={editable:editor.getAttribute('contenteditable'),tabindex:editor.getAttribute('tabindex'),aria:form.getAttribute('aria-hidden')};
      originalBlur();editor.contentEditable='false';editor.tabIndex=-1;form.setAttribute('aria-hidden','true');form.dataset.iosNativeComposer='true';
      if(transferFocus)request(true);
    }else{
      if(saved){for(const [attribute,v] of [['contenteditable',saved.editable],['tabindex',saved.tabindex]])v===null?editor.removeAttribute(attribute):editor.setAttribute(attribute,v);saved.aria===null?form.removeAttribute('aria-hidden'):form.setAttribute('aria-hidden',saved.aria);}
      delete form.dataset.iosNativeComposer;delete form.dataset.iosNativeFocused;window.__KINDRED_NATIVE_COMPOSER_FOCUSED=false;delete editor.dataset.composing;saved=null;
    }
  };
  const perform=command=>{
    if(!active||documentID!==command.document||contextKey()!==command.context||command.context!==context||!allowed()||document.querySelector('dialog[open]'))return false;
    if(!Number.isSafeInteger(command.revision)||command.revision<ack)return false;
    // Focus/selection callbacks can arrive after a page-side draft update.
    // Only a real native edit (or an unacknowledged one flushed by an action)
    // is allowed to replace the authoritative draft.
    if(command.action==='edit'||command.revision>ack){
      if(!write(command.text,command.selection,command.composing))return false;ack=command.revision;
    }else if(value()===command.text)select(command.selection);
    if(command.action==='focus'){
      window.__KINDRED_NATIVE_COMPOSER_FOCUSED=command.focused===true;
      form.toggleAttribute('data-ios-native-focused',command.focused===true);
      editor.dispatchEvent(new FocusEvent(command.focused?'focus':'blur',{bubbles:false}));
     }else if(command.action==='key'){
      if(!['Enter','Tab','Escape','ArrowUp','ArrowDown'].includes(command.key))return false;
      const event=new KeyboardEvent('keydown',{key:command.key,bubbles:true,cancelable:true});editor.dispatchEvent(event);
      if(command.key==='Enter'&&!event.defaultPrevented)form.requestSubmit();
    }else if(command.action==='send')form.requestSubmit();
    else if(command.action==='action'){
      const node=actions.get(command.id);if(!visible(node)||node.disabled)return false;
      // The existing iOS dictation handler captures the current DOM range on
      // pointerdown. That range mirrors UIKit's real selection.
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',button:0}));node.click();
    }else if(command.action==='paste'){
      const transfer=new DataTransfer();
      if(command.image){const raw=atob(command.image),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));transfer.items.add(new File([bytes],'Pasted image.png',{type:'image/png'}));}
      else transfer.setData('text/plain',command.paste||'');
      editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));
    }
    schedule();return true;
  };
  document.addEventListener('pointerdown',event=>{if(active&&!event.target.closest('#composer,#composer-menu,.command-options'))request(false);},true);
  document.addEventListener('load',event=>{if(form.contains(event.target))schedule();},true);
  editor.addEventListener('input',schedule);document.addEventListener('selectionchange',()=>{if(active)schedule();});
  new ResizeObserver(schedule).observe(editor);
  const api={snapshot,setActive,perform};window.__kindredNativeComposer=api;return api;
};
