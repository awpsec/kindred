// Mobile presentation only: retain the server's message action closures.
// Bundled by iOS as well, so older servers receive the same gestures.
(() => {
  if (window.__kindredMobileMessages) return;
  const html = document.documentElement;
  const touchLayout = matchMedia('(pointer:coarse) and (hover:none)');
  const enabled = () => !window.__KINDRED_DESKTOP && (window.__KINDRED_MOBILE || touchLayout.matches);
  const native = () => window.__KINDRED_MOBILE && !!window.webkit?.messageHandlers?.kindredAccounts;
  const groups = '#content .message-group[data-message]';
  const targets = new Map(), actions = new Map();
  let targetSerial = 0, actionSerial = 0, gesture = null, menu = null, menuGroup = null, suppressClickUntil = 0;
  const post = value => window.webkit?.messageHandlers?.kindredAccounts?.postMessage(value);
  const interactive = 'a,button,input,textarea,select,[contenteditable=true],.message-reactions';
  const groupAt = target => {
    if (!enabled() || target.closest?.(interactive)) return null;
    const group = target.closest?.(groups);
    return group?.querySelector('.message-actions') && group.querySelector('.message-row')?.getClientRects().length ? group : null;
  };
  const keyFor = group => {
    if (!group.dataset.mobileMessageKey) group.dataset.mobileMessageKey = 'message-' + ++targetSerial;
    targets.clear(); targets.set(group.dataset.mobileMessageKey, group);
    return group.dataset.mobileMessageKey;
  };
  const closeMenu = () => {
    if (menu?.matches(':popover-open')) menu.hidePopover();
    menu?.remove(); menu = null; menuGroup = null;
  };
  const remember = (group, button, title, selected = false) => {
    const id = String(++actionSerial);
    actions.set(id, {group, button});
    return {id, title, selected};
  };
  const describe = key => {
    actions.clear();
    const group = targets.get(key);
    if (!enabled() || !group?.isConnected || !group.getClientRects().length || group.closest('[inert]')) return null;
    const controls = group.querySelector('.message-actions');
    const items = [];
    const react = controls?.querySelector('[data-message-action=react]');
    if (react) {
      react.click(); // Builds the server's emoji choices, without choosing one.
      const picker = document.querySelector('body>.message-action-menu.emoji-menu');
      const children = [...picker?.querySelectorAll('button') || []].map(button =>
        remember(group, button, button.textContent.trim() + ' ' + (button.getAttribute('aria-label') || ''), button.getAttribute('aria-checked') === 'true'));
      picker?.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
      if (children.length) items.push({title:'React', children});
    }
    for (const [action, title] of [['reply','Reply'], ['copy','Copy message'], ['edit','Edit queued message']]) {
      const button = controls?.querySelector(`[data-message-action=${action}]`);
      if (button && !button.disabled) items.push(remember(group, button, title));
    }
    return {items};
  };
  const perform = id => {
    const action = actions.get(id); actions.clear();
    // Rerendering or changing conversations invalidates every old action.
    if (enabled() && action?.group.isConnected && action.group.getClientRects().length && !action.group.closest('[inert]')) action.button.click();
  };
  window.__kindredMobileMessages = {describe, perform};

  const showMenu = group => {
    if (native()) return; // UIContextMenuInteraction owns the iOS press menu.
    closeMenu();
    const model = describe(keyFor(group)); if (!model?.items.length) return;
    menuGroup = group;
    menu = document.createElement('div'); menu.className = 'mobile-message-menu';
    menu.setAttribute('popover', 'auto'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Message options');
    const add = (item, parent, emoji = false) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = emoji ? item.title.split(' ')[0] : item.title;
      button.setAttribute('aria-label', item.title); button.setAttribute('role', emoji ? 'menuitemradio' : 'menuitem');
      if (emoji) button.setAttribute('aria-checked', String(item.selected));
      button.onclick = () => { closeMenu(); perform(item.id); };
      parent.append(button);
    };
    for (const item of model.items) {
      if (item.children) {
        const reactions = document.createElement('div'); reactions.className = 'mobile-message-emoji';
        reactions.setAttribute('role', 'group'); reactions.setAttribute('aria-label', 'React');
        item.children.forEach(child => add(child, reactions, true)); menu.append(reactions);
      } else add(item, menu);
    }
    const rect = group.querySelector('.message-row').getBoundingClientRect();
    document.body.append(menu); menu.showPopover();
    const box = menu.getBoundingClientRect(), height = visualViewport?.height || innerHeight;
    menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - box.width - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(rect.bottom + 8, height - box.height - 12))}px`;
    menu.querySelector('button')?.focus({preventScroll:true});
  };
  const clearTarget = () => { if (native()) post({action:'message-target-clear'}); };
  const endGesture = () => {
    if (gesture?.opened || gesture?.horizontal) suppressClickUntil = performance.now() + 500;
    if (gesture) clearTimeout(gesture.timer);
    gesture = null; html.removeAttribute('data-mobile-message-dragging');
    html.style.setProperty('--mobile-message-offset', '0px'); html.style.setProperty('--mobile-message-time-opacity', '0');
  };
  const initialize = () => {
    const style = document.createElement('style');
    style.textContent = `
      html[data-kindred-mobile-messages] #content .message-actions { display:none !important; }
      html[data-kindred-mobile-messages] #content .message-group { position:relative; }
      html[data-kindred-mobile-messages] #content .message-row.has-message-actions { flex-wrap:nowrap; gap:0; transform:translateX(var(--mobile-message-offset,0px)); transition:transform 160ms ease-out; }
      html[data-mobile-message-dragging] #content .message-row.has-message-actions { transition:none; }
      html[data-kindred-mobile-messages] #content .has-message-actions>:is(.message-bubble,.question-card) { max-width:88%; }
      html[data-kindred-mobile-messages] #content .message-bubble { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
      html[data-kindred-mobile-messages] #content .message-bubble a { -webkit-touch-callout:default; }
      html[data-kindred-mobile-messages] #content .message-row.has-message-actions { touch-action:pan-y; }
      html[data-kindred-mobile-messages] .mobile-message-time { position:absolute; right:0; top:50%; transform:translateY(-50%); color:var(--muted); font-size:11px; line-height:16px; font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none; opacity:var(--mobile-message-time-opacity,0); transition:opacity 160ms ease-out; }
      html:not([data-kindred-mobile-messages]) .mobile-message-time { display:none; }
      html[data-kindred-mobile-messages] body>.message-action-menu { display:none !important; }
      html[data-kindred-mobile-messages] .mobile-message-menu { position:fixed; inset:auto; margin:0; width:256px; max-width:calc(100% - 24px); padding:8px; color:var(--fg); background:color-mix(in srgb,var(--surface) 82%,transparent); border:1px solid var(--line); border-radius:24px; box-shadow:0 10px 36px #0004; -webkit-backdrop-filter:blur(24px) saturate(180%); backdrop-filter:blur(24px) saturate(180%); }
      .mobile-message-menu>button { display:block; width:100%; min-height:44px; text-align:left; padding:10px 14px; border-radius:14px; font-size:16px; }
      .mobile-message-emoji { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin-bottom:6px; }
      .mobile-message-emoji button { min-width:44px; min-height:44px; border-radius:14px; font-size:25px; }
      .mobile-message-menu button:is(:hover,:focus-visible,[aria-checked=true]) { background:var(--hover); }
      @media(prefers-reduced-motion:reduce) { html[data-kindred-mobile-messages] #content .message-row,html[data-kindred-mobile-messages] .mobile-message-time { transition:none; } }
      html[data-motion=off] #content .message-row,html[data-motion=off] .mobile-message-time { transition:none; }
    `;
    document.head.append(style);
    const updateMode = () => {
      html.toggleAttribute('data-kindred-mobile-messages', !!enabled());
      endGesture(); clearTarget(); closeMenu(); actions.clear();
    };
    touchLayout.addEventListener('change', updateMode); updateMode();
    const content = document.querySelector('#content'); if (!content) return;
    const stampMessages = () => {
      if (menuGroup && !menuGroup.isConnected) closeMenu();
      for (const group of content.querySelectorAll('.message-group[data-message]')) {
        const original = group.querySelector('.message-action-time');
        if (original && !group.querySelector(':scope>.mobile-message-time')) {
          const time = original.cloneNode(true); time.className = 'mobile-message-time';
          // Announce the timestamp through the message even when visually hidden.
          time.setAttribute('aria-hidden', 'true'); group.append(time);
          if (!group.hasAttribute('aria-description')) group.setAttribute('aria-description', original.getAttribute('aria-label') || original.textContent);
        }
      }
    };
    new MutationObserver(stampMessages).observe(content, {childList:true, subtree:true}); stampMessages();
    document.addEventListener('pointerdown', event => {
      const group = groupAt(event.target);
      if (!group || event.button !== 0) { clearTarget(); return; }
      if (native()) {
        const rect = group.querySelector('.message-row').getBoundingClientRect();
        post({action:'message-target', key:keyFor(group), rect:[rect.x,rect.y,rect.width,rect.height]});
      }
    }, true);
    document.addEventListener('contextmenu', event => {
      const group = groupAt(event.target); if (!group) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!gesture?.horizontal) showMenu(group);
    }, true);
    content.addEventListener('touchstart', event => {
      endGesture();
      const group = groupAt(event.target); if (!group || event.touches.length !== 1) return;
      const touch = event.touches[0];
      gesture = {id:touch.identifier, x:touch.clientX, y:touch.clientY, group, horizontal:false, opened:false};
      if (!native()) gesture.timer = setTimeout(() => {
        if (!gesture) return; gesture.opened = true; showMenu(group);
      }, 500);
    }, {passive:true});
    content.addEventListener('touchmove', event => {
      if (!gesture) return;
      const touch = [...event.touches].find(touch => touch.identifier === gesture.id);
      if (!touch || event.touches.length !== 1) { endGesture(); clearTarget(); return; }
      const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
      if (!gesture.horizontal && Math.hypot(dx,dy) > 10) {
        clearTimeout(gesture.timer);
        if (dx < -12 && Math.abs(dx) > Math.abs(dy)*1.4) {
          gesture.horizontal = true; closeMenu(); clearTarget();
        } else { endGesture(); clearTarget(); return; }
      }
      if (gesture?.horizontal) {
        if (event.cancelable) event.preventDefault();
        const distance = Math.min(80, Math.max(0,-dx));
        html.setAttribute('data-mobile-message-dragging', '');
        html.style.setProperty('--mobile-message-offset', `${-distance}px`);
        html.style.setProperty('--mobile-message-time-opacity', String(Math.min(1,distance/60)));
      }
    }, {passive:false});
    content.addEventListener('touchend', endGesture, {passive:true});
    content.addEventListener('touchcancel', endGesture, {passive:true});
    content.addEventListener('click', event => {
      // Suppress the trailing touch click, while allowing the source actions
      // invoked programmatically to build or execute a context menu.
      if (event.isTrusted && (gesture?.opened || gesture?.horizontal || performance.now() < suppressClickUntil)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    content.addEventListener('keydown', event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      const group = event.target.closest?.(groups); if (!enabled() || !group?.querySelector('.message-actions')) return;
      event.preventDefault(); if (!native()) showMenu(group);
    });
    document.addEventListener('scroll', () => { clearTarget(); if (!gesture?.horizontal) closeMenu(); }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { endGesture(); clearTarget(); closeMenu(); actions.clear(); } });
    window.addEventListener('resize', () => { endGesture(); clearTarget(); closeMenu(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
