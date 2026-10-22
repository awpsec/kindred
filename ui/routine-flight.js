// A request acknowledgement is not a completed routine. Keep flights outside
// transient buttons so every surface agrees while the backend run catches up.
const active = new Set(['queued','running','awaiting_user','awaiting_approval','cancelling']);
const labels = {queued:'Queued',running:'Running',awaiting_user:'Waiting for you',awaiting_approval:'Waiting for approval',cancelling:'Stopping'};
export function createRoutineFlights({scope,post,read,changed=()=>{},failed=()=>{},cooldownMs=3000,reconcileMs=1500,attempts=3,timeoutMs=20000}) {
  let account,sequence=0,installed=0,flights=new Map(),snapshots=new Map();
  const key=r=>JSON.stringify([r.bot_id,r.id]);
  function current(){const next=scope();if(next!==account){for(const f of flights.values()){clearTimeout(f.timer);f.controller?.abort();}account=next;flights=new Map();snapshots=new Map();}return next;}
  function emit(){changed();}
  function view(r){current();const f=flights.get(key(r)),run=snapshots.get(key(r))?.last_run||r.last_run;
    const phase=(f&&f.phase!=='idle'?f.phase:null)|| (active.has(run?.status)?run.status:'idle');
    const outcome=phase==='idle'?({completed:'Last run completed',failed:'Last run failed',interrupted:'Last run interrupted',cancelled:'Last run cancelled'}[run?.status]||''):'';
    return {phase,blocked:phase!=='idle',label:labels[phase]||({awaiting:'Requesting…',reconciling:'Checking run…',cooldown:'Please wait…'}[phase]||outcome),error:f?.error||(phase==='idle'?run?.error:'')||'',runId:f?.runId||run?.id};}
  function settle(f,error=''){clearTimeout(f.timer);f.phase='cooldown';f.error=error;if(error)failed(error);emit();f.timer=setTimeout(()=>{if(flights.get(f.key)!==f)return;f.phase='idle';emit();},cooldownMs);}
  function beginRead(){current();return {account,sequence:++sequence};}
  function observe(rows,stamp=beginRead()){current();if(stamp.account!==account||stamp.sequence<installed)return;installed=stamp.sequence;for(const r of rows){const k=key(r);snapshots.set(k,r);const f=flights.get(k),run=r.last_run;if(!f||!run||f.phase==='awaiting')continue;
    // Another client or the scheduler can replace last_run before this tab
    // observes our run's terminal snapshot. Follow that authoritative successor.
    const successor=f.observed&&run.id!==f.runId&&(!f.created||!run.created||run.created>=f.created);
    if((f.runId&&run.id===f.runId)||(!f.runId&&run.id&&run.id!==f.previous)||successor){
      f.runId=run.id;f.created=run.created;f.observed=true;
      if(active.has(run.status)){clearTimeout(f.timer);f.phase=run.status;f.error='';}else if(f.phase!=='cooldown'&&f.phase!=='idle')settle(f);
    }
  }emit();}
  async function bounded(f,action){const controller=new AbortController();f.controller=controller;const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await action(controller.signal);}finally{clearTimeout(timer);if(f.controller===controller)f.controller=null;}}
  async function reconcile(f,n=0){if(flights.get(f.key)!==f||scope()!==f.account)return;
    try{const stamp=beginRead(),rows=await bounded(f,signal=>read(signal));if(scope()!==f.account||flights.get(f.key)!==f)return;observe(rows,stamp);
      if(['awaiting','reconciling'].includes(f.phase)){if(n+1<attempts)f.timer=setTimeout(()=>void reconcile(f,n+1),reconcileMs);else settle(f,'The request was accepted, but its run is not visible yet. Check task activity before trying again.');}
    }catch(e){if(scope()===f.account&&flights.get(f.key)===f&&['awaiting','reconciling'].includes(f.phase))settle(f,'Could not check this run. '+(e.message||'Try refreshing.'));}
  }
  async function run(r){const owner=current();if(view(r).blocked)return false;const k=key(r),f={key:k,account:owner,phase:'awaiting',previous:r.last_run?.id,error:''};flights.set(k,f);emit();
    try{const result=await bounded(f,signal=>post(r,signal));if(scope()!==owner||flights.get(k)!==f)return false;f.runId=result?.run_id;f.phase='reconciling';emit();void reconcile(f);return true;}
    catch(e){if(scope()===owner&&flights.get(k)===f)settle(f,'Run request could not be confirmed. Check task activity before trying again. '+(e.message||''));return false;}
  }
  return {view,observe,run,beginRead};
}
