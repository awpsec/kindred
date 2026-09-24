// Own runs and remote shared workers arrive through separate polls. Use the same
// own-run state as the sidebar, even before the room snapshot catches up.
export function sharedConversationWorkers(chat, snapshots, runs) {
  const live=r=>['queued','running','awaiting_approval','awaiting_user','cancelling'].includes(r.status);
  const local=runs.filter(r=>r.chat_id===chat.id),represented=new Set(),result=[];
  for(const snapshot of snapshots){
    const member=chat.participants?.find(p=>p.id===snapshot.participant);
    const own=snapshot.id?local.find(r=>r.id===snapshot.id):
      local.find(r=>r.bot_id===member?.bot_id&&r.created===snapshot.created)||local.find(r=>r.bot_id===member?.bot_id&&live(r));
    if(own){represented.add(own.id);if(live(own))result.push({...snapshot,...own,participant:snapshot.participant,name:member?.name||snapshot.name});}
    else result.push(snapshot);
  }
  for(const run of local.filter(live)){
    if(represented.has(run.id))continue;
    const member=chat.participants?.find(p=>p.kind==='bot'&&p.bot_id===run.bot_id);
    if(member)result.push({...run,participant:member.id,name:member.name});
  }
  return result;
}
// Hide routing-only runs; older servers without the signal retain their existing behavior.
export function visibleGroupWorkers(items) {
  return items.filter(item=>!['queued','running'].includes(item.status)||item.activity_started!==false);
}
// A single compact, keyed activity strip for a group, including remote members.
export function groupActivity(items,{node,avatar,elapsed,control=()=>null}) {
  const unique=new Map();
  for(const item of visibleGroupWorkers(items)){const key=item.participant||item.id;if(!unique.has(key)||item.status==='running')unique.set(key,item);}
  const members=[...unique.values()];
  const controls=new Map(members.map(m=>[m,control(m)]));
  const root=node('div','group-activity');root.dataset.message='group-activity';root.dataset.activitySignature=JSON.stringify(members.map(({id,participant,name,status,label,created,profile})=>({id,participant,name,status,label,created,profile})));
  root.setAttribute('role','status');root.setAttribute('aria-label',members.map(m=>m.name).join(', ')+' working');
  const clustered=members.length>3;root.dataset.clustered=String(clustered);
  const dots=()=>{const d=node('span','group-working-dots');d.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)d.append(node('span','','.'));return d;};
  const face=m=>{const a=avatar(m,24);a.dataset.worker=m.participant||m.id;a.title=m.name;return a;};
  if(clustered){
    const row=node('div','group-working-row'),stack=node('span','group-working-cluster');
    for(const m of members.slice(0,4))stack.append(face(m));
    row.append(stack,node('span','',`${members.length} bots ${members.every(m=>['running','queued'].includes(m.status))?'are working':'active'}`),dots());root.append(row);
    const actions=members.map(m=>({m,button:controls.get(m)})).filter(v=>v.button);
    if(actions.length){
      const details=node('details','group-working-controls'),summary=node('summary','','Manage tasks');details.append(summary);
      for(const {m,button}of actions){const item=node('div','group-working-row');item.append(node('span','group-working-label',m.name),button);details.append(item);}
      root.append(details);
    }
  }else for(const m of members){
    const row=node('div','group-working-row');
    const labels={queued:'queued',awaiting_approval:'waiting for approval',awaiting_user:'waiting for you',cancelling:'stopping',waiting:m.label||'waiting'};
    row.append(face(m),node('span','group-working-label',`${m.name} ${(labels[m.status]||(m.status==='running'&&m.label?m.label:'working')).replace(/^./,c=>c.toLowerCase())}`));
    if(m.status==='running'||m.status==='queued')row.append(dots());
    if(m.created){const timer=node('span','group-working-time',elapsed(Math.max(0,Date.now()/1000-m.created)));timer.dataset.groupStarted=m.created;row.append(timer);}
    const action=controls.get(m);if(action)row.append(action);
    root.append(row);
  }
  root.dataset.activitySignature+=JSON.stringify([...controls.values()].map(b=>b?[b.dataset.run,b.getAttribute('aria-label'),b.disabled]:null));
  return root;
}
// Polling rebuilds the strip. Text already on screen stays steady; only new or
// reworded entries fade in. The ticking elapsed time is not a change.
const TEXT='.group-working-label,.group-working-time,.group-working-dots,.group-working-row>span:not([class])';
function textKey(n){
  const row=n.closest('.group-working-row'),owner=row?.querySelector('[data-worker]')?.dataset.worker||(row?.closest('.group-working-controls')?'controls':'');
  return [owner,n.className,n.dataset.groupStarted??(n.classList.contains('group-working-dots')?'':n.textContent)].join('\n');
}
const sameFace=(a,b)=>a.dataset.profile!==undefined?a.dataset.profile===b.dataset.profile&&a.style.width===b.style.width:a.outerHTML===b.outerHTML;
export function transitionGroupActivity(previous,next,motion,track=()=>{}){
  const height=previous.getBoundingClientRect().height;
  const faces=new Map([...previous.querySelectorAll('[data-worker]')].map(n=>[n.dataset.worker,n]));
  const positions=new Map([...faces].map(([key,n])=>[key,n.getBoundingClientRect()]));
  const shown=new Set([...previous.querySelectorAll(TEXT)].map(textKey));
  for(const face of faces.values())for(const a of face.getAnimations())if(a.id==='group-worker')a.cancel();
  const expanded=previous.querySelector('.group-working-controls')?.open;
  previous.replaceChildren(...next.childNodes);if(expanded&&previous.querySelector('.group-working-controls'))previous.querySelector('.group-working-controls').open=true;previous.dataset.clustered=next.dataset.clustered;previous.dataset.activitySignature=next.dataset.activitySignature;
  previous.setAttribute('aria-label',next.getAttribute('aria-label'));
  // Keep each worker's avatar node so its live pose continues through the update.
  for(const n of previous.querySelectorAll('[data-worker]')){const old=faces.get(n.dataset.worker);if(old&&!old.isConnected&&sameFace(old,n)){old.title=n.title;n.replaceWith(old);}}
  if(!motion)return previous;
  // Animate faces from their actual cluster slots to their individual rows.
  const duration=280,easing='cubic-bezier(.2,.8,.2,1)';
  previous.getAnimations().forEach(a=>a.cancel());
  const end=previous.getBoundingClientRect().height;
  if(Math.abs(end-height)>=1)track(previous.animate([{height:height+'px'},{height:end+'px'}],{duration,easing}));
  for(const n of previous.querySelectorAll('[data-worker]')){
    const from=positions.get(n.dataset.worker),to=n.getBoundingClientRect();
    if(!from){track(n.animate([{opacity:0},{opacity:1}],{duration,easing,id:'group-worker'}));continue;}
    const dx=from.left-to.left,dy=from.top-to.top;
    if(Math.abs(dx)>=.5||Math.abs(dy)>=.5)track(n.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration,easing,id:'group-worker'}));
  }
  for(const n of previous.querySelectorAll(TEXT))if(!shown.has(textKey(n)))track(n.animate([{opacity:0},{opacity:1}],{duration,easing}));
  return previous;
}
