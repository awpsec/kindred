// Presentation only. Session storage and origin enforcement belong to WebSession.
(() => {
  const html = document.documentElement;
  if (!window.__KINDRED_MOBILE || html.dataset.kindredIos) return;
  html.dataset.kindredIos = 'true';
  html.dataset.mobile = 'true';
  const shell = document.querySelector('#app');
  const header = document.querySelector('.conversation-header');
  if (!shell || !header) return;
  const compact = matchMedia('(max-width:760px), (max-height:500px)');
  const menu = document.querySelector('#mobile-menu');
  const sidebar = shell.querySelector('.sidebar');
  const conversation = shell.querySelector('.conversation');
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
  accounts.setAttribute('aria-label', 'Accounts');
  accounts.title = 'Accounts';
  accounts.textContent = 'You';
  accounts.onclick = () => window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'open'});
  const top = sidebar?.querySelector('.sidebar-top');
  top?.prepend(accounts);
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
  const avatar = document.querySelector('#user-avatar');
  const updateAccount = () => { accounts.textContent = avatar?.textContent.trim() || 'You'; };
  if (avatar) new MutationObserver(updateAccount).observe(avatar, {subtree:true, childList:true, characterData:true});
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
  let lastAppearance = '', themePreference;
  // Observe only the appearance preference in existing settings responses. No
  // extra request or persistence: the original response still goes to the app.
  const fetch = window.fetch;
  window.fetch = function (...args) {
    return fetch.apply(this, args).then(response => {
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
    window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'appearance', rgb, followsSystem:themePreference === 'system'});
  }
  new MutationObserver(updateAppearance).observe(html, {attributes:true, attributeFilter:['data-theme', 'class', 'style']});
  updateAppearance();
  // Hand navigation to the page before slow fonts/images finish loading.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
})();
