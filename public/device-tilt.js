(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(any-pointer: coarse)');
  const mounts = new Map();
  let mode = 'auto', readings = false, pending = false, listening = false;
  let suspended = false, printing = false, frame = 0, latest = null;
  const supported = () => window.isSecureContext && typeof window.DeviceOrientationEvent !== 'undefined' && touch.matches;
  const available = item => item.inView && !item.paused && item.stage.isConnected && item.isActive() && item.stage.getClientRects().length > 0;
  const allowed = () => supported() && !reduced.matches && !document.hidden && !suspended && !printing && mode !== 'off';
  const clamp = value => Math.max(-1, Math.min(1, value));
  const delta = value => ((value + 540) % 360) - 180;
  const angle = () => Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);

  function reset(item) {
    item.baseline = null;
    item.card.classList.remove('sensor-is-tilting');
    item.card.style.removeProperty(item.x);
    item.card.style.removeProperty(item.y);
  }
  function controls() {
    for (const item of mounts.values()) {
      if (!item.controls) continue;
      item.controls.hidden = !supported() || reduced.matches;
      item.button.disabled = pending;
      const on = mode !== 'off' && (readings || mode === 'on');
      item.button.textContent = on ? 'Desactivar movimiento' : 'Activar movimiento con el celular';
      item.button.setAttribute('aria-pressed', String(on));
    }
  }
  function refresh() {
    for (const item of mounts.values()) {
      if (mode === 'off' || item.paused || printing) item.card.classList.add('device-motion-static');
      else item.card.classList.remove('device-motion-static');
      if (!allowed() || !available(item)) reset(item);
    }
    const need = allowed() && [...mounts.values()].some(available);
    if (need !== listening) {
      listening = need;
      if (need) window.addEventListener('deviceorientation', orient, { passive: true });
      else window.removeEventListener('deviceorientation', orient);
    }
    if (!need) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; latest = null;
      mounts.forEach(reset);
    }
    controls();
  }
  function render() {
    frame = 0;
    if (!allowed() || !latest) return;
    const rotation = angle(), radians = rotation * Math.PI / 180;
    for (const item of mounts.values()) {
      if (!available(item)) { reset(item); continue; }
      if (!item.baseline || item.baseline.rotation !== rotation) item.baseline = { ...latest, rotation };
      const beta = delta(latest.beta - item.baseline.beta), gamma = delta(latest.gamma - item.baseline.gamma);
      const horizontal = gamma * Math.cos(radians) + beta * Math.sin(radians);
      const vertical = beta * Math.cos(radians) - gamma * Math.sin(radians);
      item.card.style.setProperty(item.x, (-clamp(vertical / 25) * item.maxX).toFixed(2) + 'deg');
      item.card.style.setProperty(item.y, (clamp(horizontal / 25) * item.maxY).toFixed(2) + 'deg');
      item.card.classList.add('sensor-is-tilting');
    }
  }
  function orient(event) {
    if (!allowed() || typeof event.beta !== 'number' || typeof event.gamma !== 'number' ||
        !Number.isFinite(event.beta) || !Number.isFinite(event.gamma) || Math.abs(event.beta) > 180 || Math.abs(event.gamma) > 90) return;
    if (!readings) { readings = true; controls(); }
    latest = { beta: event.beta, gamma: event.gamma };
    if (!frame) frame = requestAnimationFrame(render);
  }
  function message(text) {
    for (const item of mounts.values()) if (item.status) { item.status.hidden = !text; item.status.textContent = text; }
  }
  function toggle() {
    if (pending || !supported() || reduced.matches) return;
    if (mode !== 'off' && (readings || mode === 'on')) {
      mode = 'off'; message('Movimiento desactivado.'); refresh(); return;
    }
    const activate = () => { mode = 'on'; mounts.forEach(reset); message('Incliná suavemente el celular.'); refresh(); };
    const request = window.DeviceOrientationEvent.requestPermission;
    if (readings || typeof request !== 'function') { activate(); return; }
    // Call inside the actual tap, before any await, for Safari's user gesture.
    pending = true; controls();
    let result;
    try { result = request.call(window.DeviceOrientationEvent); }
    catch { result = Promise.reject(new Error('Permission unavailable')); }
    Promise.resolve(result).then(permission => {
      if (permission === 'granted') activate();
      else { mode = 'off'; message('No se activó el movimiento. Podés permitirlo en la configuración del navegador.'); }
    }).catch(() => {
      mode = 'off'; message('No pudimos activar el movimiento. La tarjeta sigue disponible.');
    }).finally(() => { pending = false; refresh(); });
  }
  function attach(stage, card, options = {}) {
    if (!stage || !card || mounts.has(card)) return;
    const item = { stage, card, controls: options.controls, isActive: options.isActive || (() => true),
      x: options.x || '--poster-x', y: options.y || '--poster-y', maxX: options.maxX || 4, maxY: options.maxY || 5,
      inView: !('IntersectionObserver' in window), paused: false, baseline: null };
    if (item.controls) {
      item.button = item.controls.querySelector('[data-tilt-toggle]');
      item.status = item.controls.querySelector('[data-tilt-status]');
      item.button.addEventListener('click', toggle);
    }
    mounts.set(card, item);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        item.inView = entries.some(entry => entry.isIntersecting);
        if (!item.inView) reset(item);
        refresh();
      }, { threshold: 0.05 });
      observer.observe(stage);
    }
    if (options.ignore) {
      const pause = value => { if (item.paused !== value) { item.paused = value; reset(item); refresh(); } };
      stage.addEventListener('pointerdown', event => pause(!!event.target.closest(options.ignore)));
      stage.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') pause(!!event.target.closest(options.ignore)); });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) stage.addEventListener(type, () => pause(false));
    }
    refresh();
  }
  document.addEventListener('visibilitychange', refresh);
  reduced.addEventListener('change', refresh);
  touch.addEventListener('change', refresh);
  window.addEventListener('orientationchange', () => { mounts.forEach(reset); refresh(); });
  window.addEventListener('beforeprint', () => { printing = true; refresh(); });
  window.addEventListener('afterprint', () => { printing = false; refresh(); });
  window.addEventListener('pagehide', () => { suspended = true; refresh(); });
  window.addEventListener('pageshow', () => { suspended = false; refresh(); });
  window.VASDeviceTilt = Object.freeze({ attach, refresh });
})();
