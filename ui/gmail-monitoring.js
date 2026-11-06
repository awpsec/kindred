// Gmail background monitoring is independent of the bot's conversational provider.
export function openGmailConnection(env){
  const {node,button,field,modal,api,publicUrl='',onConnected=()=>{}}=env;
  const d=modal('Connect Gmail monitoring','slack-connection-dialog slack-monitor-dialog'),form=node('form','slack-monitor-form');
  const fields=node('div','slack-monitor-fields');fields.append(node('p','muted small','Connect once for background mail detection with any bot. Your Claude or ChatGPT Gmail connector stays unchanged. Only new mail wakes the bot; unchanged checks use no AI.'));
  const name=field('Account name','','input',{required:true,maxLength:80,placeholder:'Work Gmail'});
  const server=field('Kindred server address',publicUrl||(/^https?:$/.test(location.protocol)?location.origin:''),'input',{required:true,type:'url',placeholder:'https://kindred.example.com'});
  const client=field('Google client ID','','input',{required:true,autocomplete:'off'});
  const secret=field('Google client secret','','input',{required:true,type:'password',autocomplete:'new-password'});
  const guide=node('details','slack-setup-guide');guide.append(node('summary','','Set up Google access'));
  const steps=node('ol');for(const t of ['In Google Cloud, enable Gmail API and create an OAuth client of type Web application.','Configure the consent screen for read-only Gmail access. If the app is in Testing, add your Google account as a test user; Google may expire test authorizations.','Add the redirect address below to that OAuth client, then enter its client ID and secret.','Continue to Google, sign in to the mailbox you want to monitor and grant read-only access. Return here and choose Check connection.'])steps.append(node('li','',t));
  const redirect=node('code','gmail-redirect');const update=()=>{try{redirect.textContent=new URL('/oauth/gmail/callback',server.input.value).href;}catch{redirect.textContent='Enter your server address above.';}};server.input.addEventListener('input',update);update();
  const link=node('a','detail-link','Open Google Cloud setup');link.href='https://console.cloud.google.com/apis/credentials';link.target='_blank';link.rel='noopener noreferrer';guide.append(steps,redirect,link);
  const feedback=node('p','run-error small');feedback.setAttribute('role','status');
  const next=button('Continue to Google',()=>{},'primary');next.type='submit';next.onclick=null;
  const actions=node('div','monitor-actions');actions.append(next,button('Cancel',()=>d.close(),'subtle-button'));
  fields.append(name.label,server.label,guide,client.label,secret.label,feedback);form.append(fields,actions);d.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;next.disabled=true;feedback.textContent='';try{
    const result=await api('/gmail-connections/start','POST',{name:name.input.value,public_url:server.input.value,client_id:client.input.value.trim(),client_secret:secret.input.value.trim()});secret.input.value='';
    const signIn=node('a','primary','Sign in with Google');signIn.href=result.url;signIn.target='_blank';signIn.rel='noopener noreferrer';
    actions.replaceChildren(signIn,button('Check connection',async()=>{await onConnected();d.close();},'subtle-button'),button('Close',()=>d.close(),'subtle-button'));
    feedback.className='muted small';feedback.textContent='Open Google sign-in, then return to Kindred. Connecting does not create a monitor.';
  }catch(error){feedback.textContent=error.message;}finally{next.disabled=false;}};
}
export async function mountGmailMonitoring(root,env){
  const {api,node,button,field,modal,state,routineAssignee,editMonitor,onChanged,botId=''}=env,token=state.token;
  const current=()=>state.token===token&&root.isConnected&&(!env.isCurrent||env.isCurrent());
  const request=(...args)=>{if(!current())throw new Error('Workspace changed. Open Connections again.');return api(...args);};
  let data;try{data=await request('/inbox-monitors');}catch(error){if(current()){root.append(node('p','run-error small','Could not load Gmail monitoring.'),button('Retry',onChanged,'subtle-button'));}return;}
  if(!current()||(env.isLatest&&!env.isLatest()))return;env.onStatus?.(data);
  const section=node('section','slack-monitoring gmail-monitoring');section.setAttribute('aria-label','Gmail monitoring');
  const old=root.querySelector('.gmail-monitoring'),snapshot=JSON.stringify([data,botId]);if(old?.dataset.snapshot===snapshot)return;
  const expanded=new Set([...(old?.querySelectorAll('[data-monitor-id][open]')||[])].map(r=>r.dataset.monitorId));section.dataset.snapshot=snapshot;
  const top=node('div','section-toolbar monitor-toolbar');top.append(node('h3','','Monitoring'));
  const connected=(data.connections||[]).filter(a=>a.status==='connected');
  const connect=()=>openGmailConnection({node,button,field,modal,api:request,publicUrl:data.public_url,onConnected:onChanged});
  top.append(button('Add monitor',()=>connected.length?editMonitor(null,data,{bot_id:botId}):connect(),'subtle-button','plus'));section.append(top,node('p','muted small','New Gmail messages wake your bot. No repeated AI checks. Works with every bot provider.'));
  for(const w of data.items.filter(w=>!botId||w.bot_id===botId)){
    const row=node('details','slack-monitor-row'),summary=node('summary','monitor-heading'),body=node('div','slack-monitor-body');row.dataset.monitorId=w.id;row.open=expanded.has(w.id);
    summary.append(routineAssignee(w.bot_id),node('span','monitor-mailbox',w.mailbox||w.name),node('span','monitor-status',!w.enabled?'Paused':w.error?'Needs attention':w.checked_at?'Monitoring':'Starting'),node('span','slack-rule-overview','New messages → Inbox'));row.append(summary);
    body.append(node('p','muted small',w.instructions),node('p','muted small',w.checked_at?'Last checked '+new Date(w.checked_at*1000).toLocaleString():'No successful check yet.'));
    if(w.error)body.append(node('p','run-error small',w.error));
    if(w.pending_messages)body.append(node('p','muted small',`${w.pending_messages} new messages waiting for this bot.`));
    const actions=node('div','monitor-actions'),error=node('p','run-error small');error.setAttribute('role','status');
    const act=async fn=>{for(const b of actions.querySelectorAll('button'))b.disabled=true;try{await fn();await onChanged();}catch(e){error.textContent=e.message;}finally{for(const b of actions.querySelectorAll('button'))b.disabled=false;}};
    actions.append(button('Edit',()=>editMonitor(w,data),'subtle-button','edit'),button(w.enabled?'Pause':'Resume',()=>act(()=>w.enabled?request(`/inbox-monitors/${w.id}/pause`,'POST',{}):request('/inbox-monitors','POST',Object.fromEntries(['id','bot_id','account_id','name','instructions','mode','topic','service_account','public_url','enabled'].map(k=>[k,k==='enabled'?true:w[k]])))),'subtle-button',w.enabled?'pause':'play'));
    if(!w.enabled)actions.append(button('Remove',()=>act(()=>request(`/inbox-monitors/${w.id}`,'DELETE')),'subtle-button','trash'));
    else actions.append(button('Check now',()=>act(()=>request(`/inbox-monitors/${w.id}/check`,'POST',{})),'subtle-button','refresh'));
    body.append(actions,error);row.append(body);section.append(row);
  }
  if(!data.items.some(w=>!botId||w.bot_id===botId))section.append(node('p','monitor-empty-line','No Gmail monitors for this bot yet.'));
  const connections=node('details','slack-connections');connections.open=!!old?.querySelector('.slack-connections')?.open;connections.append(node('summary','','Gmail connections'));
  for(const a of data.connections||[]){const row=node('div','slack-connection-row');row.append(node('strong','',a.name),node('span','muted small',[a.email,a.status==='connected'?'Connected':'Disconnected',a.source==='google'?'Google read-only':'Kindred connection'].filter(Boolean).join(' · ')));
    if(a.source==='google'&&a.status==='connected')row.append(button('Disconnect',async()=>{try{await request('/gmail-connections/'+encodeURIComponent(a.id),'DELETE');await onChanged();}catch(e){row.append(node('p','run-error small',e.message));}},'subtle-button'));
    connections.append(row);}
  connections.append(button('Connect Gmail',connect,'subtle-button','plus'));section.append(connections);
  if(old)old.replaceWith(section);else root.append(section);
}
