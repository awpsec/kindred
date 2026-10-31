const historyScopes=['channels:history','groups:history','im:history','mpim:history'];
function refreshSlackSetupCards(){document.querySelectorAll('[data-connection-toolkit="slack_events"]').forEach(card=>card.refreshConnection?.());}
export function slackSetupCard(request,env){
  const {api,node,button,field,modal,state,openMonitoring,logo}=env,token=state.token;
  const card=node('section','chat-connection-card slack-setup-card');card.dataset.connectionToolkit='slack_events';
  const head=node('div','chat-connection-head'),copy=node('div','chat-connection-copy'),description=node('p','muted small'),status=node('span','connection-state','Checking');
  copy.append(button('Slack monitoring',()=>openMonitoring(request.bot_id),'chat-connection-title'),description);head.append(logo(),copy,status);
  const footer=node('div','chat-connection-accounts'),feedback=node('p','run-error small');feedback.setAttribute('role','status');card.append(head,footer,feedback);
  const current=()=>state.token===token&&card.isConnected;
  const call=(...args)=>{if(!current())throw new Error('Workspace changed. Open the conversation again.');return api(...args);};
  let generation=0,busy=false,timer,accounts=[];
  function completed(declined=false,dismissed=false){
    card.dataset.completed='true';clearTimeout(timer);status.textContent=dismissed?'Dismissed':declined?'Not now':'Connected';status.className='connection-state'+(!declined&&!dismissed?' connected':'');
    description.textContent=dismissed?'Setup dismissed.':declined?'Setup deferred.':'Connected · setup continuing';
    footer.replaceChildren(button('Manage monitoring',()=>openMonitoring(request.bot_id),'subtle-button'));feedback.textContent='';
  }
  async function act(action){
    if(busy||!current()||card.dataset.completed==='true')return;
    busy=true;clearTimeout(timer);feedback.textContent='';for(const b of footer.querySelectorAll('button'))b.disabled=true;
    try{await action();}catch(error){if(current())feedback.textContent=error.message;}
    finally{busy=false;if(current()&&card.dataset.completed!=='true'){for(const b of footer.querySelectorAll('button'))b.disabled=false;}}
  }
  function connect(){
    if(!current())return;
    const account=accounts.find(a=>request.account_id?a.id===request.account_id:request.account_name&&a.name.toLowerCase()===request.account_name.toLowerCase());
    openSlackConnection({node,button,field,modal,request:call,accountName:request.account_name,onConnected:async()=>{if(current())await render();refreshSlackSetupCards();}},account);
  }
  function actions(){
    footer.append(button('Connect Slack',connect,'subtle-button','plus'),button('Check again',()=>render(),'subtle-button','refresh'));
    if(request.question_id)footer.append(button('Not now',()=>act(async()=>{await call('/questions/'+encodeURIComponent(request.question_id)+'/answer','POST',{selected:1});if(current())completed(true);}), 'subtle-button'));
  }
  async function render(){
    if(!current()||busy||card.dataset.completed==='true')return;
    clearTimeout(timer);const ticket=++generation;
    try{
      const data=await call('/slack-monitoring');if(!current()||ticket!==generation||busy||card.dataset.completed==='true')return;
      accounts=data.connections||[];const choices=accounts.filter(a=>!request.account_id||a.id===request.account_id),ready=choices.filter(a=>a.status==='connected');
      status.textContent=ready.length?'Choose account':choices.some(a=>a.status==='connecting')?'Connecting':'Connection needed';
      description.textContent=request.account_name?`Connect ${request.account_name}, then select its account to continue setup.`:'Connect Slack, then select an account. Your bot will finish the monitoring rules.';
      footer.replaceChildren();
      for(const account of ready){
        const label=`Use ${account.name} · ${account.user_name} · ${account.team_name}`;
        footer.append(button(label,()=>act(async()=>{await call('/slack-setup/'+encodeURIComponent(request.question_id)+'/complete','POST',{account_id:account.id});if(current())completed();}),'connection-account-chip connected','check'));
      }
      actions();
      if(choices.some(a=>a.status==='connecting'))timer=setTimeout(()=>void render(),2000);
    }catch(error){if(!current()||ticket!==generation)return;status.textContent='Unavailable';description.textContent='Couldn’t load Slack connections.';feedback.textContent=error.message;footer.replaceChildren();actions();}
  }
  card.refreshConnection=render;
  if(request.completed)completed(request.declined,request.dismissed);
  else requestAnimationFrame(()=>void render());
  return card;
}
export function slackAppManifest(kind='user'){
  const manifest={display_information:{name:'Kindred monitoring',description:'Receive messages for your Kindred teammates'},oauth_config:{scopes:{[kind]:[...historyScopes,'channels:read','groups:read','im:read','mpim:read']}},settings:{event_subscriptions:{[kind==='bot'?'bot_events':'user_events']:['message.channels','message.groups','message.im','message.mpim']},socket_mode_enabled:true,token_rotation_enabled:false}};
  if(kind==='bot')manifest.features={bot_user:{display_name:'Kindred monitoring',always_online:false}};
  return manifest;
}
export function slackRuleLabel(rule,account){
  const where=rule.scope==='all_channels'?'All channels':rule.scope==='direct_messages'?`Direct Messages (${account?.name||'connected account'})`:'#'+(rule.channel_name||rule.channel_id);
  return `${rule.event==='mentions'?'Mentions':'All messages'} → ${where}`;
}
export async function mountSlackMonitoring(root,env){
  const {api,node,button,field,modal,state,onChanged,routineAssignee,previous,botId=''}=env,token=state.token;
  const current=()=>state.token===token&&(!env.isCurrent||env.isCurrent());
  const latest=()=>current()&&(!env.isLatest||env.isLatest());
  const request=(...args)=>{if(!current())throw new Error('Workspace changed. Open settings again.');return api(...args);};
  const section=node('section','slack-monitoring');section.setAttribute('aria-label','Slack monitoring');const anchor=previous||section;if(anchor.parentNode!==root)root.append(anchor);
  const top=node('div','section-toolbar monitor-toolbar');top.append(node('h3','','Slack'));section.append(top);
  const loading=node('p','muted small','Loading Slack monitors…');section.append(loading);
  let data;
  try{data=await request('/slack-monitoring');}catch(error){if(anchor.isConnected&&latest()){if(previous){if(!previous.querySelector('.slack-refresh-error'))previous.append(node('p','slack-refresh-error run-error small','Could not refresh Slack status. Trying again shortly.'));}else{loading.textContent='Slack monitoring is unavailable on this server.';top.append(button('Retry',()=>onChanged(),'subtle-button'));}}return;}
  if(!anchor.isConnected||!latest())return;
  const snapshot=JSON.stringify([data,botId,state.bots.map(b=>[b.id,b.name,b.profile?.archived])]);
  if(previous?.dataset.snapshot===snapshot){previous.querySelector('.slack-refresh-error')?.remove();return;}
  const expanded=new Set([...(previous?.querySelectorAll('.slack-monitor-row[open]')||[])].map(row=>row.dataset.slackMonitorId));
  section.dataset.snapshot=snapshot;if(previous)previous.replaceWith(section);loading.remove();
  let active=(data.connections||[]).filter(a=>a.status!=='disconnected');
  top.append(button('Add monitor',()=>active.length?editMonitor():connectAccount(null,true),'subtle-button','plus'));
  section.append(node('p','muted small','New Slack messages wake your bot. No repeated AI checks.'));
  const status=a=>a?.status==='connected'?'Listening':a?.status==='connecting'?'Connecting':a?.status==='disconnected'?'Disconnected':'Needs attention';
  const watches=(data.items||[]).filter(w=>!botId||w.bot_id===botId);
  for(const watch of watches){
    const account=data.connections.find(a=>a.id===watch.account_id),row=node('details','slack-monitor-row'),summary=node('summary','monitor-heading');
    row.dataset.slackMonitorId=watch.id;
    row.open=expanded.has(watch.id);
    summary.append(routineAssignee(watch.bot_id),node('span','monitor-mailbox',account?.name||'Slack account'),node('span','monitor-status',watch.enabled?status(account):'Paused'));row.append(summary);
    const overview=node('span','slack-rule-overview',watch.rules.slice(0,2).map(r=>slackRuleLabel(r,account)).join(' · ')+(watch.rules.length>2?` · +${watch.rules.length-2} more`:''));
    overview.title=watch.rules.map(r=>slackRuleLabel(r,account)).join('\n');summary.append(overview);
    const body=node('div','slack-monitor-body');
    for(const rule of watch.rules)body.append(node('div','slack-rule-label',slackRuleLabel(rule,account)));
    body.append(node('p','muted small',watch.instructions));
    if(watch.pending_messages)body.append(node('p','muted small',`${watch.pending_messages} new ${watch.pending_messages===1?'message':'messages'} waiting for this bot to finish its current work.`));
    if(account?.error)body.append(node('p','run-error small',account.error));
    if(account?.warning)body.append(node('p','run-error small',account.warning));
    const feedback=node('p','run-error small');feedback.setAttribute('role','status');
    const actions=node('div','monitor-actions');
    const act=async action=>{try{for(const b of actions.querySelectorAll('button'))b.disabled=true;await request(`/slack-monitors/${encodeURIComponent(watch.id)}/control`,'POST',{action});await onChanged();}catch(error){feedback.textContent=error.message;for(const b of actions.querySelectorAll('button'))b.disabled=false;}};
    actions.append(button('Edit',()=>editMonitor(watch),'subtle-button','edit'),button(watch.enabled?'Pause':'Resume',()=>act(watch.enabled?'pause':'resume'),'subtle-button',watch.enabled?'pause':'play'));
    if(!watch.enabled)actions.append(button('Remove',()=>act('remove'),'subtle-button','trash'));
    body.append(actions,feedback);row.append(body);section.append(row);
  }
  if(!watches.length)section.append(node('p','monitor-empty-line',botId?'No Slack monitors for this bot yet.':'No Slack monitors yet.'));
  const connections=node('details','slack-connections'),heading=node('summary','','Slack connections');connections.open=!!previous?.querySelector('.slack-connections')?.open;connections.append(heading);
  for(const account of data.connections||[]){
    const row=node('div','slack-connection-row');row.append(node('strong','',account.name),node('span','muted small',`${account.user_name} · ${account.team_name} · ${status(account)}`));
    if(account.error)row.append(node('p','run-error small',account.error));
    if(account.warning)row.append(node('p','run-error small',account.warning));
    row.append(node('span','muted small',account.received_at?'Last event '+new Date(account.received_at*1000).toLocaleString():'No events received yet. Check the Slack app’s event subscriptions if messages do not arrive.'));
    const actions=node('div','monitor-actions');actions.append(button('Update connection',()=>connectAccount(account),'subtle-button'));
    if(account.status!=='disconnected')actions.append(button('Disconnect',async()=>{if(!confirm(`Disconnect ${account.name}? Its monitors will pause. Chat history stays saved.`))return;try{await request('/slack-connections/'+encodeURIComponent(account.id),'DELETE');await onChanged();}catch(error){row.append(node('p','run-error',error.message));}},'subtle-button'));
    row.append(actions);connections.append(row);
  }
  connections.append(button('Connect Slack',()=>connectAccount(),'subtle-button','plus'));section.append(connections);

  function select(label,choices,value){const element=node('select');element.setAttribute('aria-label',label);for(const [id,text] of choices){const option=node('option','',text);option.value=id;element.append(option);}element.value=value;return element;}
  function labeled(text,input){const label=node('label','',text);label.append(input);return label;}
  function installForm(dialog,form,contents,save){const fields=node('div','slack-monitor-fields');fields.append(...contents);form.append(fields,save);dialog.append(form);}
  function connectAccount(account,thenCreate=false){
    return openSlackConnection({node,button,field,modal,request,onConnected:async saved=>{
      if(!current())return;
      data.connections=[...data.connections.filter(a=>a.id!==saved.id),saved];active=data.connections.filter(a=>a.status!=='disconnected');
      await onChanged();refreshSlackSetupCards();if(thenCreate&&current())editMonitor(null,saved.id);
    }},account);
  }
  function editMonitor(watch,accountId){
    const dialog=modal(watch?'Edit Slack monitor':'Slack monitoring','slack-monitor-dialog'),form=node('form','slack-monitor-form');
    const bot=select('Bot',state.bots.filter(b=>!b.profile?.archived).map(b=>[b.id,b.name]),watch?.bot_id||botId||state.bot?.id||state.bots.find(b=>!b.profile?.archived)?.id||'');
    const choices=watch?data.connections:active;
    const connection=select('Slack account',choices.map(a=>[a.id,`${a.name} · ${a.user_name}`]),watch?.account_id||accountId||active[0]?.id||'');
    bot.disabled=!!watch||!!botId;connection.disabled=!!watch;
    const identity=node('p','muted small'),rules=node('div','slack-rule-editor');rules.setAttribute('aria-label','Monitoring rules');
    const instructions=field('What should your bot do?',watch?.instructions||'Help with requests. Reply when useful; stay quiet otherwise.','textarea');
    const feedback=node('p','run-error small');feedback.setAttribute('role','status');
    const save=button(watch?'Save monitor':'Create monitor',()=>{},'primary');save.type='submit';
    let rows=[],channels=[],cursor='',generation=0;
    const channelMore=button('Load more channels',()=>loadChannels(false),'subtle-button');channelMore.hidden=true;
    const add=button('Add rule',()=>addRule({event:'all_messages',scope:'channel',channel_id:''}),'subtle-button','plus');
    installForm(dialog,form,[labeled('Bot',bot),labeled('Slack account',connection),identity,rules,add,channelMore,node('p','muted small','A message matching more than one rule wakes the bot once. Its own messages are ignored.'),instructions.label,node('p','muted small','All channels includes only conversations this Slack identity and app can access. New messages only; monitoring does not read old history.'),feedback],save);
    function updateTargets(row){
      const account=data.connections.find(a=>a.id===connection.value),selected=row.target.value||row.initial;
      row.target.replaceChildren();
      for(const [value,label] of [['all_channels','All channels'],['direct_messages',`Direct Messages (${account?.name||'account'})`],['','Choose a channel…'],...channels.map(c=>['channel:'+c.id,'#'+c.name])]){const option=node('option','',label);option.value=value;if(value==='')option.disabled=true;row.target.append(option);}
      if(selected?.startsWith('channel:')&&!channels.some(c=>'channel:'+c.id===selected)){const option=node('option','',row.storedName?'#'+row.storedName:'Selected channel');option.value=selected;row.target.append(option);}
      row.target.value=selected||'';
    }
    function addRule(rule){
      if(rows.length>=32)return;
      const row=node('div','slack-rule-edit'),event=select('Event',[['all_messages','All messages'],['mentions','Mentions']],rule.event),target=node('select');target.setAttribute('aria-label','Where');
      const entry={row,event,target,initial:rule.scope==='channel'?(rule.channel_id?'channel:'+rule.channel_id:''):rule.scope,storedName:rule.channel_name};
      const remove=button('',()=>{rows=rows.filter(r=>r!==entry);row.remove();add.disabled=false;save.disabled=!rows.length;},'icon-button','trash');remove.title='Remove rule';remove.setAttribute('aria-label','Remove rule');
      row.append(labeled('Event',event),labeled('Where',target),remove);rows.push(entry);rules.append(row);updateTargets(entry);save.disabled=false;add.disabled=rows.length>=32;
    }
    async function loadChannels(reset){
      const ticket=++generation,accountId=connection.value;
      if(reset){channels=[];cursor='';for(const row of rows){const selected=row.target.value;row.target.value='';row.initial=selected.startsWith('channel:')?'':selected;row.storedName='';updateTargets(row);}}
      channelMore.disabled=true;
      const a=data.connections.find(a=>a.id===accountId);identity.textContent=a?`${a.user_name} · ${a.team_name}${a.bot_id?' · Slack app bot':' · Slack account'}`:'';
      try{const page=await request(`/slack-connections/${encodeURIComponent(accountId)}/channels?cursor=${encodeURIComponent(cursor)}`);if(ticket!==generation||!dialog.isConnected||!current())return;channels.push(...page.items);cursor=page.next_cursor||'';for(const row of rows)updateTargets(row);channelMore.hidden=!cursor;feedback.textContent='';}
      catch(error){if(ticket===generation&&dialog.isConnected)feedback.textContent=error.message;}
      finally{if(ticket===generation)channelMore.disabled=false;}
    }
    for(const rule of watch?.rules||[{event:'mentions',scope:'all_channels'}])addRule(rule);
    connection.onchange=()=>loadChannels(true);void loadChannels(false);
    form.onsubmit=async event=>{
      event.preventDefault();feedback.textContent='';save.disabled=true;
      try{
        const values=rows.map(r=>({event:r.event.value,scope:r.target.value.startsWith('channel:')?'channel':r.target.value,channel_id:r.target.value.startsWith('channel:')?r.target.value.slice(8):''}));
        if(values.some(r=>!r.scope))throw new Error('Choose a channel or message scope for each rule.');
        if(!watch&&data.items.some(w=>w.bot_id===bot.value&&w.account_id===connection.value))throw new Error('This bot already monitors that Slack account. Edit its existing monitor to add rules.');
        await request('/slack-monitors','POST',{id:watch?.id||'',bot_id:bot.value,account_id:connection.value,instructions:instructions.input.value,rules:values,enabled:watch?.enabled??true});dialog.close();await onChanged();
      }catch(error){feedback.textContent=error.message;}finally{save.disabled=false;}
    };
  }
}

