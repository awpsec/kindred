// Browser editing creates DIV/P/BR wrappers differently. Serialize actual lines,
// excluding the final BR used only to hold the caret on an empty line.
export function composerText(root) {
  const blocks=new Set(['DIV','P','LI','UL','OL']);
  function read(n,indent="") {
    if(n.nodeType===Node.TEXT_NODE)return n.textContent;
    if(n.dataset?.mention)return (n.dataset.channel?'#':'@')+n.dataset.name;
    if(n.tagName==='BR')return '\n';
    let result='',previous=null,itemIndex=0,markerWidth=2;
    const children=[...n.childNodes].filter(child=>child.nodeType!==Node.TEXT_NODE||child.textContent!=='');
    children.forEach((child,i)=>{
      if(child.tagName==='BR'&&i===children.length-1)return;
      if(i && (blocks.has(child.tagName)||blocks.has(previous?.tagName))) {
        // Markdown needs a paragraph boundary after a list, or the following
        // prose becomes a continuation of its final item when sent/restored.
        result+=['UL','OL'].includes(previous?.tagName)&&!['UL','OL','LI'].includes(n.tagName)?'\n\n':'\n';
      }
      if(child.tagName==='LI') {
        const marker=n.tagName==='OL'?`${Number(n.getAttribute('start')||1)+itemIndex++}. `:'- ';
        markerWidth=marker.length;
        result+=indent+marker+read(child,indent+' '.repeat(markerWidth));
      } else result+=read(child,indent+(['UL','OL'].includes(n.tagName)&&['UL','OL'].includes(child.tagName)?' '.repeat(markerWidth):''));
      previous=child;
    });
    return result;
  }
  return read(root).replaceAll('\u00a0',' ');
}

