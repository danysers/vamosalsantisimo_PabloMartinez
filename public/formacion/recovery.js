(() => {
  let challengeId=null, pending=false;
  function showReturnRecovery() {
    if(document.getElementById('registration-result')?.dataset.state!=='recovery') return;
    let panel=document.getElementById('payment-recovery');
    if(panel) { panel.hidden=false; return; }
    if(document.getElementById('receipt-lookup')) {
      const grid=document.getElementById('registration-grid'); if(grid) grid.hidden=false;
      return;
    }
    panel=document.createElement('div');panel.id='payment-recovery';panel.className='recovery-panel';
    panel.innerHTML='<form id="receipt-lookup"><label for="recovery-identifier">DNI o número de gestión</label><input id="recovery-identifier" name="identifier" autocomplete="off" minlength="5" maxlength="80" required placeholder="Tu documento o referencia"><p>Te enviaremos un código al correo que usaste al inscribirte. Revisá también correo no deseado.</p><button type="submit" class="button gold">Enviar código a mi correo</button></form><form id="receipt-verify" hidden><label for="recovery-code">Código de seis dígitos</label><input id="recovery-code" name="code" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" pattern="[0-9]{6}" required><p>El código dura quince minutos y se utiliza una sola vez.</p><button type="submit" class="button gold">Verificar y continuar</button><button type="button" class="checkout-edit" id="recovery-resend">Solicitar otro código</button></form><p id="recovery-feedback" role="status" aria-live="polite"></p><p><a href="https://wa.me/5493704258770" target="_blank" rel="noopener noreferrer">¿Necesitás ayuda? Consultanos por WhatsApp</a></p>';
    document.getElementById('payment-next').append(panel);
    const reference=new URLSearchParams(location.search).get('reference');
    if(reference && /^[A-Za-z0-9_-]{10,80}$/.test(reference)) document.getElementById('recovery-identifier').value=reference;
  }
  document.addEventListener('workshop:recovery-needed',showReturnRecovery);
  async function request(body) {
    const response=await (window.VASErrors?.fetch||fetch)('/api/taller/inscripciones/recuperar',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const value=await response.json();
    if(!response.ok) throw new Error(value.error||'No pudimos completar la solicitud. Intentá nuevamente.');
    return value;
  }
  document.addEventListener('submit',async event=>{
    if(!['receipt-lookup','receipt-verify'].includes(event.target.id)) return;
    event.preventDefault();if(pending || !event.target.reportValidity())return;
    const form=event.target,feedback=document.getElementById('recovery-feedback'),button=form.querySelector('button[type="submit"]');
    pending=true;button.disabled=true;feedback.textContent='Procesando…';
    try {
      if(form.id==='receipt-lookup') {
        const result=await request({action:'request',identifier:form.elements.namedItem('identifier').value.trim()});
        if(form!==document.getElementById('receipt-lookup'))return;
        challengeId=result.challengeId;feedback.textContent=result.message;document.getElementById('recovery-code').value='';
        form.hidden=true;document.getElementById('receipt-verify').hidden=false;
        document.getElementById('recovery-code').focus();
      } else {
        const result=await request({action:'verify',challengeId,code:form.elements.namedItem('code').value.trim()});
        if(form!==document.getElementById('receipt-verify'))return;
        feedback.textContent='Inscripción recuperada. Estamos consultando tu pago…';
        document.dispatchEvent(new CustomEvent('workshop:recovered',{detail:result}));
      }
    } catch(error) { if(form.isConnected)feedback.textContent=error.message; }
    finally { pending=false;button.disabled=false; }
  });
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('#recovery-resend') || pending) return;
    challengeId=null;document.getElementById('receipt-verify').hidden=true;
    document.getElementById('receipt-lookup').hidden=false;
    document.getElementById('recovery-feedback').textContent='Revisá los datos y solicitá otro código. Podés pedir hasta tres en quince minutos.';
    document.getElementById('recovery-identifier').focus();
  });
  showReturnRecovery();
})();
