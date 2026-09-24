const $=id=>document.getElementById(id),invoke=(name,args={})=>window.__TAURI__.core.invoke(name,args);
let pending=false,last={},timer,rendered;
function render(value){
 last=value;const key=JSON.stringify([value,pending]);if(rendered===key)return;rendered=key;
 document.documentElement.dataset.theme=value.theme==='light'?'light':'dark';
 const busy=pending||value.busy,ready=value.status==='ready';
 $('choose').disabled=busy;$('install').disabled=busy||!value.filename;$('install').hidden=ready;
 $('restart').hidden=!ready;$('restart').disabled=busy;
 $('rollback').hidden=!value.rollback;$('rollback').disabled=busy;
 $('filename').textContent=value.filename||'Use an AppImage downloaded from Kindred Releases.';
 $('message').textContent=value.message||'Choose a Kindred AppImage from your downloads.';
 $('progress').hidden=!value.busy&&value.status!=='ready';
 if(Number.isFinite(value.progress))$('progress').value=value.progress;else $('progress').removeAttribute('value');
 $('runtime').hidden=!value.runtime;$('runtime').textContent=value.runtime==='system'?'Using your system GTK and audio libraries.':'Using the AppImage’s bundled libraries.';
}
async function load(){render(await invoke('linux_update_state'));}
async function act(name,args){if(pending||last.busy)return;pending=true;render(last);$('error').hidden=true;try{await invoke(name,args);}catch(e){$('error').textContent=String(e.message||e);$('error').hidden=false;}finally{pending=false;await load().catch(showError);}}
function showError(e){$('error').textContent=String(e.message||e);$('error').hidden=false;}
$('choose').onclick=()=>act('choose_linux_appimage');
$('install').onclick=()=>act('install_linux_appimage',{rollback:false});
$('rollback').onclick=()=>act('install_linux_appimage',{rollback:true});
$('restart').onclick=()=>act('restart_linux_client');
async function poll(){try{await load();}catch(e){showError(e);}timer=setTimeout(poll,500);}
window.addEventListener('pagehide',()=>clearTimeout(timer));
void poll();
