// Browser editing creates DIV/P/BR wrappers differently. Serialize actual lines,
// excluding the final BR used only to hold the caret on an empty line.
export function composerText(root) {
  const blocks=new Set(['DIV','P','LI','UL','OL']);
  function read(n,depth=0) {
    if(n.nodeType===Node.TEXT_NODE)return n.textContent;
    if(n.dataset?.mention)return (n.dataset.channel?'#':'@')+n.dataset.name;
    if(n.tagName==='BR')return '\n';
    let result='',previous=null;
    const children=[...n.childNodes].filter(child=>child.nodeType!==Node.TEXT_NODE||child.textContent!=='');
    children.forEach((child,i)=>{
      if(child.tagName==='BR'&&i===children.length-1)return;
      if(i && (blocks.has(child.tagName)||blocks.has(previous?.tagName))) {
        // Markdown needs a paragraph boundary after a list, or the following
        // prose becomes a continuation of its final item when sent/restored.
        result+=['UL','OL'].includes(previous?.tagName)&&!['UL','OL','LI'].includes(n.tagName)?'\n\n':'\n';
      }
      if(child.tagName==='LI') {
        const marker=n.tagName==='OL'?`${i+1}. `:'- ';
        result+='  '.repeat(depth)+marker+read(child,depth+1);
      } else result+=read(child,depth+(['UL','OL'].includes(n.tagName)&&['UL','OL'].includes(child.tagName)?1:0));
      previous=child;
    });
    return result;
  }
  return read(root).replaceAll('\u00a0',' ');
}

export function createComposerLists(editor,restoreMention=()=>{}) {
  let savedRange;
  // This editor serializes plain text and lists, not browser rich-text styles.
  // Otherwise Ctrl+B/I/U can silently leave subsequent typing bold or italic,
  // while sending/reloading discards that formatting.
  editor.addEventListener('beforeinput',e=>{
    if(['formatBold','formatItalic','formatUnderline','formatStrikeThrough'].includes(e.inputType))e.preventDefault();
    if(e.isComposing||e.inputType!=='insertText'||e.data!==' ')return;
    const r=selection();if(!r?.collapsed||listItem(r))return;
    if(!/^[-*+]$/.test(lineBefore(r)))return;
    e.preventDefault();const s=getSelection();s.modify('extend','backward','character');
    document.execCommand('delete');toggle();
  });
  const protectMentions=()=>{for(const n of editor.querySelectorAll('[data-mention]')){n.contentEditable='false';restoreMention(n);}};
  editor.addEventListener('input',protectMentions);
  const selection=()=>{
    const s=getSelection(),r=s?.rangeCount?s.getRangeAt(0):null;
    return r&&editor.contains(r.commonAncestorContainer)?r:null;
  };
  document.addEventListener('selectionchange',()=>{const r=selection();if(r)savedRange=r.cloneRange();});
  const listItem=r=>{const n=r.startContainer.nodeType===Node.ELEMENT_NODE?r.startContainer:r.startContainer.parentElement;const li=n?.closest('li');return li&&editor.contains(li)?li:null;};
  const lineBefore=r=>{const prefix=r.cloneRange();prefix.selectNodeContents(editor);prefix.setEnd(r.startContainer,r.startOffset);return composerText(prefix.cloneContents()).split('\n').at(-1);};
  const changed=()=>editor.dispatchEvent(new Event('input',{bubbles:true}));
  function toggle() {
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
    try {document.execCommand('insertUnorderedList');} finally {protectMentions();editor.classList.remove('is-formatting-list');}
    changed();
  }
  function keydown(e) {
    if(e.isComposing)return false;
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&['b','i','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();return true;
    }
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='Digit8') {e.preventDefault();toggle();return true;}
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
    const line=lineBefore(r),match=line.match(/^(\s*)([-*+]) (.*)$/);
    if(!match)return false;
    e.preventDefault();
    if(e.key==='Tab') {
      // Move only the indentation; preserve text, mention chips and caret position.
      const s=getSelection();for(const _ of Array.from(line))s.modify('move','backward','character');
      if(e.shiftKey){for(let i=0;i<Math.min(2,match[1].length);i++)s.modify('extend','forward','character');if(match[1])document.execCommand('delete');}
      else document.execCommand('insertText',false,'  ');
      for(const _ of Array.from(line.slice(e.shiftKey?Math.min(2,match[1].length):0)))s.modify('move','forward','character');
      changed();return true;
    }
    if(!match[3].trim()) {
      const s=getSelection();for(let i=0;i<line.length;i++)s.modify('extend','backward','character');
      document.execCommand('delete');
      if(composerText(editor).trim())document.execCommand('insertText',false,'\n');
    } else document.execCommand('insertText',false,'\n'+match[1]+match[2]+' ');
    changed();return true;
  }
  return {toggle,keydown};
}