// Inline URL icons are native autoformat transactions, like automatic lists.
// Native Undo first removes formatting; text editing and Redo stay browser-owned.
export function createComposerLinks(editor,{createIcon}={}) {
  const highlight=globalThis.Highlight&&globalThis.CSS?.highlights?new Highlight():null;
  if(highlight)CSS.highlights.set('kindred-composer-link',highlight);
  const sites=Object.assign(Object.create(null),{'github.com':'github','www.github.com':'github','mail.google.com':'gmail','drive.google.com':'googledrive','calendar.google.com':'googlecalendar','notion.so':'notion','www.notion.so':'notion','notion.com':'notion','www.notion.com':'notion','trello.com':'trello','www.trello.com':'trello'});
  const images=new Map(),suppressed=new Set(),blocks=new Set(['DIV','P','LI','UL','OL']);
  let frame=0,timer=0,composing=false,formatting=false;
  function iconImage(site){
    if(images.has(site))return images.get(site);
    const logo=site!=='web'?createIcon?.(site):null,svg=logo?.matches('svg')?logo:logo?.querySelector('svg');
    const source=svg?new XMLSerializer().serializeToString(svg):'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.6"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>';
    const value='url("data:image/svg+xml,'+encodeURIComponent(source)+'")';images.set(site,value);return value;
  }
  const atomic=n=>n.nodeType===Node.ELEMENT_NODE&&(n.tagName==='BR'||n.matches('[data-mention],[contenteditable="false"]'));
  const weight=n=>n.nodeType===Node.TEXT_NODE?n.length:atomic(n)?1:[...n.childNodes].reduce((sum,c)=>sum+weight(c),0)+(blocks.has(n.tagName)?2:0);
  function bookmark(){
    const s=getSelection();if(!s?.rangeCount||!editor.contains(s.anchorNode)||!editor.contains(s.focusNode))return null;
    function point(node,offset){
      const chip=(node.nodeType===Node.TEXT_NODE?node.parentElement:node).closest?.('[contenteditable="false"]');
      if(chip&&editor.contains(chip)){const after=offset>0;node=chip.parentNode;offset=[...node.childNodes].indexOf(chip)+(after?1:0);}
      let value=node.nodeType===Node.TEXT_NODE?offset:[...node.childNodes].slice(0,offset).reduce((sum,c)=>sum+weight(c),0)+(node!==editor&&blocks.has(node.tagName)?1:0);
      while(node!==editor){const parent=node.parentNode;for(const sibling of parent.childNodes){if(sibling===node)break;value+=weight(sibling);}if(parent!==editor&&blocks.has(parent.tagName))value++;node=parent;}return value;
    }
    return [point(s.anchorNode,s.anchorOffset),point(s.focusNode,s.focusOffset)];
  }
  function restore(saved){
    if(!saved)return;
    function locate(node,offset){
      if(node.nodeType===Node.TEXT_NODE)return [node,Math.min(offset,node.length)];
      if(atomic(node)){const parent=node.parentNode;return [parent,[...parent.childNodes].indexOf(node)+(offset?1:0)];}
      if(node!==editor&&blocks.has(node.tagName)){if(offset===0)return [node,0];offset--;}
      for(const child of node.childNodes){const size=weight(child);if(offset<=size)return locate(child,offset);offset-=size;}
      return [node,node.childNodes.length];
    }
    getSelection().setBaseAndExtent(...locate(editor,saved[0]),...locate(editor,saved[1]));
  }
  function scan(){
    const nodes=[];let text='';
    function read(node){
      if(node.nodeType===Node.TEXT_NODE){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;return;}
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      if(node.matches('[data-mention],[contenteditable="false"]')){text+='\n';return;}
      const block=node.tagName==='BR'||blocks.has(node.tagName);if(block)text+='\n';
      for(const child of node.childNodes)read(child);if(block)text+='\n';
    }
    for(const child of editor.childNodes)read(child);
    const matches=[],pattern=/(^|[\s([{'"<])((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi;
    for(const match of text.matchAll(pattern)){
      let url=match[2].replace(/[.,!?;:]+$/,'');
      while(/[)\]}]$/.test(url)){const close=url.at(-1),open={')':'(',']':'[','}':'{'}[close];if(url.split(close).length<=url.split(open).length)break;url=url.slice(0,-1).replace(/[.,!?;:]+$/,'');}
      let parsed;try{parsed=new URL(/^www\./i.test(url)?'https://'+url:url);if(!parsed.hostname)continue;}catch{continue;}
      const start=match.index+match[1].length,end=start+url.length,first=nodes.find(n=>n.end>start),last=nodes.find(n=>n.end>=end);if(!first||!last)continue;
      const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);
      const ancestor=first.node.parentElement.closest('[data-composer-url]'),prefix=document.createRange();if(ancestor){prefix.selectNodeContents(ancestor);prefix.setEnd(range.startContainer,range.startOffset);}
      matches.push({url,range,owner:ancestor&&prefix.toString()===''?ancestor:null,site:!parsed.username&&!parsed.password&&sites[parsed.hostname]||'web'});
    }
    return matches;
  }
  function paint(){
    frame=0;if(composing)return;
    highlight?.clear();const matches=scan(),seen=new Set();
    for(const match of matches){highlight?.add(match.range);if(match.owner){seen.add(match.owner);match.owner.dataset.site=match.site;match.owner.style.setProperty('--composer-link-icon',iconImage(match.site));}}
    // Only attributes change outside native editing transactions. This keeps
    // browser history references, selection, and IME text nodes intact.
    for(const span of editor.querySelectorAll('[data-composer-url]'))if(!seen.has(span)){span.removeAttribute('data-site');span.style.removeProperty('--composer-link-icon');}
  }
  const schedule=()=>{if(!frame&&!composing)frame=requestAnimationFrame(paint);};
  function autoformat(){
    timer=0;if(composing||formatting||document.activeElement!==editor||!editor.isContentEditable||!editor.getClientRects().length)return;
    const matches=scan().filter(m=>!m.owner&&!suppressed.has(m.url));if(!matches.length)return;
    const saved=bookmark();if(!saved)return;
    formatting=true;
    try{
      // Native editing may rebuild neighboring text nodes. Rescan after each
      // formatting transaction instead of retaining stale ranges.
      for(let remaining=Math.min(matches.length,32);remaining>0;remaining--){
        const match=scan().find(m=>!m.owner&&!suppressed.has(m.url));if(!match)break;
        const span=document.createElement('span'),prefix=document.createElement('span');span.dataset.composerUrl='';span.className='composer-url';span.dataset.site=match.site;span.style.setProperty('--composer-link-icon',iconImage(match.site));prefix.className='composer-url-prefix';prefix.textContent=match.url.slice(0,8);span.append(prefix,document.createTextNode(match.url.slice(8)));
        const selection=getSelection();selection.removeAllRanges();selection.addRange(match.range);document.execCommand('insertHTML',false,span.outerHTML);
      }
      restore(saved);
    }finally{formatting=false;schedule();}
  }
  new MutationObserver(schedule).observe(editor,{childList:true,characterData:true,subtree:true});
  editor.addEventListener('input',e=>{
    schedule();if(formatting)return;clearTimeout(timer);
    if(e.inputType==='historyUndo'){for(const match of scan())suppressed.add(match.url);return;}
    if(e.inputType==='historyRedo'||composing||e.isComposing)return;
    timer=setTimeout(autoformat,80);
  });
  editor.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);highlight?.clear();});
  editor.addEventListener('compositionend',()=>{composing=false;schedule();timer=setTimeout(autoformat,80);});
  editor.addEventListener('kindred-composer-reset',()=>{clearTimeout(timer);suppressed.clear();schedule();timer=setTimeout(autoformat,80);});
  editor.addEventListener('focus',()=>{clearTimeout(timer);timer=setTimeout(autoformat,80);});
  schedule();
}

