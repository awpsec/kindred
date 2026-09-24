// Workspace context is selected locally, adapted by an existing bot, then reviewed.
const byteLength = s => new TextEncoder().encode(s).length;
const omitted = new Set(['node_modules','target','vendor','venv','__pycache__','dist','build']);
const safePart = p => p && p !== '.' && p !== '..' && !/[\\:\x00-\x1f\x7f]/.test(p);
const visible = p => p.split('/').every(s => safePart(s) && !omitted.has(s) && (!s.startsWith('.') || ['.claude','.codex','.agents','.pi'].includes(s)));
const isDocument = p => /(^|\/)(claude(?:\.local)?|agents(?:\.override)?|memory|system|append_system)\.md$/i.test(p) || /^readme\.md$/i.test(p) || /^(?:\.claude\/(?:rules|memory)|\.codex\/(?:memory|memories)|\.agents\/memory|\.pi\/(?:agent\/)?(?:memory|memories)|memory|memories)\/.*\.md$/i.test(p);
const isCommand = p => /(?:^|\/)(?:\.claude\/commands|\.codex\/(?:prompts|commands)|\.pi\/(?:agent\/)?prompts|commands|prompts)\/.*\.md$/.test(p);
function encode(bytes) { let s=''; for (let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s); }
export async function collectWorkspace(files) {
  const entries=new Map(); let root='';
  for (const file of files) {
    const path=file.webkitRelativePath || file.name, parts=path.split('/');
    if (parts.length<2) throw new Error('Choose the workspace folder, including its instruction files.');
    root ||= parts[0]; if (parts[0]!==root) throw new Error('Choose one workspace folder.');
    const relative=parts.slice(1).join('/'); if (!visible(relative)) continue;
    if (parts.length>14 || entries.size>=5000) throw new Error('Choose a smaller workspace (5,000 candidate files, 12 directory levels).');
    if (entries.has(relative)) throw new Error('Duplicate workspace path: '+relative);
    entries.set(relative,file);
  }
  const documents=[], packages=[], warnings=[]; let bytes=0;
  async function document(path) {
    if (documents.length>=64) throw new Error('Choose up to 64 instruction and memory files.');
    const file=entries.get(path); if(file.size>65536){warnings.push('Instruction file exceeds 64 KiB: '+path);return;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
    bytes+=byteLength(text); if(bytes>512*1024) throw new Error('Instruction and memory text exceeds 512 KiB.');
    documents.push({path,text});
  }
  for (const path of [...entries.keys()].sort()) if (isDocument(path)) await document(path);
  for(let hop=0;hop<4;hop++) {
    const extra=new Set();
    for(const d of documents) for(const word of d.text.split(/\s+/)) {
      const ref=word.startsWith('@')?word.slice(1).replace(/[,;)]*$/,''):'';
      const path=d.path.split('/').slice(0,-1).concat(ref).join('/');
      if(ref.endsWith('.md') && !ref.includes('~') && ref.split('/').every(safePart) && entries.has(path) && !documents.some(d=>d.path===path)) extra.add(path);
    }
    if(!extra.size) break;
    for(const path of extra) await document(path);
  }
  for (const path of [...entries.keys()].sort()) {
    const skill=path.split('/').at(-1)==='SKILL.md';
    const loose=/^\.pi\/(?:agent\/)?skills\/[^/]+\.md$/.test(path)&&entries.get(path).size<=48000&&/^---\r?\n[\s\S]*?^description:[ \t]*\S[\s\S]*?^---/m.test(await entries.get(path).text());
    if(!skill && !isCommand(path) && !loose) continue;
    if(packages.length>=256) throw new Error('Choose a workspace with up to 256 workflows.');
    const prefix=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'', selected=skill?[...entries.keys()].filter(p=>p.startsWith(prefix) && p.slice(prefix.length).split('/').every(s=>!s.startsWith('.'))):[path];
    if(selected.length>128){warnings.push('Omitted '+path+': more than 128 supporting files.');continue;}
    if(selected.some(p=>entries.get(p).size>2*1024*1024)){warnings.push('Omitted '+path+': a supporting file exceeds 2 MiB.');continue;}
    const bundle={entry:path.slice(prefix.length),name:skill?prefix.split('/').filter(Boolean).at(-1)||root:path.split('/').at(-1).slice(0,-3),source:path,files:{}};
    for(const file of selected) bundle.files[file.slice(prefix.length)]=encode(new Uint8Array(await entries.get(file).arrayBuffer()));
    bytes+=byteLength(JSON.stringify(bundle)); if(bytes>8*1024*1024) throw new Error('Workspace snapshot exceeds 8 MiB.');
    packages.push(bundle);
  }
  if(!documents.length&&!packages.length) throw new Error('No CLAUDE.md, AGENTS.md, memory, commands or SKILL.md files found.');
  if(warnings.length>128) throw new Error('Too many omitted files. Choose a smaller workspace.');
  return {root,documents,packages,warnings};
}

