import {savedAccounts} from './profiles.js';
const invoke=(command,args={})=>window.__TAURI__.core.invoke(command,args),$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),embedded=params.get('embedded')==='1';
let requestedTheme=params.get('theme'),platform=null;
function accountContext(detail={}){if(detail.section==='setup')delete document.documentElement.dataset.accountSection;if(['light','dark'].includes(detail.theme)){requestedTheme=detail.theme;document.documentElement.dataset.theme=detail.theme;}if(['accounts','standalone'].includes(detail.section)){document.documentElement.dataset.accountSection=detail.section;const label=detail.section==='standalone'?'Local server':'Accounts';const chrome=document.querySelector('.dialog-chrome span');if(chrome)chrome.textContent=label;document.querySelector('main>h1').textContent=label;}}
accountContext({theme:requestedTheme,section:params.get('section')});
window.addEventListener('kindred-account-context',e=>accountContext(e.detail));

if(embedded){
 document.documentElement.dataset.embedded='true';document.documentElement.dataset.accountSection='accounts';document.querySelector('.dialog-chrome')?.remove();
 window.addEventListener('kindred-account-section',e=>{if(['accounts','standalone'].includes(e.detail)){document.documentElement.dataset.accountSection=e.detail;window.scrollTo(0,0);}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();void invoke('close_profile_home');}});
}
function statusReply(){let timer;return Promise.race([invoke('standalone_status'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The setup status did not respond.')),8000);})]).finally(()=>clearTimeout(timer));}
let firstRun=false;
function chooseSetup(choice){
 document.documentElement.dataset.setupChoice=choice;
 for(const name of ['local','server'])$('choose-'+name).setAttribute('aria-pressed',String(choice===name));
 if(choice==='server'){$('server-form').hidden=false;$('address').focus();}
}
$('choose-local').onclick=()=>chooseSetup('local');
$('choose-server').onclick=()=>chooseSetup('server');
let loading=false,pollTimer=null,resumeKey=null,showAccountsAfterUpdate=false,hasLocalAccounts=false,setupState=null,setupRequest=null,setupEpoch=0;
const localServer=address=>{try{const u=new URL(address);return u.protocol==='http:'&&u.port==='9444'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}};
function profileReadiness(){
 for(const button of document.querySelectorAll('[data-profile-server]')){
  if(!localServer(button.dataset.profileServer))continue;
  const ready=setupState&&setupState.status!=='working'&&setupState.status!=='error'&&(setupState.status==='ready'||setupState.local_server);
  button.disabled=!ready||button.dataset.profileBusy==='true';button.setAttribute('aria-disabled',String(button.disabled));button.closest('.saved-profile')?.classList.toggle('setup-unavailable',!ready);
  const status=button.querySelector('.session-state');
  const message=!setupState?'Checking local server…':setupState.status==='working'?(setupState.stage||'Preparing local server…'):setupState.status==='error'?(embedded?'Setup needs attention · open Standalone':'Setup needs attention · see progress below'):(embedded?'Local server is offline · open Standalone':'Local server is offline · start setup below');
  button.title=ready?'':message;if(status)status.textContent=ready?button.dataset.sessionState:message;
  const progress=button.querySelector('.profile-setup-progress');if(progress){progress.hidden=!embedded||!setupState||!['working','error'].includes(setupState.status);progress.max=setupState?.stage_count||5;if(Number.isFinite(setupState?.completed_stages))progress.value=setupState.completed_stages;else progress.removeAttribute('value');}
 }
}
function elapsedSetup(){
 const started=setupState?.started_at;if(!started){$('setup-elapsed').textContent='';return;}
 const seconds=Math.max(0,Math.floor(Date.now()/1000-started));$('setup-elapsed').textContent=setupState.status==='working'?(seconds<60?seconds+'s elapsed':Math.floor(seconds/60)+'m '+seconds%60+'s elapsed'):'Setup '+(setupState.status==='ready'?'complete':'paused');
}
async function perform(action,button){if(button?.disabled)return;if(button){button.disabled=true;button.dataset.profileBusy='true';}$('error').textContent='';try{return await action();}catch(e){$('error').textContent=String(e.message||e);}finally{if(button){button.disabled=false;delete button.dataset.profileBusy;}profileReadiness();}}
async function load(){
 const data=await invoke('profile_home_state');hasLocalAccounts=data.entries.some(p=>localServer(p.server));if(data.intent?.mode==='standalone-update')showAccountsAfterUpdate=true;platform=data.platform||(data.linux_client_updates?'linux':null);$('update-client').hidden=platform!=='linux'||!data.linux_client_updates;$('update-client').onclick=()=>perform(()=>invoke('open_linux_update'),$('update-client'));$('version').textContent='Desktop app '+data.version;document.documentElement.dataset.theme=(requestedTheme||data.theme)==='light'?'light':'dark';
 firstRun=!embedded&&!document.documentElement.dataset.accountSection&&!data.entries.length&&!data.intent;
 document.documentElement.toggleAttribute('data-first-run',firstRun);$('setup-choices').hidden=!firstRun;
 if(firstRun){document.querySelector('.dialog-chrome span').textContent='Welcome';$('home-title').textContent='Welcome to Kindred';$('home-intro').textContent='Choose where your bots will live.';}
 const moving=data.intent?.mode==='transfer';$('connections-view').hidden=moving;$('transfer-view').hidden=!moving;if(moving){$('transfer-source').textContent=data.intent.name+' · '+data.intent.server;const pending=data.transfer_request;if(pending?.source===data.intent.source){$('transfer-address').value=pending.destination;$('transfer-username').value=pending.username;}return;}
 const connection=data.intent?.mode==='connection'?data.intent:null;$('connection-recovery').hidden=!connection;
 if(connection){$('connection-title').textContent=connection.failed?'Couldn’t open your workspace':'Opening your workspace…';$('connection-address').textContent=connection.server;$('connection-help').textContent=connection.failed?'Check your connection and that the server is running, then try again. '+(data.entries.length?'You can also choose another account below.':'You can also connect to another server below.'):'Connecting to your saved server.';$('connection-retry').hidden=!connection.failed;$('connection-retry').dataset.profileServer=connection.server;$('connection-retry').onclick=()=>perform(()=>connection.key?invoke('switch_native_profile',{key:connection.key}):invoke('connect_profile_server',{address:connection.server}),$('connection-retry'));}
 $('saved').hidden=!data.entries.length;$('profiles').replaceChildren();
 for(const entry of savedAccounts(data.entries,data.last)){const row=document.createElement('div');row.className='saved-profile';const button=document.createElement('button');button.type='button';button.className='select';button.dataset.key=entry.key;button.dataset.profileServer=entry.server;button.dataset.keys=JSON.stringify(entry.workspaces.map(p=>p.key));
 const initial=document.createElement('span');initial.className='profile-initial';initial.textContent=entry.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
 const text=document.createElement('span'),name=document.createElement('span'),server=document.createElement('span'),status=document.createElement('span');name.className='name';name.textContent=entry.name;server.className='server';server.textContent=entry.username?entry.username+' · '+entry.server:entry.server;status.className='session-state';status.textContent=entry.session_available===true?'Saved sign-in':entry.session_available===false?'Sign-in required':'Saved account';button.dataset.sessionState=status.textContent;const progress=document.createElement('progress');progress.className='profile-setup-progress';progress.setAttribute('aria-label',entry.name+' setup');progress.hidden=true;text.className='saved-profile-copy';text.title=entry.name+' · '+entry.server;text.append(name,server,status,progress);button.append(initial,text);
 button.onclick=()=>perform(()=>invoke('switch_native_profile',{key:entry.key}),button);row.append(button);
 const forget=document.createElement('button');forget.className='forget';forget.type='button';forget.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';forget.title='Account options';forget.setAttribute('aria-label','Options for '+entry.name);forget.onclick=()=>profileOptions(entry,forget);row.append(forget);$('profiles').append(row);
 }
 if(!$('address').value)$('address').value=data.entries.find(p=>p.key===data.last)?.server||data.entries[0]?.server||'';
 if(!data.entries.length){$('server-form').hidden=false;$('add-account').setAttribute('aria-expanded','true');}
 profileReadiness();
 const last=data.entries.find(p=>p.key===data.last);if(localServer(last?.server)&&data.intent?.mode==='connection')resumeKey=data.last;
 void counts();try{await pollSetup();}catch(e){setupPollError(e);}finally{startSetupPolling();}
}
async function counts(){if(loading)return;loading=true;try{const values=await invoke('profile_activity');for(const button of document.querySelectorAll('.select[data-key]')){button.querySelector('.count')?.remove();const n=JSON.parse(button.dataset.keys||'[]').reduce((sum,key)=>sum+(values[key]||0),0);if(n>0){const count=document.createElement('span');count.className='count';count.textContent=n>9?'9+':String(n);count.setAttribute('aria-label',n+' unread notifications');button.append(count);}}}catch{}finally{loading=false;}}
$('server-form').onsubmit=e=>{e.preventDefault();perform(()=>invoke('connect_profile_server',{address:$('address').value}),e.currentTarget.querySelector('button'));};
$('add-account').onclick=()=>{const hidden=!$('server-form').hidden;$('server-form').hidden=hidden;$('add-account').setAttribute('aria-expanded',String(!hidden));if(!hidden)$('address').focus();};
function renderSetup(status={}){
 status=status||{};if(firstRun&&!document.documentElement.dataset.setupChoice&&(status.local_server||['working','error','ready'].includes(status.status)))chooseSetup('local');const previous=setupState;setupState=status;const working=status.status==='working',server=status.local_server;
 let versions=$('standalone-versions');if(!versions){versions=document.createElement('p');versions.id='standalone-versions';versions.className='hint';versions.setAttribute('role','status');$('standalone').before(versions);}
 // Keep the detected versions visible while setup is running.
 if(!working){versions.hidden=!server;versions.textContent=server?'Desktop app '+server.desktop_version+' · Local server '+server.version+(server.update_available?'. A local server update is available. This updates this computer’s server only; hosted accounts are unchanged. Finish active bot tasks first.':''):'';}
 $('open-local').textContent=hasLocalAccounts?'Choose an account':'Open local server';
 $('standalone').textContent=working?'Preparing local server…':server?.update_available?'Update local server':server?'Repair local server':'Set up this computer';
 const panel=$('setup-progress-panel');panel.hidden=!['working','error','ready'].includes(status.status);panel.dataset.status=status.status||'';
 const bar=$('setup-progress'),total=status.stage_count||5,completed=status.completed_stages;
 bar.max=total;if(Number.isFinite(completed))bar.value=Math.max(0,Math.min(total,completed));else if(status.status==='ready')bar.value=total;else bar.removeAttribute('value');
 const stage=status.status==='ready'?'All setup stages complete':(status.stage_index?'Step '+status.stage_index+' of '+total+' · ':'')+(status.stage||'Preparing local server');if($('setup-stage').textContent!==stage)$('setup-stage').textContent=stage;
 bar.setAttribute('aria-valuetext',$('setup-stage').textContent);const detail=status.detail||'Waiting for the next setup update…';if($('setup-log').textContent!==detail)$('setup-log').textContent=detail;$('setup-details').hidden=!status.detail;if(status.status==='error'&&previous?.status!=='error'&&status.detail)$('setup-details').open=true;
 profileReadiness();elapsedSetup();
 $('setup').hidden=!status.message||(working&&status.message===status.stage);if($('setup').textContent!==(status.message||''))$('setup').textContent=status.message||'';$('standalone').disabled=working;$('open-local').hidden=status.status!=='ready';const recovery=status.linux_recovery;$('linux-recovery').hidden=platform!=='linux'||!recovery?.command||!((!server&&status.status!=='ready')||(status.status==='error'&&/^(Docker Engine is missing|Docker Compose v2 is missing|Docker is installed, but)/.test(status.message||'')));if(recovery?.command){$('linux-setup-command').value=recovery.command;$('linux-recovery-note').textContent=recovery.note||'';$('linux-appimage-note').hidden=!recovery.appimage;if(status.status==='error'&&previous?.status!=='error')$('linux-recovery').open=true;}
}
function setupPollError(error){
 $('setup').hidden=false;$('setup').textContent='Could not check setup progress. '+String(error.message||error)+' Retrying…';
 // A missed status reply does not mean the worker stopped. Keep local profiles
 // blocked and keep polling; do not offer a second concurrent setup attempt.
 if(!setupState)profileReadiness();
}
function startSetupPolling(){clearTimeout(pollTimer);pollTimer=setTimeout(async()=>{try{await pollSetup();}catch(e){setupPollError(e);}finally{startSetupPolling();}},setupState?.status==='working'?1000:5000);}
$('standalone').onclick=async()=>{
 if($('standalone').disabled)return;showAccountsAfterUpdate=hasLocalAccounts;setupEpoch++;$('error').textContent='';
 renderSetup({status:'working',stage:'Checking Docker',message:'Checking Docker',stage_index:1,stage_count:5,completed_stages:0,started_at:Math.floor(Date.now()/1000)});
 let started=false;try{await invoke('start_standalone');started=true;if(setupRequest)await setupRequest;await pollSetup();}
 catch(error){if(started)setupPollError(error);else renderSetup({...setupState,status:'error',message:String(error.message||error)});}
 finally{startSetupPolling();}
};
function pollSetup(){
 if(setupRequest)return setupRequest;
 const epoch=setupEpoch;
 setupRequest=(async()=>{
  const status=await statusReply();if(epoch!==setupEpoch)return;
  renderSetup(status);if(status?.status==='ready'&&showAccountsAfterUpdate&&hasLocalAccounts){showAccountsAfterUpdate=false;resumeKey=null;accountContext({section:'accounts'});window.scrollTo(0,0);return;}if(status?.status==='ready'&&resumeKey){const key=resumeKey;resumeKey=null;await perform(()=>invoke('switch_native_profile',{key}));}
 })().finally(()=>{setupRequest=null;});return setupRequest;
}
setInterval(elapsedSetup,1000);
window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
$('copy-linux-setup').onclick=async()=>{const command=$('linux-setup-command');try{await navigator.clipboard.writeText(command.value);$('linux-copy-status').textContent='Copied. Paste this block into your terminal.';}catch{command.focus();command.select();$('linux-copy-status').textContent='Select and copy the highlighted block with Ctrl+C, then paste it into your terminal.';}};
$('open-local').onclick=()=>{if(hasLocalAccounts){accountContext({section:'accounts'});window.scrollTo(0,0);return;}return perform(()=>invoke('connect_profile_server',{address:'http://127.0.0.1:9444'}),$('open-local'));};
void perform(load);setInterval(()=>{if(!document.hidden)counts();},15000);

function confirmForget(entry,trigger){
 const dialog=document.createElement('dialog');dialog.className='confirm-dialog';
 const title=document.createElement('h2');title.textContent='Forget '+entry.name+' on this computer?';dialog.setAttribute('aria-label',title.textContent);
 const copy=document.createElement('p');copy.textContent='This removes its saved connection from this computer. Your bots, chats and files remain on '+entry.server+'. You can sign in again later.';
 const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Keep account';cancel.autofocus=true;cancel.onclick=()=>dialog.close();
 const confirm=document.createElement('button');confirm.type='button';confirm.className='danger';confirm.textContent='Forget on this computer';confirm.onclick=()=>perform(async()=>{for(const workspace of entry.workspaces||[entry])await invoke('forget_profile',{key:workspace.key});dialog.close();await load();},confirm);
 actions.append(cancel,confirm);dialog.append(title,copy,actions);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();},{once:true});dialog.showModal();cancel.focus();
}

function profileOptions(entry,trigger){
 const dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-label','Options for '+entry.name);
 const title=document.createElement('h2');title.textContent=entry.name;const server=document.createElement('p');server.textContent=entry.server;
 const actions=document.createElement('div');actions.className='dialog-actions';const done=document.createElement('button');done.textContent='Done';done.onclick=()=>dialog.close();
 const forget=document.createElement('button');forget.className='danger';forget.textContent='Forget on this computer';forget.onclick=()=>{dialog.close();confirmForget(entry,trigger);};actions.append(done,forget);dialog.append(title,server);
 if(entry.workspaces?.length>1){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Existing workspaces';details.append(summary);for(const workspace of entry.workspaces){const button=document.createElement('button');button.dataset.profileServer=workspace.server||entry.server;button.textContent=workspace.name;button.onclick=()=>perform(()=>invoke('switch_native_profile',{key:workspace.key}),button);details.append(button);}dialog.append(details);}
 dialog.append(actions);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(!document.querySelector('dialog[open]'))trigger.focus({preventScroll:true});},{once:true});dialog.showModal();profileReadiness();done.focus();
}
$('transfer-form').onsubmit=async event=>{event.preventDefault();const button=$('transfer-submit');if(button.disabled)return;button.disabled=true;$('transfer-cancel').disabled=true;$('transfer-error').textContent='Moving your workspace. Keep this window open…';try{
 await invoke('transfer_profile',{address:$('transfer-address').value,username:$('transfer-username').value,password:$('transfer-password').value,register:$('transfer-register').checked,remember:$('transfer-remember').checked});
 $('transfer-error').textContent='Moved. Opening your workspace on its new server…';
}catch(e){$('transfer-error').textContent=String(e.message||e);}finally{$('transfer-password').value='';button.disabled=false;$('transfer-cancel').disabled=false;}};
$('transfer-register').onchange=()=>{$('transfer-password').autocomplete=$('transfer-register').checked?'new-password':'current-password';};
$('transfer-cancel').onclick=async()=>{const button=$('transfer-cancel');button.disabled=true;try{await invoke('cancel_profile_transfer');$('transfer-error').textContent='Transfer cancelled. The original workspace can run again. Any partial destination copy remains paused.';}catch(e){$('transfer-error').textContent=String(e.message||e);}finally{button.disabled=false;}};
window.addEventListener('kindred-dialog-refresh',()=>perform(load));
