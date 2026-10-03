// Native presentation of server actions. Session storage and origin enforcement belong to WebSession.
(() => {
  const html = document.documentElement;
  if (!window.__KINDRED_MOBILE || html.dataset.kindredIos) return;
  html.dataset.kindredIos = 'true';
  html.dataset.mobile = 'true';
  const shell = document.querySelector('#app');
  const header = document.querySelector('.conversation-header');
  if (!shell || !header) return;
  // WebKit owns keyboard avoidance; use the visible viewport exactly once.
  // Fixing the root prevents focus from scrolling the entire chat off screen.
  const updateViewport = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    html.style.setProperty('--ios-viewport-height', `${height}px`);
    html.toggleAttribute('data-ios-short-viewport', height <= 180);
  };
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.addEventListener('resize', updateViewport);
  updateViewport();
  const compact = matchMedia('(max-width:760px), (max-height:500px)');
  const menu = document.querySelector('#mobile-menu');
  const sidebar = shell.querySelector('.sidebar');
  const conversation = shell.querySelector('.conversation');
  // UIKit owns conversation context menus. Preserve the server's action
  // closures so permissions, current pin state and mute choices stay authoritative.
  const rowSelector = '.sidebar .nav-entry, .sidebar .pinned-entry';
  const nativeActions = new Map();
  let menuGeneration = 0;
  const rowKey = row => {
    const control = row?.querySelector('[data-sidebar-id]');
    return control ? `${control.dataset.sidebarKind}:${control.dataset.sidebarId}` : null;
  };
  document.addEventListener('pointerdown', event => {
    const row = event.target.closest?.(rowSelector);
    if (!row || sidebar?.inert || event.button !== 0) return;
    const rect = row.getBoundingClientRect();
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'conversation-target',
      key:rowKey(row),rect:[rect.x,rect.y,rect.width,rect.height]});
    // Desktop pin drag captures the pointer and disables horizontal scrolling.
    // On iOS the same press belongs to the native menu, including pinned cards.
    if (row.matches('.pinned-entry')) event.stopImmediatePropagation();
  },true);
  document.addEventListener('contextmenu', event => {
    if (!event.target.closest?.(rowSelector)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  },true);
  document.addEventListener('scroll', () => {
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'conversation-target-clear'});
  },true);
  window.__kindredConversationMenu = {
    describe(key) {
      nativeActions.clear();
      const row = [...document.querySelectorAll(rowSelector)].find(row => rowKey(row) === key);
      if (!row || sidebar?.inert || !row.getClientRects().length) return null;
      row.querySelector('.nav-more')?.click();
      const menu = document.querySelector('body > .chat-context-menu');
      if (!menu) return null;
      const generation = ++menuGeneration;
      const leaf = button => {
        const id = `${generation}-${nativeActions.size}`;
        nativeActions.set(id, {key,button});
        return {title:button.textContent.trim(),id};
      };
      const items = [...menu.children].filter(child => child.matches('button')).map(button => {
        if (button.getAttribute('aria-haspopup') !== 'menu') return leaf(button);
        button.click(); // Creates the submenu; never invokes a conversation action.
        const submenu = [...menu.querySelectorAll('.conversation-submenu')].find(sub => sub._trigger === button);
        return {title:button.textContent.trim(),children:[...submenu?.querySelectorAll('button') || []].map(leaf)};
      });
      menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      return {items};
    },
    perform(id) {
      const action = nativeActions.get(id);
      nativeActions.clear();
      if (action && [...document.querySelectorAll(rowSelector)].some(row => rowKey(row) === action.key)) action.button.click();
    },
  };
  const icon = path => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  if (menu) {
    menu.innerHTML = icon('<path d="m14 5-7 7 7 7"/>');
    menu.setAttribute('aria-label', 'Back to conversations');
    menu.title = 'Conversations';
  }
  const accounts = document.createElement('button');
  accounts.id = 'ios-accounts';
  accounts.type = 'button';
  accounts.className = 'icon-button';
  accounts.setAttribute('aria-label', 'Settings');
  accounts.title = 'Settings';
  accounts.textContent = 'You';
  accounts.onclick = () => document.querySelector('#settings-button')?.click();
  const top = sidebar?.querySelector('.sidebar-top');
  top?.prepend(accounts);
  const more = document.createElement('button');
  more.id = 'ios-library-more';
  more.type = 'button';
  more.className = 'icon-button';
  more.setAttribute('aria-label', 'More');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-controls', 'ios-library-menu');
  more.setAttribute('aria-expanded', 'false');
  more.innerHTML = icon('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>');
  accounts.after(more);
  const libraryMenu = document.createElement('div');
  libraryMenu.id = 'ios-library-menu';
  libraryMenu.setAttribute('popover', 'auto');
  libraryMenu.setAttribute('role', 'menu');
  libraryMenu.setAttribute('aria-label', 'More');
  // Keep the original navigation entries in place: the Artifacts workspace
  // reuses its entry as the return-to-Chats action while it is open.
  for (const [id, label, path] of [
    ['artifacts-button', 'Artifacts', '<path d="M3 7h7l2 2h9v11H3z"/>'],
    ['marketplace-button', 'Marketplace', '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"/>'],
  ]) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.innerHTML = icon(path);
    const text = document.createElement('span');
    text.textContent = label;
    item.append(text);
    item.onclick = () => {
      libraryMenu.hidePopover();
      document.getElementById(id)?.click();
    };
    libraryMenu.append(item);
  }
  sidebar?.append(libraryMenu);
  const positionLibraryMenu = () => {
    if (!libraryMenu.matches(':popover-open')) return;
    const anchor = more.getBoundingClientRect();
    libraryMenu.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - libraryMenu.offsetWidth - 12))}px`;
    libraryMenu.style.top = `${anchor.bottom + 8}px`;
  };
  more.onclick = () => {
    libraryMenu.togglePopover();
    positionLibraryMenu();
  };
  libraryMenu.addEventListener('toggle', event => more.setAttribute('aria-expanded', String(event.newState === 'open')));
  libraryMenu.addEventListener('keydown', event => {
    const items = [...libraryMenu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  more.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      libraryMenu.showPopover();
      positionLibraryMenu();
      libraryMenu.querySelector('button')?.focus();
    }
  });
  window.addEventListener('resize', positionLibraryMenu);
  const search = document.createElement('button');
  search.id = 'ios-search';
  search.type = 'button';
  search.className = 'icon-button';
  search.setAttribute('aria-label', 'Search conversations');
  search.setAttribute('aria-expanded', 'false');
  search.innerHTML = icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');
  top?.insertBefore(search, document.querySelector('#new-bot'));
  search.onclick = () => {
    sidebar.classList.toggle('ios-searching');
    search.setAttribute('aria-expanded', String(sidebar.classList.contains('ios-searching')));
    if (sidebar.classList.contains('ios-searching')) document.querySelector('#search')?.focus();
    else {
      const input = document.querySelector('#search');
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); }
    }
  };
  const settings = document.querySelector('#settings-dialog');
  const settingsHeader = document.createElement('div');
  settingsHeader.className = 'ios-settings-header';
  const settingsClose = document.createElement('button');
  settingsClose.type = 'button';
  settingsClose.className = 'icon-button';
  settingsClose.setAttribute('aria-label', 'Close settings sheet');
  settingsClose.innerHTML = icon('<path d="m6 6 12 12M18 6 6 18"/>');
  settingsClose.onclick = () => document.querySelector('#settings-close')?.click();
  const accountEntry = document.createElement('button');
  accountEntry.id = 'ios-settings-account';
  accountEntry.type = 'button';
  accountEntry.setAttribute('aria-label', 'Manage accounts');
  const accountInitial = document.createElement('span');
  accountInitial.className = 'ios-account-initial';
  const accountCopy = document.createElement('span');
  accountCopy.className = 'ios-account-copy';
  const accountName = document.createElement('strong');
  const accountCaption = document.createElement('span');
  accountCaption.textContent = 'Accounts and servers';
  accountCopy.append(accountName, accountCaption);
  const accountChevron = document.createElement('span');
  accountChevron.innerHTML = icon('<path d="m9 5 7 7-7 7"/>');
  accountEntry.append(accountInitial, accountCopy, accountChevron);
  accountEntry.onclick = () => window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'open'});
  settingsHeader.append(settingsClose, accountEntry);
  settings?.prepend(settingsHeader);
  // The sheet is a destination from the list; dismissing it returns there.
  // A downward pull at the top dismisses it without interfering with content scrolling.
  let sheetPull;
  settingsHeader.addEventListener('touchstart', event => { sheetPull = event.touches[0]?.clientY; }, {passive:true});
  settingsHeader.addEventListener('touchend', event => {
    if (sheetPull !== undefined && event.changedTouches[0]?.clientY - sheetPull > 80) settingsClose.click();
    sheetPull = undefined;
  }, {passive:true});
  const avatar = document.querySelector('#user-avatar');
  const updateAccount = () => {
    const initial = avatar?.textContent.trim() || 'You';
    accounts.textContent = initial;
    accountInitial.textContent = initial;
    accountName.textContent = document.querySelector('#identity-name')?.textContent.trim() || 'Your account';
  };
  if (avatar) new MutationObserver(updateAccount).observe(avatar, {subtree:true, childList:true, characterData:true});
  const identityName = document.querySelector('#identity-name');
  if (identityName) new MutationObserver(updateAccount).observe(identityName, {subtree:true, childList:true, characterData:true});
  updateAccount();
  const computer = document.querySelector('#computer-panel');
  if (computer) {
    const back = document.createElement('button');
    back.id = 'ios-computer-back';
    back.className = 'icon-button';
    back.type = 'button';
    back.setAttribute('aria-label', 'Back to chat');
    back.innerHTML = icon('<path d="m14 5-7 7 7 7"/>');
    back.onclick = () => document.querySelector('#computer-close')?.click();
    computer.querySelector('.panel-header')?.prepend(back);
    const controls = document.createElement('section');
    controls.className = 'ios-computer-controls';
    controls.setAttribute('aria-label', 'Computer controls and resources');
    for (const child of [...computer.children]) {
      if (!child.matches('.panel-header, #desktop')) controls.append(child);
    }
    computer.append(controls);
  }
  function updateNavigation() {
    const railClasses = ['sidebar-rail', 'sidebar-fading', 'sidebar-peek'];
    if (compact.matches && railClasses.some(name => shell.classList.contains(name))) shell.classList.remove(...railClasses);
    const open = shell.classList.contains('sidebar-open');
    menu?.setAttribute('aria-expanded', String(open));
    if (sidebar) sidebar.inert = compact.matches && !open;
    if (sidebar?.inert && libraryMenu.matches(':popover-open')) libraryMenu.hidePopover();
    if (conversation) conversation.inert = compact.matches && open;
  }
  compact.addEventListener('change', updateNavigation);
  new MutationObserver(updateNavigation).observe(shell, {attributes:true, attributeFilter:['class']});
  updateNavigation();
  function updateEnvironment(value) {
    if (!value) return;
    html.dataset.iosSlab = String(value.isSlab === true);
    html.style.setProperty('--ios-safe-bottom', `${Math.max(0, Number(value.bottomInset) || 0)}px`);
  }
  window.addEventListener('kindred-ios-layout', event => updateEnvironment(event.detail));
  updateEnvironment(window.__KINDRED_IOS_LAYOUT);
  // Floating controls share the message viewport. Reserve their measured sizes,
  // including attachments/replies and keyboard/rotation changes, for scroll ends.
  const composerArea = document.querySelector('#composer-area');
  const updateClearance = () => {
    const top = header.getBoundingClientRect().height;
    const bottom = composerArea?.hidden ? 0 : composerArea?.getBoundingClientRect().height || 0;
    conversation.style.setProperty('--ios-chat-top', `${top}px`);
    conversation.style.setProperty('--ios-chat-bottom', `${bottom}px`);
  };
  const clearanceObserver = new ResizeObserver(updateClearance);
  clearanceObserver.observe(header);
  if (composerArea) clearanceObserver.observe(composerArea);
  updateClearance();

  // The store manages the installed app. Keep both version labels, with no
  // browser/server updater or desktop speech controls exposed on this device.
  const settingsContent = document.querySelector('#settings-content');
  const adaptDeviceSettings = () => {
    for (const version of settingsContent?.querySelectorAll('[data-client-version]') || []) {
      const value = window.__KINDRED_IOS_APP_VERSION || 'iOS app';
      if (version.textContent !== value) version.textContent = value;
      const label = version.closest('.setting-row')?.querySelector('.setting-label');
      if (label && label.textContent !== 'iOS app on this device') label.textContent = 'iOS app on this device';
    }
  };
  if (settingsContent) new MutationObserver(adaptDeviceSettings).observe(settingsContent, {subtree:true, childList:true, characterData:true});
  adaptDeviceSettings();
  // Clear a stale desktop multiline measurement after the draft becomes empty.
  document.addEventListener('input', event => {
    const editor = event.target;
    if (editor.id === 'prompt' && !(editor.value ?? editor.innerText ?? '').trim()) {
      document.querySelector('#composer')?.classList.remove('is-multiline');
    }
  });
  // Older servers install desktop select listeners on the real <select>. Stop
  // those listeners, leaving the browser's default iOS picker and change event.
  for (const type of ['mousedown', 'click', 'keydown']) {
    document.addEventListener(type, event => {
      if (event.target instanceof HTMLSelectElement) event.stopImmediatePropagation();
    }, true);
  }
  let launchReadySent = false;
  const markLaunchReady = () => {
    if (launchReadySent) return;
    launchReadySent = true;
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'launch-ready'});
  };
  const checkLoadedRows = () => { if (sidebar.querySelector('.bot-link,.pinned-bot')) markLaunchReady(); };
  new MutationObserver(checkLoadedRows).observe(sidebar, {childList:true, subtree:true});
  checkLoadedRows();
  let lastAppearance = '', themePreference;
  // Observe existing settings and chat responses without extra requests.
  // The original response still goes to the server UI unchanged.
  const fetch = window.fetch;
  window.fetch = function (...args) {
    return fetch.apply(this, args).then(response => {
      if (response.ok && response.url === new URL('/api/chats', location.origin).href) {
        // Include an empty account, after the server UI consumes the response.
        response.clone().json().then(() => requestAnimationFrame(() => requestAnimationFrame(markLaunchReady))).catch(() => {});
      }
      if (response.ok && response.url === new URL('/api/settings', location.origin).href) {
        response.clone().json().then(value => {
          if (['system', 'dark', 'light'].includes(value.theme)) {
            themePreference = value.theme;
            updateAppearance();
          }
        }).catch(() => {});
      }
      return response;
    });
  };
  document.addEventListener('change', event => {
    const select = event.target;
    if (select instanceof HTMLSelectElement && ['system', 'dark', 'light'].every(value => [...select.options].some(option => option.value === value))) {
      themePreference = select.value;
      updateAppearance();
    }
  });
  function updateAppearance() {
    const color = getComputedStyle(document.body).backgroundColor;
    const rgb = color.match(/^rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/)?.slice(1).map(Number);
    const appearance = `${color}:${themePreference}`;
    if (!rgb || appearance === lastAppearance) return;
    lastAppearance = appearance;
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'appearance', rgb, followsSystem:themePreference === 'system', appearanceKnown:themePreference !== undefined});
  }
  new MutationObserver(updateAppearance).observe(html, {attributes:true, attributeFilter:['data-theme', 'class', 'style']});
  updateAppearance();
  // Hand navigation to the page before slow fonts/images finish loading.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
})();
