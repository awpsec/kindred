// Files belong to their share event, not to the run's moving activity indicator.
export function transcriptAttachments(messages, runs, details, {hasBefore=false,hasAfter=false,directOrder=false}={}) {
  const rows=new Map(), projected=new Set();
  const candidates=[],runMap=new Map(runs.map(run=>[run.id,run]));
  for(const run of runs){
    const detail=details.get(run.id),events=new Map((detail?.events||[]).filter(e=>e.kind==='attachment'&&e.body?.id).map(e=>[e.body.id,e]));
    const result=messages.filter(m=>m.run_id===run.id&&m.kind==='result');
    const files=[...result.flatMap(m=>m.attachments||[]),...(detail?.attachments||[])];
    for(const file of files){
      if(!file.id)continue;
      const event=events.get(file.id),created=Number(event?.created||file.created||0);
      // Old persisted results can lack share dates/events. Preserve that fallback.
      if(!created&&result.length)continue;
      const candidate={file,run,event,hasResult:result.length>0,created:created||Number(run.created)||0};
      const existing=candidates.find(item=>item.file.id===file.id);
      if(!existing)candidates.push(candidate);
      else {
        const hasResult=existing.hasResult||candidate.hasResult;
        if(event&&(!existing.event||event.seq<existing.event.seq))Object.assign(existing,candidate);
        existing.hasResult=hasResult;
      }
    }
  }
  candidates.sort((a,b)=>a.created-b.created||(a.event&&b.event?a.event.seq-b.event.seq:0)||String(a.file.id).localeCompare(String(b.file.id)));
  for(const item of candidates){
    const {file,run,event,created}=item;
    projected.add(file.id);
    let slot=0;
    const user=m=>m.sender==='user'||m.mine===true;
    const prompt=messages.findIndex(m=>user(m)&&(m.run_id===run.id||m.delivery?.some(d=>d.run_id===run.id||d.into_run_id===run.id)));
    // Legacy results omit delivery metadata. Match only their originating prompt.
    const legacyPrompt=prompt<0?messages.findIndex(m=>user(m)&&m.created<=created&&m.text===run.prompt):-1;
    for(let i=0;i<messages.length;i++){
      const m=messages[i];
      // Direct chat queues are displayed by turn, even when the next prompt was
      // submitted earlier than this share. Keep files inside their owner's turn.
      const nextTurn=user(m)&&m.delivery?.length===1&&m.delivery[0];
      if(directOrder&&nextTurn&&nextTurn.bot_id===run.bot_id&&nextTurn.status!=='steered'&&!nextTurn.into_run_id&&nextTurn.run_id!==run.id&&
        (prompt>=0?m.seq>messages[prompt].seq:(runMap.get(nextTurn.run_id)?.created>run.created)))break;
      if(m.created<created){slot=i+1;continue;}
      if(m.created>created)break;
      // Event sequence disambiguates shares and assistant updates in one second.
      // A later user message with the same timestamp must not pull old files down.
      if(event&&m.run_id===run.id&&Number.isInteger(m.source_event_seq)){
        if(m.source_event_seq<event.seq)slot=i+1;else break;
      }else if(i===prompt||i===legacyPrompt)slot=i+1;
    }
    const firstTime=Math.min(...messages.map(m=>m.created)),lastTime=Math.max(...messages.map(m=>m.created));
    if(hasBefore&&messages.length&&(created<firstTime||(slot===0&&created===firstTime))){
      // A deep-linked result may be the only discoverable owner of older files.
      // Keep its downloads available until the original share is in this window.
      if(item.hasResult)projected.delete(file.id);
      continue;
    }
    if(hasAfter&&messages.length&&(created>lastTime||(slot===messages.length&&created===lastTime)))continue;
    const list=rows.get(slot)||[];list.push(item);rows.set(slot,list);
  }
  return {rows,projected};
}
