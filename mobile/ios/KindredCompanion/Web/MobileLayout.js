// Native presentation of server actions. Session storage and origin enforcement belong to WebSession.
(() => {
  const html = document.documentElement;
  if (!window.__KINDRED_MOBILE || html.dataset.kindredIos) return;
  html.dataset.kindredIos = 'true';
  html.dataset.mobile = 'true';
  // UIKit supplies system text size separately. Respect fixed
  // page scale in WKWebView so double taps and pinches cannot zoom the shell.
  // Leave Safari and embedded computer/document content's own gestures alone.
  const viewport = document.querySelector('meta[name=viewport]') || document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
  if (!viewport.isConnected) document.head.append(viewport);
  const shell = document.querySelector('#app');
  const header = document.querySelector('.conversation-header');
  if (!shell || !header) return;
  // Older deployed servers finish only the outgoing edge animation. Keep the
  // incoming pane moving too, without replacing their retained Back closure.
  // New servers own the paired animation and bypass this compatibility layer.
  let edgeHandler = window.__KINDRED_EDGE_BACK, edgePreview = null;
  const clearEdgePreview = () => { edgePreview?.animation?.cancel(); edgePreview = null; };
  const adaptEdgeHandler = handler => {
    if (typeof handler !== 'function' || window.__KINDRED_MOBILE_NAVIGATION_VERSION >= 2) return handler;
    return message => {
      const accepted = handler(message);
      if (!accepted) return accepted;
      if (message.phase === 'begin' && shell.classList.contains('ios-edge-preview')) {
        clearEdgePreview();
        const target = shell.dataset.edgeTarget;
        const destination = shell.querySelector(target === 'bot-chat' ? '.conversation' : '.sidebar');
        if (destination) edgePreview = {id:message.id,destination,width:shell.clientWidth};
      }
      if (edgePreview?.id === message.id && ['finish','cancel'].includes(message.phase) && !edgePreview.animation &&
          html.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
        const commit = message.phase === 'finish' && message.commit === true;
        edgePreview.animation = edgePreview.destination.animate([
          {transform:getComputedStyle(edgePreview.destination).transform},
          {transform:`translateX(${commit ? 0 : -edgePreview.width*.3}px)`},
        ],{duration:commit ? 250 : 200,easing:'ease-out',fill:'forwards'});
      }
      return accepted;
    };
  };
  edgeHandler = adaptEdgeHandler(edgeHandler);
  Object.defineProperty(window,'__KINDRED_EDGE_BACK',{configurable:true,
    get:() => edgeHandler,set:value => { clearEdgePreview(); edgeHandler = adaptEdgeHandler(value); }});
  new MutationObserver(() => {
    if (!shell.classList.contains('ios-edge-preview')) clearEdgePreview();
  }).observe(shell,{attributes:true,attributeFilter:['class']});
  // UIKit sizes WKWebView to the keyboard layout guide. Once native geometry
  // arrives, do not subtract WebKit's transient visualViewport height again.
  let nativeHeight = 0, nativePortrait, nativeDuo = false;
  const updateViewport = () => {
    const height = nativeHeight || window.visualViewport?.height || window.innerHeight;
    html.style.setProperty('--ios-viewport-height', `${height}px`);
    html.toggleAttribute('data-ios-short-viewport', height <= 180);
  };
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', () => {
    if (nativeHeight && (window.scrollY || window.scrollX)) window.scrollTo(0,0);
  });
  updateViewport();
  const compact = matchMedia('(max-width:760px), (max-height:500px)');
  const menu = document.querySelector('#mobile-menu');
  const sidebar = shell.querySelector('.sidebar');
  const conversation = shell.querySelector('.conversation');
  const statusBlur = document.createElement('div');
  statusBlur.id = 'ios-status-blur'; statusBlur.setAttribute('aria-hidden','true');
  document.body.append(statusBlur);
  // Older servers request browser permission when notification preferences
  // change. Keep their preference save, but route device setup to the app and
  // replace the browser-only failure before it can paint.
  const notificationMessage = () => window.__KINDRED_IOS_PUSH_AVAILABLE
    ? 'Manage iPhone notifications in Accounts.'
    : 'Background notifications require Apple Developer Program push signing. This free Personal Team build cannot receive them.';
  document.addEventListener('change', event => {
    const control = event.target;
    const label = control.closest?.('label,.setting-row');
    const title = control.getAttribute?.('aria-label') || label?.querySelector('.setting-label,span')?.textContent.trim();
    if (title !== 'Notifications' || (control.type === 'checkbox' ? !control.checked : control.value === 'none')) return;
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'notification-settings'});
  },true);
  const notice = document.querySelector('#notice');
  if (notice) new MutationObserver(() => {
    if (notice.textContent === 'This browser does not support notifications. Use the desktop app.' ||
        notice.textContent === 'Notifications are blocked in your browser settings.') notice.textContent = notificationMessage();
  }).observe(notice,{childList:true,characterData:true,subtree:true});

  // Stop is a deliberate second tap on iOS, never a permanent hover action.
  const workerSelector = '.work-line,.group-working-row';
  let revealedStopRun = null;
  const collapseStops = except => {
    revealedStopRun = except?.querySelector('.work-stop')?.dataset.run || null;
    adaptStops();
  };
  function adaptStops() {
    for (const stop of document.querySelectorAll('.work-stop')) {
      const row = stop.closest(workerSelector), label = row?.querySelector('.work-label,.group-working-label');
      const revealed = !!revealedStopRun && stop.dataset.run === revealedStopRun;
      row?.classList.toggle('ios-stop-revealed',revealed);
      stop.tabIndex = revealed ? 0 : -1;
      stop.setAttribute('aria-hidden', String(!revealed));
      if (label) { label.tabIndex = 0; label.setAttribute('role','button'); label.setAttribute('aria-expanded',String(!!revealed)); }
    }
  }
  let statusPress, handledStatusClick = false;
  document.addEventListener('pointerdown', event => {
    handledStatusClick = false;
    const stop = event.target.closest?.(workerSelector)?.querySelector('.work-stop');
    statusPress = stop && !event.target.closest('.work-stop')
      ? {run:stop.dataset.run,x:event.clientX,y:event.clientY,pointer:event.pointerId} : null;
  },true);
  document.addEventListener('pointercancel', () => { statusPress = null; },true);
  document.addEventListener('pointerup', event => {
    const press = statusPress; statusPress = null;
    if (!press || press.pointer !== event.pointerId || Math.hypot(event.clientX-press.x,event.clientY-press.y)>8) return;
    // Blurring the composer can replace the status DOM between down and up.
    // Carry the task ID through that change instead of losing the first tap.
    revealedStopRun = revealedStopRun === press.run ? null : press.run;
    adaptStops(); handledStatusClick = true;
  },true);
  document.addEventListener('click', event => {
    const row = event.target.closest?.(workerSelector);
    if (event.target.closest?.('.work-stop')) return;
    if (handledStatusClick) { handledStatusClick = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (row?.querySelector('.work-stop')) {
      const show = row.querySelector('.work-stop').dataset.run !== revealedStopRun;
      collapseStops(show ? row : null);
      event.preventDefault(); event.stopImmediatePropagation();
    } else collapseStops();
  },true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') collapseStops();
    if (!['Enter',' '].includes(event.key) || !event.target.matches?.('.work-label,.group-working-label')) return;
    event.preventDefault(); event.stopImmediatePropagation(); event.target.click();
  },true);
  const messages = document.querySelector('.messages');
  if (messages) new MutationObserver(adaptStops).observe(messages,{childList:true,subtree:true});
  adaptStops();
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
  const adaptPreviews = () => {
    for (const dialog of document.querySelectorAll('.document-dialog,.workspace-artifact-dialog,.screenshot-dialog')) {
      if (dialog.dataset.iosPreview) continue;
      let head = dialog.querySelector('.document-header,.dialog-header');
      let close = head?.querySelector('button:last-child');
      if (dialog.matches('.workspace-artifact-dialog')) {
        close = dialog.querySelector(':scope > button');
        if (!close) continue;
        head = document.createElement('header'); head.className = 'ios-preview-header';
        const title = document.createElement('strong');
        title.textContent = dialog.querySelector('.workspace-artifact-header strong')?.textContent || 'Artifact preview';
        dialog.prepend(head); head.append(title,close);
      }
      if (!head || !close) continue;
      dialog.dataset.iosPreview = 'true';
      close.setAttribute('aria-label','Close preview'); close.title = 'Close preview';
      close.innerHTML = icon('<path d="m6 6 12 12M18 6 6 18"/>');
      if (dialog.matches('.document-dialog')) {
        for (const action of head.querySelectorAll('button,a')) {
          if (action !== close) action.classList.add('ios-preview-download');
        }
      }
    }
  };
  new MutationObserver(adaptPreviews).observe(document.body,{childList:true,subtree:true});
  adaptPreviews();
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
  if (settings) {
    const closeImmediately = settings.close.bind(settings);
    let exit = null, exitTimer;
    settings.close = returnValue => {
      if (!settings.open || exit) return;
      if (html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches) {
        closeImmediately(returnValue); return;
      }
      settings.inert = true;
      settings.dataset.iosSheetClosing = 'true';
      const animation = settings.animate([{transform:getComputedStyle(settings).transform},{transform:'translateY(100%)'}],
        {duration:240,easing:'cubic-bezier(.4,0,.8,.2)',fill:'forwards'});
      exit = animation;
      const finish = () => {
        if (exit !== animation) return;
        exit = null; clearTimeout(exitTimer);
        // Remove the modal before releasing the held end pose.
        closeImmediately(returnValue);
        animation.cancel(); settings.inert = false;
        delete settings.dataset.iosSheetClosing;
      };
      animation.finished.then(finish,finish);
      // WebKit animation suspension must never leave an invisible modal.
      exitTimer = setTimeout(finish,600);
    };
    settings.addEventListener('cancel',event => { event.preventDefault(); settings.close(); });
  }
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
      const botID = queueStatus.dataset.controlBotId;
      // Older servers omit IDs. Ignore the heading's primary-bot badge when
      // matching their text-only return action.
      const headingName = [...(document.querySelector('#heading')?.childNodes || [])]
        .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
      const duplicate = queueAction && !controlNotice.hidden && [...controlNotice.querySelectorAll('.control-notice-row button')]
        .some(action => botID && action.closest('.control-notice-row').dataset.controlBotId
          ? action.closest('.control-notice-row').dataset.controlBotId === botID
          : action.getAttribute('aria-label') === queueAction.getAttribute('aria-label') ||
            action.getAttribute('aria-label') === 'Return control to ' + headingName);
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
    for (const source of [controlNotice,queueStatus]) pauseObserver.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','data-control-bot-id']});
    adaptControlNotice();
  }
  if (computer) {
    let resumeScreen = null;
    // The server attaches desktop's click-to-expand listener to this host.
    // Replace that host before opening a VNC connection; its content survives,
    // and future RFB instances attach to the new #desktop. Canvas listeners
    // belong to noVNC and are left intact.
    const detachDesktopExpansion = () => {
      const oldDesktop = computer.querySelector('#desktop');
      if (!oldDesktop) return;
      const desktop = oldDesktop.cloneNode(false);
      desktop.append(...oldDesktop.childNodes); oldDesktop.replaceWith(desktop);
    };
    if (computer.hidden) detachDesktopExpansion();
    document.addEventListener('click', event => {
      if (computer.hidden && event.target.closest?.('#show-computer')) detachDesktopExpansion();
    },true);
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest?.('#desktop') || computer.classList.contains('is-controlling')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    },true);
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
    // Keep the keyboard's geometry steady until the action click completes.
    // Blurring this input on pointer-down otherwise moves Return control out
    // from under the user's finger before pointer-up can activate it.
    let controlPress = null, completedControlTap = null;
    toolbar?.addEventListener('pointerdown',event => {
      controlPress = null;
      const button = event.target.closest('#desktop-paste,#take-control,#done-subtask');
      if (!event.isPrimary || event.button !== 0 || !canvas() || !button || button.disabled) return;
      event.preventDefault();
      if (event.pointerType === 'touch') controlPress = {button,id:event.pointerId,x:event.clientX,y:event.clientY};
    });
    toolbar?.addEventListener('pointercancel',() => { controlPress = null; });
    toolbar?.addEventListener('pointerup',event => {
      const press = controlPress; controlPress = null;
      if (!press || !canvas() || shell.dataset.mobileResizing === 'true' || press.id !== event.pointerId || !press.button.isConnected || press.button.disabled ||
          event.target.closest('button') !== press.button || Math.hypot(event.clientX-press.x,event.clientY-press.y) > 8) return;
      // WKWebView suppresses its compatibility click after a prevented touch
      // pointer-down. Activate once on release without dismissing the keyboard.
      event.preventDefault();
      completedControlTap = {button:press.button,at:performance.now()};
      press.button.click();
    });
    toolbar?.addEventListener('click',event => {
      if (event.isTrusted && event.detail > 0 && completedControlTap?.button === event.target.closest('button') &&
          performance.now()-completedControlTap.at < 600) {
        completedControlTap = null; event.preventDefault(); event.stopImmediatePropagation();
      }
    },true);
    window.addEventListener('kindred-native-geometry',() => { controlPress = null; });
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
    let restoringFocus = false;
    input.addEventListener('focus',keyboardState);
    input.addEventListener('blur',() => {
      keyboardState();
      if (!restoringFocus && canvas()) window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'computer-keyboard'});
    });
    let awaitingControl = false, controlTimeout, hadControl = false, inputWanted = false;
    const portrait = () => html.dataset.iosDuoInner === 'true' || (nativePortrait ?? (window.innerHeight >= window.innerWidth));
    window.__kindredComputerInput = {
      focus(force = false) {
        if (!canvas() || !portrait()) return;
        // A fold can resize the computer behind a sheet or a second editor.
        // Keep that editor's keyboard and caret instead of stealing focus.
        if (document.querySelector('dialog[open]') ||
            (document.activeElement !== input && document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))) return;
        restoringFocus = true;
        if (force) input.blur();
        input.focus({preventScroll:true}); restoringFocus = false;
      }
    };
    // Focus during the user's tap, before the asynchronous takeover request;
    // iOS won't summon its keyboard from a later network callback alone.
    document.querySelector('#take-control')?.addEventListener('click', event => {
      if (event.currentTarget.disabled) return;
      clearTimeout(controlTimeout);
      if (canvas()) { awaitingControl = false; return; }
      awaitingControl = true; resetInput();
      updateControl();
      controlTimeout = setTimeout(() => { awaitingControl = false; updateControl(); },35000);
    },true);
    document.addEventListener('click', event => {
      if (!event.target.closest?.('#computer-close')) return;
      resumeScreen = canvas() ? document.querySelector('#screen-picker')?.value : null;
    },true);
    // Remote clicks may focus the canvas; restore native entry after the click.
    let restoreKeyboard = false;
    computer.addEventListener('pointerdown', event => {
      if (event.target.matches('.desktop-canvas canvas')) restoreKeyboard = computer.classList.contains('ios-keyboard-active');
    },true);
    computer.addEventListener('pointerup', event => {
      if (event.target.matches('.desktop-canvas canvas') && restoreKeyboard && canvas()) window.__kindredComputerInput.focus();
      restoreKeyboard = false;
    });
    let paneWasHidden = computer.hidden;
    const updateControl = () => {
      // Other server actions can open the pane too. The connection awaits its
      // endpoint before constructing RFB, so clear legacy host listeners at
      // the hidden->visible transition, before the live canvas is attached.
      if (paneWasHidden && !computer.hidden) detachDesktopExpansion();
      paneWasHidden = computer.hidden;
      const controlling = !!canvas();
      if (controlling) {
        awaitingControl = false; clearTimeout(controlTimeout);
        if (!hadControl) {
          resetInput(); window.__kindredComputerInput.focus();
          window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'computer-keyboard'});
        }
      } else if ((!awaitingControl || computer.hidden) && document.activeElement === input) {
        awaitingControl = false; clearTimeout(controlTimeout); input.blur();
      }
      const wanted = !computer.hidden && (controlling || awaitingControl);
      if (wanted !== inputWanted) {
        inputWanted = wanted;
        window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'computer-input',enabled:wanted});
      }
      hadControl = controlling;
      if (!computer.hidden && resumeScreen) {
        const choice = document.querySelector('#screen-picker')?.value;
        const action = document.querySelector('#take-control');
        const label = action?.getAttribute('aria-label');
        if (choice !== resumeScreen) resumeScreen = null;
        else if (!action.disabled && label === 'Use screen') {
          // Resume only the screen we left under manual control. "Use screen"
          // reattaches its existing lease; it never interrupts a new bot task.
          resumeScreen = null; action.click();
        } else if (!action.disabled && /^(Take control|Stop task & take control)$/.test(label)) resumeScreen = null;
      }
      const screen = computer.querySelector('.desktop-canvas canvas');
      if (screen?.width > 0 && screen?.height > 0) computer.style.setProperty('--ios-screen-ratio',screen.width / screen.height);
    };
    new MutationObserver(updateControl).observe(computer,{attributes:true,attributeFilter:['class','hidden','width','height'],childList:true,subtree:true});
    updateControl();
  }
  function updateNavigation() {
    const isCompact = html.dataset.iosLayout ? html.dataset.iosLayout === 'compact' : compact.matches;
    const railClasses = ['sidebar-rail', 'sidebar-fading', 'sidebar-peek'];
    if (isCompact && railClasses.some(name => shell.classList.contains(name))) shell.classList.remove(...railClasses);
    const open = shell.classList.contains('sidebar-open');
    menu?.setAttribute('aria-expanded', String(open));
    if (sidebar) sidebar.inert = (isCompact && !open) || (html.dataset.iosSidebarHidden === 'true' && !html.classList.contains('pane-resizing'));
    if (sidebar?.inert && libraryMenu.matches(':popover-open')) libraryMenu.hidePopover();
    if (conversation) conversation.inert = isCompact && open;
  }
  compact.addEventListener('change', updateNavigation);
  new MutationObserver(updateNavigation).observe(shell, {attributes:true, attributeFilter:['class']});
  new MutationObserver(updateNavigation).observe(html, {attributes:true, attributeFilter:['class','data-ios-layout','data-ios-sidebar-hidden']});
  updateNavigation();
  function updateEnvironment(value) {
    if (!value) return;
    html.style.setProperty('--ios-safe-top', `${Math.max(0, Number(value.topInset) || 0)}px`);
    html.style.setProperty('--ios-safe-left', `${Math.max(0, Number(value.leftInset) || 0)}px`);
    html.style.setProperty('--ios-safe-right', `${Math.max(0, Number(value.rightInset) || 0)}px`);
    nativeDuo = value.isDuo === true;
    html.dataset.iosDuo = String(nativeDuo);
    html.dataset.iosDuoInner = String(nativeDuo && value.isDuoInner === true);
    html.dataset.iosSlab = String(value.isSlab === true);
    // A closed phone must not inherit an inner-display fullscreen state whose
    // collapse control is intentionally unavailable on the outer display.
    if (nativeDuo && value.isDuoInner !== true && computer?.classList.contains('expanded')) {
      document.querySelector('#computer-expand')?.click();
    }
    html.style.setProperty('--ios-safe-bottom', `${Math.max(0, Number(value.bottomInset) || 0)}px`);
    nativeHeight = Math.max(0, Number(value.viewportHeight) || 0);
    nativePortrait = typeof value.isPortrait === 'boolean' ? value.isPortrait : undefined;
    updateViewport();
    updateReservedControls();
    window.__kindredComputerInput?.focus();
  }
  window.addEventListener('kindred-ios-layout', event => updateEnvironment(event.detail));
  updateEnvironment(window.__KINDRED_IOS_LAYOUT);
  function updateReservedControls() {
    const regions = nativeDuo ? window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || [] : [];
    const horizontal = regions.find(r => r.kind === 'division' && r.width > r.height && r.y > 0);
    html.dataset.iosDuoPose = horizontal ? 'tabletop' : regions.some(r => r.kind === 'division' && r.height > r.width) ? 'book' : 'flat';
    html.style.setProperty('--ios-tabletop-top',`${horizontal?.y || 0}px`);
    // If the keyboard covers the lower half, controls stay above it instead
    // of reserving a hinge gap outside the remaining web viewport.
    const below = horizontal && (nativeHeight || innerHeight) > horizontal.y + horizontal.height + 128;
    html.style.setProperty('--ios-tabletop-gap',`${below ? horizontal.height : 0}px`);
    const occlusions = regions.filter(r => r.kind === 'occlusion');
    const intersects = (a,b) => a.left < b.x+b.width && a.right > b.x && a.top < b.y+b.height && a.bottom > b.y;
    const tag = document.querySelector('.bot-heading');
    html.style.setProperty('--ios-header-obstruction','0px');
    html.style.setProperty('--ios-composer-obstruction','0px');
    if (tag) {
      const rect = tag.getBoundingClientRect();
      const move = Math.max(0,...occlusions.filter(r => intersects(rect,r)).map(r => r.y+r.height+8-rect.top));
      html.style.setProperty('--ios-header-obstruction',`${move}px`);
    }
    const area = document.querySelector('#composer-area');
    if (area) {
      const rect = area.getBoundingClientRect();
      const move = Math.max(0,...occlusions.filter(r => intersects(rect,r)).map(r => rect.bottom-r.y+8));
      html.style.setProperty('--ios-composer-obstruction',`${move}px`);
    }
    requestAnimationFrame(() => updateClearance());
  }
  window.addEventListener('kindred-native-geometry',updateReservedControls);
  // Floating controls share the message viewport. Reserve their measured sizes,
  // including attachments/replies and keyboard/rotation changes, for scroll ends.
  const composerArea = document.querySelector('#composer-area');
  // Dynamic Type and draft growth can hit a camera region without changing
  // the native viewport. Recheck after those controls actually change size.
  let obstructionFrame = 0;
  const obstructionObserver = new ResizeObserver(() => {
    if (obstructionFrame) return;
    obstructionFrame = requestAnimationFrame(() => {
      obstructionFrame = 0;
      updateReservedControls();
    });
  });
  for (const control of [document.querySelector('.bot-heading'), composerArea]) {
    if (control) obstructionObserver.observe(control);
  }
  const updateClearance = () => {
    const top = header.getBoundingClientRect().height;
    const bottom = composerArea?.hidden ? 0 : (composerArea?.getBoundingClientRect().height || 0) + (parseFloat(getComputedStyle(html).getPropertyValue('--ios-composer-obstruction')) || 0);
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
  const duoRoute = () => {
    const library = document.querySelector('.artifact-studio');
    if (library) return library.dataset.iosArtifactView === 'document' ? 'artifact' : 'artifacts';
    if (document.querySelector('#marketplace-dialog[open]')) return 'marketplace';
    if (!computer?.hidden) return 'computer';
    if (!document.querySelector('#details-panel')?.hidden) return 'details';
    if (shell.hidden) return 'marketplace';
    return html.dataset.iosLayout === 'compact' && shell.classList.contains('sidebar-open') ? 'chat-list' : 'bot-chat';
  };
  let lastDuoNavigation = '';
  const publishDuoNavigation = () => {
    if (!nativeDuo) return;
    const route = duoRoute();
    const regular = html.dataset.iosLayout === 'regular';
    const state = {action:'duo-navigation', route, title:(document.querySelector('.bot-heading strong')?.textContent || '').slice(0,160),
      listVisible:['bot-chat','computer'].includes(route) && regular && html.dataset.iosSidebarHidden !== 'true',
      listToggleAvailable:['bot-chat','computer'].includes(route) && regular && html.dataset.iosDuoInner === 'true' && !!window.__KINDRED_DUO_PANES,
      botSettingsAvailable:route === 'details' && !!document.querySelector('#bot-settings') && !document.querySelector('#bot-settings').hidden};
    const next = JSON.stringify(state);
    if (lastDuoNavigation === next) return;
    lastDuoNavigation = next;
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage(state);
  };
  window.__kindredDuoActions = {perform(action) {
    const route = duoRoute();
    if (!nativeDuo || (document.querySelector('dialog[open]') && !(action === 'back' && route === 'marketplace'))) return;
    if (action === 'chats') { window.__KINDRED_DUO_PANES?.toggleList(); publishDuoNavigation(); return; }
    if (action === 'back' || (action === 'computer' && route === 'computer')) {
      if (route === 'computer') {
        if (typeof window.__KINDRED_MOBILE_BACK === 'function') window.__KINDRED_MOBILE_BACK('bot-chat');
        else document.querySelector('#ios-computer-back')?.click();
      } else if (route === 'details') document.querySelector('#details-close')?.click();
      else if (route === 'artifact') document.querySelector('.artifact-workbench-header [aria-label="Back to artifacts"]')?.click();
      else if (route === 'artifacts') document.querySelector('.ios-artifact-navigation [aria-label="Back to chats"]')?.click();
      else if (route === 'marketplace') document.querySelector('#marketplace-dialog')?.close();
      else if (route === 'bot-chat') {
        if (typeof window.__KINDRED_MOBILE_BACK === 'function') window.__KINDRED_MOBILE_BACK('chat-list');
        else menu?.click();
      }
    } else {
      const selectors = {computer:'#show-computer',botSettings:'#bot-settings',settings:'#settings-button',artifacts:'#artifacts-button',marketplace:'#marketplace-button',search:'#ios-search',newChat:'#new-bot'};
      if (action === 'botSettings' && (route !== 'details' || document.querySelector('#bot-settings')?.hidden)) return;
      if (action === 'search' && route === 'artifacts') document.querySelector('.ios-artifact-navigation [aria-label="Search artifacts"]')?.click();
      else if (action === 'newChat' && route === 'artifacts') document.querySelector('.artifact-add')?.click();
      else if (Object.hasOwn(selectors,action)) document.querySelector(selectors[action])?.click();
    }
    publishDuoNavigation();
  }};
  new MutationObserver(publishDuoNavigation).observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','data-ios-artifact-view']});
  new MutationObserver(publishDuoNavigation).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  new MutationObserver(publishDuoNavigation).observe(html,{attributes:true,attributeFilter:['data-ios-layout','data-ios-duo','data-ios-duo-inner','data-ios-sidebar-hidden']});
  publishDuoNavigation();
  // Hand navigation to the page before slow fonts/images finish loading.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
})();
