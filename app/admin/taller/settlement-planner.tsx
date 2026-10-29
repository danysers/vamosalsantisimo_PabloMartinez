'use client'

import { useEffect, useState } from 'react'

type Option = {releaseDays:number;feeBasisPoints:number | null;feeIncludesTax:boolean;active:boolean;checkedAt:string | null}
type Plan = {targetAvailableAt:string;recommendedReleaseDays:number;feeBasisPoints:number;feeIncludesTax:boolean;deadlinePassed:boolean;
  steps:Array<{switchAt:string;remindAt:string;recommendedReleaseDays:number;feeBasisPoints:number}>}
type Config = {fundsBeforeDays:number;reminderLeadDays:number;reminderEmail:string;options:Option[];plan:Plan | null;
  recordedSetting:{releaseDays:number;feeBasisPoints:number;checkedAt:string} | null;providerChangeNeeded:boolean;
  reminders:Array<{id:string;releaseDays:number;switchAt:string;sentAt:string | null;acknowledgedAt:string | null}>}
const endpoint='/api/admin/taller/acreditacion-fondos'
const label=(days:number)=>days===0?'Al instante':`${days} días`
const day=(date:string)=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date))
const percent=(bps:number)=>`${(bps/100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`
function basisPoints(value:string) {
  const clean=value.trim().replace(',','.')
  if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(clean))return null
  const [whole,decimal='']=clean.split('.')
  const result=Number(whole)*100+Number(decimal.padEnd(2,'0'))
  return result<=10000?result:null
}

