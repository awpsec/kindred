// Presentation only. Session storage and origin enforcement belong to WebSession.
(() => {
  if (!window.__KINDRED_MOBILE || document.documentElement.dataset.kindredIos) return;
  document.documentElement.dataset.kindredIos = 'true';
  document.documentElement.dataset.mobile = 'true';
  const shell = document.querySelector('#app');
  const header = document.querySelector('.conversation-header');
  if (!shell || !header) return;
  const compact = matchMedia('(max-width:760px), (max-height:500px)');
  const menu = document.querySelector('#mobile-menu');
  const sidebar = shell.querySelector('.sidebar');
  const backdrop = document.createElement('button');
  backdrop.id = 'ios-sidebar-backdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close conversations');
  backdrop.onclick = () => { shell.classList.remove('sidebar-open'); menu?.focus(); };
  shell.append(backdrop);
  const accounts = document.createElement('button');
  accounts.id = 'ios-accounts';
  accounts.type = 'button';
  accounts.className = 'icon-button';
  accounts.setAttribute('aria-label', 'Accounts');
  accounts.title = 'Accounts';
  accounts.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
  accounts.onclick = () => window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'open'});
  (header.querySelector('.header-actions') || header).append(accounts);
  // Do not wait for slow fonts/images before handing navigation to the chat.
  window.webkit?.messageHandlers?.kindredAccounts?.postMessage({action:'interface-ready'});
  function updateNavigation() {
    const railClasses = ['sidebar-rail', 'sidebar-fading', 'sidebar-peek'];
    if (compact.matches && railClasses.some(name => shell.classList.contains(name))) shell.classList.remove(...railClasses);
    const open = shell.classList.contains('sidebar-open');
    menu?.setAttribute('aria-expanded', String(open));
    if (sidebar) sidebar.inert = compact.matches && !open;
    backdrop.hidden = !compact.matches || !open;
  }
  // A phone starts in the conversation; selecting a chat closes the drawer.
  if (compact.matches) shell.classList.remove('sidebar-open');
  compact.addEventListener('change', () => {
    shell.classList.remove('sidebar-open');
    updateNavigation();
  });
  new MutationObserver(updateNavigation).observe(shell, {attributes:true, attributeFilter:['class']});
  updateNavigation();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compact.matches && shell.classList.contains('sidebar-open')) backdrop.click();
  });
})();
