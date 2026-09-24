import {installThemedSelects} from "./select-menu.js";
installThemedSelects();
const $=id=>document.getElementById(id),invoke=(name,args={})=>window.__TAURI__.core.invoke(name,args);
const embedded=new URLSearchParams(location.search).get('embedded')==='1';
if(embedded){document.documentElement.dataset.embedded='true';document.querySelector('.dialog-chrome')?.remove();}
let currentId=null,initialized=false,editing=false;
const explanations={off:'Bots cannot access files or run commands on this desktop.',workspace:'Bots may list, read, write and create directories inside the workspace. Outside paths and commands are blocked.',ask:'Workspace file operations proceed. Every outside file operation and every command needs your approval in this native window.',full:'Bots may read and change files outside the workspace and run commands without a native approval prompt. Kindred’s normal external-action approvals still apply.'};
$('mode').onchange=()=>{editing=true;$('explanation').textContent=explanations[$('mode').value];};
$('save').onclick=async()=>{try{await invoke('set_local_access',{mode:$('mode').value});editing=false;$('message').textContent='Desktop permission saved.';}catch(e){$('message').textContent=String(e);}};
async function decide(allow){const id=currentId;if(!id)return;$('allow').disabled=$('deny').disabled=true;try{await invoke('decide_local_access',{id,allow});currentId=null;$('request').hidden=true;}catch(e){$('message').textContent=String(e);}}
$('allow').onclick=()=>decide(true);$('deny').onclick=()=>decide(false);
async function refresh(){try{const s=await invoke('local_access_state');document.documentElement.dataset.theme=s.theme==='light'?'light':'dark';if(!initialized||!editing){$('mode').value=s.mode;$('explanation').textContent=explanations[s.mode];initialized=true;}$('workspace').textContent=s.workspace;$('origin').textContent=s.origin||'';if(s.error)$('message').textContent=s.error;
 const p=embedded?null:s.pending;$('request').hidden=!p;if(p&&p.id!==currentId){currentId=p.id;$('request-title').textContent=`Allow ${p.bot} to use this computer?`;const action={local_read:'Read file',local_write:'Write file',local_list:'List directory',local_mkdir:'Create directory',local_exec:'Run command'}[p.tool]||p.tool;const path=p.path.startsWith('\\\\?\\')?p.path.slice(4):p.path;$('operation').textContent=`${action} · ${path}`;$('details').textContent=p.command||p.text||'File access';$('allow').disabled=$('deny').disabled=false;window.scrollTo(0,document.body.scrollHeight);}if(!p)currentId=null;
}catch(e){$('message').textContent=String(e);}}refresh();setInterval(refresh,500);