export function createWorkspaceImportUI({api,node,button,field,select,modal:makeModal,notice,getBots,refresh,openBot}) {
  const dialogs=new Set();
  function modal(...args){const d=makeModal(...args);dialogs.add(d);d.addEventListener('close',()=>dialogs.delete(d));return d;}
  const done=v=>['created','synced'].includes(v.state);
  const sourceText=s=>s?.kind==='desktop'?`${s.path} · ${s.label||s.device_id}`:`${s?.path||'Folder'} · uploaded snapshot`;
  function errors(root,message) { root.textContent=message; root.hidden=!message; }
  function before(title,value) {
    const d=node('details','workspace-before');d.append(node('summary','',title),node('pre','',value||'(empty)'));return d;
  }
  function card(v) {
    const root=node('article','bot-draft-card workspace-card');root.dataset.workspaceImport=v.id;
    const label=done(v)?(v.state==='synced'?'Origin synchronized':'Workspace imported'):v.error?'Preparation needs attention':v.state==='ready'?'Ready to review':v.state==='cancelled'?'Import cancelled':'Preparing workspace';
    root.append(node('span','eyebrow',label),node('strong','',v.name),node('p','muted small',sourceText(v.source)),button(done(v)?'View import':'Review import',()=>{root.closest('dialog')?.close();return review(v.id);},'outline-button'));
    return root;
  }
  async function history() {
    const d=modal('Workspace imports','workspace-dialog'),body=node('div','workspace-body'),error=node('p','run-error');error.setAttribute('role','alert');d.append(body,error);
    try{const items=await api('/workspace-imports');if(!d.isConnected)return;body.append(button('Import a workspace',()=>{d.close();return start();},'primary'));for(const v of items)body.append(card(v));if(!items.length)body.append(node('p','muted','No workspace imports yet.'));}catch(e){errors(error,e.message);}
  }
  async function origin(bot) {
    const v=await api('/bots/'+encodeURIComponent(bot.id)+'/workspace-origin');
    const d=modal('Workspace origin','workspace-dialog'),body=node('div','workspace-body');d.append(body);
    if(!v){body.append(node('p','','This bot was not created from a workspace.'),button('Import a new bot',()=>{d.close();return start();},'primary'));return;}
    body.append(node('h3','',bot.name),node('p','workspace-source',sourceText(v.source)),node('p','muted small','Last synchronized '+new Date(v.synced_at*1000).toLocaleString()),node('p','','The origin stays saved when this bot edits its own instructions or memory. Ask it to sync with its origin, or prepare a review here.'));
    if(!v.refreshable)body.append(node('p','muted','Select the source folder again to supply a fresh snapshot. Browsers do not retain access to its original absolute path.'));
    body.append(button('Prepare origin sync',()=>{d.close();return start(bot,v);},'primary'),button('Past imports',()=>{d.close();return history();},'outline-button'));
  }
  async function start(target=null,origin=null) {
    const bots=getBots().filter(b=>!b.profile?.archived),d=modal(target?'Sync origin workspace':'Import workspace','workspace-dialog'),form=node('form','workspace-body');
    const error=node('p','run-error');error.hidden=true;error.setAttribute('role','alert');
    const name=field('Bot name',target?.name||'','input',{required:true,maxLength:80,placeholder:'Harold'});
    const converter=select(bots.map(b=>[b.id,b.name]),target?.id||bots[0]?.id||'');converter.setAttribute('aria-label','Converter bot');converter.required=true;
    const converterLabel=node('label','','Prepare with');converterLabel.append(converter);
    const mode=select([['desktop','Paired desktop · keeps a syncable origin'],['upload','Select a folder · upload a snapshot']],origin?.source.kind||'desktop');mode.setAttribute('aria-label','Workspace source');
    const modeLabel=node('label','','Workspace source');modeLabel.append(mode);
    const device=select([['','Choose a desktop']],origin?.source.device_id||'');device.setAttribute('aria-label','Source desktop');
    const deviceLabel=node('label','','Source desktop');deviceLabel.append(device);
    const path=field('Absolute workspace path',origin?.source.path||'','input',{maxLength:4000,placeholder:'/home/you/projects/workspace'});
    const desktop=node('div','workspace-fields');desktop.append(deviceLabel,path.label,node('p','muted small','The converter needs local access to this desktop. Its existing folder permissions apply; allow the read on that desktop if prompted.'));
    const upload=node('div','workspace-fields'),picker=field('Workspace folder','','input',{type:'file'});picker.input.setAttribute('webkitdirectory','');picker.input.setAttribute('directory','');
    const summary=node('p','muted small','Only instructions, memories and command/skill packages are selected. Project source and hidden credential files are excluded.');upload.append(picker.label,summary);
    const extra=node('details','workspace-before'),extraPicker=field('Add a hidden context folder','','input',{type:'file'}),extraSummary=node('p','muted small');
    extraPicker.input.setAttribute('webkitdirectory','');extraPicker.input.setAttribute('directory','');
    extra.append(node('summary','','Include hidden context folders'),node('p','muted small','Some folder pickers omit .claude, .codex, .agents and .pi. Select each hidden context folder from this workspace here to include it, or use a paired desktop for automatic discovery.'),extraPicker.label,extraSummary);upload.append(extra);
    let snapshot=null,loading=false,submitted=null,requestId=crypto.randomUUID(),selectionVersion=0;
    const extraFolders=new Map();
    const prepare=button('Prepare draft',()=>{},'primary');prepare.type='submit';prepare.onclick=null;prepare.disabled=true;
    function changedMode(){desktop.hidden=mode.value!=='desktop';upload.hidden=mode.value!=='upload';device.required=path.input.required=mode.value==='desktop';picker.input.required=mode.value==='upload';}
    mode.onchange=changedMode;changedMode();
    async function readSelection(){
      const version=++selectionVersion; snapshot=null;loading=true;prepare.disabled=true;errors(error,'');summary.textContent='Reading workspace context…';
      try{
        const primary=[...picker.input.files],root=primary[0]?.webkitRelativePath.split('/')[0];if(!root)throw new Error('Choose the workspace folder first.');
        const merged=new Map(primary.map(f=>[f.webkitRelativePath,f]));
        for(const files of extraFolders.values())for(const file of files){const relative=root+'/'+file.webkitRelativePath;merged.set(relative,{name:file.name,webkitRelativePath:relative,size:file.size,arrayBuffer:()=>file.arrayBuffer()});}
        const value=await collectWorkspace([...merged.values()]);if(version!==selectionVersion)return;snapshot=value;
        summary.textContent=`${snapshot.documents.length} documents · ${snapshot.packages.length} workflows${snapshot.warnings.length?' · '+snapshot.warnings.length+' omissions':''}. Source: ${snapshot.root}.`;
        if(snapshot.warnings.length)summary.textContent+=' '+snapshot.warnings.join(' ');
        extraSummary.textContent=extraFolders.size?'Explicitly included: '+[...extraFolders.keys()].join(', '):'';
      }catch(e){if(version===selectionVersion){errors(error,e.message);summary.textContent='Choose a smaller folder or fix the listed files.';}}
      finally{if(version===selectionVersion){loading=false;prepare.disabled=!bots.length;}}
    }
    picker.input.onchange=()=>{extraFolders.clear();extraSummary.textContent='';extraPicker.input.value='';void readSelection();};
    extraPicker.input.onchange=()=>{
      const files=[...extraPicker.input.files],root=files[0]?.webkitRelativePath.split('/')[0];
      if(!['.claude','.codex','.agents','.pi'].includes(root)||files.some(f=>f.webkitRelativePath.split('/')[0]!==root)){errors(error,'Choose a .claude, .codex, .agents or .pi folder from this workspace.');return;}
      if(!picker.input.files.length){errors(error,'Choose the workspace folder first.');return;}
      extraFolders.set(root,files);void readSelection();
    };
    extra.append(button('Clear additional folders',()=>{extraFolders.clear();extraSummary.textContent='';extraPicker.input.value='';return readSelection();},'subtle-button'));

    form.append(node('p','',target?'Prepare a merged update using the saved source, previous import and current Kindred edits.':'Turn a coding-agent workspace into a Kindred bot. Import AGENTS.md, CLAUDE.md, memories, commands and skills from Codex, Claude Code, Pi or a portable workspace. An existing bot adapts its instructions, memories, skills and slash commands for you to review.'),name.label,converterLabel,modeLabel,desktop,upload,node('p','muted small','Selected context is sent to the converter’s AI provider. Supporting files stay with skills; the importer does not run scripts, hooks or commands. Skills and slash commands will be available throughout this profile.'),error,prepare,button('Past imports',()=>{d.close();return history();},'outline-button'));
    if(target){name.input.readOnly=true;converter.disabled=true;mode.disabled=true;device.disabled=true;path.input.readOnly=true;}
    if(!bots.length){errors(error,'Create and configure a bot first so it can prepare the conversion.');prepare.disabled=true;}
    d.append(form);
    try{const devices=(await api('/local/devices')).devices||[];if(d.isConnected){device.replaceChildren(...select([['','Choose a desktop'],...devices.map(v=>[v.id,v.name+(v.online?'':' · offline')])],origin?.source.device_id||'').options);if(origin?.source.device_id&&!devices.some(v=>v.id===origin.source.device_id)){const o=node('option','',origin.source.label||'Saved desktop · unavailable');o.value=origin.source.device_id;device.append(o);device.value=o.value;}}}catch(e){if(d.isConnected&&mode.value==='desktop')errors(error,e.message);}
    prepare.disabled=!bots.length;
    form.onsubmit=async e=>{e.preventDefault();if(loading||prepare.disabled||!form.reportValidity())return;prepare.disabled=true;errors(error,'');try{
      if(mode.value==='upload'&&!snapshot)throw new Error('Choose the workspace folder first.');
      const source=origin?.source||{kind:mode.value,path:mode.value==='desktop'?path.input.value.trim():snapshot.root,device_id:device.value,label:mode.value==='desktop'?device.selectedOptions[0]?.textContent:snapshot.root};
      const payload={bot_id:converter.value,name:name.input.value.trim(),source,...(target?{target_id:target.id}:{}),...(mode.value==='upload'?{snapshot}:{})};
      const body=JSON.stringify(payload);if(submitted!==null&&submitted!==body)requestId=crypto.randomUUID();submitted=body;
      const result=await api('/workspace-imports','POST',{...payload,request_id:requestId});if(!d.isConnected)return;d.close();await refresh();await review(result.id);
    }catch(e){errors(error,e.message);}finally{prepare.disabled=false;}};
  }
  async function review(id) {
    const d=modal('Workspace import review','workspace-dialog'),body=node('div','workspace-body'),error=node('p','run-error');error.hidden=true;error.setAttribute('role','alert');d.append(body,error);
    let timer=null,editing=false;
    d.addEventListener('close',()=>clearTimeout(timer));
    async function load(){if(!d.isConnected)return;try{const v=await api('/workspace-imports/'+encodeURIComponent(id));if(!d.isConnected)return;errors(error,'');render(v);if(v.state==='analyzing'&&!v.error)timer=setTimeout(load,1800);}catch(e){errors(error,e.message);if(!editing)body.append(button('Try loading again',load,'outline-button'));}}
    function render(v) {
      body.replaceChildren();
      const sync=!!v.target_id;
      body.append(node('h3','',v.name),node('p','workspace-source',sourceText(v.source)));
      if(done(v)){body.append(node('p','',v.state==='synced'?'Origin synchronized. The next task will use the updated instructions and memory.':'Bot created with its origin, memories and selected workflows.'),button('Open bot',async()=>{d.close();await refresh();await openBot(v.created_bot_id);},'primary'));return;}
      if(v.state!=='ready'){
        body.append(node('p','',v.error|| (v.state==='cancelled'?'Preparation was cancelled.':'Your converter is preparing a draft. You can close this window and return from the chat card or Past imports.')));
        if(v.error||v.state==='cancelled')body.append(button('Prepare again',async()=>{await api('/workspace-imports/'+id+'/retry','POST',{});await load();},'primary'));
        if(v.state==='analyzing')body.append(button('Cancel preparation',async()=>{await api('/workspace-imports/'+id+'/cancel','POST',{});await load();},'outline-button'));return;
      }
      editing=true;
      const draft=structuredClone(v.draft),form=node('form','workspace-review'),name=field('Bot name',draft.name,'input',{required:true,maxLength:80});name.input.readOnly=sync;
      const instructions=field('Instructions',draft.instructions,'textarea',{required:true,maxLength:32000,rows:10}),memory=field('Memories',draft.memory.split('\n\n[Kindred workspace origin]')[0],'textarea',{maxLength:14000,rows:6});
      const role=field('Role',draft.role,'input',{maxLength:80}),description=field('Description',draft.description,'textarea',{maxLength:2000,rows:3});
      form.append(node('p','',sync?'Review the merged update. Changes made since preparation will block the sync until you prepare it again.':'Review and edit the conversion before creating your bot.'),name.label);
      if(!sync)form.append(role.label,description.label);
      if(sync)form.append(before('Current instructions',v.baseline.instructions));form.append(instructions.label);
      if(sync)form.append(before('Current memories',v.baseline.memory));form.append(memory.label,node('p','muted small','The workspace origin is appended to memory and retained separately so it survives future edits.'));
      const sourceFiles=node('details','workspace-before');sourceFiles.append(node('summary','',`${v.manifest.documents.length} source documents · ${v.manifest.workflows.length} workflows`));for(const item of [...v.manifest.documents,...v.manifest.workflows])sourceFiles.append(node('p','workspace-source',item.key));form.append(sourceFiles);
      if(draft.notes)form.append(before('Conversion notes and dependencies',draft.notes));
      for(const warning of v.manifest.warnings||[])form.append(node('p','workspace-warning',warning));
      if(v.conflicts?.length)form.append(node('p','workspace-warning',v.conflicts.join('\n')));
      form.append(node('h3','','Skills and slash commands'),node('p','muted small','These are shared across this profile. Skipped workflows leave existing entries unchanged. Supporting files are retained; only entry instructions are adapted.'));
      const workflows=[];
      for(const w of draft.workflows){
        const original=v.manifest.workflows.find(p=>p.key===w.key),section=node('fieldset','workspace-workflow');section.append(node('legend','',w.key));for(const warning of original.warnings||[])section.append(node('p','workspace-warning',warning));
        const include=field('Include this workflow','','input',{type:'checkbox',checked:w.include!==false});section.append(include.label);
        const fields=node('div','workspace-fields'),name=field('Skill name',w.name||original.name,'input',{required:true,maxLength:100}),command=field('Slash command',w.command||original.command,'input',{required:true,maxLength:48}),description=field('Workflow description',w.description||'','input',{maxLength:600}),body=field('Workflow instructions',w.body||'','textarea',{required:true,maxLength:48000,rows:7});
        if(v.baseline?.skills?.[w.key])fields.append(before('Current Kindred workflow',v.baseline.skills[w.key].body));
        fields.append(name.label,command.label,description.label,body.label,node('p','muted small',`${original.files.length} preserved files: ${original.files.join(', ')}`));
        function toggle(){fields.hidden=!include.input.checked;for(const f of [name,command,description,body])f.input.disabled=!include.input.checked;}include.input.onchange=toggle;toggle();section.append(fields);form.append(section);workflows.push(()=>include.input.checked?{key:w.key,include:true,name:name.input.value.trim(),command:command.input.value.trim(),description:description.input.value,body:body.input.value}:{key:w.key,include:false});
      }
      const removals=[];
      for(const [key,w] of Object.entries(v.previous_workflows||{})){if(v.manifest.workflows.some(p=>p.key===key))continue;const remove=field(`Remove ${w.name} (/${w.command}) — deleted from source`,'','input',{type:'checkbox',checked:draft.removals.includes(key)});form.append(remove.label);removals.push(()=>remove.input.checked?key:null);}
      const local=field('Allow the new bot local access to its origin desktop','','input',{type:'checkbox'});
      if(!sync&&v.source.kind==='desktop')form.append(local.label,node('p','muted small','Uses the desktop’s existing permission mode for file operations and commands. Leave off to configure access later in bot settings.'));
      const apply=button(sync?'Apply origin sync':'Create bot',()=>{},'primary');apply.type='submit';apply.onclick=null;
      const actions=node('div','workspace-actions');actions.append(apply,button('Prepare again',async()=>{await api('/workspace-imports/'+id+'/retry','POST',{});editing=false;await load();},'outline-button'),button('Discard import',async()=>{await api('/workspace-imports/'+id+'/cancel','POST',{});editing=false;await load();},'subtle-button'));form.append(actions);body.append(form);
      form.onsubmit=async e=>{e.preventDefault();if(apply.disabled||!form.reportValidity())return;apply.disabled=true;errors(error,'');try{await api('/workspace-imports/'+id+'/apply','POST',{revision:v.revision,local_access:local.input.checked,draft:{...draft,name:name.input.value.trim(),instructions:instructions.input.value,memory:memory.input.value,role:role.input.value,description:description.input.value,workflows:workflows.map(f=>f()),removals:removals.map(f=>f()).filter(Boolean)}});editing=false;await refresh();await load();notice(sync?'Origin synchronized.':'Workspace imported.');}catch(e){errors(error,e.message);}finally{apply.disabled=false;}};
    }
    await load();
  }
  return {start,history,review,origin,card,close:()=>{for(const d of dialogs)d.close();}};
}
