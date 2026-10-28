(() => {
  'use strict';
  let current=null, preparing=null, checking=null, timer=0, checks=0;
  let lastState=null, savingMethod=false;
  const opensInNewTab=location.protocol!=='https:';
  const money=minor => '$'+(minor/100).toLocaleString('es-AR');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  async function json(url,body) {
    const response=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if (!response.ok) throw new Error(result.error || 'No pudimos completar la consulta. Intentá nuevamente.');
    return result;
  }
  function remember(receipt) {
    current={reference:receipt.reference,accessToken:receipt.paymentAccessToken,localTest:receipt.localTest===true || receipt.testMode===true,payment:receipt.payment};
    try { sessionStorage.setItem('vas-workshop-payment:'+receipt.reference,JSON.stringify(current)); } catch { /* Current tab remains usable. */ }
    const url=new URL(location.href); url.searchParams.set('reference',receipt.reference);
    history.replaceState({...history.state},'',url);
  }
  function shell() {
    const result=document.getElementById('registration-result'); if (!result) return null;
    const grid=document.getElementById('registration-grid'); if (grid) grid.hidden=true;
    result.hidden=false; document.body.classList.add('registration-preview-mode');
    const reference=document.getElementById('registration-reference');
    if (reference && current) reference.textContent='Referencia: '+current.reference;
    return result;
  }
  function controls() {
    const host=document.getElementById('payment-next'); if (!host) return null;
    if (!document.getElementById('checkout-controls')) {
      const container=document.createElement('div'); container.id='checkout-controls';
      const price=document.createElement('p'); price.id='checkout-breakdown';
      const link=document.createElement('a'); link.id='checkout-pay'; link.className='button gold'; link.textContent='Continuar en Mercado Pago'; if (opensInNewTab) link.target='_blank'; link.rel='noopener noreferrer'; link.hidden=true;
      const retry=document.createElement('button'); retry.id='checkout-retry'; retry.type='button'; retry.className='button'; retry.textContent='Preparar pago'; retry.addEventListener('click',preparePayment);
      const edit=document.createElement('button'); edit.id='checkout-edit'; edit.type='button'; edit.className='checkout-edit'; edit.textContent='Elegir otro método de pago'; edit.addEventListener('click',openMethodEditor);
      const proof=document.createElement('a'); proof.id='checkout-proof'; proof.textContent='Enviar comprobante por WhatsApp'; proof.target='_blank'; proof.rel='noopener noreferrer'; proof.hidden=true;
      const status=document.createElement('p'); status.id='checkout-status'; status.setAttribute('role','status');
      const editor=document.createElement('form'); editor.id='checkout-method-editor'; editor.className='checkout-method-editor'; editor.hidden=true;
      editor.innerHTML='<fieldset><legend>¿Cómo preferís completar el pago?</legend><label><input id="payment-choice-mercado_pago" type="radio" name="new-payment-method" value="mercado_pago" required><span>Mercado Pago<small>Tarjeta o dinero en cuenta · Con gastos de servicio</small></span></label><label><input id="payment-choice-bank_transfer" type="radio" name="new-payment-method" value="bank_transfer"><span>Transferencia bancaria<small>Te mostramos el alias para transferir</small></span></label><label><input id="payment-choice-on_site" type="radio" name="new-payment-method" value="on_site"><span>Pagar en el taller<small>Abonás al llegar al encuentro</small></span></label></fieldset><p class="method-editor-note">Conservás tu inscripción y todos tus datos.</p><div class="method-editor-actions"><button id="payment-method-save" type="submit" class="button gold">Guardar método de pago</button><button id="payment-method-cancel" type="button" class="checkout-edit">Cancelar</button></div><p id="payment-method-error" role="status"></p>';
      editor.addEventListener('submit',saveMethod);
      editor.querySelector('#payment-method-cancel').addEventListener('click',() => { editor.hidden=true; if(lastState) renderState(lastState); });
      container.append(price,link,retry,proof,edit,status,editor); host.append(container);
    }
    return {host,title:document.getElementById('payment-next-title'),description:document.getElementById('payment-next-description'),
      price:document.getElementById('checkout-breakdown'),link:document.getElementById('checkout-pay'),retry:document.getElementById('checkout-retry'),edit:document.getElementById('checkout-edit'),proof:document.getElementById('checkout-proof'),editor:document.getElementById('checkout-method-editor'),status:document.getElementById('checkout-status')};
  }
  async function openMethodEditor() {
    if (!current || savingMethod) return;
    const access=current, ui=controls(); if(!ui) return;
    ui.edit.disabled=true;
    try {
      const state=await json('/api/taller/pagos/estado',{reference:access.reference,accessToken:access.accessToken});
      if(current!==access || !ui.host.isConnected) return;
      renderState(state);
      if(!state.canChangeMethod) { if(!ui.host.hidden) ui.status.textContent='Este pago ya no permite cambiar el método. Contactá a la organización si necesitás ayuda.'; return; }
      ui.editor.dataset.attemptId=state.attemptId;
      for(const method of ['mercado_pago','bank_transfer','on_site']) {
        const radio=document.getElementById('payment-choice-'+method);
        radio.disabled=!state.methods[method]; radio.checked=method===state.paymentMethod;
      }
      document.getElementById('payment-method-error').textContent='';
      const slot=document.getElementById('confirmation-method-slot');
      if(slot && state.paymentMethod==='on_site' && state.status==='pending') { slot.append(ui.editor); document.getElementById('pass-change-method').hidden=true; }
      ui.editor.hidden=false; ui.link.hidden=true; ui.retry.hidden=true; ui.proof.hidden=true; ui.edit.hidden=true;
      document.getElementById('payment-choice-'+state.paymentMethod)?.focus();
    } catch(error) { ui.status.textContent=error.message; }
    finally { ui.edit.disabled=false; }
  }
  async function saveMethod(event) {
    event.preventDefault(); if(!current || savingMethod) return;
    const ui=controls(), access=current;
    const method=['mercado_pago','bank_transfer','on_site'].find(value => document.getElementById('payment-choice-'+value).checked);
    if(!method || !ui.editor.dataset.attemptId) return;
    savingMethod=true;
    const save=document.getElementById('payment-method-save'); save.disabled=true; save.textContent='Guardando…';
    const cancel=document.getElementById('payment-method-cancel'); cancel.disabled=true;
    document.getElementById('payment-method-error').textContent='';
    try {
      const result=await json('/api/taller/pagos/metodo',{reference:access.reference,accessToken:access.accessToken,attemptId:ui.editor.dataset.attemptId,method});
      if(current!==access || !ui.host.isConnected) return;
      ui.editor.hidden=true; renderState(result);
      if(result.paymentMethod==='mercado_pago' && result.status==='pending') preparePayment(); else schedule(5000);
    } catch(error) { if(current===access && ui.host.isConnected) document.getElementById('payment-method-error').textContent=error.message; }
    finally { savingMethod=false; save.disabled=false; save.textContent='Guardar método de pago'; cancel.disabled=false; }
  }
  function paymentUrl(value) {
    const url=new URL(value);
    if (url.protocol!=='https:' || !['mercadopago.com.ar','www.mercadopago.com.ar'].includes(url.hostname) || !url.pathname.startsWith('/checkout/') || url.username || url.password) throw new Error('Destino de pago inválido.');
    return url.toString();
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (current && !document.hidden && document.getElementById('payment-next')) timer=setTimeout(refreshPayment,delay);
  }
  async function preparePayment() {
    if (!current || preparing===current) return;
    const access=current, ui=controls(); if (!ui) return;
    preparing=access; ui.retry.disabled=true; ui.status.textContent='Preparando tu pago…';
    try {
      const result=await json('/api/taller/pagos/checkout',{reference:access.reference,accessToken:access.accessToken});
      if (current!==access || !ui.host.isConnected) return;
      ui.link.href=paymentUrl(result.checkoutUrl); ui.link.textContent='Pagar '+money(result.amountMinor)+' con Mercado Pago ↗';
      ui.link.hidden=false; ui.retry.hidden=true;
      ui.status.textContent=access.localTest ? 'Usá únicamente tarjetas de prueba de Mercado Pago. La confirmación se actualizará automáticamente.'
        : 'Esta pantalla se actualizará automáticamente cuando se confirme tu pago.';
    } catch (error) {
      if (current===access && ui.host.isConnected) { ui.status.textContent=error.message; ui.retry.textContent='Reintentar preparar pago'; ui.retry.hidden=false; }
    } finally { if (preparing===access) preparing=null; ui.retry.disabled=false; if (current===access) schedule(5000); }
  }
  function confirmation() {
    let section=document.getElementById('registration-confirmed'); if (section) return section;
    section=document.createElement('div'); section.id='registration-confirmed'; section.className='registration-confirmed'; section.hidden=true;
    // Static template; untrusted values are assigned with textContent, never HTML.
    section.innerHTML='<div class="confirmation-copy">'
      +'<p class="confirmation-welcome">Ya te ponemos en oración y confiamos este encuentro a Dios. Que sea un tiempo para renovar tu fe, compartir tu música y abrir el corazón a lo que Él tiene preparado para vos.</p>'
      +'<blockquote class="confirmation-verse"><p>“Todo lo puedo en Cristo<br>que me fortalece.”</p><cite>Filipenses 4, 13</cite></blockquote>'
      +'<p class="confirmation-email" id="confirmation-email" role="status"></p>'
      +'<p class="confirmation-payment-note" id="confirmation-payment-note" role="status" hidden></p>'
      +'<div class="pass-actions"><button type="button" class="button" id="print-workshop-pass">Imprimir mi acreditación <span aria-hidden="true">↗</span></button><button type="button" class="checkout-edit" id="pass-change-method" hidden>Elegir otro método de pago</button><a href="/formacion" class="confirmation-back">Volver al taller</a></div><div id="confirmation-method-slot"></div>'
      +'<p class="pass-caption">También podés presentar el QR desde tu celular.</p></div>'
      +'<div class="pass-stage"><article class="workshop-pass" aria-label="Tu acreditación al taller de Pablo Martínez">'
      +'<div class="workshop-pass__art"><img class="workshop-pass__logo" src="/formacion/assets/logo-dorado.png" alt="Vamos al Santísimo" width="525" height="388"><span class="workshop-pass__edition">FORMOSA · 2026</span><span class="workshop-pass__type">TALLER DE FORMACIÓN</span><h3>Formación<br><em>católica.</em></h3><p class="workshop-pass__speaker">Pablo Martínez</p></div>'
      +'<div class="workshop-pass__body"><p class="workshop-pass__date" id="pass-date"></p><p class="workshop-pass__venue" id="pass-venue"></p><p class="workshop-pass__nickname" id="pass-nickname" hidden></p><div class="workshop-pass__qr"><img id="pass-qr" width="192" height="192" alt="QR personal para acreditarte en el taller" hidden><p id="pass-qr-pending" role="status">Preparando tu QR…</p></div><p class="workshop-pass__admission" id="pass-admission">TU ACREDITACIÓN PERSONAL</p><p class="workshop-pass__payment" id="pass-payment" hidden></p><p class="workshop-pass__reference" id="pass-reference"></p><p class="workshop-pass__test" id="pass-test" hidden>PRUEBA · SIN VALIDEZ PARA EL EVENTO</p></div></article></div>';
    document.getElementById('registration-result').append(section);
    section.querySelector('#print-workshop-pass').addEventListener('click',() => { if (!section.querySelector('#pass-qr').hidden) window.print(); });
    section.querySelector('#pass-change-method').addEventListener('click',openMethodEditor);
    const stage=section.querySelector('.pass-stage'), card=stage.querySelector('.workshop-pass');
    const reset=() => { card.classList.remove('is-tilting'); card.style.removeProperty('--pass-x'); card.style.removeProperty('--pass-y'); };
    stage.addEventListener('pointermove',event => {
      if (motion.matches || event.pointerType!=='mouse' || event.target.closest('.workshop-pass__qr')) { reset(); return; }
      const box=stage.getBoundingClientRect();
      card.style.setProperty('--pass-x',((.5-(event.clientY-box.top)/box.height)*5).toFixed(2)+'deg');
      card.style.setProperty('--pass-y',(((event.clientX-box.left)/box.width-.5)*7).toFixed(2)+'deg');
      card.classList.add('is-tilting');
    });
    stage.addEventListener('pointerleave',reset);
    return section;
  }
  function renderConfirmation(result,paid=true) {
    const root=shell(); if (!root) return false;
    const section=confirmation() || document.getElementById('registration-confirmed');
    section.querySelector('.workshop-pass').setAttribute('aria-label',paid?'Tu acreditación al taller de Pablo Martínez':'Tu credencial de inscripción · Pago en el taller pendiente');
    root.dataset.state='confirmed'; section.hidden=false; document.getElementById('payment-next').hidden=true;
    root.dataset.payment=paid?'paid':'pending';
    document.getElementById('registration-result-title').textContent=paid?'Inscripción confirmada':'Inscripción registrada';
    root.querySelector('.result-intro').textContent='Tu inscripción ha sido registrada. '+(result.nickname?'¡Te esperamos, '+result.nickname+'!':'¡Te esperamos en el taller!');
    root.querySelector('.result-symbol').textContent='✓'; document.getElementById('registration-reference').hidden=true;
    const test=result.testMode===true || current.localTest;
    document.getElementById('pass-test').hidden=!test;
    document.getElementById('pass-reference').textContent=result.reference;
    const name=document.getElementById('pass-nickname'); name.hidden=!result.nickname; name.textContent=result.nickname||'';
    document.getElementById('pass-admission').textContent=paid?'TU ACREDITACIÓN PERSONAL':'TU CREDENCIAL DE INSCRIPCIÓN';
    const payment=document.getElementById('pass-payment'); payment.hidden=paid; payment.textContent='PAGO EN EL TALLER · PENDIENTE';
    const note=document.getElementById('confirmation-payment-note'); note.hidden=paid; note.textContent='Elegiste pagar en el taller: '+money(result.amountMinor)+'. Presentá este QR en recepción para completar el pago y acreditar tu ingreso.';
    document.getElementById('print-workshop-pass').textContent=paid?'Imprimir mi acreditación ↗':'Imprimir mi inscripción ↗';
    const editor=document.getElementById('checkout-method-editor');
    document.getElementById('pass-change-method').hidden=paid || result.canChangeMethod===false || !editor.hidden;
    const qr=document.getElementById('pass-qr'), pending=document.getElementById('pass-qr-pending');
    const card=paid?result.accreditation:result.registrationCard;
    const ready=!!(card && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(card.qrDataUrl));
    qr.hidden=!ready; pending.hidden=ready; document.getElementById('print-workshop-pass').disabled=!ready;
    if (ready) {
      if (qr.src!==card.qrDataUrl) qr.src=card.qrDataUrl;
      qr.alt=paid?'QR personal para acreditarte en el taller':'QR de tu inscripción para presentar en recepción';
      const date=new Date(card.startsAt);
      const day=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'numeric',month:'long'}).format(date);
      const time=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
      document.getElementById('pass-date').textContent=day+' · '+time+' h';
      document.getElementById('pass-venue').textContent=card.venue;
    } else { qr.removeAttribute('src'); pending.textContent='Estamos preparando tu acreditación. Se actualizará en unos instantes.'; }
    document.getElementById('confirmation-email').textContent=!paid ? 'Guardá tu credencial para el día del encuentro. El pago se registrará al llegar; todavía no figura como abonado.' : result.emailStatus==='sent' ? 'También enviamos tu acreditación por correo. Guardala para el día del encuentro.'
      : result.emailStatus==='failed' ? 'El envío del correo está demorado. Podés guardar tu acreditación desde esta pantalla.'
      : test ? 'Esta acreditación es de prueba y no tiene validez para ingresar al evento.' : 'Tu acreditación también llegará por correo. Mientras tanto, ya podés usar este QR.';
    document.title=paid?'Tu acreditación · Taller Pablo Martínez':'Tu inscripción · Taller Pablo Martínez';
    return ready;
  }
  function renderState(result) {
    const root=shell(), ui=controls(); if (!ui || !root) return false;
    lastState=result;
    const method=result.paymentMethod || current.payment || 'mercado_pago';
    current.payment=method;
    try { sessionStorage.setItem('vas-workshop-payment:'+current.reference,JSON.stringify(current)); } catch { /* Current tab remains usable. */ }
    if (result.testMode) current.localTest=true;
    if(method!=='on_site' || result.status==='approved') document.getElementById('checkout-controls').append(ui.editor);
    if (result.status==='approved' && result.registrationStatus==='confirmed') { ui.editor.hidden=true; return !renderConfirmation(result) || result.emailStatus!=='sent'; }
    if(method==='on_site' && ['pending','created'].includes(result.status) && result.registrationStatus==='pending') {
      if(!ui.editor.hidden && ui.editor.dataset.attemptId!==result.attemptId) ui.editor.hidden=true;
      renderConfirmation(result,false); return true;
    }
    const section=document.getElementById('registration-confirmed');
    if (section) { section.hidden=true; const qr=section.querySelector('#pass-qr'); qr.hidden=true; qr.removeAttribute('src'); }
    root.dataset.state='pending'; ui.host.hidden=false; ui.edit.hidden=result.canChangeMethod===false; ui.proof.hidden=true;
    if(!ui.editor.hidden && ui.editor.dataset.attemptId!==result.attemptId) ui.editor.hidden=true;
    document.getElementById('registration-result-title').textContent='Inscripción registrada';
    root.querySelector('.result-intro').textContent='Ya recibimos tu inscripción. Solo falta un paso para confirmar tu lugar.';
    document.getElementById('registration-reference').hidden=false;
    ui.price.hidden=false;
    ui.price.textContent=method==='mercado_pago' ? money(result.baseAmountMinor)+' + gastos de servicio' : 'Importe del taller: '+money(result.amountMinor);
    if (['cancelled','review'].includes(result.registrationStatus) || ['refunded','partially_refunded','charged_back','review'].includes(result.status)) {
      ui.title.textContent='Inscripción para revisar'; ui.description.textContent='Contactá a la organización con tu referencia. No hagas otro pago desde esta pantalla.';
      ui.link.hidden=true; ui.retry.hidden=true; ui.edit.hidden=true; ui.editor.hidden=true; ui.price.hidden=true; ui.status.textContent=''; return false;
    }
    const originalProof=document.getElementById('payment-proof-link'); if(originalProof) originalProof.hidden=true;
    if(method!=='mercado_pago') {
      ui.link.hidden=true; ui.retry.hidden=true;
      if(method==='bank_transfer') {
        ui.title.textContent='Completá la transferencia';
        ui.description.textContent=result.transfer ? 'Transferí al alias '+result.transfer.alias+' ('+result.transfer.provider+'). La organización verificará tu comprobante para confirmar el lugar.' : 'Estamos consultando los datos para transferir.';
        if(result.transfer?.whatsappUrl && ui.editor.hidden) {
          const url=new URL(result.transfer.whatsappUrl);
          if(url.protocol==='https:' && url.hostname==='wa.me') { ui.proof.href=url.href; ui.proof.hidden=false; }
        }
      } else { ui.title.textContent='Aboná al llegar al taller'; ui.description.textContent='Tu inscripción quedó registrada. Podés completar el pago con la organización el día del encuentro.'; }
      ui.status.textContent='Conservá tu referencia. La confirmación se actualizará automáticamente cuando se registre el pago.';
      if(!ui.editor.hidden) ui.edit.hidden=true;
      return true;
    }
    if (['rejected','cancelled'].includes(result.status)) {
      ui.title.textContent='Pago no aprobado'; ui.description.textContent='El pago fue rechazado, cancelado o venció. Contactá a la organización antes de iniciar otro.';
      ui.link.hidden=true; ui.retry.hidden=true; ui.status.textContent=''; return false;
    }
    ui.title.textContent='Completá tu inscripción con el pago'; ui.description.textContent='Al confirmar el pago, vas a encontrar acá tu acreditación con QR.';
    if (result.checkoutUrl) { ui.link.href=paymentUrl(result.checkoutUrl); ui.link.textContent='Pagar '+money(result.amountMinor)+' con Mercado Pago ↗'; ui.link.hidden=false; ui.retry.hidden=true; }
    if(!ui.editor.hidden) { ui.link.hidden=true; ui.retry.hidden=true; ui.edit.hidden=true; }
    ui.status.textContent=result.verification==='unavailable' ? 'Todavía no pudimos verificar el pago. No pagues otra vez: seguimos consultando su confirmación.'
      : current.localTest ? 'Usá únicamente tarjetas de prueba. El estado se actualiza automáticamente.' : 'El estado se actualiza automáticamente al confirmar tu pago.';
    return true;
  }
  async function refreshPayment() {
    if (!current || checking===current || document.hidden || !document.getElementById('payment-next')) return;
    const access=current; checking=access; let again=true;
    try {
      const result=await json('/api/taller/pagos/estado',{reference:access.reference,accessToken:access.accessToken});
      if (current!==access || !document.getElementById('payment-next')) return;
      again=renderState(result);
    } catch (error) {
      if (current===access) { const ui=controls(); if (ui && !ui.host.hidden) ui.status.textContent=error.message+' Vamos a volver a consultar automáticamente.'; }
    } finally { if (checking===access) checking=null; if (current===access) { checks++; schedule(again ? (checks<12 ? 5000 : 15000) : 60000); } }
  }
  async function configureForm() {
    const form=document.getElementById('registration'); if (!form) return;
    try {
      const response=await fetch('/api/taller/configuracion',{cache:'no-store'}); const config=await response.json();
      if (form!==document.getElementById('registration')) return;
      const note=document.getElementById('workshop-price-note');
      if (response.ok) {
        if (note) note.textContent='Valor del taller: '+money(config.baseAmountMinor)+' + gastos de servicio al pagar online.';
        form.querySelectorAll('[name="formaPago"]').forEach(input => { input.disabled=!config.methods[input.value]; });
        const hint=document.getElementById('workshop-checkout-hint');
        if (hint) hint.textContent=config.localTest || config.environment==='test' ? 'Estás en el entorno de prueba. Usá solo tarjetas de prueba; no hay cargos reales.' : config.registrationOpen ? 'Vas a ver el importe final antes de confirmar el pago.' : 'Las inscripciones todavía no están habilitadas.';
        const label=document.getElementById('mercado-pago-option-label'); if (label) label.textContent='Pago online'+(config.methods.mercado_pago ? '' : ' (en preparación)');
      }
    } catch { /* Server enforces availability and price. */ }
  }
  function restorePayment() {
    clearTimeout(timer); current=null;
    const reference=new URLSearchParams(location.search).get('reference');
    if (!document.getElementById('payment-next') || (!reference && !document.querySelector('[data-payment-return]'))) return;
    try {
      const saved=JSON.parse(sessionStorage.getItem('vas-workshop-payment:'+reference) || 'null');
      if (reference && saved?.reference===reference && /^[A-Za-z0-9_-]{43}$/.test(saved.accessToken)) current=saved;
    } catch { /* Recover without exposing private data. */ }
    shell(); const ui=controls(); ui.host.hidden=false; ui.retry.hidden=true;
    if (current) { checks=0; refreshPayment(); }
    else { ui.title.textContent='Consultá tu inscripción'; ui.description.textContent='Abrí esta pantalla desde el mismo navegador en el que te inscribiste o contactá a la organización con tu referencia.'; ui.edit.hidden=true; }
  }
  document.addEventListener('workshop:form-ready',() => { configureForm(); queueMicrotask(restorePayment); });
  document.addEventListener('workshop:registered',async event => {
    clearTimeout(timer); current=null;
    const receipt=event.detail;
    if (!receipt.paymentAccessToken) return;
    remember(receipt); checks=0;
    if(receipt.resumed && receipt.requestedPayment && receipt.requestedPayment!==receipt.payment && receipt.status==='pending') {
      try {
        const access=current;
        const state=await json('/api/taller/pagos/estado',{reference:access.reference,accessToken:access.accessToken});
        if(current!==access) return;
        const result=state.canChangeMethod ? await json('/api/taller/pagos/metodo',{reference:access.reference,accessToken:access.accessToken,attemptId:state.attemptId,method:receipt.requestedPayment}) : state;
        if(current!==access) return;
        renderState(result);
        if(result.paymentMethod==='mercado_pago' && result.status==='pending') preparePayment(); else schedule(5000);
      } catch(error) { const ui=controls(); if(ui) ui.status.textContent=error.message; schedule(1000); }
      return;
    }
    if (renderState({...receipt,registrationStatus:receipt.status,status:receipt.paymentStatus})) {
      if (receipt.payment==='mercado_pago' && receipt.paymentStatus==='pending') preparePayment(); else refreshPayment();
    }
  });
  document.addEventListener('visibilitychange',() => { if (!document.hidden && current) { checks=0; refreshPayment(); } else clearTimeout(timer); });
  addEventListener('focus',() => { if (current) refreshPayment(); });
  addEventListener('pageshow',event => { if (event.persisted) restorePayment(); });
  addEventListener('pagehide',() => clearTimeout(timer));
  configureForm(); restorePayment();
})();
