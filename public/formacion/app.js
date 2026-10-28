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
function updatePaymentDescription() {
  const description=document.querySelector('#payment-method-description');
  if (!description) return;
  const method=document.querySelector('#registration [name="formaPago"]:checked')?.value;
  description.textContent=method==='mercado_pago' ? 'Aboná con tarjeta o con tu cuenta de Mercado Pago. Vas a ver el importe final, con gastos de servicio, antes de confirmar.'
    : method==='bank_transfer' ? 'Al inscribirte te mostraremos los datos para transferir y enviar el comprobante a la organización.'
    : method==='on_site' ? 'Registrá tu inscripción y aboná al llegar al taller.'
    : 'Elegí una opción para ver cómo continuar.';
}
document.addEventListener('change', event => {
  if(event.target.name === 'formaPago') { updatePaymentDescription(); return; }
  if(event.target.name !== 'tieneInconveniente') return;
  const details = document.querySelector('#payment-details-field');
  const textarea = document.querySelector('#inconveniente');
  const showDetails = event.target.value === 'si';
  details.hidden = !showDetails;
  if(!showDetails) textarea.value = '';
  const methodField = document.querySelector('#payment-method-field');
  methodField.hidden = showDetails;
  for (const radio of methodField.querySelectorAll('input[name="formaPago"]')) {
    radio.required = !showDetails;
    if (showDetails) radio.checked = false;
  }
  updatePaymentDescription();
});
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function prepareRegistrationForm() {
  const birthDate = document.querySelector('#registration [name="fechaNacimiento"]');
  if (birthDate) birthDate.max = todayIso();
  document.dispatchEvent(new Event('workshop:form-ready'));
}
prepareRegistrationForm();
document.addEventListener('input', event => {
  const form = event.target.closest?.('#registration');
  if (form) {
    delete form.dataset.creationKey;
    if ('setCustomValidity' in event.target) event.target.setCustomValidity('');
  }
});
document.addEventListener('change', event => {
  if (event.target.closest?.('#registration')) delete event.target.closest('#registration').dataset.creationKey;
});
function validateRegistration(form) {
  for (const input of form.querySelectorAll('input:not([type="radio"]), textarea')) input.value = input.value.trim();
  const namePattern = /^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u;
  for (const name of ['nombre', 'apellido']) {
    const input = form.elements.namedItem(name);
    input.setCustomValidity(input.value && (!namePattern.test(input.value) || input.value.length < 2)
      ? 'Ingresá al menos dos letras, sin números ni símbolos.' : '');
  }
  const birthDate = form.elements.namedItem('fechaNacimiento');
  birthDate.max = todayIso();
  birthDate.setCustomValidity(birthDate.value && (birthDate.value < '1900-01-01' || birthDate.value > birthDate.max)
    ? 'Ingresá una fecha de nacimiento válida, que no sea futura.' : '');
  const phone = form.elements.namedItem('telefono');
  const value = phone.value;
  const digits = value.replace(/\D/g, '');
  phone.setCustomValidity(value && (!/^\+?[\d\s()-]+$/.test(value) || digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits))
    ? 'Ingresá un teléfono válido con código de área.' : '');
  return form.reportValidity();
}
function showRegistrationResult(form, receipt) {
  const result = document.getElementById('registration-result');
  result.querySelector('.result-intro').textContent=receipt.paymentStatus==='approved' ? 'Tu inscripción está confirmada. Conservá tu referencia para cualquier consulta.'
    : receipt.payment==='mercado_pago' ? 'Ya registramos tus datos. Continuá con el pago online para confirmar tu lugar.'
    : receipt.payment==='bank_transfer' ? 'Ya registramos tus datos. A continuación tenés la información para completar la transferencia.'
    : receipt.payment==='on_site' ? 'Tu inscripción quedó registrada para abonar en el taller.'
    : 'Recibimos tu solicitud. La organización se comunicará con vos para acompañarte.';
  result.querySelector('#registration-reference').textContent = `Referencia: ${receipt.reference}. Guardala para cualquier consulta.`;
  const next = result.querySelector('#payment-next');
  const title = result.querySelector('#payment-next-title');
  const description = result.querySelector('#payment-next-description');
  const proof = result.querySelector('#payment-proof-link');
  next.hidden = false;
  proof.hidden = true;
  if (receipt.status === 'cancelled' || ['refunded', 'charged_back', 'review'].includes(receipt.paymentStatus)) {
    title.textContent = 'Inscripción para revisar';
    description.textContent = 'No hagas otro pago desde esta pantalla. Contactá a la organización con tu referencia.';
  } else if (receipt.paymentStatus === 'approved') {
    title.textContent = 'Pago confirmado';
    description.textContent = 'Tu pago ya figura confirmado. La acreditación con QR se enviará por separado cuando esté emitida.';
  } else if (receipt.paymentStatus === 'declined') {
    title.textContent = 'Solicitud revisada';
    description.textContent = 'No se aprobó la excepción de pago. Contactá a la organización para acordar cómo abonar.';
  } else if (receipt.payment === 'mercado_pago') {
    title.textContent = 'Pago pendiente';
    description.textContent = 'Tu inscripción está registrada. Continuá con Mercado Pago para abonar el importe final.';
  } else if (receipt.payment === 'bank_transfer') {
    title.textContent = 'Transferencia pendiente';
    description.textContent = `Transferí $${(receipt.amountMinor / 100).toLocaleString('es-AR')} al alias ${receipt.transfer.alias} (${receipt.transfer.provider}). Tu pago quedará pendiente hasta que lo verifiquemos.`;
    proof.href = receipt.transfer.whatsappUrl;
    proof.hidden = false;
  } else if (receipt.payment === 'on_site') {
    title.textContent = 'Pago en el lugar pendiente';
    description.textContent = `El importe previsto es $${(receipt.amountMinor / 100).toLocaleString('es-AR')}. El pago se registrará en el taller.`;
  } else {
    title.textContent = 'Solicitud recibida';
    description.textContent = 'Revisaremos tu situación. Por ahora no tenés que pagar; te avisaremos cuando se resuelva.';
    if (receipt.assistanceWhatsappUrl) {
      proof.href = receipt.assistanceWhatsappUrl;
      proof.textContent = 'Avisar también por WhatsApp';
      proof.hidden = false;
    }
  }
  document.getElementById('registration-grid').hidden = true;
  result.hidden = false;
  document.body.classList.add('registration-preview-mode');
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  result.focus({ preventScroll: true });
}
document.addEventListener('submit', async event => {
  if (event.target.id !== 'registration') return;
  event.preventDefault();
  const form = event.target;
  if (!validateRegistration(form)) return;
  const data = new FormData(form);
  const error = document.getElementById('registration-error');
  const button = form.querySelector('button[type="submit"]');
  error.hidden = true;
  button.disabled = true;
  const creationKey = form.dataset.creationKey || crypto.randomUUID();
  form.dataset.creationKey = creationKey;
  const resumeReceipts=[];
  try {
    for(let i=sessionStorage.length-1;i>=0&&resumeReceipts.length<8;i--) {
      const key=sessionStorage.key(i); if(!key?.startsWith('vas-workshop-payment:')) continue;
      const saved=JSON.parse(sessionStorage.getItem(key));
      if(/^[A-Za-z0-9_-]{10,80}$/.test(saved?.reference) && /^[A-Za-z0-9_-]{43}$/.test(saved?.accessToken)) resumeReceipts.push({reference:saved.reference,accessToken:saved.accessToken});
    }
  } catch { /* A registration can still be submitted without saved receipts. */ }
  try {
    const response = await fetch('/api/taller/inscripciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': creationKey },
      body: JSON.stringify({
        firstName: data.get('nombre'), lastName: data.get('apellido'), birthDate: data.get('fechaNacimiento'),
        nickname: data.get('apodo') || '', resumeReceipts,
        phone: data.get('telefono'), email: data.get('correo'), prayerGroup: data.get('grupo'),
        movement: data.get('mov'), ecclesialState: data.get('estado'), occupation: data.get('ocupacion'),
        paymentDifficulty: data.get('tieneInconveniente') === 'si',
        paymentDifficultyNotes: data.get('tieneInconveniente') === 'si' ? data.get('inconveniente') : '',
        ...(data.get('tieneInconveniente') === 'no' ? { paymentMethod: data.get('formaPago') } : {}),
      }),
    });
    const receipt = await response.json();
    if (!response.ok) throw new Error(receipt.error || 'No pudimos registrar tu inscripción. Intentá nuevamente.');
    showRegistrationResult(form, receipt);
    if (receipt.localTest || receipt.testMode) {
      const notice=document.createElement('p'); notice.className='registration-test-notice';
      notice.textContent='Modo de prueba · Sin cargos reales';
      document.getElementById('registration-result').append(notice);
    }
    document.dispatchEvent(new CustomEvent('workshop:registered',{detail:receipt}));
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : 'No pudimos registrar tu inscripción. Intentá nuevamente.';
    error.hidden = false;
  } finally { button.disabled = false; }
});
// Cada URL conserva su HTML completo. La navegación interna reutiliza los recursos.
const routes = new Set(['/formacion', ...['pablo-martinez','inscripcion','contacto','recursos','preguntas-frecuentes'].map(r => '/formacion/'+r)]);
function updateDirections() {
  const link = document.getElementById('workshop-directions');
  if (!link) return;
  const apple = /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const destination = 'Parroquia San Luis Rey de Francia, Paraguay 260, Formosa, Argentina';
  const url = new URL(apple ? 'https://maps.apple.com/' : 'https://www.google.com/maps/dir/');
  url.search = new URLSearchParams(apple ? { daddr: destination, dirflg: 'd' } : { api: '1', destination, dir_action: 'navigate' }).toString();
  link.href = url.toString();
  link.setAttribute('aria-label', `Cómo llegar a la Parroquia San Luis de Francia en ${apple ? 'Mapas de Apple' : 'Google Maps'}`);
}
updateDirections();
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
      prepareRegistrationForm();
      updateDirections();
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
