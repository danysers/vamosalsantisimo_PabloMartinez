(() => {
  let challengeId=null, pending=false;
  async function request(body) {
    const response=await fetch('/api/taller/inscripciones/recuperar',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
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
})();
