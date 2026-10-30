(() => {
  'use strict';
  if (window.VASErrors) return;
  const key='vas-operational-events-v1', queue=[], seen=new Map();
  let sending=false, retry=0;
  const newId=()=>window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);});
  const page=()=>location.pathname.startsWith('/admin')?'panel':location.pathname.startsWith('/formacion')?'workshop':'main';
  function persist() { try { sessionStorage.setItem(key,JSON.stringify(queue.slice(-8).map(item=>item.event))); } catch { /* The in-memory queue still works. */ } }
  function report(input,access) {
    const fingerprint=input.operation+':'+input.code+':'+(input.outcome||'');
    if(Date.now()-(seen.get(fingerprint)||0)<60_000) return;
    if(seen.size>100) seen.clear();seen.set(fingerprint,Date.now());
    const event={correlationId:input.correlationId||newId(),operation:input.operation,code:input.code,page:page()};
    for(const field of ['httpStatus','fileSize','fileType','online','outcome']) if(input[field]!==undefined)event[field]=input[field];
    queue.push({event,access,attempts:0});if(queue.length>8)queue.shift();persist();void flush();
  }
  async function flush() {
    if(sending || !queue.length || navigator.onLine===false) return;
    sending=true;clearTimeout(retry);
    const item=queue[0],controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
    try {
      const panel=page()==='panel';
      const body={...item.event,...(!panel&&item.access?{access:item.access}:{})};
      const response=await fetch(panel?'/api/admin/incidencias':'/api/taller/incidencias',{method:'POST',cache:'no-store',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      if(response.ok || (response.status>=400&&response.status<500)) queue.shift();
      else item.attempts++;
    } catch { item.attempts++; }
    finally {
      clearTimeout(timeout);sending=false;
      if(item.attempts>=3&&queue[0]===item)queue.shift();persist();
      if(queue.length)retry=setTimeout(flush,30_000);
    }
  }
  const operations={'/api/taller/pagos/estado':'payment_status','/api/taller/pagos/checkout':'checkout',
    '/api/taller/pagos/metodo':'payment_method','/api/taller/pagos/retorno':'payment_status',
    '/api/taller/inscripciones':'registration','/api/taller/inscripciones/recuperar':'recovery','/api/taller/enlace':'email_link'};
  async function monitoredFetch(url,options={},access) {
    const operation=operations[url];if(!operation)return fetch(url,options);
    const correlationId=newId();
    try {
      const response=await fetch(url,{...options,headers:{...options.headers,'X-VAS-Request-ID':correlationId}});
      if(!response.ok)report({correlationId,operation,code:'request_failed',httpStatus:response.status},access);
      return response;
    } catch(error) {
      report({correlationId,operation,code:operation==='payment_status'?'state_unavailable':'request_failed',online:navigator.onLine!==false},access);
      throw error;
    }
  }
  addEventListener('error',event=>report({operation:'page',code:event.error?'runtime_exception':'asset_unavailable',online:navigator.onLine!==false}),true);
  addEventListener('unhandledrejection',()=>report({operation:'page',code:'unhandled_rejection',online:navigator.onLine!==false}));
  addEventListener('online',flush);
  try { const saved=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))for(const event of saved.slice(-8))queue.push({event,attempts:0}); } catch { /* Ignore damaged local state. */ }
  window.VASErrors={report,newId,fetch:monitoredFetch};void flush();
})();
