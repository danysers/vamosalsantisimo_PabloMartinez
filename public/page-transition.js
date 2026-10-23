(() => {
  if (window.__siteTransitionReady) return;
  window.__siteTransitionReady = true;
  const root = document.documentElement;
  const key = 'vas-page-transition';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leaving = false;
  const reset = () => { leaving = false; root.removeAttribute('data-site-navigation'); };

  async function reveal() {
    if (root.dataset.siteNavigation !== 'entering') return;
    const hero = new Image();
    hero.src = location.pathname.startsWith('/formacion')
      ? '/formacion/assets/pablo-martinez.png' : '/2026/adoracion/santisimo-portada.png';
    // Wait for real resources, with a bounded wait on a slow connection.
    await Promise.race([
      Promise.allSettled([document.fonts.ready, hero.decode()]),
      new Promise(resolve => setTimeout(resolve, 2500)),
    ]);
    if (reduced()) return reset();
    requestAnimationFrame(() => {
      root.dataset.siteNavigation = 'revealing';
      setTimeout(reset, 580);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, {once:true});
  else reveal();
  addEventListener('pageshow', event => { if (event.persisted) reset(); });

  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    const inWorkshop = location.pathname.startsWith('/formacion');
    const toWorkshop = /^\/formacion(?:\/|$)/.test(url.pathname);
    if (url.origin !== location.origin || inWorkshop === toWorkshop || (!toWorkshop && url.pathname !== '/') || reduced()) return;
    // If storage is unavailable, keep ordinary link navigation working.
    try { sessionStorage.setItem(key, JSON.stringify({path:url.pathname,at:Date.now()})); }
    catch { return; }
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    root.dataset.siteNavigation = 'leaving';
    setTimeout(() => location.assign(url.href), 290);
    setTimeout(reset, 8000);
  });
})();
