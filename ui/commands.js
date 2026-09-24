import {composerText} from './composer-text.js';

// Commands are resolved and snapshotted by the server. This module only assists
// editing; the grey parameter hints are CSS content, never part of the message.
export function tokenizeParameters(text) {
  const parts=[];let value='',quote=null,started=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i],next=text[i+1];
    if(ch==='\\'&&next&&(next==='\\'||next===quote||(!quote&&(/[\s'"]/.test(next))))){value+=text[++i];started=true;}
    else if(ch===quote)quote=null;
    else if(!quote&&!started&&(ch==='"'||ch==="'")){quote=ch;started=true;}
    else if(!quote&&/\s/.test(ch)){if(started){parts.push(value);value='';started=false;}}
    else{value+=ch;started=true;}
  }
  if(started)parts.push(value);
  return {parts,incomplete:!!quote};
}
export function createCommandsUI({editor,composer,api,connected,unavailable=()=>null,onDraft,openLibrary}) {
  const menu=document.createElement('div');menu.id='command-options';menu.className='command-options';menu.hidden=true;
  menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Commands');composer.before(menu);
  editor.setAttribute('aria-autocomplete','list');editor.setAttribute('aria-controls',menu.id);
  let commands=[],updated=0,pending=null,selected=0,items=[],dismissed=null,error='',generation=0,lastCompletion=null;
  const node=(tag,classes,text)=>{const n=document.createElement(tag);n.className=classes||'';if(text!==undefined)n.textContent=text;return n;};
  function close(){menu.hidden=true;items=[];editor.removeAttribute('aria-activedescendant');}
  function completion(){
    const selection=getSelection();
    if(!selection?.rangeCount||!selection.isCollapsed)return null;
    const caret=selection.getRangeAt(0);
    if(!editor.contains(caret.startContainer))return null;
    const before=caret.cloneRange();before.selectNodeContents(editor);before.setEnd(caret.startContainer,caret.startOffset);
    const prefixFragment=before.cloneContents(),prefix=composerText(prefixFragment),match=prefix.match(/(?:^|[\s([{"'`])\/([a-z0-9_-]{0,48})$/i);
    if(!match)return null;
    const after=caret.cloneRange(),scope=(caret.endContainer.nodeType===Node.ELEMENT_NODE?caret.endContainer:caret.endContainer.parentElement).closest('li,p,div');
    after.selectNodeContents(scope&&editor.contains(scope)?scope:editor);after.setStart(caret.endContainer,caret.endOffset);
    // Serializing a partial LI as Markdown invents a '- ' prefix after the
    // caret. Use the remaining inline text, within this paragraph/list item.
    const suffix=after.toString(),tail=suffix.match(/^[a-z0-9_-]*/i)[0];
    // Replace only the token at the caret, preserving list nodes and @mentions.
    const start=prefixFragment.textContent.length-match[1].length-1,end=prefixFragment.textContent.length+tail.length;
    const range=document.createRange(),walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    let offset=0,startSet=false,endSet=false;
    while(walker.nextNode()){
      const n=walker.currentNode,next=offset+n.length;
      if(!startSet&&start<=next){range.setStart(n,Math.max(0,start-offset));startSet=true;}
      if(startSet&&end<=next){range.setEnd(n,end-offset);endSet=true;break;}
      offset=next;
    }
    if(!startSet||!endSet)return null;
    const leading=!prefix.slice(0,prefix.length-match[1].length-1).trim();
    return {query:match[1].toLowerCase(),range,leading,suffix:suffix.slice(tail.length),key:editor.value+'@'+start+':'+end};
  }
  function parsed(){const text=editor.value.trimStart();const match=text.match(/^\/([a-z][a-z0-9_-]{0,47})(?:\s+([\s\S]*))?$/);return match?{name:match[1],args:match[2]||'',command:commands.find(c=>c.name===match[1])}:null;}
  async function load(force=false) {
    if(!connected())return [];
    if(pending)return pending;
    if(!force&&Date.now()-updated<15000)return commands;
    const requestGeneration=generation;
    pending=(async()=>{try{
      const result=await api('/commands');if(requestGeneration!==generation)return commands;
      commands=Array.isArray(result)?result:[];updated=Date.now();error='';return commands;
    }catch(e){if(requestGeneration===generation){error=e.message;updated=0;}throw e;}
    finally{if(requestGeneration===generation)pending=null;}})();return pending;
  }
  // Native text highlights preserve caret movement, IME, copy/paste and undo.
  const commandHighlight=globalThis.Highlight&&globalThis.CSS?.highlights?new Highlight():null;
  function markCommands(){
    if(!commandHighlight)return;
    commandHighlight.clear();CSS.highlights.set('kindred-command',commandHighlight);
    if(!connected()||unavailable()||error)return;
    const names=new Set(commands.map(c=>c.name)),nodes=[],walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    let text='';while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===Node.ELEMENT_NODE){if(['BR','DIV','P','LI'].includes(n.tagName))text+='\n';continue;}nodes.push({node:n,start:text.length,end:text.length+n.length});text+=n.textContent;}
    const pattern=/(^|[\s([{"'`])\/([a-z][a-z0-9_-]{0,47})(?![a-z0-9_/-])/g;
    for(const match of text.matchAll(pattern)){
      if(!names.has(match[2]))continue;
      const start=match.index+match[1].length,end=start+match[2].length+1;
      const first=nodes.find(n=>n.end>start),last=nodes.find(n=>n.end>=end);
      if(!first||!last||first.node.parentElement.closest('[data-mention]'))continue;
      const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);commandHighlight.add(range);
    }
  }
  function updateHint(){
    markCommands();const p=parsed();editor.removeAttribute('data-command-params');editor.removeAttribute('data-command-active');
    if(!connected()||unavailable()||!p?.command||p.command.action!=='run')return;
    const {parts,incomplete}=tokenizeParameters(p.args),params=p.command.parameters||[];
    const filled=incomplete?Math.max(0,parts.length-1):parts.length;
    const remaining=params.slice(filled).map(p=>(p.required?'<':'[')+p.name+(p.required?'>':']'));
    if(remaining.length)editor.dataset.commandParams=(/\s$/.test(editor.value)?'':' ')+remaining.join(' ');
    editor.dataset.commandActive=p.name;
  }
  function highlight(){
    [...menu.querySelectorAll('[role="option"]')].forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));
    const option=menu.querySelector('[aria-selected="true"]');
    if(option){editor.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
    else editor.removeAttribute('aria-activedescendant');
  }
  function show(){
    updateHint();const token=completion();
    if(!connected()||document.activeElement!==editor||!token||dismissed===token.key){close();return;}
    const query=token.query;
    items=commands.filter(c=>c.name.includes(query)||c.description?.toLowerCase().includes(query)).sort((a,b)=>Number(!a.name.startsWith(query))-Number(!b.name.startsWith(query))||a.name.localeCompare(b.name)).slice(0,8);
    menu.replaceChildren();menu.hidden=false;document.getElementById('mention-options').hidden=true;
    const heading=node('div','command-menu-heading',token.leading?'Commands':'Reference a command');menu.append(heading);
    const reason=unavailable();if(reason){items=[];menu.append(node('p','command-empty',reason));editor.removeAttribute('aria-activedescendant');return;}
    if(!items.length){
      const status=node('p','command-empty',pending?'Loading commands…':error?'Commands could not load.':'No matching commands. Create one in Skills.');status.setAttribute('role','status');menu.append(status);
      if(error){const retry=node('button','command-retry','Retry');retry.type='button';retry.onpointerdown=e=>e.preventDefault();retry.onclick=()=>{void load(true).then(show).catch(show);show();};menu.append(retry);}
      editor.removeAttribute('aria-activedescendant');return;
    }
    selected=Math.min(selected,items.length-1);
    items.forEach((command,i)=>{
      const option=node('button','command-option');option.type='button';option.id='command-option-'+i;option.setAttribute('role','option');option.tabIndex=-1;
      const copy=node('span','command-option-copy');copy.append(node('strong','', '/'+command.name),node('span','command-description',command.description));
      option.append(copy,node('span','command-source',command.source==='skill'?'Skill':command.source==='built-in'?'Built in':command.source));
      option.addEventListener('pointerdown',e=>e.preventDefault());option.onclick=()=>select(command,completion());
      option.onpointermove=()=>{selected=i;highlight();};menu.append(option);
    });
    menu.append(node('div','command-menu-footer',(token.leading?'':'Reference only · ')+'↑ ↓ to choose · Enter or Tab to insert · Esc to close'));highlight();
  }
  function select(command,token=null){
    close();
    editor.focus({preventScroll:true});
    const range=token?.range||document.createRange();
    if(!token)range.selectNodeContents(editor);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const spacing=token?.suffix&&/^[\s.,;:!?)}\]]/.test(token.suffix)?'':' ';
    document.execCommand('insertText',false,'/'+command.name+spacing);
    dismissed=completion()?.key||null;
    editor.dispatchEvent(new Event('input',{bubbles:true}));onDraft();updateHint();
  }
  function update(){
    const token=completion();if(dismissed!==token?.key)dismissed=null;
    selected=0;
    // Mark the request pending before rendering the initial empty catalogue.
    if(!unavailable()&&((token&&lastCompletion!==token.key)||(!updated&&!error&&editor.value.includes('/'))))void load(token?!token.query:false).then(show).catch(show);
    lastCompletion=token?.key||null;
    show();
  }
  function keydown(event){
    if(event.isComposing)return false;
    if(!completion()){close();return false;}
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();dismissed=completion()?.key;close();return true;}
    if(menu.hidden)return false;
    if(['ArrowDown','ArrowUp'].includes(event.key)&&items.length){event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;highlight();return true;}
    if((event.key==='Tab'||(event.key==='Enter'&&!event.shiftKey))&&items.length){event.preventDefault();select(items[selected],completion());return true;}
    return false;
  }
  async function beforeSend(){
    const text=editor.value.trim();if(!/^\/[a-z][a-z0-9_-]*(?:\s|$)/.test(text))return false;
    await load(true);if(editor.value.trim()!==text)return false;const p=parsed();if(!p?.command)throw Error('Unknown command. Type / to browse commands, or start with // to send literal text.');
    const {parts,incomplete}=tokenizeParameters(p.args);if(incomplete)throw Error('Close the quoted command parameter before sending.');
    let cursor=0;for(const parameter of p.command.parameters){
      const value=parameter.rest?parts.slice(cursor).join(' '):parts[cursor]||'';
      if(parameter.required&&!value.trim()){updateHint();editor.focus({preventScroll:true});throw Error('Add <'+parameter.name+'>. '+p.command.usage);}
      cursor=parameter.rest?parts.length:Math.min(parts.length,cursor+1);
    }
    if(cursor<parts.length)throw Error('Too many parameters. '+p.command.usage+'. Quote values containing spaces.');
    close();return p.command.action==='library';
  }
  function reset(){generation++;commands=[];items=[];selected=0;dismissed=null;lastCompletion=null;updated=0;pending=null;error='';commandHighlight?.clear();close();editor.removeAttribute('data-command-params');editor.removeAttribute('data-command-active');}
  function invalidate(){generation++;pending=null;updated=0;void load(true).then(show).catch(()=>{});}
  editor.addEventListener('input',update);
  editor.addEventListener('focus',update);
  editor.addEventListener('click',update);
  document.addEventListener('selectionchange',()=>{if(document.activeElement===editor)update();});
  editor.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==editor)close();},0));
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!editor.contains(e.target)){dismissed=completion()?.key;close();}});
  // Opening the library never starts a model task or changes the current draft.
  return {keydown,beforeSend,select,refresh:show,invalidate,reset,load,openLibrary};
}
