// Native-only projection of the retained page's collaboration metadata. Observe
// existing reads; never issue requests, retain transcripts, or cancel over HTTP.
(() => {
  if (window.top !== window.self || window.__kindredCollaboration) return;
  const documentID = crypto.randomUUID(), fetchPage = window.fetch.bind(window), versions = new Map(), waits = new Map();
  let bots = [], chats = [], runs = [], queued = false, last = '', hidden = false, signature = '', serial = 0;
  const empty = () => { signature = ''; return null; };
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160 ? value : null;
  const emit = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sync(); }); } };
  window.fetch = async function(input, options) {
    let path, version;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      const method = options?.method || input?.method || 'GET';
      if (method.toUpperCase() === 'GET' && url.origin === location.origin && /^\/api\/(bots|runs|chats(?:\/[^/]+)?)$/.test(url.pathname)) {
        path = url.pathname; version = (versions.get(path) || 0) + 1; versions.set(path, version);
      }
    } catch {}
    const response = await fetchPage(input, options);
    if (path && response.ok) response.clone().json().then(data => {
      if (versions.get(path) !== version) return;
      if (path === '/api/bots' && Array.isArray(data)) bots = data.slice(0,2000).filter(b => id(b.id)).map(b => ({id:b.id,name:String(b.name || '').slice(0,160)}));
      else if (path === '/api/chats' && Array.isArray(data)) chats = data.slice(0,2000).filter(c => id(c.id)).map(c => ({id:c.id,archived:!!c.archived,bot_only:!!c.bot_only}));
      else if (path === '/api/runs' && Array.isArray(data)) runs = data.slice(0,2000).filter(r => id(r.id)).map(r => ({id:r.id,bot_id:r.bot_id,chat_id:r.chat_id,status:r.status,created:Number(r.created)||0,
        delegation:r.delegation ? {requester_bot_id:r.delegation.requester_bot_id,source_chat_id:r.delegation.source_chat_id,resuming:!!r.delegation.resuming,waiting_on_bot_ids:(r.delegation.waiting_on_bot_ids || []).filter(id).slice(0,100)} : null}));
      else if (path.startsWith('/api/chats/')) {
        const chat = decodeURIComponent(path.slice('/api/chats/'.length));
        waits.delete(chat); waits.set(chat, (Array.isArray(data.pending_waits) ? data.pending_waits : []).slice(0,1000).filter(w => id(w.parent_run_id) && id(w.bot_id)).map(w => ({bot_id:w.bot_id,requester_bot_id:w.requester_bot_id,parent_run_id:w.parent_run_id})));
        if (waits.size > 24) waits.delete(waits.keys().next().value);
      }
      emit();
    }).catch(() => {});
    return response;
  };
  const unique = items => [...new Set(items)];
  function current() {
    if (hidden) return empty();
    const selected = document.querySelector('.bot-link.active[data-sidebar-id],.pinned-bot.active[data-sidebar-id]');
    const selectedID = selected?.dataset.sidebarId, botID = selected?.dataset.sidebarKind === 'bots' ? selectedID : selectedID?.startsWith('dm-') ? selectedID.slice(3) : null;
    const bot = bots.find(b => b.id === botID), heading = document.querySelector('#bot-details');
    if (!bot || heading?.disabled || heading?.querySelector('.participant-stack') || document.querySelector('#heading')?.textContent.trim() !== bot.name) return empty();
    const chatID = 'dm-' + bot.id, pending = waits.get(chatID) || [], known = pending.filter(w => w.requester_bot_id === bot.id && bots.some(b => b.id === w.bot_id));
    let label, runIDs, kind, groups = [];
    if (known.length) {
      label = 'Waiting on ' + unique(known.map(w => bots.find(b => b.id === w.bot_id).name)).join(', ');
      runIDs = unique(known.map(w => w.parent_run_id)); kind = 'waiting'; groups = [bot.id];
    } else {
      const run = runs.filter(r => r.bot_id === bot.id && r.delegation && ['queued','running','awaiting_user','awaiting_approval','completed'].includes(r.status) && (r.status !== 'completed' || r.delegation.waiting_on_bot_ids.length)).sort((a,b) => (a.status === 'queued') - (b.status === 'queued') || a.created - b.created)[0];
      if (run) {
        const requester = bots.find(b => b.id === run.delegation.requester_bot_id);
        const target = chats.find(c => c.id === run.delegation.source_chat_id && !c.archived && !c.bot_only) || chats.find(c => c.id === 'dm-' + requester?.id && !c.archived && !c.bot_only);
        kind = run.status === 'queued' && !run.delegation.resuming ? 'queued' : 'working';
        label = (kind === 'queued' ? 'Queued for ' : 'Working for ') + (requester && target ? requester.name : 'another bot');
        if (run.status === 'completed') { kind = 'waiting'; label += ' · waiting on ' + run.delegation.waiting_on_bot_ids.map(b => bots.find(item => item.id === b)?.name || 'a teammate').join(', '); }
        runIDs = [run.id];
      } else {
        const incoming = pending.filter(w => w.bot_id === bot.id && w.requester_bot_id !== bot.id);
        if (!incoming.length) return empty();
        const names = unique(incoming.map(w => bots.find(b => b.id === w.requester_bot_id)?.name || 'A teammate'));
        label = names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' waiting on you'; kind = 'waiting';
        runIDs = unique(incoming.map(w => w.parent_run_id)); groups = unique(incoming.map(w => w.requester_bot_id));
      }
    }
    const nextSignature = JSON.stringify([chatID,kind,label,runIDs.slice().sort()]);
    if (signature !== nextSignature) { signature = nextSignature; serial++; }
    const key = documentID + ':' + serial;
    // Prefer the owning task's handler. Mobile fallback groups retain the
    // existing parent-run cancellation behavior when no task is on this page.
    const buttons = unique(runIDs.map(run => document.querySelector('.work-stop[data-run="' + CSS.escape(run) + '"]')));
    const targets = buttons.every(Boolean) ? buttons : unique(groups.map(group => document.querySelector('.collaboration-wait[data-message="collaboration-wait-' + CSS.escape(group || '') + '"] .collaboration-stop')));
    const canInterrupt = targets.length > 0 && targets.every(button => button?.isConnected && !button.disabled);
    return {key,label:label.slice(0,200),kind,canInterrupt,targets};
  }
  function sync() {
    const state = current(), heading = document.querySelector('#bot-details'), title = document.querySelector('#heading');
    let caption = heading?.querySelector('.ios-collaboration-caption');
    if (state && title) {
      if (!caption) { caption = document.createElement('span'); caption.className = 'ios-collaboration-caption'; title.after(caption); }
      if (caption.textContent !== state.label) caption.textContent = state.label;
    } else caption?.remove();
    if (heading?.hasAttribute('data-ios-collaboration') !== !!state) heading?.toggleAttribute('data-ios-collaboration',!!state);
    const next = JSON.stringify(state && {key:state.key,label:state.label,kind:state.kind,canInterrupt:state.canInterrupt});
    if (next !== last) { last = next; dispatchEvent(new Event('kindred-collaboration')); }
  }
  window.__kindredCollaboration = {
    read() { const state = current(); return state && {key:state.key,label:state.label,kind:state.kind,canInterrupt:state.canInterrupt}; },
    interrupt(key) {
      const state = current();
      if (document.hidden || !state || state.key !== key || !state.canInterrupt || document.querySelector('dialog[open]')) return false;
      state.targets.forEach(button => button.click()); emit(); return true;
    }
  };
  const start = () => { new MutationObserver(emit).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','disabled','hidden']}); emit(); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded',start,{once:true}); else start();
  addEventListener('pagehide',() => {hidden = true; emit();});
  addEventListener('pageshow',() => {hidden = false; emit();});
})();
