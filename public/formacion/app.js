const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
function closeMenu() {
  menu?.setAttribute('aria-expanded','false');
  menu?.setAttribute('aria-label','Abrir menú');
  nav?.classList.remove('open');
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  closeMenu();
  if(open) { menu.setAttribute('aria-expanded','true'); menu.setAttribute('aria-label','Cerrar menú'); nav.classList.add('open'); }
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
});
document.addEventListener('submit', event => {
  if(event.target.id !== 'registration') return;
  event.preventDefault();
  const status = document.querySelector('#form-status');
  status.hidden = false;
  status.textContent = 'La recepción de inscripciones se habilitará próximamente. Tus datos todavía no fueron enviados.';
});
// Cada URL conserva su HTML completo. La navegación interna reutiliza los recursos.
const routes = new Set(['/formacion', ...['el-taller','pablo-martinez','inscripcion','contacto','recursos','preguntas-frecuentes'].map(r => '/formacion/'+r)]);
const cache = new Map();
function loadPage(url) {
  const key = url.pathname;
  if(!cache.has(key)) {
    const request = fetch(url.href, {credentials:'same-origin'}).then(async response => {
      if(!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Página no disponible');
      const doc = new DOMParser().parseFromString(await response.text(),'text/html');
      if(!doc.querySelector('main#main') || !doc.querySelector('.page > footer')) throw new Error('Página incompatible');
      return doc;
    }).catch(error => { cache.delete(key); throw error; });
    cache.set(key,request);
  }
  return cache.get(key);
}
const portrait = new Image();
portrait.src = '/formacion/assets/pablo-martinez.png';
const assetsReady = Promise.allSettled([document.fonts.ready,portrait.decode()]);
let generation = 0;
let transition;
history.scrollRestoration = 'manual';
history.replaceState({...history.state,formation:true,y:scrollY},'');
let scrollFrame;
addEventListener('scroll',() => {
  if(scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    history.replaceState({...history.state,y:scrollY},'');
    scrollFrame = 0;
  });
},{passive:true});
async function navigate(url,{pop=false,y=0}={}) {
  const current = ++generation;
  if(!pop) history.replaceState({...history.state,y:scrollY},'');
  try {
    const [doc] = await Promise.all([loadPage(url),assetsReady]);
    if(current !== generation) return;
    if(transition) { transition.skipTransition(); await transition.finished.catch(()=>{}); }
    if(current !== generation) return;
    // Al volver desde una sección inferior, fundir la vista completa evita que
    // el cambio de posición del scroll exponga de golpe el encabezado.
    document.documentElement.classList.toggle('transition-scrolled',scrollY > 1 || y > 1);
    const update = () => {
      if(current !== generation) return;
      closeMenu();
      document.querySelector('main').replaceWith(doc.querySelector('main').cloneNode(true));
      document.querySelector('footer').replaceWith(doc.querySelector('footer').cloneNode(true));
      document.body.className = doc.body.className;
      document.title = doc.title;
      nav.querySelectorAll('a').forEach(link => {
        if(new URL(link.href).pathname === url.pathname) link.setAttribute('aria-current','page');
        else link.removeAttribute('aria-current');
      });
      if(scrollFrame) { cancelAnimationFrame(scrollFrame); scrollFrame = 0; }
      if(!pop) history.pushState({formation:true,y:0},'',url.href);
      window.scrollTo({top:y,left:0,behavior:'instant'});
      const heading = document.querySelector('h1');
      heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    };
    if(document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const active = document.startViewTransition(update);
      transition = active;
      await active.finished.catch(()=>{});
      if(transition === active) { transition = null; document.documentElement.classList.remove('transition-scrolled'); }
    } else { update(); document.documentElement.classList.remove('transition-scrolled'); }
  } catch {
    if(current === generation) location.assign(url.href);
  }
}
document.addEventListener('click',event => {
  const link = event.target.closest('a');
  if(!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if(url.origin !== location.origin || !routes.has(url.pathname) || url.hash || url.search) return;
  event.preventDefault();
  if(url.pathname === location.pathname) { closeMenu(); return; }
  navigate(url);
});
addEventListener('popstate',event => {
  if(routes.has(location.pathname)) navigate(new URL(location.href),{pop:true,y:event.state?.y||0});
  else location.reload();
});
const prefetch = event => {
  const link = event.target.closest('a');
  if(!link || navigator.connection?.saveData) return;
  const url = new URL(link.href);
  if(url.origin === location.origin && routes.has(url.pathname)) loadPage(url).catch(()=>{});
};
document.addEventListener('pointerover',prefetch,{passive:true});
document.addEventListener('focusin',prefetch);
