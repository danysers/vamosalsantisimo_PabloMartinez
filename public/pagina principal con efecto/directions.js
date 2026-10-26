(() => {
  'use strict';
  const main = document.getElementById('directions-main');
  if (!main) return;
  const fallback = document.getElementById('directions-rain');
  const place = document.getElementById('directions-place');
  const address = document.getElementById('directions-address');
  const status = document.getElementById('directions-status');
  const rainDestination = 'Parroquia María Auxiliadora, Av. 9 de Julio 1015, Formosa, Argentina';
  const apple = /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const source = document.getElementById('weather-source');
  let destination = '-26.1936919,-58.1701572';
  let timer = 0;
  let loading = false;
  let lastAttempt = 0;
  let stopped = false;

  function mapUrl(value) {
    const url = new URL(apple ? 'https://maps.apple.com/' : 'https://www.google.com/maps/dir/');
    url.search = new URLSearchParams(apple ? { daddr:value, dirflg:'d' } : { api:'1', destination:value, dir_action:'navigate' }).toString();
    return url.toString();
  }
  function setLink(link, value, name) {
    link.href = mapUrl(value);
    link.setAttribute('aria-label', `Cómo llegar a ${name} en ${apple ? 'Mapas de Apple' : 'Google Maps'}`);
  }
  function syncLinks() {
    setLink(main, destination, place.textContent);
    setLink(fallback, rainDestination, 'María Auxiliadora');
  }
  function unavailable() {
    status.textContent = 'No pudimos consultar el clima. Antes de salir, verificá la sede con el equipo. También tenés abajo el acceso a María Auxiliadora.';
  }
  function apply(data) {
    if (!data || !['scheduled','dry','rain','unavailable','ended','manual'].includes(data.status) || !['indoor','outdoor'].includes(data.venue?.id)) throw new Error('Invalid venue');
    const indoor = data.venue.id === 'indoor';
    const name = indoor ? 'Parroquia María Auxiliadora' : 'Anfiteatro de la Juventud';
    destination = indoor ? rainDestination : '-26.1936919,-58.1701572';
    place.textContent = name;
    address.textContent = indoor ? 'Av. 9 de Julio 1015, Formosa.' : 'Av. Napoleón Uriburu y Av. 9 de Julio, Formosa.';
    document.querySelectorAll('[data-event-venue-label]').forEach(node => { node.textContent = name; });
    document.documentElement.dataset.eventVenue = indoor ? 'indoor' : 'outdoor';
    syncLinks();
    source.hidden = !['dry','rain','unavailable'].includes(data.status);
    if (data.status === 'scheduled') status.textContent = 'Si llueve, nos encontramos en María Auxiliadora. La sede se actualiza según el clima desde las 18:00 h del 19 de diciembre.';
    else if (data.status === 'rain') status.textContent = 'El reporte meteorológico indica lluvia. Nos encontramos en María Auxiliadora; el botón ya te lleva allí.';
    else if (data.status === 'dry') status.textContent = 'El reporte meteorológico no indica lluvia. Nos encontramos en el Anfiteatro; seguimos revisando el clima.';
    else if (data.status === 'manual') status.textContent = 'Sede indicada por el equipo del encuentro.';
    else if (data.status === 'unavailable') unavailable();
    else status.textContent = 'La revisión automática del clima para este encuentro finalizó.';
    return data.refreshAfterMs;
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped && delay > 0) timer = setTimeout(refresh, Math.max(1000, Math.min(delay, 60 * 60 * 1000)));
  }
  async function refresh() {
    if (loading || document.hidden || stopped) return;
    loading = true;
    lastAttempt = Date.now();
    let delay = 5 * 60 * 1000;
    try {
      const response = await fetch('/api/evento/sede', { cache:'no-store', signal:AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Venue unavailable');
      delay = apply(await response.json());
    } catch { unavailable(); }
    finally { loading = false; schedule(delay); }
  }
  syncLinks();
  refresh();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else if (Date.now() - lastAttempt > 30000) refresh();
    else schedule(30000);
  });
  addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
  addEventListener('pageshow', event => { if (event.persisted) { stopped = false; refresh(); } });
})();
