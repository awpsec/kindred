// People and explicitly shared bots on the connected Kindred server.
export function createServerChatsUI({api,state,node,button,field,select,modal,icon,buddy,notice,refresh,chooseChat,chooseBot}) {
  let support;
  async function available(){
    if(support===undefined){const response=await fetch('/identity/meta');support=response.ok&&(await response.json()).server_chats===true;if(support){const identity=await fetch('/identity/profiles',{headers:{Authorization:'Bearer '+state.token}});if(identity.ok&&(await identity.json()).legacy===true)support=false;}}
    return support;
  }
  async function list(){return await available()?api('/server-chats'):[];}
  function avatar(member,size=30){
    if(member.kind==='bot')return buddy({...member,profile:member.avatar||{}},size);
    const face=node('span','person-avatar');face.style.width=face.style.height=size+'px';face.append(icon('user',Math.round(size*.62)));face.setAttribute('aria-label','Person');return face;
  }
  async function sharing(){
    const d=modal('Share bots','server-chat-dialog'),content=node('div','server-chat-sharing');d.append(content);
    content.append(node('p','muted small','Shared bots appear in search for people on this server. They keep your connections and approval settings. You join conversations that include your bots. Turning sharing off removes the bot from server chats.'));
    const data=await api('/server-chats/sharing');if(!d.isConnected)return;
    for(const member of data.items){
      const row=node('label','participant-option'),check=node('input');check.type='checkbox';check.checked=member.shared;check.setAttribute('role','switch');check.setAttribute('aria-label','Share '+member.name);
      row.append(avatar(member),node('span','',member.name),check);content.append(row);
      check.onchange=async()=>{const value=check.checked;check.disabled=true;try{await api('/server-chats/sharing','PUT',{bot_id:member.bot_id,shared:value});await refresh();}catch(e){check.checked=!value;notice(e.message,true);}finally{check.disabled=false;}};
    }
    if(!data.items.length)content.append(node('p','muted','Create a bot in this profile to share it.'));
    content.append(button('Done',()=>d.close(),'primary'));
  }
  async function edit(chat=null){
    const d=modal(chat?'Chat settings':'New chat','server-chat-dialog'),form=node('form','server-chat-form');d.append(form);
    const canManage=!chat||chat.can_manage,chosen=new Map((chat?.participants||[]).filter(m=>m.id!==chat.me).map(m=>[m.id,m]));
    const search=field('People and bots','','input',{placeholder:'Search people and bots',maxLength:100}),chips=node('div','participant-selections'),heading=node('h3','participant-heading','Recents'),results=node('div','participant-results');
    search.input.type='search';search.input.autocomplete='off';search.input.setAttribute('aria-controls','participant-results');results.id='participant-results';results.setAttribute('aria-live','polite');
    const name=field('Chat name',chat?.name||'','input',{placeholder:'Optional group name',maxLength:100});name.input.disabled=!canManage;
    const description=field('Description',chat?.description||'','textarea',{maxLength:2000,placeholder:'Purpose, update style, and coordination for this chat.'});description.input.rows=3;description.input.disabled=!canManage;
    const options=node('div','server-chat-options'),all=node('input'),botToBot=node('input');all.type=botToBot.type='checkbox';all.checked=!!chat?.all_messages;botToBot.checked=!!chat?.bot_to_bot;all.disabled=botToBot.disabled=!canManage;
    const label=(input,text)=>{const row=node('label','server-chat-option');row.append(input,node('span','',text));return row;};
    options.append(label(all,'Let bots respond to general messages'),label(botToBot,'Let bots respond to each other'),node('p','muted small','Otherwise, address a bot by name or @mention. Bot replies use their owner’s connections and approval settings.'));
    const feedback=node('p','server-chat-feedback');feedback.setAttribute('role','status');
    const save=node('button','primary',chat?'Save chat':'Start chat');save.type='submit';save.hidden=!canManage;
    const footer=node('div','dialog-actions');footer.append(button('Share bots',sharing,'subtle-button'),save);
    form.append(search.label,chips,heading,results,name.label,description.label,options,feedback,footer);
    let generation=0,timer,controller;
    function selected(){
      chips.replaceChildren();for(const member of chosen.values()){
        const chip=button('',()=>{chosen.delete(member.id);selected();void load();},'participant-chip');chip.disabled=!canManage;chip.setAttribute('aria-label','Remove '+member.name);chip.append(avatar(member,20),node('span','',member.name));if(canManage)chip.append(icon('close',12));chips.append(chip);
      }
      options.hidden=![...chosen.values()].some(m=>m.kind==='bot');save.disabled=chosen.size===0;search.input.disabled=!canManage;
    }
    async function load(){
      const current=++generation;controller?.abort();controller=new AbortController();
      heading.textContent=search.input.value.trim()?'Search results':'Recents';results.setAttribute('aria-busy','true');
      try{const data=await api('/server-chats/directory?q='+encodeURIComponent(search.input.value.trim()),'GET',undefined,{signal:controller.signal});if(!d.isConnected||current!==generation)return;
        results.replaceChildren();const entries=data.items.filter(m=>!chosen.has(m.id));
        if(!search.input.value.trim())heading.textContent='Recents';
        for(const member of entries){
          const row=button('',()=>{chosen.set(member.id,member);selected();void load();search.input.focus();},'participant-option');row.disabled=!canManage;row.dataset.participant=member.id;row.setAttribute('aria-label',member.name+' · '+(member.kind==='person'?'Person':'Bot'));
          const copy=node('span','participant-copy');copy.append(node('strong','',member.name),node('small','muted',member.kind==='person'?'Person · '+member.owner_name:(member.shared?'Shared bot':'Your bot')+' · '+member.owner_name));row.append(avatar(member),copy,icon('plus',16));results.append(row);
        }
        if(!entries.length)results.append(node('p','muted small',search.input.value?'No matching people or bots.':data.recent.length?'No more recent people or bots.':'Search for a person or bot to start a conversation.'));
        feedback.textContent='';
      }catch(e){if(current===generation&&!controller.signal.aborted){results.replaceChildren(button('Retry search',load,'outline-button'));feedback.textContent=e.message;}}
      finally{if(current===generation)results.removeAttribute('aria-busy');}
    }
    search.input.oninput=()=>{clearTimeout(timer);timer=setTimeout(load,120);};
    d.addEventListener('close',()=>{generation++;controller?.abort();clearTimeout(timer);});
    form.onsubmit=async event=>{event.preventDefault();if(!canManage||save.disabled)return;save.disabled=true;feedback.textContent='';
      try{const only=[...chosen.values()][0],ownBot=!chat&&chosen.size===1&&!name.input.value.trim()&&only?.kind==='bot'?state.bots.find(b=>b.id===only.bot_id):null;if(ownBot){d.close();await chooseBot(ownBot);return;}const saved=await api(chat?'/server-chats/'+chat.id:'/server-chats',chat?'PUT':'POST',{name:name.input.value,description:description.input.value,participants:[...chosen.keys()],all_messages:all.checked,bot_to_bot:botToBot.checked});d.close();await chooseChat(saved);}catch(e){feedback.textContent=e.message;save.disabled=false;}
    };
    if(chat){
      const mine=chat.participants.filter(m=>m.kind==='bot'&&m.account===chat.me.replace(/^person:/,'')),delegation=select([['','I’ll answer myself'],...mine.map(m=>[m.id,m.name+' can answer for me'])],chat.delegates?.[chat.me]||'');delegation.setAttribute('aria-label','When I am mentioned');
      const own=node('section','server-chat-personal');own.append(node('h3','','When I am mentioned'),delegation,node('p','muted small','Your bot replies under its own name. Replies to another bot also require “Let bots respond to each other”.'));
      delegation.onchange=async()=>{delegation.disabled=true;try{await api('/server-chats/'+chat.id+'/delegate','PUT',{bot:delegation.value});await refresh();}catch(e){notice(e.message,true);}finally{delegation.disabled=false;}};
      own.append(button('Choose my bots for this chat',async()=>{
        const picker=modal('My bots in this chat','server-chat-dialog'),body=node('div','server-chat-sharing');picker.append(body);
        const data=await api('/server-chats/sharing'),checks=[];
        body.append(node('p','muted small','Add your bots to this conversation without making them searchable across the server.'));
        for(const member of data.items){const row=node('label','participant-option'),check=node('input');check.type='checkbox';check.checked=chat.participants.some(p=>p.id===member.id);check.setAttribute('aria-label',member.name);checks.push([member.id,check]);row.append(avatar(member),node('span','',member.name),check);body.append(row);}
        if(!checks.length)body.append(node('p','muted','Create a bot in your profile first.'));
        body.append(button('Save my bots',async()=>{const saved=await api('/server-chats/'+chat.id+'/my-bots','PUT',{bots:checks.filter(([,check])=>check.checked).map(([id])=>id)});picker.close();d.close();await refresh();await edit(saved);},'primary'));
      },'outline-button'));
      own.append(button('Leave chat',async()=>{await api('/server-chats/'+chat.id+'/leave','POST',{});state.chat=null;d.close();await refresh();},'danger-text'));
      form.append(own);
    }
    selected();await load();if(canManage&&d.isConnected)search.input.focus();
  }
  return {available,list,edit,avatar,sharing};
}
