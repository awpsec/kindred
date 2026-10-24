// Native presentation of server actions. Session storage and origin enforcement belong to WebSession.
(() => {
  const html = document.documentElement;
  if (!window.__KINDRED_MOBILE || html.dataset.kindredIos) return;
  html.dataset.kindredIos = 'true';
  html.dataset.mobile = 'true';
  // SVG animation frames cannot change navigation, menus or pane geometry.
  // Keep them out of native-wide observers while retaining identity changes.
  const observeUI = callback => new MutationObserver((records, observer) => {
    const structural = records.filter(record => !record.target.closest?.('.character') ||
      (record.type === 'attributes' && ['data-shape','data-avatar-body','data-avatar-color'].includes(record.attributeName)));
    if (structural.length) callback(structural, observer);
  });
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
  observeUI(() => {
    if (!shell.classList.contains('ios-edge-preview')) clearEdgePreview();
  }).observe(shell,{attributes:true,attributeFilter:['class']});
  // UIKit sizes WKWebView to the keyboard layout guide. Once native geometry
  // arrives, do not subtract WebKit's transient visualViewport height again.
  let nativeHeight = 0, nativePortrait, nativeDuo = false;
  const updateViewport = () => {
    const height = nativeHeight || window.visualViewport?.height || window.innerHeight;
    html.style.setProperty('--ios-viewport-height', `${height}px`);
    html.toggleAttribute('data-ios-short-viewport', height <= 180);
    requestAnimationFrame(resetRootScroll);
  };
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.addEventListener('resize', updateViewport);
  const resetRootScroll = () => {
    // WebKit can scroll the fixed body's overflow-hidden box to reveal focus
    // even while window.scrollY remains zero. Nested chat/editor scrolling is
    // intentional; only the two viewport roots are reset.
    for (const root of [html,document.body]) if (root && (root.scrollTop || root.scrollLeft)) root.scrollTo(0,0);
    if (window.scrollY || window.scrollX) window.scrollTo(0,0);
  };
  window.visualViewport?.addEventListener('scroll',resetRootScroll);
  window.addEventListener('scroll',resetRootScroll);
  document.addEventListener('scroll',event => { if (event.target === html || event.target === document.body) resetRootScroll(); },true);
  document.addEventListener('focusin',() => requestAnimationFrame(resetRootScroll));
  updateViewport();
  const compact = matchMedia('(max-width:760px), (max-height:500px)');
  const menu = document.querySelector('#mobile-menu');
  const sidebar = shell.querySelector('.sidebar');
  const conversation = shell.querySelector('.conversation');
  // An older server may install its message gesture bridge before our bundled
  // script. Reuse its opaque key/actions, but correct the native preview bounds
  // after its pointer handler has published the old full-row rectangle.
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest?.('a,button,input,textarea,select,[contenteditable=true],.message-reactions')) return;
    const group = event.target.closest?.('#content .message-group[data-message]');
    if (!group?.querySelector('.message-actions')) return;
    queueMicrotask(() => {
      const key = group.dataset.mobileMessageKey;
      const bubble = group.querySelector('.message-row>:is(.message-bubble,.question-card)');
      if (!key || !group.isConnected || !bubble?.getClientRects().length) return;
      const rect = bubble.getBoundingClientRect(), viewport = group.closest('.conversation-history')?.getBoundingClientRect();
      let left = Math.max(0,rect.left,viewport?.left || 0), right = Math.min(innerWidth,rect.right,viewport?.right ?? innerWidth);
      let top = Math.max(0,rect.top,viewport?.top || 0), bottom = Math.min(nativeHeight || innerHeight,rect.bottom,viewport?.bottom ?? innerHeight);
      for (const overlay of document.querySelectorAll('.conversation-header,.bot-heading,#composer-area,.jump-latest')) {
        if (!overlay.getClientRects().length || getComputedStyle(overlay).visibility === 'hidden') continue;
        const box = overlay.getBoundingClientRect();
        if (box.right <= left || box.left >= right || box.bottom <= top || box.top >= bottom) continue;
        if (overlay.matches('.conversation-header,.bot-heading')) top = Math.max(top,box.bottom);
        else if (overlay.matches('.jump-latest') && event.clientY >= box.bottom) top = Math.max(top,box.bottom);
        else bottom = Math.min(bottom,box.top);
      }
      window.webkit?.messageHandlers?.kindredAccounts?.postMessage(right > left && bottom > top
        ? {action:'message-target',key,rect:[left,top,right-left,bottom-top]}
        : {action:'message-target-clear'});
    });
  },true);
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
  if (notice) observeUI(() => {
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
  if (messages) observeUI(adaptStops).observe(messages,{childList:true,subtree:true});
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
    for (const dialog of document.querySelectorAll('.document-dialog,.workspace-artifact-dialog,.screenshot-dialog,.chat-media-dialog')) {
      if (dialog.dataset.iosPreview) continue;
      let head = dialog.querySelector('.document-header,.dialog-header,.chat-media-heading');
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
      if (dialog.matches('.chat-media-dialog.is-video')) {
        // Touch dismisses on the surrounding space. Retain an accessible close
        // action for VoiceOver/keyboard without a floating window title bar.
        dialog.tabIndex = -1;
        dialog.focus({preventScroll:true});
        for (const action of head.querySelectorAll('button,a')) if (action !== close) action.hidden = true;
      }
      close.setAttribute('aria-label','Close preview'); close.title = 'Close preview';
      close.innerHTML = icon('<path d="m6 6 12 12M18 6 6 18"/>');
      if (dialog.matches('.document-dialog')) {
        for (const action of head.querySelectorAll('button,a')) {
          if (action !== close) action.classList.add('ios-preview-download');
        }
      }
    }
  };
  observeUI(adaptPreviews).observe(document.body,{childList:true,subtree:true});
  adaptPreviews();
  // Artifacts retain the server's editor/save closures, but navigate as two
  // pages on iOS. Returning to the list never destroys an in-progress editor.
  const artifactPages = new Map();
  const artifactSidebarKey='kindred-ios-artifact-sidebar-v1:'+(window.__KINDRED_MOBILE_PROFILE||'');
  let artifactSidebarWidth=210,artifactSidebarHidden=false;
  try {
    const saved=JSON.parse(localStorage.getItem(artifactSidebarKey)||'null');
    if(Number.isFinite(saved?.width)&&saved.width>=76&&saved.width<=600)artifactSidebarWidth=saved.width;
    if(typeof saved?.hidden==='boolean')artifactSidebarHidden=saved.hidden;
  }catch{}
  const saveArtifactSidebar=()=>{try{localStorage.setItem(artifactSidebarKey,JSON.stringify({width:artifactSidebarWidth,hidden:artifactSidebarHidden}));}catch{}};
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
  // Artifact panes use the same measured native geometry as chat. Keep the
  // preview mounted: a fold changes frames, never the selected document.
  const artifactFrames = ({hidden=false,single=false}={}) => {
    const layout = window.__KINDRED_IOS_LAYOUT || {}, geometry = window.__KINDRED_NATIVE_GEOMETRY || {};
    const width = innerWidth, height = Math.min(innerHeight, nativeHeight || innerHeight);
    const finite = value => Number.isFinite(value) ? Math.max(0,value) : 0;
    const left = Math.min(width,finite(layout.leftInset)), right = Math.min(width-left,finite(layout.rightInset));
    const top = Math.min(height,finite(layout.topInset)), bottom = Math.min(height-top,finite(layout.bottomInset));
    const frame = {x:left,y:top,width:width-left-right,height:height-top-bottom};
    const sx = width/(geometry.width || width), sy = height/(geometry.height || height);
    const regions = (Array.isArray(geometry.reservedRegions) ? geometry.reservedRegions : [])
      .filter(r => r.active !== false && ['division','occlusion'].includes(r.kind) && ['x','y','width','height'].every(k=>Number.isFinite(r[k])) && r.width>0 && r.height>0)
      .map(r => ({kind:r.kind,x:Math.max(0,r.x*sx),y:Math.max(0,r.y*sy),width:Math.min(width,(r.x+r.width)*sx)-Math.max(0,r.x*sx),height:Math.min(height,(r.y+r.height)*sy)-Math.max(0,r.y*sy)}))
      .filter(r => r.width>0 && r.height>0);
    const toolbar = window.__KINDRED_IOS_TOOLBAR;
    if (toolbar && ['x','y','width','height'].every(k=>Number.isFinite(toolbar[k])) && toolbar.width>0 && toolbar.height>0) regions.push({...toolbar,kind:'occlusion'});
    const intersect = (a,b) => a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
    const avoid = (box, exclusions) => {
      for (const r of exclusions) {
        if (!intersect(box,r)) continue;
        const choices = [{...box,width:r.x-box.x},{...box,x:r.x+r.width,width:box.x+box.width-r.x-r.width},
          {...box,height:r.y-box.y},{...box,y:r.y+r.height,height:box.y+box.height-r.y-r.height}].filter(c=>c.width>0&&c.height>0);
        if (choices.length) box=choices.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
        else box={...box,width:0,height:0};
      }
      return box;
    };
    const vertical = regions.find(r=>r.kind==='division'&&r.height>r.width&&r.x>frame.x&&r.x+r.width<frame.x+frame.width);
    const horizontal = regions.find(r=>r.kind==='division'&&r.width>r.height&&r.y>frame.y&&r.y+r.height<frame.y+frame.height);
    const scale = Math.max(1,parseFloat(getComputedStyle(html).getPropertyValue('--text-scale'))||1);
    const minLibrary=220*scale, minDocument=320*scale, divider=vertical||horizontal, exclusions=regions.filter(r=>r!==divider);
    let library, documentFrame, mode='single',resizable=false,maximum=0;
    if (!single && layout.isDuoInner === true && vertical) {
      library=avoid({...frame,width:vertical.x-frame.x},exclusions);
      documentFrame=avoid({...frame,x:vertical.x+vertical.width,width:frame.x+frame.width-vertical.x-vertical.width},exclusions);
      if(library.width>=minLibrary&&documentFrame.width>=minDocument) mode='split';
    } else if (!single && layout.isDuoInner === true && horizontal) {
      documentFrame=avoid({...frame,height:horizontal.y-frame.y},exclusions);
      library=avoid({...frame,y:horizontal.y+horizontal.height,height:frame.y+frame.height-horizontal.y-horizontal.height},exclusions);
      if(documentFrame.height>=200*scale&&library.height>=200*scale&&frame.width>=minDocument) mode='stacked';
    } else if (!single && layout.isDuoInner === true && frame.width>=720*scale) {
      maximum=Math.floor(Math.max(76,Math.min(width/4,frame.width-minDocument)));
      const listWidth=hidden?0:Math.max(76,Math.min(artifactSidebarWidth,maximum));
      library=avoid({...frame,width:listWidth},exclusions);
      documentFrame=avoid({...frame,x:frame.x+listWidth,width:frame.width-listWidth},exclusions);
      if((hidden||library.width>=76)&&documentFrame.width>=minDocument) { mode='split';resizable=true; }
    }
    if(mode==='single') library=documentFrame=avoid(frame,regions);
    return {mode,library,document:documentFrame,resizable,maximum};
  };
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
    const more = artifactButton('More options', '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>');
    more.classList.add('ios-artifact-more');more.setAttribute('aria-haspopup','menu');
    more.onclick = () => openLibraryMenu(more);
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
    nav.append(more, find, create);
    // Keep the existing type chooser and its action closures next to +.
    const addMenu = root.querySelector('.artifact-add-menu');
    if (addMenu) nav.append(addMenu);
    library.prepend(nav);
    const back = artifactButton('Back to artifacts', '<path d="M4 6h16M4 12h16M4 18h16"/>');
    const documentMore=artifactButton('More options', '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>');
    documentMore.classList.add('ios-artifact-more');documentMore.setAttribute('aria-haspopup','menu');
    documentMore.onclick=()=>openLibraryMenu(documentMore);
    const handle=document.createElement('div');handle.className='ios-duo-resizer';handle.dataset.pane='artifacts';handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Resize artifact list');root.append(handle);
    const page = {ignoredRoute:null, show:null, dispose:null, layout:null, toggle:null, drag:null};
    const show = documentView => {
      root.dataset.iosArtifactView = documentView ? 'document' : 'list';
      page.layout();
    };
    page.layout = () => {
      const documentView=root.dataset.iosArtifactView==='document';
      const frames = nativeDuo ? artifactFrames({hidden:documentView&&artifactSidebarHidden}) : {mode:'single'};
      const hidden=frames.resizable&&documentView&&artifactSidebarHidden;
      root.dataset.iosArtifactLibraryHidden=String(hidden);
      root.dataset.iosArtifactCompact=String(frames.resizable&&!hidden&&frames.library.width<128);
      root.dataset.iosArtifactToggleAvailable=String(frames.resizable&&documentView);
      handle.hidden=!frames.resizable||hidden;
      if(frames.resizable){
        handle.style.left=(frames.library.x+frames.library.width-12)+'px';handle.style.top=frames.library.y+'px';handle.style.height=frames.library.height+'px';
        handle.setAttribute('aria-valuemin','76');handle.setAttribute('aria-valuemax',String(frames.maximum));handle.setAttribute('aria-valuenow',String(Math.round(frames.library.width)));
      }
      if(root.dataset.iosArtifactLayout!==frames.mode) root.dataset.iosArtifactLayout=frames.mode;
      for(const [name,pane] of [['library',library],['document',workbench]]) {
        for(const key of ['x','y','width','height']) {
          const property='--ios-artifact-'+key, value=frames[name]?.[key];
          if(value===undefined) pane.style.removeProperty(property);
          else if(pane.style.getPropertyValue(property)!==value+'px') pane.style.setProperty(property,value+'px');
        }
      }
      const split=frames.mode!=='single';
      const hiddenPane=hidden?library:split?null:documentView?library:workbench;
      const moveFocus=hiddenPane?.contains(document.activeElement);
      library.inert=hidden||(!split&&documentView); workbench.inert=!split&&!documentView;
      if(moveFocus) {
        const target=documentView?workbench:library;
        target.tabIndex=-1; target.focus({preventScroll:true});
      }
    };
    page.toggle=()=>{
      if(root.dataset.iosArtifactToggleAvailable!=='true'||page.drag||document.querySelector('dialog[open]'))return;
      artifactSidebarHidden=!artifactSidebarHidden;saveArtifactSidebar();page.layout();
      window.dispatchEvent(new Event('kindred-native-geometry'));
    };
    const dragGeometry=()=>{const l=window.__KINDRED_IOS_LAYOUT||{},g=window.__KINDRED_NATIVE_GEOMETRY||{};return JSON.stringify([innerWidth,nativeHeight||innerHeight,l.isDuoInner,l.railSide,l.leftInset,l.rightInset,l.topInset,l.bottomInset,(g.reservedRegions||[]).filter(r=>r.active!==false).map(r=>[r.kind,r.x,r.y,r.width,r.height])]);};
    handle.addEventListener('pointerdown',event=>{
      if(handle.hidden||event.button!==0||!event.isPrimary||page.drag||document.querySelector('dialog[open]'))return;
      event.preventDefault();event.stopImmediatePropagation();
      const before=artifactSidebarWidth,start=library.getBoundingClientRect().width,x=event.clientX,id=event.pointerId,geometry=dragGeometry();
      const shield=document.createElement('div');shield.className='pane-resize-shield';shield.setAttribute('aria-hidden','true');document.body.append(shield);
      root.dataset.iosArtifactResizing='true';html.classList.add('pane-resizing');handle.setPointerCapture(id);
      const move=next=>{if(next.pointerId===id){artifactSidebarWidth=Math.max(76,Math.min(Number(handle.getAttribute('aria-valuemax')),start+next.clientX-x));page.layout();}};
      const finish=commit=>{
        if(!page.drag)return;page.drag=null;
        handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel);handle.removeEventListener('lostpointercapture',cancel);document.removeEventListener('keydown',escape,true);
        if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
        shield.remove();delete root.dataset.iosArtifactResizing;html.classList.remove('pane-resizing');
        if(!commit)artifactSidebarWidth=before;else{if(artifactSidebarWidth<128)artifactSidebarWidth=76;saveArtifactSidebar();}
        page.layout();window.dispatchEvent(new Event('kindred-native-geometry'));
      };
      const up=next=>{if(next.pointerId===id)finish(true);},cancel=()=>finish(false),escape=next=>{if(next.key==='Escape'){next.preventDefault();cancel();}};
      page.drag={cancel,geometry};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);document.addEventListener('keydown',escape,true);
    });
    handle.addEventListener('keydown',event=>{
      if(handle.hidden||page.drag||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();
      const maximum=Number(handle.getAttribute('aria-valuemax'));
      artifactSidebarWidth=event.key==='Home'?76:event.key==='End'?maximum:Math.max(76,Math.min(maximum,library.getBoundingClientRect().width+(event.key==='ArrowLeft'?-16:16)));
      saveArtifactSidebar();page.layout();window.dispatchEvent(new Event('kindred-native-geometry'));
    });
    const checkDrag=event=>{if(page.drag&&(event?.type==='pagehide'||page.drag.geometry!==dragGeometry()||document.hidden||document.querySelector('dialog[open]')))page.drag.cancel();};
    const modalObserver=observeUI(checkDrag);modalObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
    for(const event of ['kindred-ios-layout','kindred-native-geometry','resize','pagehide'])window.addEventListener(event,checkDrag);
    document.addEventListener('visibilitychange',checkDrag);
    back.onclick = () => {
      page.ignoredRoute = location.pathname;
      history.pushState({}, '', '/artifacts');
      show(false);
      library.querySelector('.artifact-studio-library-item.selected')?.focus({preventScroll:true});
    };
    // The server rebuilds the document toolbar when refreshing a preview.
    const placeBack = () => {
      if (back.parentElement !== toolbar) toolbar.prepend(back);
      if (documentMore.parentElement !== toolbar) toolbar.append(documentMore);
    };
    const toolbarObserver = observeUI(placeBack);
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
    page.show = show; page.dispose = () => {
      page.drag?.cancel();toolbarObserver.disconnect();modalObserver.disconnect();
      for(const event of ['kindred-ios-layout','kindred-native-geometry','resize','pagehide'])window.removeEventListener(event,checkDrag);
      document.removeEventListener('visibilitychange',checkDrag);
    };
    artifactPages.set(root, page);
    show(artifactDocumentRoute());
  };
  const syncArtifacts = () => {
    for (const [root, page] of artifactPages) {
      if (!root.isConnected) { page.dispose(); artifactPages.delete(root); }
      else page.layout();
    }
    shell.querySelectorAll('.artifact-studio').forEach(mountArtifacts);
  };
  observeUI(syncArtifacts).observe(shell, {childList:true});
  const syncArtifactPage = () => {
    for (const page of artifactPages.values()) page.show(artifactDocumentRoute());
  };
  window.addEventListener(artifactRouteEvent, syncArtifactPage);
  window.addEventListener('popstate', syncArtifactPage);
  window.addEventListener('hashchange', syncArtifactPage);
  for(const event of ['kindred-ios-layout','kindred-native-geometry','kindred-ios-toolbar','resize']) window.addEventListener(event,()=>{for(const page of artifactPages.values())page.layout();});
  observeUI(()=>{for(const page of artifactPages.values())page.layout();}).observe(html,{attributes:true,attributeFilter:['style']});
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
  accounts.setAttribute('aria-label', 'More options');
  accounts.title = 'More options';
  accounts.innerHTML = icon('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>');
  accounts.setAttribute('aria-haspopup','menu');
  accounts.setAttribute('aria-expanded','false');
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
  more.hidden = true;
  accounts.after(more);
  const libraryMenu = document.createElement('div');
  libraryMenu.id = 'ios-library-menu';
  libraryMenu.setAttribute('popover', 'auto');
  libraryMenu.setAttribute('role', 'menu');
  libraryMenu.setAttribute('aria-label', 'More options');
  let libraryMenuAnchor=accounts;
  // Keep the original navigation entries in place: the Artifacts workspace
  // reuses its entry as the return-to-Chats action while it is open.
  for (const [id, label, path] of [
    ['settings-button', 'Settings', '<circle cx="12" cy="12" r="8"/>'],
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
    item.dataset.navigation=id;
    item.onclick = () => {
      libraryMenu.hidePopover();
      if(id==='artifacts-button'&&document.querySelector('.artifact-studio')) document.querySelector('.artifact-studio-library-brand')?.click();
      else document.getElementById(id)?.click();
    };
    libraryMenu.append(item);
  }
  const manageAccounts=document.createElement('button');
  manageAccounts.type='button';manageAccounts.setAttribute('role','menuitem');manageAccounts.textContent='Manage accounts';
  manageAccounts.onclick=()=>{libraryMenu.hidePopover();window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'open'});};
  libraryMenu.append(manageAccounts);
  document.body.append(libraryMenu);
  const positionLibraryMenu = () => {
    if (!libraryMenu.matches(':popover-open')) return;
    const anchor = libraryMenuAnchor.getBoundingClientRect();
    libraryMenu.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - libraryMenu.offsetWidth - 12))}px`;
    libraryMenu.style.top = `${anchor.bottom + 8}px`;
  };
  function openLibraryMenu(anchor) {
    libraryMenuAnchor.setAttribute('aria-expanded','false');
    libraryMenuAnchor=anchor;
    lastMenuSource=anchor;
    const artifactItem=libraryMenu.querySelector('[data-navigation=artifacts-button] span');
    if(artifactItem){const artifacts=!!document.querySelector('.artifact-studio');artifactItem.textContent=artifacts?'Chats':'Artifacts';artifactItem.previousElementSibling.innerHTML=artifacts?'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-5a9 9 0 0 1-.9-4 8.4 8.4 0 0 1 8.5-9H13a8.4 8.4 0 0 1 8 8z"/>':'<path d="M3 7h7l2 2h9v11H3z"/>';}
    libraryMenu.togglePopover();
    positionLibraryMenu();
  }
  accounts.onclick = () => openLibraryMenu(accounts);
  more.onclick = () => openLibraryMenu(more);
  libraryMenu.addEventListener('toggle', event => libraryMenuAnchor.setAttribute('aria-expanded', String(event.newState === 'open')));
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
    const palette = document.querySelector('#search-trigger');
    if (palette) { palette.click(); return; }
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
      const centered = settings.hasAttribute('data-ios-sheet');
      const painted = getComputedStyle(settings);
      const frames = centered ? [{opacity:painted.opacity,translate:painted.translate},{opacity:0,translate:'0 10px'}]
        : [{transform:getComputedStyle(settings).transform},{transform:'translateY(100%)'}];
      const animation = settings.animate(frames,
        {duration:centered?180:240,easing:centered?'ease-out':'cubic-bezier(.4,0,.8,.2)',fill:'forwards'});
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
    accountInitial.textContent = initial;
    accountName.textContent = document.querySelector('#identity-name')?.textContent.trim() || 'Your account';
  };
  if (avatar) observeUI(updateAccount).observe(avatar, {subtree:true, childList:true, characterData:true});
  const identityName = document.querySelector('#identity-name');
  if (identityName) observeUI(updateAccount).observe(identityName, {subtree:true, childList:true, characterData:true});
  updateAccount();
  const computer = document.querySelector('#computer-panel');
  const botCenter = () => computer?.classList.contains('has-bot-center') === true;
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
    const pauseObserver = observeUI(adaptControlNotice);
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
      if (!child.matches('.panel-header, #desktop, .bot-center-heading, .ios-duo-resizer, .ios-computer-edge')) controls.append(child);
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
    observeUI(updateControl).observe(computer,{attributes:true,attributeFilter:['class','hidden','width','height'],childList:true,subtree:true});
    updateControl();
  }
  // The shared phone UI suppresses expansion for every iOS client. Native
  // geometry distinguishes an open inner display or tablet from a slab.
  if (computer) {
    const measureComputerChrome = () => {
      if (!botCenter() || computer.hidden) return;
      const css = getComputedStyle(computer);
      const height = [...computer.querySelectorAll(':scope>.bot-center-heading,:scope>.ios-computer-controls')]
        .reduce((total,node) => total+node.getBoundingClientRect().height,0)+(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)+8;
      const text = Math.ceil(height)+'px';
      if (computer.style.getPropertyValue('--ios-center-chrome') !== text) computer.style.setProperty('--ios-center-chrome',text);
    };
    let fitFrame = 0;
    const fitComputerChrome = () => {
      if (fitFrame) return;
      fitFrame = requestAnimationFrame(() => { fitFrame = 0; measureComputerChrome(); });
    };
    const chromeSize = new ResizeObserver(fitComputerChrome);
    for (const node of computer.querySelectorAll(':scope>.bot-center-heading,:scope>.ios-computer-controls')) chromeSize.observe(node);
    observeUI(fitComputerChrome).observe(computer,{attributes:true,attributeFilter:['hidden','class'],childList:true});
    fitComputerChrome();
  }
  document.querySelector('#computer-expand')?.addEventListener('click', event => {
    if (!computer || html.dataset.iosSlab !== 'false' ||
        (nativeDuo && html.dataset.iosDuoInner !== 'true')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const expanded = !computer.classList.contains('expanded');
    computer.classList.toggle('expanded',expanded);
    const button = event.currentTarget;
    button.setAttribute('aria-label',expanded ? 'Collapse computer' : 'Expand computer');
    button.title = expanded ? 'Collapse computer' : 'Expand computer';
    button.innerHTML = icon(expanded
      ? '<path d="m7 6 6 6-6 6m6-12 6 6-6 6"/>'
      : '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>');
  },true);
  // Keep the installed app's sidebar independent of older server fold widths.
  // Each account already has an isolated WebKit store; profile IDs scope its
  // preference further when that account switches profiles.
  const nativeSidebarKey = 'kindred-ios-sidebar-v1:' + (window.__KINDRED_MOBILE_PROFILE || '');
  let nativeSidebarWidth = 210, nativeComputerWidth = 240, nativeSidebarHidden = false, nativeSidebarDrag = null, nativeSidebarStamp = '';
  try {
    const saved = JSON.parse(localStorage.getItem(nativeSidebarKey) || 'null');
    if (saved && Number.isFinite(saved.width) && saved.width >= 76 && saved.width <= 600 && typeof saved.hidden === 'boolean') {
      nativeSidebarWidth = saved.width; nativeSidebarHidden = saved.hidden;
      if (Number.isFinite(saved.computerWidth) && saved.computerWidth >= 240 && saved.computerWidth <= 800) nativeComputerWidth = saved.computerWidth;
    }
  } catch {}
  const saveNativeSidebar = () => { try { localStorage.setItem(nativeSidebarKey,JSON.stringify({width:nativeSidebarWidth,computerWidth:nativeComputerWidth,hidden:nativeSidebarHidden})); } catch {} };
  const nativeSidebarOwnsLayout = () => html.dataset.iosDuoInner === 'true' && html.dataset.iosLayout === 'regular' && !shell.hidden && !document.querySelector('.artifact-studio') && (computer?.hidden || (html.dataset.iosComputer === 'side' && !computer.classList.contains('expanded')));
  const nativeSidebarActive = () => nativeSidebarOwnsLayout() && document.querySelector('#details-panel')?.hidden !== false;
  const nativeComputerActive = () => !botCenter() && html.dataset.iosDuoInner === 'true' && !computer?.hidden && !computer.classList.contains('expanded') && html.dataset.iosComputer === 'side' && !(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).some(region => region.active !== false && region.kind === 'division' && region.width > 0 && region.height > 0 && region.x < innerWidth && region.x+region.width > 0 && region.y < (nativeHeight||innerHeight) && region.y+region.height > 0);
  const nativeSidebarBlocked = () => document.hidden || shell.hidden || !!document.querySelector('dialog[open],.artifact-studio') || computer?.classList.contains('expanded');
  const nativeSidebarLeading = () => nativeDuo && html.dataset.iosRailSide === 'left' ? Math.min(innerWidth,Math.max(0,Number(window.__KINDRED_IOS_LAYOUT?.leftInset)||0)) : 0;
  const nativeSidebarGeometry = () => JSON.stringify([window.__KINDRED_NATIVE_GEOMETRY || {},html.dataset.iosRailSide]);
  function syncNativeSidebar(notify = false) {
    html.toggleAttribute('data-ios-bot-center',botCenter());
    if (!sidebar) return;
    // Earlier servers count inactive fold divisions and can mark a fitting
    // flat three-pane layout compact. Use installed-app widths for that pose.
    if (html.dataset.iosDuoInner === 'true' && !html.hasAttribute('data-ios-fold') && !computer?.hidden && html.dataset.iosComputer === 'side' && !(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).some(region => region.active !== false && region.kind === 'division' && region.width > 0 && region.height > 0 && region.x < innerWidth && region.x+region.width > 0 && region.y < (nativeHeight||innerHeight) && region.y+region.height > 0)) {
      const css = getComputedStyle(shell), available = shell.clientWidth-(parseFloat(css.paddingLeft)||0)-(parseFloat(css.paddingRight)||0), scale = parseFloat(getComputedStyle(html).getPropertyValue('--text-scale')) || 1;
      if ((nativeHeight||innerHeight) >= 480 && available-(nativeSidebarHidden?0:Math.max(76,Math.min(nativeSidebarWidth,available/4-nativeSidebarLeading()))+nativeSidebarLeading())-(botCenter()?0:nativeComputerWidth) >= 300*scale && html.dataset.iosLayout !== 'regular') html.dataset.iosLayout = 'regular';
    }
    if (nativeSidebarDrag && (!(nativeSidebarDrag.kind === 'computer' ? nativeComputerActive() : nativeSidebarActive()) || nativeSidebarBlocked() || nativeSidebarDrag.geometry !== nativeSidebarGeometry())) nativeSidebarDrag.cancel();
    const active = nativeSidebarOwnsLayout();
    const style = getComputedStyle(shell), contentLeft = shell.getBoundingClientRect().left + (parseFloat(style.paddingLeft) || 0);
    const width = shell.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const other = !botCenter() && !computer?.hidden && html.dataset.iosComputer === 'side' ? computer.getBoundingClientRect().width : 0;
    const scale = parseFloat(getComputedStyle(html).getPropertyValue('--text-scale')) || 1;
    const leading = nativeSidebarLeading();
    let maximum = Math.max(76,Math.min(width/4-leading,width - other - leading - (!computer?.hidden ? 300 : 360) * scale));
    for (const region of window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []) {
      if (region.active !== false && region.kind === 'division' && region.height > region.width && region.x > contentLeft) maximum = Math.min(maximum,Math.max(76,region.x-contentLeft-leading));
    }
    maximum = Math.floor(maximum);
    const shownWidth = Math.max(76,Math.min(nativeSidebarWidth,maximum));
    for (const [name,value] of Object.entries({iosNativeSidebar:active,iosNativeSidebarHidden:active && nativeSidebarHidden,iosNativeSidebarRail:active && shownWidth < 128})) {
      if (html.dataset[name] !== String(value)) html.dataset[name] = String(value);
    }
    if (html.style.getPropertyValue('--ios-native-sidebar-width') !== shownWidth+leading+'px') html.style.setProperty('--ios-native-sidebar-width',shownWidth+leading+'px');
    if (html.style.getPropertyValue('--ios-native-sidebar-leading') !== leading+'px') html.style.setProperty('--ios-native-sidebar-leading',leading+'px');
    let detailsLeft = active && !nativeSidebarHidden ? shownWidth+leading : 0;
    if (botCenter() && html.dataset.iosDuoInner === 'true') {
      const split = (window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).find(region => region.active !== false && region.kind === 'division' && region.height > region.width && region.x > contentLeft && region.x+region.width < contentLeft+width);
      if (split) detailsLeft = Math.max(detailsLeft,split.x+split.width-shell.getBoundingClientRect().left);
    }
    if (html.style.getPropertyValue('--ios-details-left') !== detailsLeft+'px') html.style.setProperty('--ios-details-left',detailsLeft+'px');
    html.dataset.iosNativeSidebarDraggable = String(nativeSidebarActive());
    if (active) {
      const handles = [...sidebar.querySelectorAll(':scope>.ios-duo-resizer')];
      let handle = handles.shift();
      for (const duplicate of handles) duplicate.remove();
      if (!handle) {
        handle = document.createElement('div'); handle.className = 'ios-duo-resizer'; handle.dataset.pane = 'sidebar'; handle.tabIndex = 0;
        handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical'); handle.setAttribute('aria-label','Resize chat list'); sidebar.append(handle);
      }
      handle.setAttribute('aria-valuemin','76'); handle.setAttribute('aria-valuemax',String(Math.round(maximum))); handle.setAttribute('aria-valuenow',String(Math.round(shownWidth)));
    }
    const computerActive = nativeComputerActive(), computerMaximum = Math.max(240,Math.min(800,width-(active&&!nativeSidebarHidden?shownWidth+leading:0)-300*scale));
    const shownComputerWidth = Math.max(240,Math.min(nativeComputerWidth,computerMaximum));
    if (html.dataset.iosNativeComputer !== String(computerActive)) html.dataset.iosNativeComputer = String(computerActive);
    if (html.style.getPropertyValue('--ios-native-computer-width') !== shownComputerWidth+'px') html.style.setProperty('--ios-native-computer-width',shownComputerWidth+'px');
    if (computerActive) {
      const handles = [...computer.querySelectorAll(':scope>.ios-duo-resizer')]; let handle = handles.shift(); for (const duplicate of handles) duplicate.remove();
      if (!handle) { handle = document.createElement('div'); handle.className = 'ios-duo-resizer'; handle.dataset.pane = 'computer'; handle.tabIndex = 0; handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical'); handle.setAttribute('aria-label','Resize bot computer'); computer.append(handle); }
      handle.setAttribute('aria-valuemin','240'); handle.setAttribute('aria-valuemax',String(Math.round(computerMaximum))); handle.setAttribute('aria-valuenow',String(Math.round(shownComputerWidth)));
    }
    const stamp = [active,nativeSidebarHidden,shownWidth,leading,computerActive,shownComputerWidth].join(':');
    const changed = stamp !== nativeSidebarStamp; nativeSidebarStamp = stamp;
    updateNavigation();
    if (changed && notify === true) window.dispatchEvent(new Event('kindred-native-geometry'));
  }
  window.__kindredNativeSidebar = {active:nativeSidebarActive,cancel() { nativeSidebarDrag?.cancel(); },toggle() {
    if (!nativeSidebarActive() || document.querySelector('dialog[open]') || nativeSidebarDrag) return;
    nativeSidebarHidden = !nativeSidebarHidden; saveNativeSidebar(); syncNativeSidebar(true);
  }};
  document.addEventListener('pointerdown',event => {
    const handle = event.target.closest?.('.sidebar>.ios-duo-resizer,.computer-panel>.ios-duo-resizer'), isComputer = handle?.dataset.pane === 'computer';
    if (!handle || !(isComputer ? nativeComputerActive() : nativeSidebarActive()) || nativeSidebarBlocked() || (!isComputer && nativeSidebarHidden) || event.button !== 0 || !event.isPrimary || nativeSidebarDrag) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const before = isComputer ? nativeComputerWidth : nativeSidebarWidth, start = (isComputer ? computer : sidebar).getBoundingClientRect().width-(isComputer?0:nativeSidebarLeading()), x = event.clientX, id = event.pointerId;
    const geometry = nativeSidebarGeometry(), shield = document.createElement('div'); shield.className = 'pane-resize-shield'; shield.setAttribute('aria-hidden','true'); document.body.append(shield);
    html.classList.add('pane-resizing'); handle.setPointerCapture(id);
    const move = next => { if (next.pointerId === id) { const value = Math.max(isComputer?240:76,Math.min(Number(handle.getAttribute('aria-valuemax')),start+(next.clientX-x)*(isComputer?-1:1))); if(isComputer) nativeComputerWidth=value; else nativeSidebarWidth=value; syncNativeSidebar(true); } };
    const end = commit => {
      if (!nativeSidebarDrag) return;
      nativeSidebarDrag = null;
      handle.removeEventListener('pointermove',move); handle.removeEventListener('pointerup',up); handle.removeEventListener('pointercancel',cancel); handle.removeEventListener('lostpointercapture',cancel); document.removeEventListener('keydown',escape,true);
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
      shield.remove(); html.classList.remove('pane-resizing');
      if (!commit) { if(isComputer) nativeComputerWidth=before; else nativeSidebarWidth=before; }
      else { if (!isComputer && nativeSidebarWidth < 128) nativeSidebarWidth = 76; saveNativeSidebar(); }
      syncNativeSidebar();
      // Keep remote input gated until the shared controller verifies the final
      // canvas transform, including a cancelled drag that changed no width.
      window.dispatchEvent(new Event('kindred-native-geometry'));
    };
    const up = next => { if (next.pointerId === id) end(true); }, cancel = () => end(false), escape = next => { if (next.key === 'Escape') { next.preventDefault(); cancel(); } };
    nativeSidebarDrag = {kind:isComputer?'computer':'sidebar',geometry,cancel}; handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',up); handle.addEventListener('pointercancel',cancel); handle.addEventListener('lostpointercapture',cancel); document.addEventListener('keydown',escape,true);
    shell.dataset.mobileResizing = 'true'; window.dispatchEvent(new Event('kindred-native-geometry'));
  },true);
  document.addEventListener('keydown',event => {
    const isComputer = event.target.matches?.('.computer-panel>.ios-duo-resizer');
    if (!event.target.matches?.('.sidebar>.ios-duo-resizer,.computer-panel>.ios-duo-resizer') || !(isComputer?nativeComputerActive():nativeSidebarActive()) || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const maximum = Number(event.target.getAttribute('aria-valuemax'));
    const minimum = isComputer?240:76,previous = isComputer?nativeComputerWidth:nativeSidebarWidth;
    const value = event.key === 'Home' ? minimum : event.key === 'End' ? maximum : Math.max(minimum,Math.min(maximum,previous+(event.key === 'ArrowLeft' ? -16 : 16)*(isComputer?-1:1)));
    if(isComputer) nativeComputerWidth=value; else nativeSidebarWidth=value;
    saveNativeSidebar(); syncNativeSidebar(true);
  },true);
  for (const type of ['pointerdown','pointermove','pointerup','click','keydown','keyup','touchstart','touchmove','touchend']) document.addEventListener(type,event => {
    if (nativeSidebarDrag && event.target.closest?.('#desktop,#desktop-paste,#take-control,#ios-computer-input')) { event.preventDefault(); event.stopImmediatePropagation(); }
  },{capture:true,passive:false});
  document.addEventListener('click',event => {
    if (event.target.closest?.('#ios-search') && nativeSidebarActive() && (nativeSidebarHidden || nativeSidebarWidth < 128)) {
      nativeSidebarHidden = false; nativeSidebarWidth = Math.max(210,nativeSidebarWidth); saveNativeSidebar(); syncNativeSidebar(true);
    }
  },true);
  observeUI(() => syncNativeSidebar()).observe(html,{attributes:true,attributeFilter:['style','data-ios-layout','data-ios-duo-inner']});
  observeUI(() => syncNativeSidebar()).observe(sidebar,{childList:true});
  // The deployed desktop slide also animates a flex reservation. Native pane
  // widths and its resize callback can invalidate that frame before it ends.
  // Settle through the server's own cancellation closure before paint; a bounded opacity effect
  // then fades the retained pane at its final native geometry. No navigation,
  // computer connection or completion handler is replaced.
  const paneFades = new Map();
  const finishPaneFades = () => { for (const fade of [...paneFades.values()]) fade.finish(); };
  for (const type of ['pagehide','resize']) window.addEventListener(type,finishPaneFades);
  document.addEventListener('visibilitychange',() => { if (document.hidden) finishPaneFades(); });
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',event => { if (event.matches) finishPaneFades(); });
  observeUI(() => { if (html.dataset.motion === 'off') finishPaneFades(); }).observe(html,{attributes:true,attributeFilter:['data-motion']});
  function settleNativePaneFrames() {
    if (!nativeDuo) return;
    for (const panel of shell.querySelectorAll(':scope>.pane-layout-frame')) {
      const motion = panel.getAnimations().find(animation => animation.effect?.getKeyframes().some(frame => frame.transform && frame.width));
      if (!motion) continue;
      const frames = motion.effect.getKeyframes(), first = frames[0];
      const offset = new DOMMatrix(first.transform);
      const exit = {left:(parseFloat(panel.style.left)||0)+offset.m41,
        top:(parseFloat(panel.style.top)||0)+offset.m42,width:parseFloat(first.width),height:parseFloat(first.height)};
      const closing = panel.inert;
      motion.cancel();
      // Animation cancel events are queued. Invoke the same owner callback
      // now so its held frame/reservation is gone before this paint.
      if (panel.classList.contains('pane-layout-frame')) motion.dispatchEvent(new Event('cancel'));
      const previous = paneFades.get(panel);
      const startOpacity = previous ? Number(getComputedStyle(panel).opacity) : (closing?1:0);
      previous?.finish();
      panel.classList.remove('ios-pane-closing');
      const reduced = html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (reduced) continue;
      if (closing && panel.hidden && Object.values(exit).every(Number.isFinite)) {
        for (const [name,value] of Object.entries(exit)) panel.style.setProperty('--ios-pane-exit-'+name,value+'px');
        panel.classList.add('ios-pane-closing');
      }
      const fade = panel.animate([{opacity:startOpacity},{opacity:closing?0:1}],{duration:200,easing:'ease-out',fill:'both'});
      let timer,done=false;
      const finish = () => {
        if (done) return; done=true; clearTimeout(timer);
        if (paneFades.get(panel)?.animation !== fade) return;
        paneFades.delete(panel); panel.classList.remove('ios-pane-closing');
        for (const name of Object.keys(exit)) panel.style.removeProperty('--ios-pane-exit-'+name);
        fade.onfinish = fade.oncancel = null; fade.cancel();
      };
      paneFades.set(panel,{animation:fade,finish});
      fade.onfinish = fade.oncancel = finish;
      timer=setTimeout(finish,320);
    }
  }
  observeUI(records => {
    records = records.filter(record => record.target === shell ||
      record.target.matches?.('.details-panel,.computer-panel') || sidebar.contains(record.target));
    if (!records.length) return;
    settleNativePaneFrames(); syncNativeSidebar();
    if (records.some(record => record.target === shell || record.target.matches?.('.details-panel,.computer-panel'))) {
      updateNativeContentClearance(); scheduleContentClearance();
    }
  }).observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class']});
  observeUI(() => { if (nativeSidebarDrag && nativeSidebarBlocked()) nativeSidebarDrag.cancel(); }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',() => { if (document.hidden) nativeSidebarDrag?.cancel(); });
  for (const type of ['pagehide','blur','popstate','hashchange']) window.addEventListener(type,() => nativeSidebarDrag?.cancel());
  window.addEventListener('kindred-native-geometry',() => syncNativeSidebar());
  syncNativeSidebar();
  function updateNavigation() {
    const isCompact = html.dataset.iosLayout ? html.dataset.iosLayout === 'compact' : compact.matches;
    const railClasses = ['sidebar-rail', 'sidebar-fading', 'sidebar-peek'];
    if (isCompact && railClasses.some(name => shell.classList.contains(name))) shell.classList.remove(...railClasses);
    const open = shell.classList.contains('sidebar-open');
    menu?.setAttribute('aria-expanded', String(open));
    const hiddenList = html.dataset.iosNativeSidebar === 'true' ? nativeSidebarHidden : html.dataset.iosSidebarHidden === 'true';
    if (sidebar) sidebar.inert = (isCompact && !open) || (hiddenList && !html.classList.contains('pane-resizing'));
    if (sidebar?.inert && libraryMenu.matches(':popover-open')) libraryMenu.hidePopover();
    if (conversation) conversation.inert = isCompact && open;
  }
  compact.addEventListener('change', updateNavigation);
  observeUI(updateNavigation).observe(shell, {attributes:true, attributeFilter:['class']});
  observeUI(updateNavigation).observe(html, {attributes:true, attributeFilter:['class','data-ios-layout','data-ios-sidebar-hidden']});
  updateNavigation();
  // Animate retained chrome between local display geometries. Pixel bounds,
  // rather than scale transforms, keep text and touch targets at their real size.
  const chromeNodes = () => [...document.querySelectorAll('#composer,.conversation-header .bot-heading,.conversation>.composer-area>.jump-latest')];
  const chromeRects = new Map(), chromePainted = new Map(), chromeTargets = new Map(), chromeMotions = new Map();
  let identityGhost = null, identityTimer = 0, identityWait = 0, identityGeneration = 0, identityReady = null;
  let lastIdentityRect = null;
  const identityFrame = (remembered = false) => {
    const rect = window.__KINDRED_IOS_TOOLBAR?.identity;
    if (rect && ['x','y','width','height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0) {
      lastIdentityRect = {...rect}; return lastIdentityRect;
    }
    return remembered ? lastIdentityRect : null;
  };
  window.addEventListener('kindred-ios-toolbar',() => identityFrame());
  const finishIdentityHandoff = () => {
    identityGeneration++; clearTimeout(identityTimer); clearTimeout(identityWait);
    if (identityReady) window.removeEventListener('kindred-ios-toolbar',identityReady); identityReady = null;
    identityTimer = identityWait = 0; identityGhost?.remove(); identityGhost = null;
    delete html.dataset.iosIdentityHandoff;
  };
  // The live identity remains one accessible button. A temporary, inert visual
  // bridges its web tag and the system toolbar's measured avatar bounds.
  function updateIdentityPlacement(inToolbar) {
    const previous = html.dataset.iosToolbarIdentity;
    if (previous === String(inToolbar)) return;
    const tag = document.querySelector('.conversation-header .bot-heading');
    const source = identityGhost?.getBoundingClientRect() || (previous === 'true' ? identityFrame(true) : chromePainted.get(tag) || chromeRects.get(tag) || tag?.getBoundingClientRect());
    const sourceOpacity = identityGhost ? Number(getComputedStyle(identityGhost).opacity) : previous === 'true' ? 0 : 1;
    const nameOpacity = identityGhost ? Number(getComputedStyle(identityGhost.lastElementChild).opacity) : previous === 'true' ? 0 : 1;
    finishIdentityHandoff();
    html.dataset.iosToolbarIdentity = String(inToolbar);
    const covered = computer?.hidden === false || document.querySelector('#details-panel')?.hidden === false ||
      document.querySelector('.artifact-studio,dialog[open]') || conversation.inert;
    if (previous === undefined || previous === String(inToolbar) || !tag || !nativeDuo || document.hidden || covered ||
        html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const generation = identityGeneration;
    html.dataset.iosIdentityHandoff = 'true';
    const ghost = tag.cloneNode(true); ghost.classList.add('ios-identity-handoff');
    ghost.removeAttribute('id'); ghost.removeAttribute('disabled'); ghost.inert = true; ghost.setAttribute('aria-hidden','true');
    const svgIDs = new Map();
    for (const node of ghost.querySelectorAll('[id]')) {
      if (node.closest('svg')) { const next = 'ios-handoff-'+generation+'-'+node.id; svgIDs.set(node.id,next); node.id = next; }
      else node.removeAttribute('id');
    }
    for (const node of ghost.querySelectorAll('svg,svg *')) for (const attr of [...node.attributes]) {
      let value = attr.value;
      for (const [before,after] of svgIDs) value = value.replaceAll('#'+before,'#'+after);
      if (value !== attr.value) node.setAttribute(attr.name,value);
    }
    ghost.firstElementChild.style.cssText = 'display:flex;flex:none;align-items:center';
    const avatar = ghost.querySelector('.character'); if (avatar) avatar.style.cssText += ';width:30px!important;height:30px!important';
    const name = ghost.lastElementChild;
    name.style.cssText += ';min-width:0;overflow:hidden;white-space:nowrap;flex:1';
    ghost.style.cssText = 'position:fixed!important;left:0;top:0;transform:none!important;margin:0!important;max-width:none!important;min-width:0!important;min-height:0!important;pointer-events:none!important;z-index:30;overflow:hidden;box-sizing:border-box;visibility:visible!important;';
    if (source?.width && source.height) {
      Object.assign(ghost.style,{left:source.x+'px',top:source.y+'px',width:source.width+'px',height:source.height+'px',opacity:String(sourceOpacity)});
      document.body.append(ghost); identityGhost = ghost;
    }
    let started = false;
    const start = (fallback = false) => {
      if (started || generation !== identityGeneration) return;
      const natural = tag.getBoundingClientRect(), native = identityFrame();
      if (inToolbar && !native && !fallback) return;
      const target = inToolbar ? native || (source && {x:source.x+source.width/2-19,y:source.y,width:38,height:38}) : natural;
      if (!target?.width || !target.height) { finishIdentityHandoff(); return; }
      started = true; clearTimeout(identityWait);
      const from = source?.width && source.height ? source : {...target,x:target.x+target.width/2-19,width:38,height:38};
      ghost.style.opacity = '';
      document.body.append(ghost); identityGhost = ghost;
      html.dataset.iosIdentityHandoff = 'true';
      const frame = rect => ({left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
      const motion = ghost.animate([
        {...frame(from),padding:inToolbar?'5px 12px 5px 8px':'4px',gap:inToolbar?'8px':'0px',opacity:sourceOpacity},
        {...frame(target),padding:inToolbar?'4px':'5px 12px 5px 8px',gap:inToolbar?'0px':'8px',opacity:inToolbar?0:1},
      ],{duration:280,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
      name.animate([{opacity:nameOpacity},{opacity:inToolbar?0:1}],{duration:220,fill:'both'});
      motion.finished.then(() => { if(generation === identityGeneration) finishIdentityHandoff(); },() => {});
      identityTimer = setTimeout(() => { if(generation === identityGeneration) finishIdentityHandoff(); },650);
    };
    // UIKit can publish its final control frame one layout pass after the pose.
    requestAnimationFrame(() => requestAnimationFrame(() => start()));
    const ready = () => { if (generation === identityGeneration) start(); window.removeEventListener('kindred-ios-toolbar',ready); };
    if (inToolbar) { identityReady = ready; window.addEventListener('kindred-ios-toolbar',ready,{once:true}); }
    identityWait = setTimeout(() => { window.removeEventListener('kindred-ios-toolbar',ready); start(true); },180);
  }
  let chromePose = '', chromeLayout = '', chromeKeyboard, chromeFrame = 0, chromeTimer = 0, chromeActive = false;
  const chromeRect = node => {
    if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return null;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null;
  };
  const displayPose = () => {
    const geometry = window.__KINDRED_NATIVE_GEOMETRY, layout = window.__KINDRED_IOS_LAYOUT;
    if (!nativeDuo || !geometry || !layout) return '';
    // Host height/safe-area changes caused by the keyboard are intentionally absent.
    return JSON.stringify([geometry.windowWidth,geometry.windowHeight,layout.isDuoInner,layout.isPortrait,layout.railSide,
      (geometry.reservedRegions || []).filter(r => r.kind === 'division' && r.active !== false && r.width>0 && r.height>0)
        .map(r => r.height>r.width ? ['vertical',r.x,r.width] : ['horizontal',r.y,r.height]).sort()]);
  };
  const finishChromeMotion = () => {
    clearTimeout(chromeTimer); chromeTimer = 0;
    for (const motion of chromeMotions.values()) { motion.onfinish = motion.oncancel = null; motion.cancel(); }
    chromeMotions.clear(); chromeTargets.clear(); chromePainted.clear(); chromeActive = false;
    delete html.dataset.iosChromeMorphing; chromeRects.clear();
    for (const node of chromeNodes()) chromeRects.set(node,chromeRect(node));
  };
  function scheduleChromeMotion() {
    if (chromeFrame) return;
    chromeFrame = requestAnimationFrame(() => {
      chromeFrame = 0;
      if (!nativeDuo) { chromePose = ''; finishChromeMotion(); return; }
      const geometry = window.__KINDRED_NATIVE_GEOMETRY;
      // A resize can precede its native geometry message. Keep the last painted
      // source until that message arrives instead of caching half-reflowed bounds.
      if (nativeDuo && Number.isFinite(geometry?.width) && Math.abs(geometry.width-innerWidth)>1) return;
      const nextPose = displayPose(), changed = chromePose && nextPose && nextPose !== chromePose;
      chromePose = nextPose;
      const keyboard = window.__KINDRED_IOS_LAYOUT?.keyboardVisible === true;
      const keyboardChanged = chromeKeyboard !== undefined && chromeKeyboard !== keyboard;
      chromeKeyboard = keyboard;
      const lane = conversation.getBoundingClientRect(), area = document.querySelector('#composer-area');
      const bounds = area?.getBoundingClientRect(), css = area && getComputedStyle(area);
      const layout = JSON.stringify([lane.x,lane.y,lane.width,lane.height,bounds?.x,bounds?.width,bounds?.bottom,css?.paddingLeft,css?.paddingRight,
        header.style.getPropertyValue('--ios-native-control-left'),header.style.getPropertyValue('--ios-native-control-right')]);
      const layoutChanged = layout !== chromeLayout; chromeLayout = layout;
      if (keyboardChanged) { finishChromeMotion(); return; }
      if (!changed && chromeActive && !layoutChanged) {
        for (const node of chromeNodes()) chromePainted.set(node,chromeRect(node));
        return;
      }
      const reduced = html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (!changed && !chromeActive) {
        chromeRects.clear();
        for (const node of chromeNodes()) chromeRects.set(node,chromeRect(node));
        return;
      }
      if (reduced || document.hidden || html.classList.contains('pane-resizing')) { finishChromeMotion(); return; }
      const before = new Map();
      for (const node of chromeNodes()) before.set(node,chromeActive ? (chromePainted.get(node) || chromeRect(node)) : chromeRects.get(node));
      // Cancel only our effects, then measure the natural destination after
      // native/sidebar observers have applied the latest geometry in this frame.
      for (const motion of chromeMotions.values()) { motion.onfinish = motion.oncancel = null; motion.cancel(); }
      chromeMotions.clear(); chromeTargets.clear();
      for (const node of chromeNodes()) {
        const target = chromeRect(node), prior = before.get(node);
        chromeRects.set(node,target);
        if (!target || node.classList.contains('is-morphing') || (node.matches('.bot-heading') && html.hasAttribute('data-ios-identity-handoff'))) continue;
        const from = prior || (node.matches('.bot-heading') ? {...target,x:target.x+target.width/2-22,width:44} : null);
        if (!from || (!changed && Math.abs(from.x-target.x)+Math.abs(from.y-target.y)+Math.abs(from.width-target.width)+Math.abs(from.height-target.height)<1)) continue;
        chromeTargets.set(node,target);
        // Centered identity and trailing Latest controls already change their
        // layout origin as width changes. Subtract that anchor movement once.
        const anchor = node.matches('.bot-heading') ? 0.5 : 1;
        const dx = from.x-target.x-(target.width-from.width)*anchor;
        const editing = node.id === 'composer';
        // Keep the live editor's height natural while its width changes. New
        // keystrokes/attachments must never be clipped by a held animation box.
        // Anchor the live form by its trailing edge as width changes.
        // A left-origin translation plus a changing width can drift past the
        // rail while UIKit publishes intermediate hinge geometry.
        const constraints = editing ? {minWidth:'0px',maxWidth:'none',alignSelf:'flex-end',marginLeft:'0px',marginRight:'0px'}
          : {minWidth:'0px',maxWidth:'none',minHeight:Math.min(from.height,target.height)+'px',overflow:'clip'};
        const motion = node.animate([
          {...constraints,translate:`${dx}px ${from.y-target.y}px`,width:from.width+'px',...(editing?{}:{height:from.height+'px'}),opacity:prior?1:0},
          {...constraints,translate:'0px 0px',width:target.width+'px',...(editing?{}:{height:target.height+'px'}),opacity:1},
        ],{duration:280,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        chromeMotions.set(node,motion); chromePainted.set(node,chromeRect(node));
      }
      chromeActive = chromeMotions.size > 0;
      if (chromeActive) {
        html.dataset.iosChromeMorphing = 'true';
        // Effects finish together. Removing them reveals exactly the measured
        // natural destination, without leaving inline frame styles behind.
        const motions = [...chromeMotions.values()];
        const complete = () => { if (motions.every(m => [...chromeMotions.values()].includes(m))) finishChromeMotion(); };
        Promise.all(motions.map(m => m.finished)).then(complete,complete);
        if (!chromeTimer) chromeTimer = setTimeout(finishChromeMotion,650);
      } else finishChromeMotion();
    });
  }
  for (const type of ['kindred-native-geometry','kindred-ios-layout']) window.addEventListener(type,scheduleChromeMotion);
  const chromeLayoutObserver = new ResizeObserver(scheduleChromeMotion);
  for (const node of [shell,conversation,...chromeNodes()]) if (node) chromeLayoutObserver.observe(node);
  document.addEventListener('visibilitychange',() => { if (document.hidden) { chromePose = ''; finishChromeMotion(); finishIdentityHandoff(); } });
  window.addEventListener('pagehide',() => { chromePose = ''; finishChromeMotion(); finishIdentityHandoff(); });
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',event => { if (event.matches) { finishChromeMotion(); finishIdentityHandoff(); } });
  observeUI(() => { if (html.dataset.motion === 'off') { finishChromeMotion(); finishIdentityHandoff(); } }).observe(html,{attributes:true,attributeFilter:['data-motion']});
  scheduleChromeMotion();

  function updateEnvironment(value) {
    if (!value) return;
    html.style.setProperty('--ios-safe-top', `${Math.max(0, Number(value.topInset) || 0)}px`);
    html.style.setProperty('--ios-safe-left', `${Math.max(0, Number(value.leftInset) || 0)}px`);
    html.style.setProperty('--ios-safe-right', `${Math.max(0, Number(value.rightInset) || 0)}px`);
    const duoCapable = value.isDuo === true;
    nativeDuo = typeof value.usesNativeRail === 'boolean' ? value.usesNativeRail : duoCapable;
    updateIdentityPlacement(nativeDuo && (value.isDuoInner !== true || value.railSide === 'none'));
    html.dataset.iosDuo = String(nativeDuo);
    html.dataset.iosDuoInner = String(value.isDuoInner === true);
    html.dataset.iosRailSide = nativeDuo ? (['left','right','none'].includes(value.railSide) ? value.railSide : 'right') : 'none';
    html.dataset.iosSlab = String(value.isSlab === true);
    // A closed phone must not inherit an inner-display fullscreen state whose
    // collapse control is intentionally unavailable on the outer display.
    if (duoCapable && value.isDuoInner !== true && computer?.classList.contains('expanded')) {
      document.querySelector('#computer-expand')?.click();
    }
    html.style.setProperty('--ios-safe-bottom', `${Math.max(0, Number(value.bottomInset) || 0)}px`);
    const composerBottomInset = typeof value.composerBottomInset === 'number' && Number.isFinite(value.composerBottomInset)
      ? Math.max(0,value.composerBottomInset) : Math.max(0,Number(value.bottomInset) || 0);
    html.style.setProperty('--ios-composer-safe-bottom',`${composerBottomInset}px`);
    // The system rail extends to the keyboard edge while typing. Keep the
    // composer's trailing action outside its measured safe inset, while using
    // the full bottom lane again as soon as the keyboard is dismissed.
    const keyboardRight = nativeDuo && value.keyboardVisible === true && Number.isFinite(value.rightInset)
      ? Math.max(0,Math.min(innerWidth,value.rightInset)) : 0;
    const keyboardLeft = nativeDuo && value.keyboardVisible === true && html.dataset.iosRailSide === 'left' && Number.isFinite(value.leftInset)
      ? Math.max(0,Math.min(innerWidth,value.leftInset)) : 0;
    html.style.setProperty('--ios-composer-keyboard-left',`${keyboardLeft}px`);
    html.style.setProperty('--ios-composer-keyboard-right',`${html.dataset.iosRailSide === 'right' ? keyboardRight : 0}px`);
    nativeHeight = Math.max(0, Number(value.viewportHeight) || 0);
    nativePortrait = typeof value.isPortrait === 'boolean' ? value.isPortrait : undefined;
    // Use window pose, never the keyboard-shortened web viewport.
    html.dataset.iosOuterLandscape = String(nativeDuo && value.isDuoInner !== true && nativePortrait === false);
    updateViewport();
    updateReservedControls();
    window.__kindredComputerInput?.focus();
  }
  window.addEventListener('kindred-ios-layout', event => updateEnvironment(event.detail));
  const setContentInset = (node,name,value) => {
    const text = Math.max(0,Math.round(value*100)/100)+'px';
    if (node && node.style.getPropertyValue(name) !== text) node.style.setProperty(name,text);
  };
  const displayContour = rect => {
    const commands = window.__KINDRED_NATIVE_GEOMETRY?.displayContour, names=['M','L','Q','C','Z'], lengths=[3,3,5,7,1];
    if (!Array.isArray(commands) || !commands.length || commands.length > 128) return null;
    const path=[];
    for (const command of commands) {
      if (!Array.isArray(command) || command.length !== lengths[command[0]] || !command.every(Number.isFinite)) return null;
      const values=command.slice(1).map((value,index)=>Math.round((value-(index%2?rect.top:rect.left))*1000)/1000);
      path.push(names[command[0]]+' '+values.join(' '));
    }
    return `path("${path.join(' ')}")`;
  };
  // Shared dialogs retain their forms, selection and close handlers. Only
  // their presentation belongs to the installed app's current safe rectangle.
  const sheetSelector = 'dialog.navigation-search,dialog.bot-dialog,dialog.chat-dialog,dialog.server-chat-dialog,dialog#settings-dialog';
  function updateNativeSheets() {
    const layout = window.__KINDRED_IOS_LAYOUT || {}, style = getComputedStyle(html);
    const read = name => parseFloat(style.getPropertyValue(name)) || 0;
    const height = nativeHeight || window.visualViewport?.height || innerHeight;
    const reserved = html.dataset.iosReserved === 'true' || html.dataset.iosNativeReserved === 'true';
    const divided = (window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).some(r => r.kind === 'division' && r.active !== false && r.width > 0 && r.height > 0 && r.x < innerWidth && r.x+r.width > 0 && r.y < height && r.y+r.height > 0);
    // A camera/status corner is handled by side insets (or individual search
    // rows), rather than cutting the whole sheet down below that corner.
    const safe = reserved && divided ? {x:read('--ios-safe-x'),y:read('--ios-safe-y'),width:read('--ios-safe-width'),height:read('--ios-safe-height')} : {x:0,y:0,width:innerWidth,height};
    if (!(safe.width > 0 && safe.height > 0)) return;
    const toolbar = window.__KINDRED_IOS_TOOLBAR;
    const zones = nativeDuo ? [toolbar,...(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).filter(r => r.kind === 'occlusion' && r.active !== false)]
      .filter(r => r && ['x','y','width','height'].every(key => Number.isFinite(r[key])) && r.width > 0 && r.height > 0) : [];
    for (const dialog of document.querySelectorAll(sheetSelector)) {
      if (!dialog.open) continue;
      const search = dialog.classList.contains('navigation-search');
      const preferences = dialog.id === 'settings-dialog';
      if (preferences && !nativeDuo) { dialog.removeAttribute('data-ios-sheet'); continue; }
      // Wide sheets sit in the usable center. On the cover, Search keeps the
      // full lower lane and projects each row around the measured native dock.
      const flow = search && nativeDuo && layout.isDuoInner !== true;
      const region = safe;
      const top = Math.max(region.y,Number(layout.topInset)||0), bottom = Math.min(height,region.y+region.height)-(Number(layout.bottomInset)||0);
      const left = Math.max(region.x,flow ? 0 : Number(layout.leftInset)||0);
      const right = Math.min(region.x+region.width,innerWidth-(flow ? 0 : Number(layout.rightInset)||0));
      const gap = Math.min(12,Math.max(0,(bottom-top)/8));
      const width = Math.max(0,Math.min(preferences ? 760 : search ? 680 : 600,right-left-2*gap));
      const sheetHeight = Math.max(0,Math.min(search ? 680 : 760,bottom-top-2*gap));
      const x = left+(right-left-width)/2, y = preferences ? top+(bottom-top-sheetHeight)/2 : top+gap;
      setContentInset(dialog,'--ios-sheet-x',x);
      setContentInset(dialog,'--ios-sheet-y',y);
      setContentInset(dialog,'--ios-sheet-width',width);
      setContentInset(dialog,'--ios-sheet-height',sheetHeight);
      dialog.toggleAttribute('data-ios-sheet',true);
      const frame = dialog.getBoundingClientRect(), scale = frame.width/(dialog.offsetWidth || frame.width) || 1;
      // Start from the stable parent interval, never the already-inset row.
      // Search's shared enter/exit scale is visual; don't bake that temporary
      // scale or translation into native point-space collision measurements.
      for (const node of dialog.querySelectorAll('.navigation-search-heading,.navigation-search-results>*')) {
        const rect = node.getBoundingClientRect(), parent = node.parentElement.getBoundingClientRect();
        const parentStyle = getComputedStyle(node.parentElement);
        const base = {left:x+(parent.left-frame.left)/scale+(parseFloat(parentStyle.paddingLeft)||0),right:x+(parent.right-frame.left)/scale-(parseFloat(parentStyle.paddingRight)||0)};
        const rowTop = y+(rect.top-frame.top)/scale, rowBottom = y+(rect.bottom-frame.top)/scale;
        let leading = 0, trailing = 0;
        for (const zone of flow ? zones : []) {
          if (rowTop >= zone.y+zone.height+12 || rowBottom <= zone.y-12 || zone.x >= base.right || zone.x+zone.width <= base.left) continue;
          if (zone.x+zone.width/2 > (base.left+base.right)/2) trailing = Math.max(trailing,base.right-zone.x+12);
          else leading = Math.max(leading,zone.x+zone.width+12-base.left);
        }
        setContentInset(node,'--ios-search-left',leading);
        setContentInset(node,'--ios-search-right',trailing);
      }
    }
  }
  const messageClearance = new WeakMap();
  let messageReadingEpoch = 0, messageGeometryEpoch = 0, messageReadingActive = false;
  function updateNativeContentClearance() {
    updateNativeSheets();
    // A preview is one retained surface, even across folds. Fit it inside one
    // usable rectangle, excluding native rail, camera/status and active hinges.
    const previewFrame = artifactFrames({single:true}).document;
    for (const dialog of document.querySelectorAll('.document-dialog[open],.workspace-artifact-dialog[open],.screenshot-dialog[open],.chat-media-dialog[open]')) {
      for (const [key,value] of Object.entries(previewFrame)) setContentInset(dialog,'--ios-preview-'+key,value);
      dialog.toggleAttribute('data-ios-preview-fit',true);
    }
    updateAvatarPickers();
    const value = window.__KINDRED_IOS_LAYOUT || {}, side = html.dataset.iosRailSide;
    const edgeLeft = nativeDuo && side === 'left' ? Math.min(innerWidth,Math.max(0,Number(value.leftInset)||0)) : 0;
    const edgeRight = nativeDuo && side === 'right' ? Math.min(innerWidth,Math.max(0,Number(value.rightInset)||0)) : 0;
    const insetFor = rect => ({left:Math.min(rect.width,Math.max(0,edgeLeft-rect.left)),right:Math.min(rect.width,Math.max(0,rect.right-(innerWidth-edgeRight)))});
    for (const node of [conversation,computer,document.querySelector('#details-panel')]) {
      if (!node) continue;
      // Use the stable parent pane interval, never an already-inset child.
      const inset = insetFor(node.getBoundingClientRect());
      setContentInset(node,'--ios-content-left',inset.left);
      setContentInset(node,'--ios-content-right',inset.right);
    }
    const toolbar = window.__KINDRED_IOS_TOOLBAR;
    const flow = nativeDuo && html.dataset.iosDuoInner !== 'true' && toolbar &&
      ['x','y','width','height'].every(key => Number.isFinite(toolbar[key])) && toolbar.width > 0 && toolbar.height > 0;
    html.toggleAttribute('data-ios-message-flow',!!flow);
    const zones = flow ? [toolbar,...(window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).filter(region => region.kind === 'occlusion' && region.active !== false)] : [];
    const history = document.querySelector('#content'), historyRect = history?.getBoundingClientRect();
    // WebKit can report an elastic offset while a touch is settling (including
    // a gesture begun before the cover layout arrived). Classify the resting
    // reading position so that stretch cannot resize and reflow a bubble.
    const scrollTop = history?.scrollTop || 0;
    const maxScrollTop = Math.max(0,history ? history.scrollHeight-history.clientHeight : 0);
    const elasticOffset = scrollTop - Math.max(0,Math.min(scrollTop,maxScrollTop));
    const historyStyle = history && getComputedStyle(history);
    const lane = historyRect && {left:historyRect.left+history.clientLeft+(parseFloat(historyStyle.paddingLeft)||0),right:historyRect.left+history.clientLeft+history.clientWidth-(parseFloat(historyStyle.paddingRight)||0)};
    let laneLeft = 0, laneRight = 0;
    // Bot replies keep a stable line length on the cover. User messages only
    // reserve this space while beside the controls, reclaiming it below.
    for (const zone of lane && flow ? zones : []) {
      if (zone.x >= lane.right || zone.x+zone.width <= lane.left) continue;
      if (zone.x+zone.width/2 > (lane.left+lane.right)/2) laneRight = Math.max(laneRight,lane.right-zone.x+6);
      else laneLeft = Math.max(laneLeft,zone.x+zone.width+6-lane.left);
    }
    setContentInset(conversation,'--ios-message-lane-left',laneLeft);
    setContentInset(conversation,'--ios-message-lane-right',laneRight);
    for (const group of history?.children || []) {
      const user = !!group.querySelector('.message-row.user');
      group.toggleAttribute('data-ios-user-message',user);
      const rect = group.getBoundingClientRect();
      const previous = messageClearance.get(group);
      const buffer = previous?.blocked ? 12 : 6;
      const overlaps = user && zones.some(zone => rect.top+elasticOffset < zone.y+zone.height+buffer && rect.bottom+elasticOffset > zone.y-buffer);
      let blocked = !!flow && overlaps;
      const sameGeometry = previous?.geometry === messageGeometryEpoch;
      if (flow && previous && sameGeometry && blocked !== previous.blocked) {
        // Width reflows can restore the reading anchor or turn bottom-follow
        // on/off. Those generated scrolls must not reverse their own resize.
        const moving = group.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
        if (moving || (!blocked && previous.reading === messageReadingEpoch)) blocked = previous.blocked;
      }
      messageClearance.set(group,{blocked,geometry:messageGeometryEpoch,
        reading:!previous || blocked !== previous.blocked ? messageReadingEpoch : previous.reading});
      // Grow the trailing edge into the lower lane. A long bubble's leading
      // edge stays put; short, right-aligned bubbles slide with that edge.
      setContentInset(group,'--ios-user-clearance',blocked ? laneRight : 0);
    }
    if (!sidebar) return;
    const base = sidebar.getBoundingClientRect(), sidebarStyle = getComputedStyle(sidebar);
    const contentLeft = base.left+(parseFloat(sidebarStyle.paddingLeft)||0), contentRight = base.right-(parseFloat(sidebarStyle.paddingRight)||0);
    const inset = insetFor({left:contentLeft,right:contentRight,width:contentRight-contentLeft});
    const scroll = document.querySelector('#bots'), viewport = scroll?.getBoundingClientRect() || base;
    const rows = [...sidebar.querySelectorAll('#bots .nav-entry')];
    const visible = rows.filter(node => {const r=node.getBoundingClientRect();return r.height>0 && r.bottom>Math.max(base.top,viewport.top) && r.top<Math.min(base.bottom,viewport.bottom);});
    const contour = nativeDuo && viewport.width > 0 && viewport.height > 0 ? displayContour(viewport) : null;
    if (contour && scroll.style.getPropertyValue('--ios-display-contour') !== contour) scroll.style.setProperty('--ios-display-contour',contour);
    if (!contour) scroll?.style.removeProperty('--ios-display-contour');
    // The compact-list design shortens four rows below search. When search
    // is hidden, one more row occupies its slot. This is a content rule, not
    // a fabricated system rail/occlusion frame.
    const upper = new Set(visible.slice(0,sidebar.classList.contains('ios-searching') ? 4 : 5));
    for (const row of rows) {
      setContentInset(row,'--ios-list-left',upper.has(row)?inset.left:0);
      setContentInset(row,'--ios-list-right',upper.has(row)?inset.right:0);
    }
    const search = sidebar.querySelector(':scope>.search');
    setContentInset(search,'--ios-list-left',inset.left);
    setContentInset(search,'--ios-list-right',inset.right);
    // The server's keyed row glide uses Web Animations without mutating DOM
    // as it moves. Keep classification current through that finite movement.
    if (rows.some(row => row.getAnimations().some(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)))) scheduleContentClearance();
  }
  let contentClearanceFrame = 0;
  const scheduleContentClearance = () => {
    if (!contentClearanceFrame) contentClearanceFrame = requestAnimationFrame(() => {contentClearanceFrame=0;updateNativeContentClearance();});
  };
  const readingHistory = document.querySelector('#content');
  const readingIntent = event => {
    if (event.type === 'keydown' && (!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) || event.target.closest('input,textarea,[contenteditable=true]'))) return;
    messageReadingEpoch++; messageReadingActive = true;
  };
  for (const name of ['wheel','touchstart','touchmove','pointerdown','keydown']) readingHistory?.addEventListener(name,readingIntent,{passive:true});
  document.querySelector('.jump-latest')?.addEventListener('click',readingIntent);
  readingHistory?.addEventListener('scrollend',() => {
    if (!messageReadingActive) return;
    messageReadingActive = false; messageReadingEpoch++; scheduleContentClearance();
  });
  readingHistory?.addEventListener('transitionend',scheduleContentClearance);
  for (const name of ['resize','kindred-ios-layout','kindred-ios-toolbar','kindred-native-geometry']) window.addEventListener(name,() => { messageGeometryEpoch++; scheduleContentClearance(); });
  document.addEventListener('scroll',event => {if(event.target === document.querySelector('#bots') || event.target === sidebar || event.target === document.querySelector('#content') || event.target.matches?.('.navigation-search-results')) scheduleContentClearance();},true);
  observeUI(scheduleContentClearance).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('resize',scheduleContentClearance);
  observeUI(scheduleContentClearance).observe(sidebar,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('kindred-ios-toolbar',scheduleContentClearance);
  observeUI(scheduleContentClearance).observe(document.querySelector('#content'),{childList:true,subtree:true});
  const contentClearanceObserver = new ResizeObserver(scheduleContentClearance);
  for (const node of [shell,sidebar,conversation,computer,document.querySelector('#details-panel')]) if(node)contentClearanceObserver.observe(node);
  function updateReservedControls() {
    scheduleContentClearance();
    const regions = nativeDuo ? (window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || [])
      .filter(region => region.active !== false && [region.x,region.y,region.width,region.height].every(Number.isFinite))
      .map(region => {
        const x = Math.max(0,region.x), y = Math.max(0,region.y);
        return {...region,x,y,width:Math.min(innerWidth,region.x+region.width)-x,
          height:Math.min(nativeHeight||innerHeight,region.y+region.height)-y};
      }).filter(region => region.width > 0 && region.height > 0) : [];
    const horizontal = regions.find(r => r.kind === 'division' && r.width > r.height && r.y > 0);
    html.dataset.iosDuoPose = horizontal ? 'tabletop' : regions.some(r => r.kind === 'division' && r.height > r.width) ? 'book' : 'flat';
    html.style.setProperty('--ios-tabletop-top',`${horizontal?.y || 0}px`);
    // If the keyboard covers the lower half, controls stay above it instead
    // of reserving a hinge gap outside the remaining web viewport.
    const below = horizontal && (nativeHeight || innerHeight) > horizontal.y + horizontal.height + 128;
    html.style.setProperty('--ios-tabletop-gap',`${below ? horizontal.height : 0}px`);
    const occlusions = regions.filter(r => r.kind === 'occlusion');
    const sharedRegions = html.hasAttribute('data-ios-fold');
    const divisions = regions.filter(region => region.kind === 'division' && region.height > region.width);
    html.dataset.iosNativeReserved = String(!sharedRegions && divisions.length > 0);
    const projectNativeControls = () => {
      for (const control of [header,document.querySelector('#composer-area')]) {
        if (!control) continue;
        const rect = control.getBoundingClientRect(); let left = rect.left, right = rect.right;
        for (const region of regions) {
          // The writing surface spans the chat in book pose. Only hardware
          // occlusions constrain it; the identity still stays on one leaf.
          if (control.id === 'composer-area' && region.kind === 'division' && region.height > region.width) continue;
          if (region.y >= rect.bottom || region.y+region.height <= rect.top || region.x >= right || region.x+region.width <= left) continue;
          if (region.x-left > right-region.x-region.width) right = Math.max(left,region.x);
          else left = Math.min(right,region.x+region.width);
        }
        const values = {'--ios-native-control-left':left-rect.left+'px','--ios-native-control-right':rect.right-right+'px'};
        for (const [name,value] of Object.entries(values)) if (control.style.getPropertyValue(name) !== value) control.style.setProperty(name,value);
      }
    };
    projectNativeControls();
    requestAnimationFrame(projectNativeControls);
    if (!sharedRegions) for (const control of [header,document.querySelector('#composer-area')]) {
      if (!control) continue;
      const rect = control.getBoundingClientRect(); let left = rect.left, right = rect.right;
      for (const region of divisions) {
        if (region.y >= rect.bottom || region.y+region.height <= rect.top || region.x >= right || region.x+region.width <= left) continue;
        if (region.x-left > right-region.x-region.width) right = Math.max(left,region.x);
        else left = Math.min(right,region.x+region.width);
      }
      control.style.setProperty('--ios-camera-left',left-rect.left+'px'); control.style.setProperty('--ios-camera-right',rect.right-right+'px');
    }
    const intersects = (a,b) => a.left < b.x+b.width && a.right > b.x && a.top < b.y+b.height && a.bottom > b.y;
    const tag = document.querySelector('.bot-heading');
    html.style.setProperty('--ios-header-obstruction','0px');
    html.style.setProperty('--ios-composer-obstruction','0px');
    if (tag && !sharedRegions) {
      const rect = tag.getBoundingClientRect();
      const move = Math.max(0,...occlusions.filter(r => intersects(rect,r)).map(r => r.y+r.height+8-rect.top));
      html.style.setProperty('--ios-header-obstruction',`${move}px`);
    }
    const area = document.querySelector('#composer-area');
    if (area && !sharedRegions) {
      // Side projection already keeps the input clear of corner/status
      // occlusions. Testing the full-width wrapper would lift it a second time.
      const rect = (area.querySelector('#composer') || area).getBoundingClientRect();
      const move = Math.max(0,...occlusions.filter(r => intersects(rect,r)).map(r => rect.bottom-r.y+8));
      html.style.setProperty('--ios-composer-obstruction',`${move}px`);
    }
    requestAnimationFrame(() => updateClearance());
  }
  window.addEventListener('kindred-native-geometry',updateReservedControls);
  observeUI(updateReservedControls).observe(html,{attributes:true,attributeFilter:['data-ios-fold']});
  updateEnvironment(window.__KINDRED_IOS_LAYOUT);
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
      // Current shared layouts own camera/division avoidance. A growing draft
      // needs a fresh projection even when the host's bounds have not changed.
      if (html.hasAttribute('data-ios-fold')) window.dispatchEvent(new Event('kindred-native-geometry'));
      else updateReservedControls();
    });
  });
  for (const control of [document.querySelector('.bot-heading'), composerArea]) {
    if (control) obstructionObserver.observe(control);
  }
  let lastComposerExtent = null;
  // The scroller paints under the input; its indicator stays in the exposed
  // reading area instead of disappearing behind the floating composer.
  const readingIndicator=document.createElement('div'), readingThumb=document.createElement('span');
  readingIndicator.className='ios-reading-indicator';readingIndicator.setAttribute('aria-hidden','true');
  readingIndicator.append(readingThumb);conversation.append(readingIndicator);
  let readingIndicatorFrame=0,readingIndicatorTimer=0;
  const indicatorStyle=(node,key,value)=>{if(node.style[key]!==value)node.style[key]=value;};
  const updateReadingIndicator=()=>{
    readingIndicatorFrame=0;
    const area=readingHistory,view=area?.getBoundingClientRect(),parent=conversation.getBoundingClientRect();
    if(!view?.height||area.scrollHeight<=area.clientHeight+1||area.closest('[hidden]')){readingIndicator.hidden=true;return;}
    const input=composerArea?.getBoundingClientRect(),top=Math.max(view.top,header.getBoundingClientRect().bottom)+4;
    const bottom=Math.min(view.bottom,input?.height?input.top:view.bottom)-4, height=Math.max(0,bottom-top);
    const lane=parseFloat(getComputedStyle(conversation).getPropertyValue('--ios-content-right'))||0;
    readingIndicator.hidden=height<24;
    indicatorStyle(readingIndicator,'left',`${view.right-parent.left-lane-5}px`);
    indicatorStyle(readingIndicator,'top',`${top-parent.top}px`);indicatorStyle(readingIndicator,'height',`${height}px`);
    const thumb=Math.min(height,Math.max(24,height*area.clientHeight/area.scrollHeight));
    const progress=Math.max(0,Math.min(1,area.scrollTop/(area.scrollHeight-area.clientHeight)));
    indicatorStyle(readingThumb,'height',`${thumb}px`);indicatorStyle(readingThumb,'top',`${progress*(height-thumb)}px`);
  };
  const scheduleReadingIndicator=()=>{if(!readingIndicatorFrame)readingIndicatorFrame=requestAnimationFrame(updateReadingIndicator);};
  readingHistory?.addEventListener('scroll',()=>{
    readingIndicator.dataset.active='true';clearTimeout(readingIndicatorTimer);
    readingIndicatorTimer=setTimeout(()=>{readingIndicator.dataset.active='false';},700);scheduleReadingIndicator();
  },{passive:true});
  const readingSize=new ResizeObserver(scheduleReadingIndicator);
  for(const node of [readingHistory,composerArea,header])if(node)readingSize.observe(node);
  observeUI(scheduleReadingIndicator).observe(readingHistory,{childList:true,subtree:true});
  for(const name of ['resize','kindred-ios-layout','kindred-native-geometry'])window.addEventListener(name,scheduleReadingIndicator);
  const updateClearance = () => {
    const top = header.getBoundingClientRect().height;
    const bottom = composerArea?.hidden ? 0 : (composerArea?.getBoundingClientRect().height || 0) + (parseFloat(getComputedStyle(html).getPropertyValue('--ios-composer-obstruction')) || 0);
    conversation.style.setProperty('--ios-chat-top', `${top}px`);
    conversation.style.setProperty('--ios-chat-bottom', `${bottom}px`);
    scheduleReadingIndicator();
    const form = document.querySelector('#composer'), rect = form?.getBoundingClientRect();
    const visible = nativeDuo && rect?.height > 0 && !shell.hidden && !form.closest('[hidden]') && getComputedStyle(form).visibility !== 'hidden' &&
      !document.querySelector('dialog[open],.artifact-studio') && document.querySelector('#details-panel')?.hidden !== false &&
      (computer?.hidden || (html.dataset.iosComputer === 'side' && !computer.classList.contains('expanded')));
    if (!visible) { lastComposerExtent = null; return; }
    // The SDK asks for a bottom *bar*, not the whole writing surface.
    // Including the editor made a second line select a different safe-area
    // row and lift the entire composer. Measure only the retained action row,
    // with the same breathing room above and below; draft wrapping must not
    // move that anchor.
    const actions = [...form.querySelectorAll('#composer-actions,#send,.dictation-button,.dictation-cancel')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map(node => node.getBoundingClientRect()).filter(box => box.height > 0);
    if (!actions.length) return;
    const rowTop = Math.min(...actions.map(box => box.top)), rowBottom = Math.max(...actions.map(box => box.bottom));
    const height = Math.round((rowBottom-rowTop+2*Math.max(0,rect.bottom-rowBottom))*100)/100;
    if (Number.isFinite(height) && height !== lastComposerExtent) {
      lastComposerExtent = height;
      window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'composer-extent',height});
    }
  };
  const clearanceObserver = new ResizeObserver(updateClearance);
  clearanceObserver.observe(header);
  if (composerArea) clearanceObserver.observe(composerArea);
  const composerVisibilityObserver = observeUI(updateClearance);
  for (const pane of [shell,computer,document.querySelector('#details-panel')]) if (pane) composerVisibilityObserver.observe(pane,{attributes:true,attributeFilter:['class','hidden']});
  observeUI(updateClearance).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
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
  if (settingsContent) observeUI(adaptDeviceSettings).observe(settingsContent, {subtree:true, childList:true, characterData:true});
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
  observeUI(checkLoadedRows).observe(sidebar, {childList:true, subtree:true});
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
  observeUI(updateAppearance).observe(html, {attributes:true, attributeFilter:['data-theme', 'class', 'style']});
  updateAppearance();
  // Avatar customization is a visual picker, using the server's actual shape
  // previews, swatches and save closures. Keep it in the top layer so retained
  // pane scrolling/animation cannot crop it into a narrow menu.
  const avatarPickerMotions = new Map();
  let avatarPickerID = 0;
  const closeAvatarPicker = wrap => { wrap.classList.remove('menu-open'); wrap.querySelector('.avatar-customize')?.setAttribute('aria-expanded','false'); };
  function updateAvatarPickers() {
    const layout = window.__KINDRED_IOS_LAYOUT || {}, height = nativeHeight || innerHeight;
    const reduced = html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches;
    for (const wrap of document.querySelectorAll('.avatar-menu')) {
      const menu = wrap.querySelector('.avatar-popover'), trigger = wrap.querySelector('.avatar-customize');
      if (!menu || !trigger) continue;
      if (!menu.dataset.iosAvatarPicker) {
        menu.dataset.iosAvatarPicker = 'true'; menu.setAttribute('popover','manual');
        menu.id ||= 'ios-avatar-picker-'+(++avatarPickerID); menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','Customize bot avatar');
        trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-controls',menu.id);
        const close = document.createElement('button'); close.type='button'; close.className='ios-avatar-picker-close';
        close.setAttribute('aria-label','Close avatar picker'); close.textContent='×';
        close.onclick=()=>{closeAvatarPicker(wrap);trigger.focus({preventScroll:true});}; menu.prepend(close);
      }
      const anchor=trigger.getBoundingClientRect();
      const available = !trigger.closest('[hidden],[inert]') && anchor.width>0 && anchor.height>0 && anchor.bottom>0 && anchor.top<height && anchor.right>0 && anchor.left<innerWidth && getComputedStyle(trigger).visibility !== 'hidden';
      if(!available && wrap.classList.contains('menu-open'))closeAvatarPicker(wrap);
      const open = available && wrap.classList.contains('menu-open') && !document.querySelector('dialog[open]');
      let previous = avatarPickerMotions.get(menu);
      if(reduced && previous){previous.animation.cancel();avatarPickerMotions.delete(menu);previous=null;}
      if (!open) {
        if (!menu.matches(':popover-open') || previous?.closing) continue;
        menu.inert=true;
        if (!available || reduced) { previous?.animation.cancel();avatarPickerMotions.delete(menu);menu.hidePopover();continue; }
        const painted=getComputedStyle(menu),start={opacity:painted.opacity,translate:painted.translate};previous?.animation.cancel();
        const animation=menu.animate([start,{opacity:0,translate:'0 -4px'}],{duration:160,easing:'ease-out',fill:'both'});
        avatarPickerMotions.set(menu,{animation,closing:true});
        animation.finished.catch(()=>{}).then(()=>{if(avatarPickerMotions.get(menu)?.animation!==animation)return;menu.hidePopover();animation.cancel();avatarPickerMotions.delete(menu);});
        continue;
      }
      const entering = !menu.matches(':popover-open') || previous?.closing;
      const start=previous?.closing?{opacity:getComputedStyle(menu).opacity,translate:getComputedStyle(menu).translate}:{opacity:0,translate:'0 -6px'};
      if (previous?.closing) { previous.animation.cancel();avatarPickerMotions.delete(menu); }
      menu.inert=false;
      if (!menu.matches(':popover-open')) menu.showPopover();
      const pane=trigger.closest('.details-panel,.computer-panel')?.getBoundingClientRect();
      let left=Math.max(12,(Number(layout.leftInset)||0)+12,pane?.left || 0),right=Math.min(innerWidth-12,innerWidth-(Number(layout.rightInset)||0)-12,pane?.right || innerWidth);
      let top=Math.max(12,(Number(layout.topInset)||0)+8),bottom=height-(Number(layout.bottomInset)||0)-12;
      if ((window.__KINDRED_NATIVE_GEOMETRY?.reservedRegions || []).some(r=>r.kind==='division' && r.active!==false && r.x+r.width>0 && r.x<innerWidth && r.y+r.height>0 && r.y<height)) {
        const style=getComputedStyle(html),read=name=>parseFloat(style.getPropertyValue('--ios-safe-'+name))||0;
        left=Math.max(left,read('x')+12);right=Math.min(right,read('x')+read('width')-12);top=Math.max(top,read('y')+12);bottom=Math.min(bottom,read('y')+read('height')-12);
      }
      const width=Math.max(0,Math.min(336,right-left));
      menu.style.setProperty('--ios-avatar-width',width+'px');
      const below=bottom-anchor.bottom-10,above=anchor.top-top-10,under=below>=Math.min(420,bottom-top) || below>=above;
      menu.style.setProperty('--ios-avatar-height',Math.max(0,under?below:above)+'px');
      const rect=menu.getBoundingClientRect(),x=Math.max(left,Math.min(right-width,anchor.left+anchor.width/2-width/2));
      menu.style.left=x+'px';menu.style.top=(under?anchor.bottom+10:Math.max(top,anchor.top-rect.height-10))+'px';
      if (entering) {
        if(!reduced){const animation=menu.animate([start,{opacity:1,translate:'0 0'}],{duration:180,easing:'ease-out'});avatarPickerMotions.set(menu,{animation,closing:false});animation.finished.catch(()=>{}).then(()=>{if(avatarPickerMotions.get(menu)?.animation===animation)avatarPickerMotions.delete(menu);});}
        (menu.querySelector('[aria-pressed=true]') || menu.querySelector('button'))?.focus({preventScroll:true});
      }
    }
  }
  observeUI(scheduleContentClearance).observe(html,{attributes:true,attributeFilter:['data-motion']});
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',scheduleContentClearance);
  document.addEventListener('scroll',event=>{if([...document.querySelectorAll('.avatar-popover:popover-open')].some(menu=>event.target!==menu && !menu.contains(event.target)))scheduleContentClearance();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const wrap=event.target.closest?.('.avatar-menu') || document.querySelector('.avatar-popover:popover-open')?.closest('.avatar-menu');if(wrap){closeAvatarPicker(wrap);wrap.querySelector('.avatar-customize')?.focus({preventScroll:true});}}});
  // Adapt action menus at their presentation boundary. Keep the server's
  // closures; avatar previews/swatches above are content, not action submenus.
  const actionMenuSelector = '[role="menu"],#new-menu,.deliverable-menu';
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
    return getComputedStyle(element).display !== 'none';
  };
  const closeActionMenu = (element, source) => {
    if (element.hasAttribute('popover')) { if (element.matches(':popover-open')) element.hidePopover(); }
    else element.hidden = true;
    source?.setAttribute('aria-expanded', 'false');
    // Reset the server's transient menu state without running any action.
    if (element.isConnected && element.matches('.chat-context-menu,.artifact-context-menu,.message-action-menu')) {
      element.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    }
  };
  const presentActionMenu = (element, present = true, toolbarSource = null) => {
    const source = toolbarSource || lastMenuSource;
    if (!source?.isConnected || source.closest('[hidden],[inert]')) { closeActionMenu(element, source); return; }
    if (toolbarSource && (!source.getClientRects().length || getComputedStyle(source).visibility === 'hidden')) { closeActionMenu(element, source); return; }
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
      .filter(button => !button.closest('[hidden]') && button.closest('[role=menu],.deliverable-menu,#new-menu') === parent)
      .map(button => {
        if (button.matches('.has-submenu')) {
          button.click(); // Builds choices without invoking a leaf action.
          const child = [...parent.querySelectorAll('.conversation-submenu')].find(menu => menu._trigger === button);
          if (child) return {title:button.textContent.trim().slice(0,100),children:choices(child)};
        }
        return remember(button);
      }).filter(Boolean);
    const items = choices(element);
    // Library pinning belongs to desktop's drawer, which iOS replaces with pages.
    const allowed = items.filter(item => !/^(Close|Unpin|Pin) (artifact )?library$/.test(item.title));
    const bounds = source.getBoundingClientRect();
    // Native toolbar buttons have no web rectangle. Anchor to the current
    // page's visible corner, retaining that page as the action's owner.
    const rect = toolbarSource ? {x:Math.max(0,Math.min(innerWidth-1,bounds.right-1)),
      y:Math.max(0,Math.min(innerHeight-1,bounds.top+1)),width:1,height:1} : bounds;
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
      const action = menuActions.get(id);
      if (!action) return;
      menuActions.clear();
      if (action.context !== menuContext() || !action.source.isConnected ||
          action.source.closest('[hidden],[inert]') || !action.source.getClientRects().length || action.button.disabled || action.button.getAttribute('aria-disabled') === 'true') return;
      action.button.click();
      closeActionMenu(action.element, action.source);
    },
    cancel(key) { if (key === String(actionMenuSerial)) menuActions.clear(); },
  };
  const scanActionMenus = () => {
    updateAvatarPickers();
    for (const element of document.querySelectorAll(actionMenuSelector)) {
      if (openActionMenu(element)) { presentActionMenu(element); break; }
    }
  };
  observeUI(scanActionMenus).observe(document.body, {childList:true,subtree:true,attributes:true,
    attributeFilter:['hidden','class','aria-expanded']});
  document.addEventListener('toggle', scanActionMenus, true);
  scanActionMenus();
  const openToolbarMenu = (trigger, source, selector) => {
    if (!trigger || !source?.isConnected || source.closest('[hidden],[inert]') ||
        !source.getClientRects().length || getComputedStyle(source).visibility === 'hidden') return;
    trigger.click(); // Keep server-owned menu construction and leaf closures.
    const element = document.querySelector(selector);
    if (element && openActionMenu(element)) presentActionMenu(element,true,source);
  };
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
    if (route !== 'bot-chat' && html.hasAttribute('data-ios-identity-handoff')) finishIdentityHandoff();
    const artifactRoot=document.querySelector('.artifact-studio'),artifacts=['artifacts','artifact'].includes(route);
    const listAvailable = artifacts ? route==='artifact'&&artifactRoot?.dataset.iosArtifactToggleAvailable==='true' : (route === 'bot-chat' || (!botCenter() && route === 'computer')) && nativeSidebarActive();
    const avatar = document.querySelector('#header-avatar .character'), shape = avatar?.dataset.avatarBody || avatar?.dataset.shape || 'round', color = avatar?.dataset.avatarColor || (avatar ? getComputedStyle(avatar).getPropertyValue('--bot-fill').trim() : '');
    const state = {action:'duo-navigation', botCenterAvailable:botCenter(), route, title:(document.querySelector('.bot-heading strong')?.textContent || '').slice(0,160),
      reduceMotion:html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion:reduce)').matches,
      botAvatarShape:/^[a-z0-9-]{1,32}$/.test(shape) ? shape : 'round',
      botAvatarColor:/^#[0-9a-f]{6}$/i.test(color) ? color : '#2475ff',
      botDetailsAvailable:['bot-chat','computer'].includes(route) && !!document.querySelector('#bot-details') && !document.querySelector('#bot-details').disabled,
      artifactLibraryVisible:['artifacts','artifact'].includes(route) && document.querySelector('.artifact-studio-library')?.inert === false,
      listVisible:artifacts ? artifactRoot?.querySelector('.artifact-studio-library')?.inert===false : listAvailable && !nativeSidebarHidden,
      listToggleAvailable:listAvailable,
      computerExpandAvailable:!botCenter() && route === 'computer' && html.dataset.iosDuoInner === 'true' && !!document.querySelector('#computer-expand') && !document.querySelector('#computer-expand').disabled,
      computerExpanded:route === 'computer' && computer.classList.contains('expanded'),
      botSettingsAvailable:route === 'details' && !!document.querySelector('#bot-settings') && !document.querySelector('#bot-settings').hidden};
    const next = JSON.stringify(state);
    if (lastDuoNavigation === next) return;
    lastDuoNavigation = next;
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage(state);
  };
  window.__kindredDuoActions = {async perform(action) {
    // Search is a modal on new servers. Back/search dismiss it; other native
    // actions wait for dismissal so no second sheet can stack over its exit.
    if (document.querySelector('.navigation-search[open]')) {
      if (!await window.__KINDRED_NAVIGATION_SEARCH?.close()) return;
      if (action === 'back' || action === 'search') return;
    }
    const route = duoRoute();
    if (!nativeDuo || (document.querySelector('dialog[open]') && !(action === 'back' && route === 'marketplace'))) return;
    if (action === 'chats') {
      if(['artifacts','artifact'].includes(route))artifactPages.get(document.querySelector('.artifact-studio'))?.toggle();
      else if (nativeSidebarActive()) window.__kindredNativeSidebar.toggle();
      publishDuoNavigation(); return;
    }
    if(action==='chatHome') {
      if(['artifacts','artifact'].includes(route))document.querySelector('.artifact-studio-library-brand')?.click();
      publishDuoNavigation();return;
    }
    if (action === 'expandComputer') {
      if (!botCenter() && route === 'computer' && html.dataset.iosDuoInner === 'true') document.querySelector('#computer-expand')?.click();
      publishDuoNavigation(); return;
    }
    if (action === 'newBot' || action === 'newConversation') {
      if (!['chat-list','bot-chat','computer'].includes(route)) return;
      const menu = document.querySelector('#new-menu');
      const choice = [...(menu?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === (action === 'newBot' ? 'New bot' : 'New chat'));
      if (choice && !choice.disabled) { menuActions.clear(); menu.hidden = true; choice.click(); }
      publishDuoNavigation(); return;
    }
    if (action === 'back' || (action === 'computer' && route === 'computer')) {
      if (route === 'computer') {
        if (typeof window.__KINDRED_MOBILE_BACK === 'function') window.__KINDRED_MOBILE_BACK('bot-chat');
        else document.querySelector('#ios-computer-back')?.click();
      } else if (route === 'details') document.querySelector('#details-close')?.click();
      else if (route === 'artifact') document.querySelector('.artifact-workbench-header [aria-label="Back to artifacts"]')?.click();
      else if (route === 'artifacts') document.querySelector('.artifact-studio-library-brand')?.click();
      else if (route === 'marketplace') document.querySelector('#marketplace-dialog')?.close();
      else if (route === 'bot-chat') {
        if (typeof window.__KINDRED_MOBILE_BACK === 'function') window.__KINDRED_MOBILE_BACK('chat-list');
        else menu?.click();
      }
    } else {
      const selectors = {computer:'#show-computer',botDetails:'#bot-details',botSettings:'#bot-settings',settings:'#settings-button',artifacts:'#artifacts-button',marketplace:'#marketplace-button',search:'#ios-search',newChat:'#new-bot'};
      if (action === 'botDetails' && !['bot-chat','computer'].includes(route)) return;
      if (action === 'botSettings' && (route !== 'details' || document.querySelector('#bot-settings')?.hidden)) return;
      const artifactLibraryVisible=['artifacts','artifact'].includes(route) && document.querySelector('.artifact-studio-library')?.inert === false;
      if (action === 'search' && artifactLibraryVisible) document.querySelector('.ios-artifact-navigation [aria-label="Search artifacts"]')?.click();
      else if (action === 'newChat' && artifactLibraryVisible) openToolbarMenu(document.querySelector('.artifact-add'),document.querySelector('.artifact-studio-library'),'.artifact-add-menu');
      else if (action === 'newChat' && ['chat-list','bot-chat','computer'].includes(route)) openToolbarMenu(document.querySelector('#new-bot'),sidebar,'#new-menu');
      else if (action === 'newChat') return;
      else if (Object.hasOwn(selectors,action)) document.querySelector(selectors[action])?.click();
    }
    publishDuoNavigation();
  }};
  observeUI(publishDuoNavigation).observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','class','data-ios-artifact-view','data-ios-artifact-layout','data-ios-artifact-toggle-available','data-ios-artifact-library-hidden','data-shape','data-avatar-body','data-avatar-color']});
  observeUI(publishDuoNavigation).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  observeUI(publishDuoNavigation).observe(html,{attributes:true,attributeFilter:['data-ios-layout','data-ios-duo','data-ios-duo-inner','data-ios-sidebar-hidden','data-ios-native-sidebar','data-ios-native-sidebar-hidden','data-motion']});
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',publishDuoNavigation);
  publishDuoNavigation();
  // Floating navigation gets the system's interactive glass on iOS 26+.
  // The page keeps the real layout and server-owned action closures. Older
  // hosts keep the existing WebKit treatment, including all text editors.
  if (window.__KINDRED_NATIVE_GLASS === true) {
    const glassDocument = crypto.randomUUID(), current = new Map(), replaced = new Map();
    const specs = [
      ['identity','.conversation-header .bot-heading',''],
      ['latest','.conversation>.composer-area>.jump-latest','chevron.down'],
      ['accounts','#ios-accounts','ellipsis'],
      ['search','#ios-search','magnifyingglass'],
      ['new','.sidebar-top #new-bot','plus'],
      ['library','#ios-library-more','ellipsis'],
      ['chats','#mobile-menu','chevron.backward'],
      ['computer','#show-computer','desktopcomputer'],
      ['bot-settings','#bot-settings','gearshape'],
      ['artifact-back','.ios-artifact-button[aria-label="Back to artifacts"]','line.3.horizontal'],
      ['artifact-more','.ios-artifact-navigation .ios-artifact-more','ellipsis'],
      ['artifact-document-more','.artifact-workbench-header .ios-artifact-more','ellipsis'],
      ['artifact-search','.ios-artifact-navigation [aria-label="Search artifacts"]','magnifyingglass'],
      ['artifact-new','.ios-artifact-navigation .artifact-add','plus'],
    ];
    let glassFrame = 0, glassLast = '', glassSerial = 0, stopped = false;
    const restore = node => {
      const state = replaced.get(node); if (!state) return;
      node.removeAttribute('data-ios-native-glass');
      for (const [name,value] of Object.entries(state)) value === null ? node.removeAttribute(name) : node.setAttribute(name,value);
      replaced.delete(node);
    };
    const visible = node => {
      if (!node?.isConnected || node.closest('[hidden],[inert]') || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
      if (!node.getClientRects().length || getComputedStyle(node).visibility !== 'visible') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < (nativeHeight || innerHeight);
    };
    const opacity = node => {let value=1;for(let n=node;n&&n!==html;n=n.parentElement)value*=Number(getComputedStyle(n).opacity);return value;};
    const glassRouteAllows = id => {
      const route = duoRoute(), artifact = route === 'artifacts' || route === 'artifact';
      if (id.startsWith('artifact-')) return artifact;
      if (artifact || route === 'marketplace') return false;
      if (id === 'bot-settings') return route === 'details';
      if (['identity','latest','chats','computer'].includes(id)) return route === 'bot-chat' || route === 'chat-list';
      return true;
    };
    const scan = () => {
      glassFrame = 0; current.clear(); const controls = [];
      const covered = document.hidden || !!document.querySelector('dialog[open]');
      if (!covered) for (const [id,selector,symbol] of specs) {
        if (!glassRouteAllows(id)) continue;
        const source = document.querySelector(selector), ghost = id === 'identity' && document.querySelector('.ios-identity-handoff');
        if (!source) continue;
        // Composite group artwork stays with its retained web renderer.
        if (id === 'identity' && (source.querySelector('.participant-stack') || source.querySelectorAll('.character').length !== 1)) continue;
        const node = ghost || source;
        if (!(ghost ? ghost.isConnected && ghost.getClientRects().length : visible(node))) continue;
        const alpha = opacity(node); if (alpha < .005) continue;
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node), identity = id === 'identity';
        const title = identity ? (source.querySelector('strong')?.textContent || '').trim().slice(0,160) : id === 'latest' ? node.textContent.trim().slice(0,160) : '';
        const label = identity ? title+' details' : (node.getAttribute('aria-label') || node.title || node.textContent.trim() || id).slice(0,200);
        const avatar = source?.querySelector('.character'), shape = avatar?.dataset.avatarBody || avatar?.dataset.shape;
        const color = avatar?.dataset.avatarColor || (avatar ? getComputedStyle(avatar).getPropertyValue('--bot-fill').trim() : '');
        const round = n => Math.round(n*100)/100;
        let identityGeometry = {};
        if (identity) {
          const text = node.querySelector('strong'), slot = text?.parentElement.getBoundingClientRect(), textRect = text?.getBoundingClientRect();
          const artwork = node.querySelector('.character')?.parentElement.getBoundingClientRect();
          if (textRect && slot && artwork) {
            const left = Math.max(rect.left,slot.left,textRect.left), top = Math.max(rect.top,slot.top,textRect.top);
            identityGeometry = {
              titleRect:[left-rect.x,top-rect.y,Math.max(0,Math.min(rect.right,slot.right,textRect.right)-left),Math.max(0,Math.min(rect.bottom,slot.bottom,textRect.bottom)-top)].map(round),
              avatarCenter:[artwork.x+artwork.width/2-rect.x,artwork.y+artwork.height/2-rect.y].map(round),
            };
          }
        }
        current.set(id,{source,node,interactive:!ghost});
        controls.push({id,title,label,symbol,shape,color,rect:[rect.x,rect.y,rect.width,rect.height].map(round),...identityGeometry,
          fontSize:parseFloat(identity ? getComputedStyle(source.querySelector('strong') || source).fontSize : style.fontSize),
          imageInset:parseFloat(style.paddingLeft)||0,imageGap:parseFloat(style.columnGap)||0,
          opacity:alpha,titleOpacity:ghost ? Number(getComputedStyle(ghost.lastElementChild).opacity) : 1,interactive:!ghost});
      }
      const payload = JSON.stringify({action:'glass-controls',document:glassDocument,controls});
      if (payload !== glassLast) {glassLast=payload;window.webkit?.messageHandlers?.kindredAccounts?.postMessage({...JSON.parse(payload),sequence:++glassSerial});}
      if (!stopped && document.getAnimations().some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime))) schedule();
    };
    const schedule = () => {if(!stopped&&!glassFrame)glassFrame=requestAnimationFrame(scan);};
    window.__kindredGlassControls = {
      setActive(document,ids,sequence) {
        if (document !== glassDocument || sequence !== glassSerial || !Array.isArray(ids)) return false;
        const nodes = new Set(ids.map(id=>current.get(id)?.node).filter(Boolean));
        for (const node of replaced.keys()) if(!nodes.has(node))restore(node);
        for (const node of nodes) {
          if (!replaced.has(node)) replaced.set(node,{'aria-hidden':node.getAttribute('aria-hidden'),tabindex:node.getAttribute('tabindex')});
          node.setAttribute('data-ios-native-glass','');node.setAttribute('aria-hidden','true');node.setAttribute('tabindex','-1');
        }
        return true;
      },
      perform(id,document) {
        if (document !== glassDocument || window.document.querySelector('dialog[open]')) return;
        const control=current.get(id);if(!glassRouteAllows(id)||!control?.interactive||!visible(control.source))return;
        lastMenuSource=control.source;control.source.click();schedule();
      },
    };
    observeUI(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert','disabled','open','aria-label','aria-disabled','data-ios-artifact-view','data-ios-artifact-layout','data-shape','data-avatar-body','data-avatar-color']});
    observeUI(schedule).observe(html,{attributes:true,attributeFilter:['style','class','data-theme','data-motion']});
    const resize = new ResizeObserver(schedule);
    for(const node of [shell,sidebar,conversation,composerArea,header])if(node)resize.observe(node);
    for(const name of ['resize','kindred-ios-layout','kindred-native-geometry','kindred-ios-toolbar','pageshow'])window.addEventListener(name,()=>{stopped=false;schedule();});
    document.addEventListener('scroll',schedule,true);
    window.addEventListener('pagehide',()=>{stopped=true;cancelAnimationFrame(glassFrame);glassFrame=0;current.clear();for(const node of replaced.keys())restore(node);glassLast='';window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'glass-controls',document:glassDocument,sequence:++glassSerial,controls:[]});});
    schedule();
  }
  // Hand navigation to the page before slow fonts/images finish loading.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
})();