export function openSlackConnection(env,account=null){
    const {node,button,field,modal,request,onConnected,accountName=''}=env;
    function select(label,choices,value){const element=node('select');element.setAttribute('aria-label',label);for(const [id,text] of choices){const option=node('option','',text);option.value=id;element.append(option);}element.value=value;return element;}
    function labeled(text,input){const label=node('label','',text);label.append(input);return label;}
    function installForm(dialog,form,contents,save){const fields=node('div','slack-monitor-fields');fields.append(...contents);form.append(fields,save);dialog.append(form);}
    const dialog=modal(account?'Update Slack connection':'Connect Slack','slack-monitor-dialog');
    const form=node('form','slack-monitor-form'),name=field('Connection name',account?.name||accountName||'Helpdesk'),app=field('App-level token','','input',{type:'password',placeholder:'xapp-…',autocomplete:'off'}),access=field('Slack account token','','input',{type:'password',placeholder:'xoxp-… or xoxb-…',autocomplete:'off'});
    app.input.setAttribute('data-private','true');access.input.setAttribute('data-private','true');
    const intro=node('p','muted small','Use a dedicated Slack app for each account and Kindred workspace. A user token monitors that account’s mentions and DMs; a bot token monitors the Slack app’s conversations.');
    const kind=select('Monitor as',[['user','Existing Slack account'],['bot','Slack app bot']],account?.bot_id?'bot':'user');
    const guide=node('details','slack-setup-guide');guide.append(node('summary','','Set up the Slack app'));
    const steps=node('ol');
    for(const text of ['Create a Slack app from the manifest below, in the workspace you want to monitor.','Enable Socket Mode and create an app-level token with connections:write.','Install the app. Copy the User OAuth Token to monitor an existing account, or the Bot User OAuth Token for the app bot.','Paste both tokens below. In Slack, join the channels you want to monitor.'])steps.append(node('li','',text));
    const copy=button('Copy app manifest',async()=>{try{await navigator.clipboard.writeText(manifest.value);copy.textContent='Manifest copied';}catch{manifest.hidden=false;manifest.select();}},'subtle-button');
    const manifest=node('textarea','slack-manifest');manifest.value=JSON.stringify(slackAppManifest(kind.value),null,2);manifest.readOnly=true;manifest.hidden=true;manifest.setAttribute('aria-label','Slack app manifest');
    kind.onchange=()=>{manifest.value=JSON.stringify(slackAppManifest(kind.value),null,2);copy.textContent='Copy app manifest';access.input.placeholder=kind.value==='user'?'xoxp-…':'xoxb-…';};kind.onchange();
    const link=node('a','detail-link','Open Slack app setup');link.href='https://api.slack.com/apps';link.target='_blank';link.rel='noopener noreferrer';guide.append(steps,copy,link,manifest);
    const feedback=node('p','run-error small');feedback.setAttribute('role','status');const save=button(account?'Update connection':'Connect',()=>{},'primary');save.type='submit';
    installForm(dialog,form,[intro,labeled('Monitor as',kind),guide,name.label,app.label,access.label,node('p','muted small','An incoming webhook only posts messages; it cannot subscribe to them. ChatGPT’s Slack connection is separate from this event connection.'),feedback],save);
    form.onsubmit=async event=>{event.preventDefault();feedback.textContent='';save.disabled=true;try{if(!access.input.value.trim().startsWith(kind.value==='user'?'xoxp-':'xoxb-'))throw new Error(kind.value==='user'?'Use the User OAuth Token for this Slack account.':'Use the Bot User OAuth Token for this Slack app.');const saved=await request('/slack-connections','POST',{id:account?.id||'',name:name.input.value,app_token:app.input.value,access_token:access.input.value});app.input.value='';access.input.value='';dialog.close();await onConnected(saved);}catch(error){feedback.textContent=error.message;}finally{save.disabled=false;}};
  }
