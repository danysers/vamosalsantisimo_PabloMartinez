(() => {
  if (window.__siteTransitionReady) return;
  window.__siteTransitionReady = true;
  const root = document.documentElement;
  const key = 'vas-page-transition';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leaving = false;
  const reset = () => {
    leaving = false;
    root.removeAttribute('data-site-navigation');
    root.removeAttribute('data-site-transition');
    document.querySelector('.workshop-transition')?.remove();
  };

  function workshopOverlay() {
    let overlay = document.querySelector('.workshop-transition');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'workshop-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="workshop-transition__brand"><svg class="workshop-transition__ring" viewBox="0 0 110 110" aria-hidden="true"><circle class="ring-track" cx="55" cy="55" r="52" pathLength="1"/><circle class="ring-glint" cx="55" cy="55" r="52" pathLength="1"/></svg><img src="/2026/logo.webp" width="525" height="388" alt=""></div>';
    document.body.append(overlay);
    return overlay;
  }

  async function reveal() {
    if (root.dataset.siteNavigation !== 'entering') return;
    const workshop = root.dataset.siteTransition === 'workshop';
    const overlay = workshop ? workshopOverlay() : null;
    const hero = new Image();
    hero.src = location.pathname.startsWith('/formacion')
      ? '/formacion/assets/pablo-martinez.png'
      : location.pathname === '/' ? '/2026/adoracion/santisimo-portada.png' : '/2026/logo.webp';
    // Wait for real resources, with a bounded wait on a slow connection.
    await Promise.race([
      Promise.allSettled([document.fonts.ready, hero.decode()]),
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
    if (reduced()) return reset();
    requestAnimationFrame(() => {
      root.dataset.siteNavigation = 'revealing';
      if (overlay) overlay.classList.add('is-revealing');
      setTimeout(reset, workshop ? 780 : 580);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, {once:true});
  else reveal();
  addEventListener('pageshow', event => { if (event.persisted) reset(); });

  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    const area = path => path === '/' ? 'inicio' : /^(?:\/)(formacion|voluntarios|donaciones)(?:\/|$)/.exec(path)?.[1];
    const from = area(location.pathname);
    const to = area(url.pathname);
    if (url.origin !== location.origin || !from || !to || from === to || reduced()) return;
    if (leaving) { event.preventDefault(); return; }
    const workshop = from === 'inicio' && to === 'formacion' && url.pathname.replace(/\/$/, '') === '/formacion';
    // If storage is unavailable, keep ordinary link navigation working.
    try { sessionStorage.setItem(key, JSON.stringify({path:url.pathname,at:Date.now(),mode:workshop ? 'workshop' : undefined})); }
    catch { return; }
    event.preventDefault();
    leaving = true;
    root.dataset.siteNavigation = workshop ? 'leaving-workshop' : 'leaving';
    if (workshop) {
      root.dataset.siteTransition = 'workshop';
      workshopOverlay().classList.add('is-leaving');
    }
    setTimeout(() => location.assign(url.href), workshop ? 2070 : 290);
    setTimeout(reset, 8000);
  }, true);
})();
