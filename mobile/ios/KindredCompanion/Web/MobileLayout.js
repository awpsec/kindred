// Native presentation of server actions. Session storage and origin enforcement belong to WebSession.
(() => {
  const html = document.documentElement;
  if (!window.__KINDRED_MOBILE || html.dataset.kindredIos) return;
  html.dataset.kindredIos = 'true';
  html.dataset.mobile = 'true';
  // This is an app interface with its own text-size setting. Respect fixed
  // page scale in WKWebView so double taps and pinches cannot zoom the shell.
  // Leave Safari and embedded computer/document content's own gestures alone.
  const viewport = document.querySelector('meta[name=viewport]') || document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
  if (!viewport.isConnected) document.head.append(viewport);
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
  const statusBlur = document.createElement('div');
  statusBlur.id = 'ios-status-blur'; statusBlur.setAttribute('aria-hidden','true');
  document.body.append(statusBlur);
  // Editing message/artifact source is a desktop workflow. Preserve reply,
  // copy, reactions, previews and metadata controls in the iOS app.
  const desktopEditControl = '[data-message-action="edit"],.artifact-workbench-actions button[aria-label^="Edit "],.artifact-workbench-actions button[aria-label="Finish editing"],.workspace-artifact-actions>button:first-child';
  document.addEventListener('click', event => {
    const action = event.target.closest?.('button');
    const teaching = action?.id === 'teach-task' || (action?.closest('#composer-menu') && action.textContent.trim() === 'Teach a task');
    if (!teaching && !event.target.closest?.(desktopEditControl)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  if (window.__kindredMobileMessages) {
    const describe = window.__kindredMobileMessages.describe;
    window.__kindredMobileMessages.describe = key => {
      const model = describe(key);
      return model ? {...model,items:model.items.filter(item => item.title !== 'Edit queued message')} : model;
    };
  }
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
  // Artifacts retain the server's editor/save closures, but navigate as two
  // pages on iOS. Returning to the list never destroys an in-progress editor.
  const artifactPages = new Map();
  const artifactRouteEvent = 'kindred-ios-artifact-route';
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      // open() reports the route both before and after fetching. A late fetch
      // must not pull someone back into a document they just left for the list.
      const path = args[2] == null ? null : new URL(String(args[2]), location.href).pathname;
      if (path && location.pathname === '/artifacts' && [...artifactPages.values()].some(page => page.ignoredRoute === path)) return;
      const result = Reflect.apply(original, this, args);
      window.dispatchEvent(new Event(artifactRouteEvent));
      return result;
    };
  }
  const artifactDocumentRoute = () => /^\/artifacts\/[^/]+\/?$/.test(location.pathname) || new URLSearchParams(location.hash.slice(1)).has('artifact');
  const artifactButton = (label, path) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'icon-button ios-artifact-button';
    button.setAttribute('aria-label', label); button.title = label;
    button.innerHTML = icon(path);
    return button;
  };
  const mountArtifacts = root => {
    if (artifactPages.has(root)) return;
    const library = root.querySelector('.artifact-studio-library');
    const workbench = root.querySelector('.artifact-workbench');
    const toolbar = root.querySelector('.artifact-workbench-header');
    const input = root.querySelector('.artifact-studio-library-search');
    const create = root.querySelector('.artifact-add');
    const brand = root.querySelector('.artifact-studio-library-brand');
    if (!library || !workbench || !toolbar || !input || !create || !brand) return;
    const nav = document.createElement('header'); nav.className = 'ios-artifact-navigation';
    const chats = artifactButton('Back to chats', '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-5a9 9 0 0 1-.9-4 8.4 8.4 0 0 1 8.5-9H13a8.4 8.4 0 0 1 8 8z"/>');
    chats.onclick = () => brand.click(); // Includes the server's unsaved-edit guard.
    const find = artifactButton('Search artifacts', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>');
    find.setAttribute('aria-expanded', 'false');
    find.onclick = () => {
      const searching = library.classList.toggle('ios-artifact-searching');
      find.setAttribute('aria-expanded', String(searching));
      if (searching) input.focus();
      else { input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); }
    };
    create.classList.add('ios-artifact-button');
    create.innerHTML = icon('<path d="M12 5v14M5 12h14"/>');
    nav.append(chats, find, create);
    // Keep the existing type chooser and its action closures next to +.
    const addMenu = root.querySelector('.artifact-add-menu');
    if (addMenu) nav.append(addMenu);
    library.prepend(nav);
    const back = artifactButton('Back to artifacts', '<path d="m14 5-7 7 7 7"/>');
    const page = {ignoredRoute:null, show:null, dispose:null};
    const show = documentView => {
      root.dataset.iosArtifactView = documentView ? 'document' : 'list';
      library.inert = documentView; workbench.inert = !documentView;
    };
    back.onclick = () => {
      page.ignoredRoute = location.pathname;
      history.pushState({}, '', '/artifacts');
      show(false);
      library.querySelector('.artifact-studio-library-item.selected')?.focus({preventScroll:true});
    };
    // The server rebuilds the document toolbar when refreshing a preview.
    const placeBack = () => { if (back.parentElement !== toolbar) toolbar.prepend(back); };
    const toolbarObserver = new MutationObserver(placeBack);
    toolbarObserver.observe(toolbar, {childList:true}); placeBack();
    library.addEventListener('click', event => {
      const row = event.target.closest('.artifact-studio-library-item');
      if (!row || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      page.ignoredRoute = null;
      if (row.getAttribute('aria-current') !== 'page') return;
      // Reopening the selected document retains its current preview.
      event.preventDefault(); event.stopImmediatePropagation();
      history.pushState({}, '', '/artifacts/' + encodeURIComponent(row.dataset.artifactId));
      show(true);
    }, true);
    page.show = show; page.dispose = () => toolbarObserver.disconnect();
    artifactPages.set(root, page);
    show(artifactDocumentRoute());
  };
  const syncArtifacts = () => {
    for (const [root, page] of artifactPages) {
      if (!root.isConnected) { page.dispose(); artifactPages.delete(root); }
    }
    shell.querySelectorAll('.artifact-studio').forEach(mountArtifacts);
  };
  new MutationObserver(syncArtifacts).observe(shell, {childList:true});
  const syncArtifactPage = () => {
    for (const page of artifactPages.values()) page.show(artifactDocumentRoute());
  };
  window.addEventListener(artifactRouteEvent, syncArtifactPage);
  window.addEventListener('popstate', syncArtifactPage);
  window.addEventListener('hashchange', syncArtifactPage);
  syncArtifacts();
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
  // Keep pause reminders in one compact place above the composer. Reuse the
  // server's return buttons so bot identity, pause IDs and errors stay intact.
  const controlNotice = document.querySelector('#control-notice');
  const queueStatus = document.querySelector('#queue-status');
  const composerHost = document.querySelector('#composer-area');
  if (controlNotice && queueStatus && composerHost) {
    composerHost.prepend(controlNotice);
    const returnIcon = icon('<path d="m10 5-7 7 7 7"/><path d="M3 12h12a6 6 0 0 1 6 6"/>');
    const adaptControlNotice = () => {
      const queueAction = queueStatus.querySelector('button');
      queueStatus.classList.toggle('ios-control-paused', !!queueAction);
      const duplicate = queueAction && !controlNotice.hidden && [...controlNotice.querySelectorAll('.control-notice-row button')]
        .some(action => action.getAttribute('aria-label') === queueAction.getAttribute('aria-label') ||
          action.getAttribute('aria-label') === 'Return control to ' + document.querySelector('#heading')?.textContent.trim());
      queueStatus.classList.toggle('ios-control-duplicate', !!duplicate);
      if (queueAction) {
        if (!queueAction.hasAttribute('aria-label')) queueAction.setAttribute('aria-label', 'Return control');
        let copy = queueStatus.querySelector('.ios-control-copy');
        if (!copy) { copy = document.createElement('span'); copy.className = 'ios-control-copy'; queueStatus.prepend(copy); }
        const queued = [...queueStatus.children].find(child => child.matches('span:not(.ios-control-copy)'))?.textContent.match(/^\d+ messages? queued/);
        const label = 'Computer paused' + (queued ? ' · ' + queued[0] : '');
        if (copy.textContent !== label) copy.textContent = label;
      } else queueStatus.querySelector('.ios-control-copy')?.remove();
      for (const action of [...controlNotice.querySelectorAll('.control-notice-row button'), ...(queueAction ? [queueAction] : [])]) {
        if (!action.querySelector('svg')) action.insertAdjacentHTML('beforeend', returnIcon);
      }
    };
    const pauseObserver = new MutationObserver(adaptControlNotice);
    for (const source of [controlNotice,queueStatus]) pauseObserver.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
    adaptControlNotice();
  }
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
    const toolbar = controls.querySelector('.desktop-toolbar');
    const paste = document.querySelector('#desktop-paste');
    if (paste && toolbar) {
      paste.setAttribute('aria-label','Paste'); paste.title = 'Paste';
      toolbar.prepend(paste);
    }
    // A remote canvas cannot advertise its text fields to iOS. Keep a real
    // native text input focused while forwarding text to noVNC's keyboard.
    const input = document.createElement('textarea');
    input.id = 'ios-computer-input'; input.setAttribute('aria-label', 'Type on bot computer');
    input.autocapitalize = 'off'; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('autocorrect', 'off'); input.tabIndex = -1;
    computer.append(input);
    const sentinel = '\u200b';
    const resetInput = () => { input.value = sentinel; input.setSelectionRange(1,1); };
    let composing = false;
    const canvas = () => computer.classList.contains('is-controlling') && !computer.hidden
      ? computer.querySelector('.desktop-canvas canvas') : null;
    const sendKey = (type, key, code = 'Unidentified', modifiers = {}) => {
      canvas()?.dispatchEvent(new KeyboardEvent(type, {key,code,bubbles:true,cancelable:true,...modifiers}));
    };
    const sendText = () => {
      for (const character of input.value.replace(sentinel,'')) {
        sendKey('keydown', character === '\n' ? 'Enter' : character);
      }
      resetInput();
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; sendText(); });
    input.addEventListener('input', () => { if (!composing) sendText(); });
    input.addEventListener('beforeinput', event => {
      if (!composing && event.inputType.startsWith('delete')) {
        event.preventDefault(); sendKey('keydown','Backspace'); resetInput();
      }
    });
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.key === 'Unidentified' || event.key === 'Process') return;
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      event.preventDefault(); event.stopPropagation();
      sendKey('keydown',event.key,event.code,{ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey,shiftKey:event.shiftKey});
    });
    input.addEventListener('keyup', event => {
      if (event.isComposing) return;
      sendKey('keyup',event.key,event.code); event.stopPropagation();
    });
    const keyboardState = () => {
      const active = document.activeElement === input;
      computer.classList.toggle('ios-keyboard-active',active);
    };
    input.addEventListener('focus',keyboardState); input.addEventListener('blur',keyboardState);
    let awaitingControl = false, controlTimeout, hadControl = false;
    // Focus during the user's tap, before the asynchronous takeover request;
    // iOS won't summon its keyboard from a later network callback alone.
    document.querySelector('#take-control')?.addEventListener('click', event => {
      if (event.currentTarget.disabled) return;
      clearTimeout(controlTimeout);
      if (canvas()) { awaitingControl = false; input.blur(); return; }
      awaitingControl = true; resetInput(); input.focus({preventScroll:true});
      controlTimeout = setTimeout(() => { awaitingControl = false; if (!canvas()) input.blur(); },35000);
    },true);
    // Remote clicks may focus the canvas; restore native entry after the click.
    let restoreKeyboard = false;
    computer.addEventListener('pointerdown', event => {
      if (event.target.matches('.desktop-canvas canvas')) restoreKeyboard = computer.classList.contains('ios-keyboard-active');
    },true);
    computer.addEventListener('pointerup', event => {
      if (event.target.matches('.desktop-canvas canvas') && restoreKeyboard && canvas()) input.focus({preventScroll:true});
      restoreKeyboard = false;
    });
    const updateControl = () => {
      const controlling = !!canvas();
      if (controlling) {
        awaitingControl = false; clearTimeout(controlTimeout);
        if (!hadControl) {
          resetInput(); input.focus({preventScroll:true});
          window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'computer-keyboard'});
        }
      } else if ((!awaitingControl || computer.hidden) && document.activeElement === input) {
        awaitingControl = false; clearTimeout(controlTimeout); input.blur();
      }
      hadControl = controlling;
      const screen = computer.querySelector('.desktop-canvas canvas');
      if (screen?.width > 0 && screen?.height > 0) computer.style.setProperty('--ios-screen-ratio',screen.width / screen.height);
    };
    new MutationObserver(updateControl).observe(computer,{attributes:true,attributeFilter:['class','hidden','width','height'],childList:true,subtree:true});
    updateControl();
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
    html.style.setProperty('--ios-safe-top', `${Math.max(0, Number(value.topInset) || 0)}px`);
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
  // Adapt action menus at their presentation boundary. Keep the server's
  // closures, but never render its hover menus/flyouts in the native app.
  const actionMenuSelector = '[role="menu"],#new-menu,.deliverable-menu,.avatar-popover';
  const menuActions = new Map();
  let actionMenuSerial = 0, lastMenuSource = null;
  const menuContext = () => `${location.pathname}:${document.querySelector('#heading')?.textContent || ''}`;
  for (const type of ['pointerdown', 'click', 'contextmenu', 'keydown']) {
    document.addEventListener(type, event => {
      if (event.isTrusted || type === 'contextmenu') lastMenuSource = event.target.closest?.('button,[data-artifact-id]') || event.target;
    }, true);
  }
  const openActionMenu = element => {
    if (element.closest('.conversation-submenu') || element.closest('[hidden],[inert]')) return false;
    if (element.hasAttribute('popover')) return element.matches(':popover-open');
    if (element.matches('.avatar-popover')) return element.parentElement.classList.contains('menu-open');
    return getComputedStyle(element).display !== 'none';
  };
  const closeActionMenu = (element, source) => {
    if (element.matches('.avatar-popover')) element.parentElement?.classList.remove('menu-open');
    else if (element.hasAttribute('popover')) { if (element.matches(':popover-open')) element.hidePopover(); }
    else element.hidden = true;
    source?.setAttribute('aria-expanded', 'false');
    // Reset the server's transient menu state without running any action.
    if (element.isConnected && element.matches('.chat-context-menu,.artifact-context-menu,.message-action-menu')) {
      element.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    }
  };
  const presentActionMenu = (element, present = true) => {
    const source = element.matches('.avatar-popover') ? element.parentElement.querySelector('button') : lastMenuSource;
    if (!source?.isConnected || source.closest('[hidden],[inert]')) { closeActionMenu(element, source); return; }
    menuActions.clear();
    const generation = String(++actionMenuSerial), context = menuContext();
    const remember = button => {
      const title = (button.getAttribute('aria-label') || button.textContent || button.title).trim().slice(0,100);
      if (!title || title === 'Teach a task' || title === 'Review lesson') return null;
      const id = `${generation}-${menuActions.size}`;
      menuActions.set(id, {button,source,element,context});
      return {id,title,disabled:button.disabled || button.getAttribute('aria-disabled') === 'true',
        selected:button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true',
        destructive:button.classList.contains('danger') || /^(Delete|Remove|Archive)\b/.test(title)};
    };
    const choices = parent => [...parent.querySelectorAll('button,a[href]')]
      .filter(button => !button.closest('[hidden]') && button.closest('[role=menu],.avatar-popover,.deliverable-menu,#new-menu') === parent)
      .map(button => {
        if (button.matches('.has-submenu')) {
          button.click(); // Builds choices without invoking a leaf action.
          const child = [...parent.querySelectorAll('.conversation-submenu')].find(menu => menu._trigger === button);
          if (child) return {title:button.textContent.trim().slice(0,100),children:choices(child)};
        }
        return remember(button);
      }).filter(Boolean);
    const items = element.matches('.avatar-popover')
      ? [...element.querySelectorAll('[role=group]')].map(group => ({title:group.getAttribute('aria-label'),children:[...group.querySelectorAll('button')].map(remember).filter(Boolean)}))
      : choices(element);
    // Library pinning belongs to desktop's drawer, which iOS replaces with pages.
    const allowed = items.filter(item => !/^(Close|Unpin|Pin) (artifact )?library$/.test(item.title));
    const rect = source.getBoundingClientRect();
    closeActionMenu(element, source);
    if (!allowed.length) { menuActions.clear(); return; }
    const model = {action:'native-menu',key:generation,
      title:element === libraryMenu ? '' : element.getAttribute('aria-label') || '',rect:[rect.x,rect.y,rect.width,rect.height],items:allowed};
    if (present) window.webkit?.messageHandlers?.kindredAccounts?.postMessage(model);
    return model;
  };
  document.addEventListener('pointerdown', event => {
    const row = event.target.closest?.('.artifact-studio-library-item[data-artifact-id]');
    if (!row || row.closest('[hidden],[inert]') || event.button !== 0) return;
    const rect = row.getBoundingClientRect();
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'artifact-target',key:row.dataset.artifactId,
      rect:[rect.x,rect.y,rect.width,rect.height]});
  }, true);
  window.__kindredNativeMenus = {
    describeArtifact(key) {
      const row = document.querySelector(`.artifact-studio-library-item[data-artifact-id="${CSS.escape(key)}"]`);
      if (!row || row.closest('[hidden],[inert]') || !row.getClientRects().length) return null;
      lastMenuSource = row;
      const rect = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.x,clientY:rect.y}));
      const menu = document.querySelector('.artifact-context-menu');
      return menu ? presentActionMenu(menu, false) : null;
    },
    perform(id) {
      const action = menuActions.get(id); menuActions.clear();
      if (!action || action.context !== menuContext() || !action.source.isConnected ||
          action.source.closest('[hidden],[inert]') || !action.source.getClientRects().length || action.button.disabled || action.button.getAttribute('aria-disabled') === 'true') return;
      action.button.click();
      // Avatar choice closures reopen the desktop flyout while saving.
      closeActionMenu(action.element, action.source);
    },
    cancel(key) { if (key === String(actionMenuSerial)) menuActions.clear(); },
  };
  const scanActionMenus = () => {
    for (const element of document.querySelectorAll(actionMenuSelector)) {
      if (openActionMenu(element)) { presentActionMenu(element); break; }
    }
  };
  new MutationObserver(scanActionMenus).observe(document.body, {childList:true,subtree:true,attributes:true,
    attributeFilter:['hidden','class','aria-expanded']});
  document.addEventListener('toggle', scanActionMenus, true);
  scanActionMenus();
  // Hand navigation to the page before slow fonts/images finish loading.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
})();