export default function SettlementPlanner({canConfigure}:{canConfigure:boolean}) {
  const [config,setConfig]=useState<Config | null>(null)
  const [rates,setRates]=useState<Record<number,string>>({})
  const [before,setBefore]=useState('3')
  const [lead,setLead]=useState('3')
  const [email,setEmail]=useState('')
  const [includesTax,setIncludesTax]=useState(false)
  const [verified,setVerified]=useState(false)
  const [notifications,setNotifications]=useState(false)
  const [observed,setObserved]=useState('35')
  const [providerConfirmed,setProviderConfirmed]=useState(false)
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  function adopt(data:Config) {
    setConfig(data);setBefore(String(data.fundsBeforeDays));setLead(String(data.reminderLeadDays));setEmail(data.reminderEmail)
    setRates(Object.fromEntries(data.options.map(option=>[option.releaseDays,option.feeBasisPoints==null?'':String(option.feeBasisPoints/100)])))
    setIncludesTax(data.options.find(option=>option.active)?.feeIncludesTax??false)
    setObserved(String(data.plan?.recommendedReleaseDays??35))
    setNotifications(data.reminders.some(reminder=>!reminder.acknowledgedAt))
  }
  useEffect(()=>{
    let stopped=false
    fetch(endpoint,{cache:'no-store',credentials:'same-origin'}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error)
      if(!stopped)adopt(data)
    }).catch(()=>{if(!stopped)setMessage('No se pudo cargar el plan de disponibilidad de fondos.')})
    // Keep the current recommendation fresh across a date boundary without
    // replacing tariff fields that an operator may be editing.
    const refresh=()=>{
      if(document.hidden)return
      fetch(endpoint,{cache:'no-store',credentials:'same-origin'}).then(async response=>{
        if(!response.ok)return
        const data=await response.json();if(!stopped)setConfig(data)
      }).catch(()=>{})
    }
    const timer=setInterval(refresh,60000)
    document.addEventListener('visibilitychange',refresh)
    return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
  },[])
  async function submit(body:object) {
    setBusy(true);setMessage('')
    try {
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const result=await response.json();if(!response.ok)throw new Error(result.error)
      const fresh=await fetch(endpoint,{cache:'no-store',credentials:'same-origin'})
      if(!fresh.ok)throw new Error('Guardado realizado. Recargá para consultar el estado actualizado.')
      adopt(await fresh.json());setVerified(false);setProviderConfirmed(false)
      setMessage('Guardado en el taller. La configuración de Mercado Pago se realiza en su cuenta.')
    } catch(error){setMessage(error instanceof Error?error.message:'No se pudo guardar.')}
    finally{setBusy(false)}
  }
  async function save() {
    const options=[35,18,10,0].map(releaseDays=>({releaseDays,feeBasisPoints:basisPoints(rates[releaseDays]||'')}))
    if(options.some(option=>option.feeBasisPoints==null)||!verified){setMessage('Completá y verificá las cuatro comisiones en tu cuenta.');return}
    await submit({action:'configure',confirmedFromAccount:true,fundsBeforeDays:Number(before),reminderLeadDays:Number(lead),
      reminderEmail:email,feeIncludesTax:includesTax,prepareReminders:notifications,options})
  }
  async function recordChange() {
    const option=config?.options.find(option=>option.releaseDays===Number(observed))
    if(!providerConfirmed||option?.feeBasisPoints==null)return
    await submit({action:'record_provider_change',confirmedFromAccount:true,releaseDays:option.releaseDays,feeBasisPoints:option.feeBasisPoints})
  }
  const plan=config?.plan
  return <section className="admin-accreditation-block" id="comisiones">
    <h2>Comisiones y disponibilidad del dinero</h2>
    <p>El taller calcula qué plazo conviene según la fecha en que necesitás los fondos. Los cambios de plazo se hacen en <a href="https://www.mercadopago.com.ar/costs-section/merchant-svcs/processing/options" target="_blank" rel="noopener noreferrer">Costos y cuotas de Mercado Pago</a> y se registran aquí después de comprobarlos.</p>
    {config&&<>
      <div className="admin-form-grid">
        <label>Fondos disponibles, días antes del taller<input type="number" min="1" max="90" value={before} disabled={!canConfigure} onChange={event=>{setBefore(event.target.value);setVerified(false)}} /></label>
        <label>Aviso previo, días<input type="number" min="0" max="30" value={lead} disabled={!canConfigure} onChange={event=>setLead(event.target.value)} /></label>
        <label>Correo de la organización<input type="email" value={email} disabled={!canConfigure} onChange={event=>setEmail(event.target.value)} /></label>
        {[35,18,10,0].map(days=><label key={days}>{label(days)} · comisión %<input inputMode="decimal" value={rates[days]??''} disabled={!canConfigure}
          onChange={event=>{setRates(current=>({...current,[days]:event.target.value}));setVerified(false)}} /></label>)}
      </div>
      <label className="admin-check"><input type="checkbox" checked={includesTax} disabled={!canConfigure} onChange={event=>{setIncludesTax(event.target.checked);setVerified(false)}} /> Los porcentajes incluyen IVA, según la cuenta</label>
      <p>Las retenciones u otros cargos no están incluidos en esta comparación. Los plazos y tarifas deben corresponder al mismo grupo de medios de pago.</p>
      {canConfigure&&<>
        <label className="admin-check"><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)} /> Comprobé estos plazos y comisiones en mi cuenta de Mercado Pago</label>
        <label className="admin-check"><input type="checkbox" checked={notifications} onChange={event=>setNotifications(event.target.checked)} /> Preparar recordatorios por correo para los próximos cambios (requiere el trabajador de correo activo)</label>
        <button className="button button-gold" disabled={busy||!verified} onClick={save}>Guardar plan verificado</button>
      </>}
      {plan?<>
        <h3>Recomendación para hoy: {label(plan.recommendedReleaseDays)}</h3>
        <p>Comisión comparada: {percent(plan.feeBasisPoints)} {plan.feeIncludesTax?'con IVA':'antes de IVA y retenciones'}. Objetivo de disponibilidad: <strong>{day(plan.targetAvailableAt)}</strong>, al comienzo del día.</p>
        {plan.deadlinePassed&&<p role="alert">La fecha objetivo ya pasó. Los nuevos cobros requieren disponibilidad inmediata y ya no pueden cumplir el margen anterior al evento.</p>}
        <ul>{plan.steps.map(step=><li key={step.switchAt}>Desde el {day(step.switchAt)}: <strong>{label(step.recommendedReleaseDays)}</strong> · {percent(step.feeBasisPoints)}. Aviso previsto: {day(step.remindAt)}.</li>)}</ul>
        <p>{config.recordedSetting?`Último plazo informado por la organización: ${label(config.recordedSetting.releaseDays)}, registrado el ${day(config.recordedSetting.checkedAt)}.`:'Todavía no se registró el plazo configurado en Mercado Pago.'}</p>
        {config.providerChangeNeeded&&<p role="alert">El último plazo informado no coincide con la recomendación de hoy. Revisalo en Mercado Pago antes de dar el cambio por realizado.</p>}
        {canConfigure&&<>
          <label>Plazo comprobado en Mercado Pago<select value={observed} onChange={event=>{setObserved(event.target.value);setProviderConfirmed(false)}}>{[35,18,10,0].map(days=><option key={days} value={days}>{label(days)}</option>)}</select></label>
          <label className="admin-check"><input type="checkbox" checked={providerConfirmed} onChange={event=>setProviderConfirmed(event.target.checked)} /> Ya guardé y comprobé ese plazo en Mercado Pago</label>
          <button className="button button-outline" disabled={busy||!providerConfirmed} onClick={recordChange}>Registrar cambio realizado</button>
        </>}
      </>:<p>Completá las tarifas verificadas para calcular el calendario. La configuración de Mercado Pago todavía no se modificó desde este panel.</p>}
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </section>
}