export function createComposerLists(editor,restoreMention=()=>{}) {
  let savedRange,lastAutoPrefix=null,suppressAutoPrefix=null;
  // This editor serializes plain text and lists, not browser rich-text styles.
  // Otherwise Ctrl+B/I/U can silently leave subsequent typing bold or italic,
  // while sending/reloading discards that formatting.
  editor.addEventListener('beforeinput',e=>{
    if(e.inputType==='historyUndo')suppressAutoPrefix=lastAutoPrefix;
    if(['formatBold','formatItalic','formatUnderline','formatStrikeThrough'].includes(e.inputType))e.preventDefault();
    if(e.isComposing||e.inputType!=='insertText'||e.data!==' ')return;
    const r=selection();if(!r?.collapsed||listItem(r))return;
    const line=lineBefore(r),ordered=line.match(/^(\d{1,3})\.$/);
    if(suppressAutoPrefix===line){suppressAutoPrefix=null;return;}
    suppressAutoPrefix=null;
    if(!ordered&&!/^[-*+]$/.test(line))return;
    lastAutoPrefix=line;
    e.preventDefault();const s=getSelection();
    for(let i=0;i<line.length;i++)s.modify('extend','backward','character');
    if(ordered){
      // One editing transaction keeps the literal marker in native undo history.
      document.execCommand('insertHTML',false,`<ol start="${Number(ordered[1])}"><li><br></li></ol>`);
      protectMentions();changed();
    }else{document.execCommand('delete');toggle();}
  });
  const protectMentions=()=>{for(const n of editor.querySelectorAll('[data-mention]')){n.contentEditable='false';restoreMention(n);}};
  editor.addEventListener('input',e=>{protectMentions();
    if(e.inputType==='historyUndo'&&lastAutoPrefix&&getSelection()?.toString()===lastAutoPrefix)getSelection().collapseToEnd();
  });
  const selection=()=>{
    const s=getSelection(),r=s?.rangeCount?s.getRangeAt(0):null;
    return r&&editor.contains(r.commonAncestorContainer)?r:null;
  };
  document.addEventListener('selectionchange',()=>{const r=selection();if(r)savedRange=r.cloneRange();});
  const listItem=r=>{const n=r.startContainer.nodeType===Node.ELEMENT_NODE?r.startContainer:r.startContainer.parentElement;const li=n?.closest('li');return li&&editor.contains(li)?li:null;};
  const lineBefore=r=>{const prefix=r.cloneRange();prefix.selectNodeContents(editor);prefix.setEnd(r.startContainer,r.startOffset);return composerText(prefix.cloneContents()).split('\n').at(-1);};
  const changed=()=>editor.dispatchEvent(new Event('input',{bubbles:true}));
  function toggle(ordered=false) {
    const r=selection()||savedRange;
    editor.focus({preventScroll:true});
    if(r&&editor.contains(r.commonAncestorContainer)) {
      const s=getSelection();s.removeAllRanges();s.addRange(r);
    } else {
      const end=document.createRange();end.selectNodeContents(editor);end.collapse(false);
      const s=getSelection();s.removeAllRanges();s.addRange(end);
    }
    // Native editing retains mention chips, selection and the browser undo stack.
    // Chromium can move a noneditable chip outside the list. Let its native
    // formatter move the inline span, then restore the chip (including on undo).
    editor.classList.add('is-formatting-list');
    for(const n of editor.querySelectorAll('[data-mention]'))n.removeAttribute('contenteditable');
    try {document.execCommand(ordered?'insertOrderedList':'insertUnorderedList');} finally {protectMentions();editor.classList.remove('is-formatting-list');}
    changed();
  }
  function keydown(e) {
    if(e.isComposing)return false;
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z')suppressAutoPrefix=lastAutoPrefix;
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&['b','i','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();return true;
    }
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&['Digit7','Digit8'].includes(e.code)) {e.preventDefault();toggle(e.code==='Digit7');return true;}
    if(!['Enter','Tab'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey)return false;
    const r=selection();if(!r)return false;
    const li=listItem(r);
    if(li) {
      e.preventDefault();
      if(e.key==='Tab'){
        document.execCommand(e.shiftKey?'outdent':'indent');
      }else document.execCommand('insertParagraph');
      protectMentions();changed();return true;
    }
    // Drafts and plain-text paste retain Markdown bullets. Continue those too.
    if(!r.collapsed)return false;
    const line=lineBefore(r),match=line.match(/^(\s*)([-*+]|\d{1,3}\.) (.*)$/);
    if(!match)return false;
    e.preventDefault();
    if(e.key==='Tab') {
      // Move only the indentation; preserve text, mention chips and caret position.
      const prefix=r.cloneRange();prefix.selectNodeContents(editor);prefix.setEnd(r.startContainer,r.startOffset);
      const parent=composerText(prefix.cloneContents()).split('\n').slice(0,-1).reverse().map(line=>line.match(/^(\s*)([-*+]|\d{1,3}\.) /)).find(m=>m&&m[1].length<=match[1].length);
      const width=parent?parent[2].length+1:2,indent=parent?parent[1].length:0;
      const remove=Math.min(match[1].length,match[1].length===indent+width?width:2);
      const add=Math.max(2,indent+width-match[1].length);
      const s=getSelection();for(const _ of Array.from(line))s.modify('move','backward','character');
      if(e.shiftKey){for(let i=0;i<remove;i++)s.modify('extend','forward','character');if(match[1])document.execCommand('delete');}
      else document.execCommand('insertText',false,' '.repeat(add));
      for(const _ of Array.from(line.slice(e.shiftKey?remove:0)))s.modify('move','forward','character');
      changed();return true;
    }
    if(!match[3].trim()) {
      const s=getSelection();for(let i=0;i<line.length;i++)s.modify('extend','backward','character');
      document.execCommand('delete');
      if(composerText(editor).trim())document.execCommand('insertText',false,'\n');
    } else document.execCommand('insertText',false,'\n'+match[1]+(/\d/.test(match[2])?`${Number(match[2].slice(0,-1))+1}.`:match[2])+' ');
    changed();return true;
  }
  return {toggle,keydown};
}
