// Older installations may retain several workspaces under one sign-in.
// Group only by a verified native account key or an exact server + username.
export function savedAccounts(entries,last) {
  const groups=new Map();
  for(const entry of entries||[]) {
    const id=entry.account_key||entry.server+'\n'+(entry.username||entry.key);
    if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);
  }
  return [...groups.values()].map(workspaces=>({...workspaces.find(e=>e.key===last)||workspaces[0],workspaces}));
}
// Profile switching reloads the application after rotating its scoped session.
// That releases every chat, provider, image, VNC and native-operation cache.
export function createProfileUI({getToken,setToken,connect,beforeSwitch,restoreAfterSwitch,nativeInvoke,notice}) {
  let enabled=false, projection=null, polling=false, meta=null, nativeProfiles=[], nativeCounts={},nativeLast=null;
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const run=async(action,control)=>{if(control?.disabled)return;if(control)control.disabled=true;try{return await action();}catch(e){notice(e.message,true);}finally{if(control)control.disabled=false;}};
  const button=(text,action,cls='subtle-button')=>{const b=el('button',cls,text);b.type='button';b.onclick=()=>run(action,b);return b;};
  async function api(path,body) {
    const response=await fetch('/identity/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
    const value=await response.json();if(!response.ok){const error=new Error(value.error||'The server could not complete this request.');error.status=response.status;throw error;}return value;
  }
  function saveToken(token) {
    setToken(token);sessionStorage.setItem('kindred-token',token);
    if(window.__KINDRED_PROFILE_HOST)localStorage.removeItem('kindred-token');
    else if($('remember-device').checked||localStorage.getItem('kindred-token'))localStorage.setItem('kindred-token',token);
  }
  function label(text,type='text',value='') {
    const root=el('label','',text),input=el('input');input.type=type;input.value=value;root.append(input);return {root,input};
  }
  function dialog(title) {
    $('profile-menu')?.remove();$('identity-menu')?.remove();$('identity-button')?.setAttribute('aria-expanded','false');
    const d=el('dialog','profile-dialog'),head=el('div','profile-dialog-heading');head.append(el('h2','',title),button('×',()=>d.close(),'icon-button'));
    head.lastChild.setAttribute('aria-label','Close');d.append(head);document.body.append(d);d.addEventListener('close',()=>{d.remove();$('switch-profiles')?.focus();},{once:true});d.showModal();return d;
  }
  function fieldSet(form,text,type,value,autocomplete) {
    const f=label(text,type,value);f.input.required=true;if(autocomplete)f.input.autocomplete=autocomplete;form.append(f.root);return f.input;
  }
  async function authentication(mode='login',host,selection={}) {
    const claiming=mode==='register'&&projection?.legacy&&projection?.claim_available;
    const form=host||dialog(claiming?'Claim your existing workspace':mode==='register'?'Create your account':'Sign in to Kindred');
    if(form.id==='account-connect')form.querySelector('h1').textContent=mode==='register'?'Create your account':'Sign in to Kindred';
    form.querySelector(':scope > .profile-auth')?.remove();
    if(form.tagName==='DIALOG')form.querySelector('h2').textContent=claiming?'Claim your existing workspace':mode==='register'?'Create account':'Sign in';
    const fields=el('form','profile-auth');
    fields.append(el('p','muted',claiming?'This account will own the bots, chats, memories and routines you already use.':mode==='register'?(meta?.first_user?'The first account administers this server.':'Your account keeps its own bots, conversations and computer.'):'Sign in to access your bots and conversations.'));
    const username=fieldSet(fields,'Username','text',selection.username||'','username');username.maxLength=80;
    const name=mode==='register'?fieldSet(fields,'Display name','text','','nickname'):null;if(name){name.maxLength=80;if(claiming)name.value=projection.profiles.find(p=>p.active)?.name||'';}
    const password=fieldSet(fields,'Password','password','',mode==='register'?'new-password':'current-password');if(mode==='register')password.minLength=4;
    const invite=mode==='register'&&!meta?.registration&&!meta?.first_user?fieldSet(fields,'Invitation code','text','', 'off'):null;
    const remember=el('label','remember-device'),check=el('input');check.type='checkbox';check.checked=$('remember-device').checked;
    remember.append(check,document.createTextNode('Keep this device connected'));fields.append(remember);
    let claimCheck=null;if(claiming){const row=el('label','remember-device');claimCheck=el('input');claimCheck.type='checkbox';claimCheck.required=true;row.append(claimCheck,document.createTextNode('Make this account the owner of my existing workspace'));fields.append(row);}
    const submit=el('button','primary',claiming?'Claim workspace':mode==='register'?'Create account':'Sign in');submit.type='submit';const error=el('output','profile-form-error');error.setAttribute('role','alert');fields.append(submit,error);
    fields.onsubmit=async event=>{event.preventDefault();submit.disabled=true;error.textContent='';try{
      const value=await api(mode,{login:username.value,password:password.value,...(claiming?{claim_legacy:claimCheck.checked}:{}),profile_id:selection.newAccount?undefined:window.__KINDRED_INITIAL_PROFILE||undefined,...(name?{name:name.value}:{}),...(invite?{invite:invite.value}:{})});
      password.value='';$('remember-device').checked=check.checked;
      if(!check.checked)localStorage.removeItem('kindred-token');
      const replacing=!!getToken();if(replacing)await beforeSwitch(projection?.active,value.profile_id);
      saveToken(value.token);
      if(window.__KINDRED_PROFILE_HOST)await nativeInvoke('remember_profile',{theme:document.documentElement.dataset.theme||'dark',token:value.token,profileId:value.profile_id,name:name?.value||'Kindred',remember:check.checked});
      if(form.tagName==='DIALOG')form.close();if(replacing)location.reload();else await connect();
    }catch(e){error.textContent=e.message;}finally{submit.disabled=false;}};
    if(mode==='login'&&(!meta?.legacy_claim||getToken()))fields.append(button('Create account',()=>authentication('register',form,selection)));
    if(mode==='register')fields.append(button('Already have an account? Sign in',()=>authentication('login',form,selection)));
    if(form.id==='account-connect'&&window.__KINDRED_PROFILE_HOST&&nativeProfiles.length)fields.append(button('Choose a saved account',()=>accountChooser(form)));
    form.append(fields);username.focus();
  }
  function accountChooser(host) {
    host.querySelector('.profile-auth')?.remove();host.querySelector('h1').textContent='Choose an account';
    const list=el('div','profile-auth account-chooser');
    list.append(el('p','muted','Continue with a saved account, or add another account.'));
    for(const entry of savedAccounts(nativeProfiles,nativeLast)){
      const row=button('',()=>nativeInvoke('switch_native_profile',{key:entry.key}),'account-choice');
      const avatar=el('span','account-avatar',entry.name.split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase());
      const copy=el('span','account-copy');copy.append(el('strong','',entry.name),el('span','muted',entry.username?entry.username+' · '+entry.server:entry.server));
      row.append(avatar,copy,el('span','account-state',entry.session_available?'Continue':'Sign in'));list.append(row);
    }
    list.append(button('Add another account',()=>authentication('login',host,{newAccount:true}),'outline-button'));
    list.append(button('Manage accounts',serverPicker));
    host.append(list);list.querySelector('button')?.focus();
  }
  async function connected() {
    if(!enabled)return;
    await refresh();
    if(window.__KINDRED_PROFILE_HOST&&projection)await nativeInvoke('remember_profile',{theme:document.documentElement.dataset.theme||'dark',token:getToken(),profileId:projection.active,name:projection.profiles.find(p=>p.active)?.name||'Kindred',remember:$('remember-device').checked});
  }
  function paint() {
    const control=$('switch-profiles');if(!control)return;
    const unread=projection?.profiles?.some(p=>!p.active&&p.unread>0)||nativeProfiles.some(p=>(p.server!==location.origin||p.profile_id!==projection?.active)&&nativeCounts[p.key]>0);
    control.classList.toggle('has-profile-activity',unread);control.setAttribute('aria-label',unread?'Switch accounts · unread activity':'Switch accounts');
    control.title=unread?'Switch accounts · unread activity':'Switch accounts';
  }
  async function refreshNativeAccounts(){
    if(!window.__KINDRED_PROFILE_HOST)return;
    const directory=await nativeInvoke('profile_home_state',{});
    nativeProfiles=directory.entries||[];nativeLast=directory.last;paint();
  }
  async function refresh() {
    if(!enabled||!getToken()||polling)return;polling=true;
    try{await Promise.allSettled([
      api('profiles').then(value=>{projection=value;paint();}),
      refreshNativeAccounts(),
      window.__KINDRED_PROFILE_HOST?nativeInvoke('profile_activity',{}).then(value=>{nativeCounts=value;paint();}):Promise.resolve()
    ]);}finally{polling=false;}
  }
  let switchingAccount=false;
  async function openSavedAccount(account,row){
    if(switchingAccount)return;switchingAccount=true;
    const status=el('span','profile-switch-progress','Opening…');status.setAttribute('role','status');row.append(status);row.setAttribute('aria-busy','true');
    const controls=[...$('profile-menu')?.querySelectorAll('button')||[]];controls.forEach(b=>b.disabled=true);
    let prepared=false;
    try{await beforeSwitch(projection?.active,null);prepared=true;await nativeInvoke('switch_native_profile',{key:account.key});}
    catch(e){if(prepared)await restoreAfterSwitch?.().catch(()=>{});throw e;}
    finally{switchingAccount=false;status.remove();row.removeAttribute('aria-busy');controls.forEach(b=>b.disabled=false);}
  }
  async function switchProfile(profile) {
    if(profile.active)return;
    await beforeSwitch(projection.active,profile.id);
    const value=await api('switch',{profile_id:profile.id});saveToken(value.token);
    if(window.__KINDRED_PROFILE_HOST)await nativeInvoke('remember_profile',{theme:document.documentElement.dataset.theme||'dark',token:value.token,profileId:profile.id,name:profile.name,remember:$('remember-device').checked});
    location.reload();
  }
  function serverAddress(value){
    const url=new URL(value.trim());if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('Enter an HTTPS server address, or HTTP on localhost.');return url;
  }
  async function connectServer(url){
    await beforeSwitch(projection?.active,null);
    if(window.__KINDRED_PROFILE_HOST){await nativeInvoke('connect_profile_server',{address:url.origin});return;}
    await api('directory',{name:url.hostname,server:url.origin});location.assign(url.href);
  }
  async function serverPicker() {
    $('profile-menu')?.remove();
    if(window.__KINDRED_DESKTOP?.platform==='linux'){await nativeInvoke('open_profile_home',{theme:document.documentElement.dataset.theme||'dark'});return;}
    if($('account-manager-dialog'))return;
    const d=el('dialog','settings-dialog'),nav=el('aside','settings-nav'),tabs=el('nav'),main=el('section','settings-main'),head=el('header'),title=el('h2','','Accounts'),content=el('div','account-manager-content');
    d.id='account-manager-dialog';d.setAttribute('aria-label','Manage accounts');
    const close=button('×',()=>d.close(),'icon-button');close.setAttribute('aria-label','Close manage accounts');
    head.append(title,close);nav.append(el('h2','','Manage accounts'),tabs);main.append(head,content);d.append(nav,main);document.body.append(d);
    let closed=false,opening=true,frame=0,section='accounts';
    const bounds=()=>{const r=content.getBoundingClientRect(),scale=devicePixelRatio||1;return{x:r.x*scale,y:r.y*scale,width:r.width*scale,height:r.height*scale};};
    const position=()=>nativeInvoke('position_profile_home',{bounds:bounds(),section});
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!closed&&!opening)void position().catch(e=>notice(String(e),true));});};
    const embedded=window.__KINDRED_EMBEDDED_ACCOUNTS===true;
    for(const name of ['Accounts']){const b=button(name,async()=>{section=name.toLowerCase();title.textContent=name;for(const tab of tabs.children){tab.classList.toggle('active',tab===b);tab.setAttribute('aria-current',String(tab===b));}if(!opening)await position();},'');b.classList.toggle('active',name==='Accounts');b.setAttribute('aria-current',String(name==='Accounts'));tabs.append(b);}
    const observer=new ResizeObserver(resize);
    d.addEventListener('close',async()=>{closed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);if(embedded)await nativeInvoke('position_profile_home',{bounds:null}).catch(()=>{});d.remove();$('switch-profiles')?.focus();},{once:true});
    d.showModal();close.focus();
    if(!embedded){
      content.classList.add('account-manager-fallback');
      content.append(el('p','muted','Choose a saved account or add another account.'));
      for(const entry of savedAccounts(nativeProfiles,nativeLast)){const row=button('',async()=>{await beforeSwitch(projection?.active,null);await nativeInvoke('switch_native_profile',{key:entry.key});},'account-choice'),copy=el('span','account-copy');copy.append(el('strong','',entry.name),el('span','muted',entry.server));row.append(copy);content.append(row);}
      content.append(button('Add account',()=>{d.close();return addAccount();},'outline-button'));
      if(window.__KINDRED_PROFILE_HOST){content.append(el('p','muted','Update the desktop app to manage saved connections and standalone setup here.'));const update=el('a','subtle-button','Check for updates');update.href='kindred-update://check';content.append(update);}
      return;
    }
    await Promise.all(d.getAnimations().map(a=>a.finished.catch(()=>{})));
    if(closed)return;
    observer.observe(content);window.addEventListener('resize',resize);
    try{await nativeInvoke('open_profile_home',{theme:document.documentElement.dataset.theme||'dark',bounds:bounds()});opening=false;if(closed)await nativeInvoke('position_profile_home',{bounds:null});else resize();}
    catch(e){opening=false;content.append(el('p','profile-form-error',String(e.message||e)));}
  }
  async function addAccount() {
    const d=dialog('Add account');
    const server=el('details','account-server'),summary=el('summary','muted','Server · '+location.origin);
    const form=el('form','profile-auth');const address=fieldSet(form,'Server address','url',location.origin,'url');
    const go=el('button','outline-button','Use this server');go.type='submit';form.append(go);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{const url=serverAddress(address.value);if(url.origin===location.origin){server.open=false;return;}await connectServer(url);},go);};
    server.append(summary,form);d.append(server);
    await authentication('login',d,{newAccount:true});
  }
  async function profileSettings(){
    const current=projection?.profiles?.find(p=>p.active);if(!current)return;
    const d=dialog('Account settings'),form=el('form','profile-auth');d.append(form);
    const name=fieldSet(form,'Display name','text',current.name,'nickname');name.maxLength=80;
    form.append(el('p','muted','Server · '+location.origin));const save=el('button','primary','Save changes');save.type='submit';form.append(save);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{await api('profile',{name:name.value});await connected();d.close();location.reload();},save);};
    if(projection.profiles.length>1){
      const existing=el('details','account-workspaces');existing.append(el('summary','','Existing workspaces'));
      existing.append(el('p','muted','These workspaces share this account’s username and password.'));
      for(const p of projection.profiles){const row=button(p.name+(p.active?' · Current':''),()=>switchProfile(p));row.disabled=p.active;existing.append(row);}
      form.append(existing);
    }
    const transfer=await api('transfer');
    if(transfer?.state==='moved')form.append(el('p','muted','This workspace moved to '+transfer.destination+'. The original is retained here for reference.'));
    else if(transfer?.state==='prepared')form.append(el('p','muted','A server transfer is pending. Tasks and routines are paused here until you finish or cancel it.'));
    if(window.__KINDRED_PROFILE_HOST)form.append(button(transfer?'Resume or review server transfer':'Move to another server',async()=>{d.close();await nativeInvoke('open_profile_transfer',{});},'outline-button'));
    else form.append(el('p','muted','Use the Kindred desktop app to move this workspace to another server.'));
  }
  async function admin() {
    const d=dialog('Server administration'),data=await api('admin');
    if(window.__KINDRED_PROFILE_HOST&&location.origin==='http://127.0.0.1:9444'){
      const local=el('section','local-server-admin');local.append(el('h3','','Local server'),button('Manage local server',()=>nativeInvoke('open_profile_home',{theme:document.documentElement.dataset.theme||'dark',section:'standalone'}),'outline-button'));d.append(local);
    }

    d.append(el('p','muted',`Up to ${data.max_users} accounts.`));
    const open=el('label','remember-device'),check=el('input');check.type='checkbox';check.checked=data.registration;open.append(check,document.createTextNode('Allow new users to register'));d.append(open);
    check.onchange=()=>run(async()=>{try{await api('admin',{action:'registration',open:check.checked});}catch(e){check.checked=!check.checked;throw e;}},check);
    const invite=el('output','profile-invite');d.append(button('Create one-use invitation',async()=>{const value=await api('admin',{action:'invite'});invite.textContent=value.invite;invite.hidden=false;}),invite);invite.hidden=true;
    for(const user of data.users){const row=el('div','profile-admin-row');row.append(el('span','',user.username+(user.admin?' · administrator':'')));if(user.id!==projection.account_id)row.append(button(user.disabled?'Enable':'Disable',async()=>{await api('admin',{action:'disable',user_id:user.id,disabled:!user.disabled});d.close();await admin();}));d.append(row);}
  }
  async function changePassword() {
    const d=dialog('Change password'),form=el('form','profile-auth');d.append(form);
    const current=fieldSet(form,'Current password','password','','current-password'),next=fieldSet(form,'New password','password','','new-password');next.minLength=4;
    form.append(el('p','muted','Other devices will need to sign in again.'));
    const submit=el('button','primary','Save password');submit.type='submit';form.append(submit);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{const value=await api('password',{current_password:current.value,password:next.value});current.value='';next.value='';saveToken(value.token);await connected();d.close();notice('Password changed.');},submit);};
  }
  const menuIcon=path=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);return svg;};
  let menuRequest=0,menuObserver=null;
  function closeMenu(focus=false){menuRequest++;menuObserver?.disconnect();menuObserver=null;$('profile-menu')?.remove();$('switch-profiles')?.setAttribute('aria-expanded','false');if(focus)$('switch-profiles')?.focus({preventScroll:true});}
  function positionMenu(){
    const root=$('profile-menu');if(!root)return;
    const box=$('switch-profiles').getBoundingClientRect(),above=box.top-14,below=innerHeight-box.bottom-14;
    root.style.maxHeight=Math.max(80,Math.min(540,Math.max(above,below)))+'px';
    root.style.left=Math.max(8,Math.min(box.right-root.offsetWidth,innerWidth-root.offsetWidth-8))+'px';
    root.style.top=(above>=below?Math.max(8,box.top-root.offsetHeight-6):box.bottom+6)+'px';
  }
  async function menu() {
    if($('profile-menu')){closeMenu();return;}
    const request=++menuRequest;try{await refreshNativeAccounts();}catch{}if(request!==menuRequest)return;void refresh().catch(()=>{});
    const root=el('div','profile-menu');root.id='profile-menu';root.setAttribute('role','menu');root.setAttribute('aria-label','Kindred accounts');
    root.append(el('div','profile-menu-label','Accounts'));
    const current=projection?.profiles?.find(p=>p.active);
    const accountRow=(name,server,action)=>{const row=button('',action,'profile-menu-row profile-account-row'),avatar=el('span','profile-menu-avatar',name.trim().split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase()),copy=el('span','profile-menu-copy');let host=server;try{host=new URL(server).host;}catch{}copy.append(el('span','profile-menu-name',name),el('span','profile-menu-server',host));copy.title=name+' · '+server;row.append(avatar,copy);row.setAttribute('role','menuitem');return row;};
    if(current){const row=accountRow(projection.username||current.name,location.origin,()=>{});row.setAttribute('aria-current','true');row.setAttribute('aria-disabled','true');row.tabIndex=-1;row.append(el('span','profile-current','Current'));root.append(row);}
    for(const account of savedAccounts(nativeProfiles,nativeLast).filter(a=>!a.workspaces.some(p=>p.server===location.origin&&p.profile_id===projection?.active))){
      const row=accountRow(account.name||account.username,account.server,()=>openSavedAccount(account,row));
      const n=account.workspaces.reduce((sum,p)=>sum+(nativeCounts[p.key]||0),0);if(n>0){const count=el('span','profile-notification',n>9?'9+':String(n));count.setAttribute('aria-label',n+' unread notifications');row.append(count);}root.append(row);
    }
    const actions=el('div','profile-menu-actions');
    const action=(name,fn,path)=>{const row=button('',()=>{closeMenu();return fn();},'profile-menu-row');row.setAttribute('role','menuitem');row.append(menuIcon(path),el('span','',name));actions.append(row);};
    action('Add account',addAccount,'M12 5v14 M5 12h14');
    if(window.__KINDRED_PROFILE_HOST)action('Manage accounts',serverPicker,'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8');
    if(!projection?.legacy)action('Account settings',profileSettings,'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2');
    if(!projection?.legacy)action('Change password',changePassword,'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 15v2');
    if(projection?.admin)action('Server administration',admin,'M4 3h16v7H4z M4 14h16v7H4z M8 6h.01 M8 17h.01');
    if(projection?.legacy)action(projection.claim_available?'Set up your account':'Sign in to your account',()=>authentication(projection.claim_available?'register':'login'),'M10 17l5-5-5-5 M3 12h12 M15 3h6v18h-6');
    root.append(actions);document.body.append(root);$('switch-profiles').setAttribute('aria-expanded','true');positionMenu();menuObserver=new ResizeObserver(positionMenu);menuObserver.observe(root);
    root.querySelector('button:not([aria-disabled=true])')?.focus({preventScroll:true});
  }
  async function init(pairCode) {
    try{const response=await fetch('/identity/meta',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)return;meta=await response.json();enabled=meta.profiles===true;}catch{return;}
    if(!enabled)return;
    try{if(window.__KINDRED_PROFILE_HOST){const directory=await nativeInvoke('profile_home_state',{});nativeProfiles=directory.entries||[];nativeLast=directory.last;}}catch{}
    // Old create-profile links now lead to account sign-in, never a hidden workspace creation.
    if(new URLSearchParams(location.search).has('new_profile')){const clean=new URL(location.href);clean.searchParams.delete('new_profile');clean.searchParams.delete('request_id');history.replaceState(null,'',clean.href);}
    if(getToken()){try{projection=await api('profiles');}catch(e){if(e.status===401||/session expired|sign in to/i.test(e.message)){setToken('');sessionStorage.removeItem('kindred-token');localStorage.removeItem('kindred-token');}}}
    const control=button('',menu,'profile-switch-button');control.append(menuIcon('M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4'));control.setAttribute('aria-expanded','false');control.setAttribute('aria-controls','profile-menu');control.id='switch-profiles';control.setAttribute('aria-haspopup','menu');$('identity-row').append(control);paint();
    document.addEventListener('click',e=>{if(!e.target.closest('#profile-menu,#switch-profiles'))closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('profile-menu')){e.preventDefault();closeMenu(true);}const menu=$('profile-menu');if(menu&&e.key==='Tab'){closeMenu(true);return;}if(menu&&['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const controls=[...menu.querySelectorAll('button:not([aria-disabled=true]):not(:disabled)')],at=controls.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?controls.length-1:(at+(e.key==='ArrowDown'?1:-1)+controls.length)%controls.length;controls[next]?.focus();}});
    window.addEventListener('resize',positionMenu);
    setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},15000);
    if(!pairCode&&!getToken()&&!new URLSearchParams(location.search).has('legacy')){
      const host=$('connect-form');host.onsubmit=e=>e.preventDefault();for(const element of [...host.children])if(element.id!=='connect-character'&&element.tagName!=='H1')element.hidden=true;
      // Form nesting is invalid HTML: replace only the original token form's tag.
      const container=el('div','connect-card');container.id='account-connect';for(const child of [...host.children])container.append(child);host.replaceWith(container);
      if(window.__KINDRED_PROFILE_HOST&&nativeProfiles.length&&!window.__KINDRED_EXPLICIT_PROFILE&&(!window.__KINDRED_NEW_ACCOUNT||nativeProfiles.some(p=>p.server===location.origin)))accountChooser(container);
      else await authentication(meta.first_user&&!meta.legacy_claim?'register':'login',container,{newAccount:!!window.__KINDRED_NEW_ACCOUNT,username:nativeProfiles.find(p=>p.server===location.origin&&p.profile_id===window.__KINDRED_INITIAL_PROFILE)?.username||''});
      if(meta.legacy_claim)container.append(button('Connect an existing device',()=>location.assign('/?legacy=1')));
    }
  }
  async function disconnect(){if(enabled&&projection&&!projection.legacy)await api('logout',{});}
  return {init,connected,refresh,disconnect,enabled:()=>enabled,projection:()=>projection};
}
