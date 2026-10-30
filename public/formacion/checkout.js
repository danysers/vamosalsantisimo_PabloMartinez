(() => {
  'use strict';
  let current=null, preparing=null, checking=null, timer=0, checks=0;
  let restoringReturn=null;
  let lastState=null, savingMethod=false, uploading=null, baseAmountMinor=null, onlineFeeMinor=null, onlineCheckoutReady=false, testMode=false;
  const whatsappIcon='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 2.5A13.4 13.4 0 0 0 4.4 22.6L2.5 29.5l7.1-1.9A13.5 13.5 0 1 0 16 2.5Z"/><path fill="#fff" d="M22.7 19.1c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.8.2l-1.1 1.3c-.2.2-.4.3-.8.1-2.2-1.1-3.6-2.1-4.8-4.3-.4-.6.4-.6 1.1-1.9.1-.2.1-.5 0-.7l-1.2-2.8c-.3-.7-.6-.6-.8-.6h-.8c-.3 0-.7.1-1 .5-1 1.1-1.3 2.2-1.1 3.6.3 1.8 1.7 3.8 3.3 5.4 2.3 2.3 5.3 3.8 7.8 4.1 1.3.2 2.5-.4 3.1-1.2.4-.6.6-1.7.5-1.9-.2-.3-.5-.4-.8-.6Z"/></svg>';
  function helpUrl(result={}) {
    const fallback='https://wa.me/5493704258770';
    let url; try { url=new URL(result.supportWhatsappUrl || result.transfer?.whatsappUrl || fallback); } catch { url=new URL(fallback); }
    if(url.protocol!=='https:' || url.hostname!=='wa.me') url=new URL(fallback);
    url.searchParams.set('text','Tengo un problema con el comprobante de pago.'+(current?.reference?' Mi número de gestión es '+current.reference+'.':''));
    return url.toString();
  }
  const opensInNewTab=location.protocol!=='https:';
  const money=minor => '$'+(minor/100).toLocaleString('es-AR');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  async function json(url,body,signal) {
    const access=body.reference && (body.accessToken||body.token) ? {reference:body.reference,token:body.accessToken||body.token,...(body.purpose?{purpose:body.purpose}:{})} : undefined;
    const response=await (window.VASErrors?.fetch||fetch)(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal},access);
    const result=await response.json();
    if (!response.ok) { const error=new Error(result.error || 'No pudimos completar la consulta. Intentá nuevamente.');error.status=response.status;throw error; }
    return result;
  }
  const readState=(access,signal)=>access.scope ? json('/api/taller/enlace',{reference:access.reference,token:access.accessToken,purpose:access.scope},signal)
    : json('/api/taller/pagos/estado',{reference:access.reference,accessToken:access.accessToken},signal);
  const emailPage=()=>location.pathname.replace(/\/index\.html$|\/$/g,'')==='/formacion/acreditacion'?'pass'
    : location.pathname.replace(/\/index\.html$|\/$/g,'')==='/formacion/comprobante'?'proof':null;
  function remember(receipt) {
    current={reference:receipt.reference,accessToken:receipt.paymentAccessToken,payment:receipt.payment,transferMode:receipt.transferMode||'alias',testMode:receipt.testMode===true};
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
      const alias=document.createElement('div'); alias.id='checkout-transfer-alias'; alias.className='checkout-transfer-option'; alias.hidden=true;
      alias.innerHTML='<p class="alias-label">Alias para transferir</p><strong id="checkout-alias-value"></strong><button type="button" id="copy-transfer-alias" class="checkout-edit">Copiar alias</button><span id="copy-alias-feedback" role="status"></span><dl id="checkout-alias-details"><div><dt>Billetera</dt><dd id="checkout-alias-provider"></dd></div><div><dt>Titular</dt><dd id="checkout-alias-holder"></dd></div><div id="checkout-alias-document-row"><dt>DNI del titular</dt><dd id="checkout-alias-document"></dd></div></dl>';
      alias.querySelector('#copy-transfer-alias').addEventListener('click',async()=>{try { await navigator.clipboard.writeText(document.getElementById('checkout-alias-value').textContent);document.getElementById('copy-alias-feedback').textContent='Alias copiado'; } catch { document.getElementById('copy-alias-feedback').textContent='Podés seleccionar el alias y copiarlo.'; } });
      const proof=document.createElement('form'); proof.id='checkout-proof'; proof.className='checkout-proof'; proof.hidden=true;
      const proofLabel=document.createElement('label'); proofLabel.htmlFor='checkout-proof-file'; proofLabel.textContent='¿Ya hiciste el pago? Subí tu comprobante acá';
      const proofNote=document.createElement('p'); proofNote.className='proof-payment-note'; proofNote.textContent='Asegurate de no pagar dos veces. Una vez que pagaste, adjuntá el comprobante para que podamos verificarlo.';
      const proofInput=document.createElement('input'); proofInput.id='checkout-proof-file'; proofInput.type='file'; proofInput.name='comprobante'; proofInput.accept='image/png,image/jpeg,image/webp,application/pdf'; proofInput.required=true;
      const proofButton=document.createElement('button'); proofButton.type='submit'; proofButton.className='button gold'; proofButton.textContent='Subir comprobante';
      const proofFeedback=document.createElement('p'); proofFeedback.id='checkout-proof-feedback'; proofFeedback.setAttribute('role','status');
      proof.append(proofLabel,proofNote,proofInput,proofButton,proofFeedback); proof.addEventListener('submit',uploadProof);
      const help=document.createElement('a'); help.id='checkout-help'; help.className='whatsapp-help'; help.innerHTML=whatsappIcon+'<span><strong>¿Tenés inconvenientes para enviar el comprobante?</strong><small>Consultanos por WhatsApp</small></span>'; help.target='_blank'; help.rel='noopener noreferrer'; help.hidden=true;
      const transferQr=document.createElement('div'); transferQr.id='checkout-transfer-qr'; transferQr.hidden=true;
      const transferQrTitle=document.createElement('p'); transferQrTitle.textContent='Pago con QR · Escaneá con tu billetera';
      const transferQrImage=document.createElement('img'); transferQrImage.id='checkout-transfer-qr-image'; transferQrImage.alt='QR para pagar el taller con una billetera virtual'; transferQrImage.width=280; transferQrImage.height=302; transferQrImage.loading='lazy';
      transferQr.append(transferQrTitle,transferQrImage);
      const status=document.createElement('p'); status.id='checkout-status'; status.setAttribute('role','status');
      const notice=document.createElement('p'); notice.id='checkout-test-notice'; notice.className='checkout-test-notice'; notice.textContent='Mercado Pago en modo de prueba. Usá únicamente cuentas y tarjetas de prueba; no hay cargos reales.';notice.hidden=true;
      const methodWarning=document.createElement('p'); methodWarning.id='checkout-method-warning';methodWarning.setAttribute('role','alert');methodWarning.hidden=true;
      const editor=document.createElement('form'); editor.id='checkout-method-editor'; editor.className='checkout-method-editor'; editor.hidden=true;
      editor.innerHTML='<fieldset><legend>¿Cómo preferís completar el pago?</legend><label><input id="payment-choice-mercado_pago" type="radio" name="new-payment-method" value="mercado_pago" required><span>Mercado Pago<small>Tarjeta o dinero en cuenta · Con gastos de servicio</small></span></label><label><input id="payment-choice-bank_transfer_alias" type="radio" name="new-payment-method" value="bank_transfer_alias"><span>Transferencia por alias<small>Sin gastos de servicio · Adjuntá el comprobante acá</small></span></label><label><input id="payment-choice-bank_transfer_qr" type="radio" name="new-payment-method" value="bank_transfer_qr"><span>Pago con QR<small>Sin gastos de servicio · Adjuntá el comprobante acá</small></span></label><label><input id="payment-choice-on_site" type="radio" name="new-payment-method" value="on_site"><span>Pago en efectivo en el taller<small>$20.000 · Sin promociones ni precios por lote</small></span></label></fieldset><p class="method-editor-note">Conservás tu inscripción y todos tus datos.</p><div class="method-editor-actions"><button id="payment-method-save" type="submit" class="button gold">Guardar método de pago</button><button id="payment-method-cancel" type="button" class="checkout-edit">Cancelar</button></div><p id="payment-method-error" role="status"></p>';
      editor.addEventListener('submit',saveMethod);
      editor.querySelector('#payment-method-cancel').addEventListener('click',() => { editor.hidden=true; if(lastState) renderState(lastState); });
      container.append(methodWarning,notice,price,link,retry,alias,transferQr,proof,help,edit,status,editor); host.append(container);
    }
    return {host,title:document.getElementById('payment-next-title'),description:document.getElementById('payment-next-description'),
      price:document.getElementById('checkout-breakdown'),link:document.getElementById('checkout-pay'),retry:document.getElementById('checkout-retry'),edit:document.getElementById('checkout-edit'),proof:document.getElementById('checkout-proof'),help:document.getElementById('checkout-help'),alias:document.getElementById('checkout-transfer-alias'),transferQr:document.getElementById('checkout-transfer-qr'),editor:document.getElementById('checkout-method-editor'),status:document.getElementById('checkout-status')};
  }
  async function openMethodEditor() {
    if (!current || current.scope || emailPage()==='proof' || savingMethod) return;
    const access=current, ui=controls(); if(!ui) return;
    ui.edit.disabled=true;
    try {
      const state=await json('/api/taller/pagos/estado',{reference:access.reference,accessToken:access.accessToken});
      if(current!==access || !ui.host.isConnected) return;
      renderState(state);
      if(!state.canChangeMethod) { if(!ui.host.hidden) ui.status.textContent='Este pago ya no permite cambiar el método. Contactá a la organización si necesitás ayuda.'; return; }
      ui.editor.dataset.attemptId=state.attemptId;
      for(const method of ['mercado_pago','bank_transfer_alias','bank_transfer_qr','on_site']) {
        const radio=document.getElementById('payment-choice-'+method);
        radio.disabled=!state.methods[method.startsWith('bank_transfer_')?'bank_transfer':method];
        radio.checked=method===(state.paymentMethod==='bank_transfer' ? 'bank_transfer_'+(current.transferMode||'alias') : state.paymentMethod);
      }
      document.getElementById('payment-method-error').textContent='';
      const slot=document.getElementById('confirmation-method-slot');
      if(slot && state.paymentMethod==='on_site' && state.status==='pending') { slot.append(ui.editor); document.getElementById('pass-change-method').hidden=true; }
      ui.editor.hidden=false; ui.link.hidden=true; ui.retry.hidden=true; ui.proof.hidden=true; ui.help.hidden=true; ui.alias.hidden=true; ui.transferQr.hidden=true; ui.edit.hidden=true;
      document.getElementById('payment-choice-'+(state.paymentMethod==='bank_transfer'?'bank_transfer_'+(current.transferMode||'alias'):state.paymentMethod))?.focus();
    } catch(error) { ui.status.textContent=error.message; }
    finally { ui.edit.disabled=false; }
  }
  async function saveMethod(event) {
    event.preventDefault(); if(!current || current.scope || emailPage()==='proof' || savingMethod) return;
    const ui=controls(), access=current;
    const choice=['mercado_pago','bank_transfer_alias','bank_transfer_qr','on_site'].find(value => document.getElementById('payment-choice-'+value).checked);
    if(!choice || !ui.editor.dataset.attemptId) return;
    const method=choice.startsWith('bank_transfer_')?'bank_transfer':choice;
    if(method===lastState?.paymentMethod) {
      current.transferMode=choice==='bank_transfer_qr'?'qr':'alias';
      ui.editor.hidden=true; renderState(lastState); return;
    }
    savingMethod=true;
    const save=document.getElementById('payment-method-save'); save.disabled=true; save.textContent='Guardando…';
    const cancel=document.getElementById('payment-method-cancel'); cancel.disabled=true;
    document.getElementById('payment-method-error').textContent='';
    try {
      const result=await json('/api/taller/pagos/metodo',{reference:access.reference,accessToken:access.accessToken,attemptId:ui.editor.dataset.attemptId,method});
      if(current!==access || !ui.host.isConnected) return;
      if(method==='bank_transfer') current.transferMode=choice==='bank_transfer_qr'?'qr':'alias';
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
  async function uploadProof(event) {
    event.preventDefault(); if(!current || uploading?.reference===current.reference) return;
    const access=current, ui=controls();
    const file=document.getElementById('checkout-proof-file').files?.[0];
    const feedback=document.getElementById('checkout-proof-feedback');
    if(!file || !file.size || file.size>5*1024*1024) { feedback.textContent='Elegí una imagen o PDF de hasta 5 MB.'; return; }
    uploading=access; clearTimeout(timer);
    const button=ui.proof.querySelector('button'); button.disabled=true; feedback.textContent='Subiendo comprobante…';
    let serverMessage='', failureCode='upload_network', httpStatus;
    const correlationId=window.VASErrors?.newId();
    const report=outcome=>window.VASErrors?.report({correlationId,operation:'proof_upload',code:failureCode,...(httpStatus>=400?{httpStatus}:{}),
      fileSize:Math.min(file.size,100*1024*1024),fileType:['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)?file.type:'other',
      online:typeof navigator==='undefined'||navigator.onLine!==false,outcome},
    {reference:access.reference,token:access.accessToken,...(access.scope?{purpose:access.scope}:{})});
    try {
      const body=new FormData(); body.set('reference',access.reference); body.set(access.scope==='proof'?'emailToken':'accessToken',access.accessToken); body.set('comprobante',file);
      const response=await fetch('/api/taller/pagos/comprobante',{method:'POST',body,cache:'no-store',...(correlationId?{headers:{'X-VAS-Request-ID':correlationId}}:{})});
      httpStatus=response.status;failureCode=response.ok?'upload_response':'upload_http';
      const result=await response.json().catch(()=>null);
      if(!response.ok) {
        serverMessage=typeof result?.error==='string' ? result.error : response.status===413 ? 'El archivo supera el límite de 5 MB.'
          : 'El servidor no pudo completar la subida. Esperá un momento y volvé a intentar.';
        throw new Error('proof_upload_rejected');
      }
      if(!result || result.status!=='review') throw new Error('proof_upload_uncertain');
      if(current!==access) return;
      ui.proof.reset(); lastState={...lastState,proofSubmitted:true}; renderState(lastState);
    } catch {
      if(current!==access || !ui.host.isConnected) return;
      feedback.textContent='No pudimos confirmar la subida. Estamos consultando si el comprobante quedó guardado…';
      // The server may have committed even if the browser lost the response.
      // Check privately once; never resend the file automatically or infer that
      // the selected file arrived merely because a request was attempted.
      const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
      try {
        const state=await readState(access,controller.signal);
        if(current!==access || !ui.host.isConnected) return;
        if(state.proofSubmitted) {
          report('saved');
          renderState(state);
          if(state.paymentMethod==='bank_transfer' && state.status==='pending') ui.status.textContent='Ya hay un comprobante guardado para esta inscripción y está en revisión. No vuelvas a pagar.';
          return;
        }
        report('missing');
      } catch { report('unavailable'); /* Keep the original file selected for an explicit retry. */ }
      finally { clearTimeout(timeout); }
      if(current===access && ui.host.isConnected) feedback.textContent=(serverMessage || 'No pudimos comunicarnos para confirmar la subida. Revisá tu conexión y volvé a intentar.')
        +' El archivo seleccionado se conserva. No necesitás inscribirte ni pagar otra vez.'+(correlationId?' Seguimiento: '+correlationId:'');
    }
    finally { if(uploading===access) uploading=null; button.disabled=false; if(current===access) schedule(5000); }
  }
  async function preparePayment() {
    if(current?.scope) { current.linkRejected=false;refreshPayment(); return; }
    if (!current || preparing===current || !(lastState?.onlineCheckoutReady ?? onlineCheckoutReady)) return;
    const access=current, ui=controls(); if (!ui) return;
    preparing=access; ui.retry.disabled=true; ui.status.textContent='Preparando tu pago…';
    try {
      const result=await json('/api/taller/pagos/checkout',{reference:access.reference,accessToken:access.accessToken});
      if (current!==access || !ui.host.isConnected) return;
      ui.link.href=paymentUrl(result.checkoutUrl); ui.link.textContent='Pagar '+money(result.amountMinor)+' con Mercado Pago ↗';
      ui.link.hidden=false; ui.retry.hidden=true;
      ui.status.textContent='Esta pantalla se actualizará automáticamente cuando se confirme tu pago.';
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
      +'<div class="workshop-pass__art"><img class="workshop-pass__logo" src="/formacion/assets/logo-dorado.png" alt="Vamos al Santísimo" width="900" height="686"><span class="workshop-pass__edition">FORMOSA · 2026</span><span class="workshop-pass__type">TALLER DE MÚSICA</span><h3>Taller de<br><em>música.</em></h3><p class="workshop-pass__speaker">Pablo Martínez</p></div>'
      +'<div class="workshop-pass__body"><p class="workshop-pass__test" id="pass-test" hidden>PRUEBA · Sin validez para el evento</p><p class="workshop-pass__date" id="pass-date"></p><p class="workshop-pass__venue" id="pass-venue"></p><p class="workshop-pass__nickname" id="pass-nickname" hidden></p><div class="workshop-pass__qr"><img id="pass-qr" width="192" height="192" alt="QR personal para acreditarte en el taller" hidden><p id="pass-qr-pending" role="status">Preparando tu QR…</p></div><p class="workshop-pass__admission" id="pass-admission">TU ACREDITACIÓN PERSONAL</p><p class="workshop-pass__payment" id="pass-payment" hidden></p><p class="workshop-pass__reference" id="pass-reference"></p></article><div class="device-tilt-controls" id="pass-motion-controls" hidden><button type="button" data-tilt-toggle aria-pressed="false">Activar movimiento con el celular</button><p data-tilt-status role="status" hidden></p></div></div>';
    const contact=document.createElement('a');contact.id='confirmation-help';contact.className='whatsapp-help';contact.target='_blank';contact.rel='noopener noreferrer';contact.innerHTML=whatsappIcon+'<span><strong>¿Tenés alguna duda sobre tu inscripción?</strong><small>Consultanos por WhatsApp</small></span>';section.querySelector('.confirmation-copy').append(contact);
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
    window.VASDeviceTilt?.attach(stage,card,{controls:section.querySelector('#pass-motion-controls'),x:'--pass-x',y:'--pass-y',
      maxX:2.5,maxY:3.5,ignore:'.workshop-pass__qr',isActive:()=>!section.hidden});
    return section;
  }
  function renderConfirmation(result,paid=true) {
    const root=shell(); if (!root) return false;
    const section=confirmation() || document.getElementById('registration-confirmed');
    section.querySelector('.workshop-pass').setAttribute('aria-label',paid?'Tu acreditación al taller de Pablo Martínez':'Tu credencial de inscripción · Pago en el taller pendiente');
    root.dataset.state='confirmed'; section.hidden=false; window.VASDeviceTilt?.refresh(); document.getElementById('payment-next').hidden=true;
    root.dataset.payment=paid?'paid':'pending';
    document.getElementById('pass-test').hidden=!(result.testMode || current?.testMode);
    document.getElementById('confirmation-help').href=helpUrl(result);
    for(const id of ['checkout-transfer-alias','checkout-transfer-qr','checkout-proof','checkout-help','checkout-pay','checkout-retry']) document.getElementById(id).hidden=true;
    document.getElementById('registration-result-title').textContent=paid?'Inscripción confirmada':'Inscripción registrada';
    root.querySelector('.result-intro').textContent='Tu inscripción ha sido registrada. '+(result.nickname?'¡Te esperamos, '+result.nickname+'!':'¡Te esperamos en el taller!');
    root.querySelector('.result-symbol').textContent='✓'; root.querySelector('.result-symbol').hidden=false; document.getElementById('registration-reference').hidden=true;
    document.getElementById('pass-reference').textContent=result.reference;
    const name=document.getElementById('pass-nickname'); name.hidden=!result.nickname; name.textContent=result.nickname||'';
    document.getElementById('pass-admission').textContent=paid?'TU ACREDITACIÓN PERSONAL':'TU CREDENCIAL DE INSCRIPCIÓN';
    const payment=document.getElementById('pass-payment'); payment.hidden=paid; payment.textContent='EFECTIVO EN EL TALLER · PENDIENTE';
    const note=document.getElementById('confirmation-payment-note'); note.hidden=paid; note.textContent='Elegiste pagar en efectivo en el taller. '+(result.amountMinor == null ? 'Precio de ventanilla a definir; no aplican lotes ni promociones.' : 'Precio de ventanilla: '+money(result.amountMinor)+'.')+' Presentá este QR en recepción para completar el pago y acreditar tu ingreso.';
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
      : 'Tu acreditación también llegará por correo. Mientras tanto, ya podés usar este QR.';
    document.title=paid?'Tu acreditación · Taller Pablo Martínez':'Tu inscripción · Taller Pablo Martínez';
    return ready;
  }
  function renderState(result) {
    const root=shell(), ui=controls(); if (!ui || !root) return false;
    lastState=result;
    if(current?.scope || emailPage()==='proof') return renderEmailState(result);
    const recovery=document.getElementById('payment-recovery'); if(recovery) recovery.hidden=true;
    if (result.deleted || result.archived) {
      const confirmed=document.getElementById('registration-confirmed');if(confirmed)confirmed.hidden=true;
      const qr=document.getElementById('pass-qr');if(qr){qr.hidden=true;qr.removeAttribute('src');}
      root.dataset.state='deleted';
      document.getElementById('registration-result-title').textContent=result.archived?'Inscripción archivada':'Inscripción eliminada';
      root.querySelector('.result-intro').textContent='La organización '+(result.archived?'archivó':'eliminó')+' esta inscripción. Si necesitás recuperarla o consultar un pago, comunicate con los contactos del taller.';
      document.getElementById('registration-reference').hidden=false;
      ui.host.hidden=true;ui.editor.hidden=true;
      return false;
    }
    if (result.historical) {
      const confirmed=document.getElementById('registration-confirmed');if(confirmed)confirmed.hidden=true;
      document.getElementById('registration-result-title').textContent='Registro del ensayo anterior';
      root.querySelector('.result-intro').textContent='Conservamos este registro para consulta de la organización. Para participar en el taller, completá una inscripción nueva desde el formulario.';
      document.getElementById('registration-reference').hidden=false;
      ui.host.hidden=true;ui.editor.hidden=true;
      return false;
    }
    if (typeof result.onlineCheckoutReady==='boolean') onlineCheckoutReady=result.onlineCheckoutReady;
    const method=result.paymentMethod || current.payment || 'mercado_pago';
    current.payment=method;
    if(result.testMode) current.testMode=true;
    try { sessionStorage.setItem('vas-workshop-payment:'+current.reference,JSON.stringify(current)); } catch { /* Current tab remains usable. */ }
    if(method!=='on_site' || result.status==='approved') document.getElementById('checkout-controls').append(ui.editor);
    if (result.status==='approved' && result.registrationStatus==='confirmed') {
      ui.editor.hidden=true;
      if(method!=='on_site') return !renderConfirmation(result) || result.emailStatus!=='sent';
      hidePass();root.dataset.state='confirmed';document.getElementById('registration-result-title').textContent='Pago registrado';
      root.querySelector('.result-intro').textContent='Tu pago en ventanilla quedó registrado. Conservá tu referencia para cualquier consulta.';
      ui.host.hidden=true;return false;
    }
    const section=document.getElementById('registration-confirmed');
    if (section) { section.hidden=true; const qr=section.querySelector('#pass-qr'); qr.hidden=true; qr.removeAttribute('src'); }
    root.dataset.state='pending'; ui.host.hidden=false; ui.edit.hidden=result.canChangeMethod===false; ui.proof.hidden=true; ui.help.hidden=true; ui.alias.hidden=true; ui.transferQr.hidden=true;
    if(!ui.editor.hidden && ui.editor.dataset.attemptId!==result.attemptId) ui.editor.hidden=true;
    document.getElementById('registration-result-title').textContent='Inscripción registrada';
    root.querySelector('.result-intro').textContent='Ya recibimos tu inscripción. Solo falta un paso para confirmar tu lugar.';
    document.getElementById('registration-reference').hidden=false;
    const warning=document.getElementById('checkout-method-warning');warning.hidden=!current.methodNotice;warning.textContent=current.methodNotice||'';
    document.getElementById('checkout-test-notice').hidden=!(method==='mercado_pago' && (testMode || current.testMode || result.testMode));
    ui.price.hidden=false;
    ui.price.textContent=method==='on_site' ? (result.amountMinor == null ? 'Pago en efectivo en el taller · Precio de ventanilla a definir · Sin promociones' : 'Pago en efectivo en el taller · Precio de ventanilla '+money(result.amountMinor)) : method==='mercado_pago'
      ? 'Taller '+money(result.baseAmountMinor)+' + gasto de plataforma '+money(result.feeMinor)
      : 'Importe del taller: '+money(result.amountMinor)+' · Sin gastos de servicio';
    if (['cancelled','review'].includes(result.registrationStatus) || ['refunded','partially_refunded','charged_back','review'].includes(result.status)) {
      ui.title.textContent='Inscripción para revisar'; ui.description.textContent='Contactá a la organización con tu referencia. No hagas otro pago desde esta pantalla.';
      ui.link.hidden=true; ui.retry.hidden=true; ui.edit.hidden=true; ui.editor.hidden=true; ui.price.hidden=true; ui.status.textContent=''; return false;
    }
    const originalProof=document.getElementById('payment-proof-link'); if(originalProof) originalProof.hidden=true;
    if(method!=='mercado_pago') {
      ui.link.hidden=true; ui.retry.hidden=true;
      if(method==='bank_transfer') {
        const byQr=current.transferMode==='qr';
        ui.title.textContent=result.proofSubmitted?'Comprobante recibido':byQr?'Pagá con QR':'Transferí por alias';
        ui.description.textContent=result.transfer
          ? (result.proofSubmitted ? 'Recibimos tu comprobante. Tu pago está en proceso de confirmación.'
            : byQr ? 'Escaneá el QR con tu billetera. Después adjuntá el comprobante para que podamos confirmar tu pago.'
            : 'Transferí al alias indicado. Después adjuntá el comprobante para que podamos confirmar tu pago.')
          : 'Estamos consultando los datos para transferir.';
        document.getElementById('checkout-alias-value').textContent=result.transfer?.alias||'';
        document.getElementById('checkout-alias-provider').textContent=result.transfer?.provider||'';
        document.getElementById('checkout-alias-holder').textContent=result.transfer?.holder||'Consultá el titular en tu billetera antes de confirmar';
        document.getElementById('checkout-alias-document').textContent=result.transfer?.document||'';
        document.getElementById('checkout-alias-document-row').hidden=!result.transfer?.document;
        if(result.transfer && ui.editor.hidden) {
          if(byQr && !result.proofSubmitted) {
            document.getElementById('checkout-transfer-qr-image').src='/2026/donaciones/qr-billeteras.png';
            ui.transferQr.hidden=false;
          } else if(!result.proofSubmitted) ui.alias.hidden=false;
          ui.proof.hidden=!!result.proofSubmitted;
        } else { document.getElementById('checkout-transfer-qr-image').removeAttribute('src'); }
        if(ui.editor.hidden) { ui.help.href=helpUrl(result); ui.help.hidden=false; }
      } else { ui.title.textContent='Pagá en efectivo al llegar al taller'; ui.description.textContent='Tu inscripción quedó registrada. El precio de ventanilla se informará antes de cobrar; no aplican lotes ni promociones.'; }
      ui.status.textContent=result.proofSubmitted ? 'Pago en proceso de confirmación. Te enviaremos un correo al verificarlo.'
        : 'Conservá tu referencia. La confirmación se actualizará automáticamente cuando se registre el pago.';
      if(!ui.editor.hidden) ui.edit.hidden=true;
      return true;
    }
    if (['rejected','cancelled'].includes(result.status)) {
      ui.title.textContent='Pago no aprobado'; ui.description.textContent='El pago fue rechazado, cancelado o venció. Contactá a la organización antes de iniciar otro.';
      ui.link.hidden=true; ui.retry.hidden=true; ui.status.textContent=''; return false;
    }
    if (!onlineCheckoutReady && !result.checkoutUrl) {
      ui.title.textContent='Inscripción registrada';
      ui.description.textContent='Mercado Pago aún no está conectado. Podés elegir otro medio de pago para completar tu inscripción.';
      ui.link.hidden=true; ui.retry.hidden=true; ui.status.textContent='Tu pago sigue pendiente; no se realizó ningún cobro.';
      return false;
    }
    ui.title.textContent='Completá tu inscripción con el pago'; ui.description.textContent='Al confirmar el pago, vas a encontrar acá tu acreditación con QR.';
    if (result.checkoutUrl) { ui.link.href=paymentUrl(result.checkoutUrl); ui.link.textContent='Pagar '+money(result.amountMinor)+' con Mercado Pago ↗'; ui.link.hidden=false; ui.retry.hidden=true; }
    if(!ui.editor.hidden) { ui.link.hidden=true; ui.retry.hidden=true; ui.edit.hidden=true; }
    ui.status.textContent=result.verification==='unavailable' ? 'Todavía no pudimos verificar el pago. No pagues otra vez: seguimos consultando su confirmación.'
      : 'El estado se actualiza automáticamente al confirmar tu pago.';
    return true;
  }
  async function refreshPayment() {
    if (!current || uploading===current || checking===current || document.hidden || !document.getElementById('payment-next')) return;
    const access=current; checking=access; let again=true;
    try {
      const result=await readState(access);
      if (current!==access || !document.getElementById('payment-next')) return;
      again=renderState(result);
    } catch (error) {
      if (current===access) {
        if(access.scope) { access.linkRejected=[400,403,404].includes(error.status);showEmailLinkFailure(error instanceof TypeError ? 'No pudimos consultar tu inscripción. Revisá tu conexión y volvé a intentar.' : error.message); }
        else { const ui=controls(); if (ui && !ui.host.hidden) ui.status.textContent=(error instanceof TypeError?'No pudimos consultar el pago. Revisá tu conexión.':error.message)+' Vamos a volver a consultar automáticamente.'; }
      }
    } finally { if (checking===access) checking=null; if (current===access) { if(access.linkRejected)clearTimeout(timer);else { checks++; schedule(access.scope ? (again?30000:60000) : again ? (checks<12 ? 5000 : 15000) : 60000); } } }
  }
  function hidePass() {
    const section=document.getElementById('registration-confirmed');if(section)section.hidden=true;
    const qr=document.getElementById('pass-qr');if(qr){qr.hidden=true;qr.removeAttribute('src');}
  }
  function renderEmailState(result) {
    const root=shell(),ui=controls();if(!root||!ui)return false;
    if(current.scope==='pass' && result.passAvailable && result.accreditation) return !renderConfirmation(result);
    hidePass();root.dataset.state='receipt';ui.host.hidden=false;
    for(const element of [ui.link,ui.retry,ui.edit,ui.editor,ui.alias,ui.transferQr,ui.price])element.hidden=true;
    document.getElementById('checkout-test-notice').hidden=true;document.getElementById('checkout-method-warning').hidden=true;
    document.getElementById('registration-reference').hidden=false;
    const canUpload=result.canUpload ?? (!result.deleted&&!result.archived&&!result.historical&&result.paymentMethod==='bank_transfer'&&result.status==='pending'&&result.registrationStatus==='pending');
    const confirmed=result.registrationStatus==='confirmed';
    document.getElementById('registration-result-title').textContent=result.proofSubmitted?'Comprobante recibido':confirmed?'Inscripción confirmada':'Subí tu comprobante';
    root.querySelector('.result-intro').textContent='Este acceso es personal. Tu inscripción ya está cargada; no necesitás completar tus datos otra vez.';
    ui.title.textContent=result.proofSubmitted?'Tu comprobante está en revisión':canUpload?'Adjuntá el comprobante de tu pago':confirmed?'Tu inscripción ya está confirmada':'No hace falta adjuntar un archivo en este estado';
    ui.description.textContent=result.proofSubmitted?'Recibimos un comprobante para esta inscripción. No vuelvas a pagar. Te avisaremos por correo después de revisarlo.'
      : canUpload?'Elegí una imagen JPG, PNG, WebP o un PDF de hasta 5 MB. Después pulsá «Subir comprobante».'
      : confirmed?'Buscá el correo de acreditación para abrir tu volante, cuando corresponda.'
      : result.paymentMethod==='on_site'?'Elegiste abonar en efectivo en el taller. No necesitás adjuntar comprobante.'
      : result.paymentMethod==='mercado_pago'?'Mercado Pago confirma el pago automáticamente. No necesitás subir comprobante.'
      : 'Contactá a la organización si necesitás consultar tu inscripción.';
    ui.proof.hidden=!canUpload||!!result.proofSubmitted;
    ui.help.href=helpUrl(result);ui.help.hidden=false;
    ui.status.textContent=canUpload?'El envío no confirma el pago: la organización revisará el comprobante.':'';
    return canUpload;
  }
  function showEmailLinkFailure(message='Abrí el enlace personal del correo más reciente. Si no lo encontrás, contactá a la organización.') {
    const root=shell(),ui=controls();if(!root||!ui)return;
    hidePass();root.dataset.state='access-unavailable';ui.host.hidden=false;
    document.getElementById('registration-result-title').textContent='No pudimos abrir tu acceso';root.querySelector('.result-intro').textContent=message;
    for(const element of [ui.link,ui.edit,ui.editor,ui.alias,ui.transferQr,ui.price,ui.proof])element.hidden=true;
    ui.title.textContent='Conservás tu inscripción';ui.description.textContent='No te inscribas ni pagues nuevamente. Podés volver a abrir el enlace de tu correo.';
    ui.retry.hidden=!current?.scope;ui.retry.textContent='Volver a intentar la consulta';ui.status.textContent='';ui.help.href=helpUrl();ui.help.hidden=false;
  }
  async function configureForm() {
    const form=document.getElementById('registration'); if (!form) return;
    try {
      const response=await fetch('/api/taller/configuracion',{cache:'no-store'}); const config=await response.json();
      if (form!==document.getElementById('registration')) return;
      const note=document.getElementById('workshop-price-note');
      if (response.ok) {
        baseAmountMinor=config.baseAmountMinor;
        onlineFeeMinor=config.feeMinor;
        onlineCheckoutReady=config.onlineCheckoutReady===true;
        testMode=config.environment==='test';
        if (note) note.textContent='Valor del taller: '+money(baseAmountMinor)+' por alias o QR, sin gastos de servicio. Pago en efectivo en el taller: '+(config.onSitePriceMinor == null ? 'precio de ventanilla a definir' : money(config.onSitePriceMinor))+'; no aplican lotes ni promociones.';
        form.querySelectorAll('[name="formaPago"]').forEach(input => { input.disabled=!config.methods[input.value.startsWith('bank_transfer_')?'bank_transfer':input.value]; });
        const hint=document.getElementById('workshop-checkout-hint');
        if (hint) hint.textContent=!config.registrationOpen ? 'Las inscripciones todavía no están habilitadas.' : testMode ? 'Mercado Pago está en modo de prueba. Usá solamente cuentas y tarjetas de prueba.'
          : 'Vas a ver el importe final antes de confirmar el pago.';
        const label=document.getElementById('mercado-pago-option-label'); if (label) label.textContent='Mercado Pago · tarjeta, con gasto de plataforma'+(config.methods.mercado_pago ? '' : ' (no disponible)');
        updateOnlinePriceDescription();
        if (lastState?.paymentMethod==='mercado_pago' && lastState.status==='pending') renderState(lastState);
      }
    } catch { /* Server enforces availability and price. */ }
  }
  function updateOnlinePriceDescription() {
    if (baseAmountMinor===null || !document.querySelector('#registration [name="formaPago"][value="mercado_pago"]:checked')) return;
    const description=document.getElementById('payment-method-description');
    if (description) description.textContent='Taller '+money(baseAmountMinor)+' + gasto de plataforma '+money(onlineFeeMinor);
  }
  document.addEventListener('change',event => { if (event.target.name==='formaPago') updateOnlinePriceDescription(); });
  function showReturnRecovery() {
    const root=shell(), ui=controls(); if(!root || !ui) return;
    root.dataset.state='recovery'; root.querySelector('.result-symbol').hidden=true;
    document.getElementById('registration-result-title').textContent='Volvé a tu inscripción';
    root.querySelector('.result-intro').textContent='Si ya pagaste, no vuelvas a hacerlo. Recuperá tu acceso para ver la confirmación y tu acreditación.';
    ui.host.hidden=false; ui.retry.hidden=true; ui.link.hidden=true; ui.edit.hidden=true;
    ui.title.textContent='Recuperá el acceso de forma segura';
    ui.description.textContent='Usá el código que enviaremos al correo registrado. Tu pago se consulta directamente con Mercado Pago.';
    document.dispatchEvent(new CustomEvent('workshop:recovery-needed'));
  }
  function restorePayment() {
    if(restoringReturn) return;
    clearTimeout(timer); current=null;
    const url=new URL(location.href), reference=url.searchParams.get('reference');
    const purpose=emailPage(), emailToken=purpose&&new URLSearchParams(url.hash.slice(1)).get(purpose);
    if(emailToken) { url.hash='';history.replaceState({...history.state},'',url); }
    if(purpose && reference && /^[A-Za-z0-9_-]{10,80}$/.test(reference)) {
      let saved;
      try { saved=JSON.parse(sessionStorage.getItem('vas-email-link:'+purpose+':'+reference)||'null'); } catch { /* Ignore damaged local state. */ }
      const token=emailToken||saved?.token;
      if(typeof token==='string'&&/^v1\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(token)) {
        current={reference,accessToken:token,scope:purpose};
        try { sessionStorage.setItem('vas-email-link:'+purpose+':'+reference,JSON.stringify({token})); } catch { /* The current page remains usable. */ }
        shell();checks=0;refreshPayment();return;
      }
    }
    if(purpose==='pass' || emailToken) { showEmailLinkFailure(); return; }
    const returnToken=new URLSearchParams(url.hash.slice(1)).get('return');
    if(returnToken) { url.hash=''; history.replaceState({...history.state},'',url); }
    if (!document.getElementById('payment-next') || (!reference && !document.querySelector('[data-payment-return]'))) return;
    try {
      const saved=JSON.parse(sessionStorage.getItem('vas-workshop-payment:'+reference) || 'null');
      if (reference && saved?.reference===reference && /^[A-Za-z0-9_-]{43}$/.test(saved.accessToken)) current=saved;
    } catch { /* Recover without exposing private data. */ }
    shell(); const ui=controls(); ui.host.hidden=false; ui.retry.hidden=true;
    if (current) { checks=0; refreshPayment(); }
    else if(reference && returnToken) {
      const pending={reference,returnToken}; restoringReturn=pending;
      json('/api/taller/pagos/retorno',pending).then(result=>{
        if(restoringReturn!==pending) return;
        restoringReturn=null;
        remember({reference:result.reference,paymentAccessToken:result.accessToken}); checks=0; refreshPayment();
      }).catch(()=>{if(restoringReturn===pending){restoringReturn=null;showReturnRecovery();}});
    } else showReturnRecovery();
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
        if(!state.canChangeMethod) access.methodNotice=state.proofSubmitted ? 'Ya recibimos un comprobante para esta inscripción y está en revisión. No generamos otro cobro para evitar un pago duplicado. Consultanos por WhatsApp si necesitás cambiar el medio.' : 'Tu inscripción anterior no permite cambiar de medio de pago en este estado. Consultanos antes de pagar nuevamente.';
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
  document.addEventListener('workshop:recovered',event=>{
    clearTimeout(timer);current=null;lastState=null;restoringReturn=null;
    remember({reference:event.detail.reference,paymentAccessToken:event.detail.accessToken});checks=0;refreshPayment();
  });
  document.addEventListener('visibilitychange',() => { if (!document.hidden && current) { checks=0; refreshPayment(); } else clearTimeout(timer); });
  addEventListener('focus',() => { if (current) refreshPayment(); });
  addEventListener('pageshow',event => { if (event.persisted) restorePayment(); });
  addEventListener('pagehide',() => clearTimeout(timer));
  configureForm(); restorePayment();
})();
