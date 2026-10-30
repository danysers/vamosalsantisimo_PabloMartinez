'use client'
import { useEffect, useState, type FormEvent } from 'react'
import type { RegistrationOperations } from '../../../lib/registration-operations'
import type { RegistrationOperationInput } from '../../../lib/registration-operations-policy'

const statuses=[['pending','Pendiente'],['waiting','En espera'],['confirmed','Confirmada'],['review','En revisión'],['cancelled','Cancelada']]
const payments=[['created','Iniciado'],['pending','Pendiente'],['approved','Aprobado'],['review','En revisión'],['rejected','Rechazado'],['cancelled','Cancelado'],['refunded','Reintegrado'],['partially_refunded','Reintegro parcial'],['charged_back','Revertido']]
const methods=[['none','Sin pago / exención'],['bank_transfer','Transferencia (alias / QR)'],['mercado_pago','Mercado Pago'],['on_site','Efectivo en ventanilla'],['manual','Otro pago registrado por la organización']]
const localDate=(iso:string)=>new Date(new Date(iso).getTime()-3*3600_000).toISOString().slice(0,16)
function draft(s:RegistrationOperations) {
  return {registrationStatus:s.registrationStatus,paymentMethod:s.paymentMethod,paymentStatus:s.paymentStatus,
    amount:s.amountMinor==null?'':String(s.amountMinor/100),paid:String(s.paidAmountMinor/100),fee:String(s.feeMinor/100),manualReference:s.manualReference,
    registeredAt:localDate(s.registeredAt),qrAction:'keep',waiver:'keep',undoAdmission:false,notify:true,confirmGroup:false,confirmPayment:false,confirmQrChange:false,reason:''}
}
export default function RegistrationOperationsEditor({reference,state,blocked,refresh,onEditing}:{reference:string;state:RegistrationOperations;blocked:boolean;refresh:()=>Promise<void>;onEditing:(value:boolean)=>void}) {
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[form,setForm]=useState(()=>draft(state)),[error,setError]=useState(''),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false)
  const financial=form.paymentMethod!==state.paymentMethod||form.paymentStatus!==state.paymentStatus||(form.amount===''?null:Math.round(Number(form.amount)*100))!==state.amountMinor||Math.round(Number(form.paid)*100)!==state.paidAmountMinor||Math.round(Number(form.fee)*100)!==state.feeMinor||form.manualReference!==state.manualReference
  const qrChange=form.qrAction!=='keep'||form.undoAdmission
  useEffect(()=>{if(!editing)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[editing])
  const update=(key:keyof typeof form,value:string|boolean)=>setForm(current=>({...current,[key]:value}))
  function close(){setEditing(false);onEditing(false)}
  async function save(event:FormEvent){
    event.preventDefault();if(busy||uncertain)return
    setBusy(true);setError('');setMessage('')
    let saved=false
    try {
      const body={...form,reference,version:state.version,requestId:crypto.randomUUID(),registeredAt:form.registeredAt===localDate(state.registeredAt)?state.registeredAt:new Date(form.registeredAt+':00-03:00').toISOString(),
        amountMinor:form.amount===''?null:Math.round(Number(form.amount)*100),paidAmountMinor:Math.round(Number(form.paid)*100),feeMinor:Math.round(Number(form.fee)*100)}
      const {amount: _amount,paid: _paid,fee: _fee,...payload}=body
      void _amount;void _paid;void _fee
      const response=await fetch('/api/admin/inscripciones/operaciones',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload as RegistrationOperationInput)})
      const result=await response.json()
      if(!response.ok){setError(result.error||'No se pudo guardar.');if(response.status===409)setUncertain(true);return}
      saved=true;close();await refresh();setMessage('Gestión actualizada. Se conservó el historial.'+(result.emailsQueued?' Acreditación en cola de envío.':''))
    }catch{setError(saved?'La corrección se guardó. Recargá la ficha.':'No pudimos confirmar el guardado. Recargá la ficha antes de reintentar.');setUncertain(true)}finally{setBusy(false)}
  }
  return <section className="admin-card admin-operations"><p className="admin-card-eyebrow">Control del administrador</p><h2>Estado, pago y acreditación</h2>
    {!editing&&<><p>Corregí el estado de inscripción, el medio de pago, los importes, la fecha, la exención y el QR.</p><button className="button button-gold" disabled={blocked} onClick={()=>{setForm(draft(state));setError('');setMessage('');setUncertain(false);setEditing(true);onEditing(true)}}>Editar estado, pago y acreditación</button></>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}{uncertain&&<button className="button button-outline" onClick={()=>window.location.reload()}>Recargar ficha</button>}
    {editing&&<form onSubmit={save}><fieldset className="admin-detail-fieldset" disabled={busy||uncertain}><legend>Gestión de la inscripción</legend><div className="admin-form-grid">
      <label>Estado de inscripción<select value={form.registrationStatus} onChange={e=>update('registrationStatus',e.target.value)}>{statuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Fecha y hora registrada (Argentina)<input type="datetime-local" required value={form.registeredAt} onChange={e=>update('registeredAt',e.target.value)}/></label>
      <label>Exención de pago<select value={form.waiver} onChange={e=>update('waiver',e.target.value)}><option value="keep">Conservar ({state.waived?'autorizada':'sin exención'})</option><option value="grant">Autorizar sin costo</option><option value="revoke">Revocar exención</option></select></label>
    </div></fieldset><fieldset className="admin-detail-fieldset" disabled={busy||uncertain}><legend>Registro de pago {state.members>1?`· ${state.members} integrantes`:''}</legend>
      <p>La corrección modifica el registro interno y conserva la operación anterior. Los reintegros de dinero se gestionan en el proveedor de pago.</p>
      {state.providerOrder&&<p>Si corregís este pago pendiente, se verificará y cerrará su enlace anterior de Mercado Pago antes de reemplazarlo.</p>}
      <div className="admin-form-grid"><label>Medio de pago<select value={form.paymentMethod} onChange={e=>{update('paymentMethod',e.target.value);if(e.target.value!=='mercado_pago')update('fee','0');if(e.target.value==='none'){update('amount','');update('paid','0')}}}>{methods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Estado del pago<select disabled={form.paymentMethod==='none'} value={form.paymentStatus} onChange={e=>update('paymentStatus',e.target.value)}>{payments.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Importe total de la operación (ARS)<input type="number" min="0.01" max="2000000" step="0.01" required={form.paymentMethod!=='none'&&!(form.paymentMethod==='on_site'&&state.amountMinor===null&&!financial)} disabled={form.paymentMethod==='none'} value={form.amount} onChange={e=>update('amount',e.target.value)}/></label>
      <label>Importe abonado (ARS)<input type="number" min="0" max="2000000" step="0.01" required disabled={form.paymentMethod==='none'} value={form.paid} onChange={e=>update('paid',e.target.value)}/></label>
      <label>Gasto de servicio incluido (ARS)<input type="number" min="0" max="1999999.99" step="0.01" required disabled={form.paymentMethod!=='mercado_pago'} value={form.fee} onChange={e=>update('fee',e.target.value)}/></label>
      <label>Referencia bancaria / caja<input maxLength={120} value={form.manualReference} onChange={e=>update('manualReference',e.target.value)}/></label></div>
      {financial&&<label className="admin-detail-email-confirm"><input type="checkbox" required checked={form.confirmPayment} onChange={e=>update('confirmPayment',e.target.checked)}/> Confirmo la corrección del registro de pago y de sus importes.</label>}
      {financial&&state.members>1&&<label className="admin-detail-email-confirm"><input type="checkbox" required checked={form.confirmGroup} onChange={e=>update('confirmGroup',e.target.checked)}/> Confirmo que se corregirá el pago completo de los {state.members} integrantes. El importe se repartirá entre ellos.</label>}
    </fieldset><fieldset className="admin-detail-fieldset" disabled={busy||uncertain}><legend>Acreditación e ingreso</legend>
      {state.qrBlocked&&<p>La acreditación está bloqueada. Para habilitarla nuevamente, elegí emitir un QR nuevo.</p>}
      <div className="admin-form-grid"><label>QR personal<select value={form.qrAction} onChange={e=>update('qrAction',e.target.value)}><option value="keep">{state.qrBlocked?'Conservar bloqueo':'Conservar / emitir si corresponde'}</option><option value="revoke">Revocar y bloquear emisión automática</option><option value="reissue">Emitir uno nuevo e invalidar el anterior</option></select></label></div>
      {state.admitted&&<label className="admin-detail-email-confirm"><input type="checkbox" checked={form.undoAdmission} onChange={e=>update('undoAdmission',e.target.checked)}/> Revertir el ingreso registrado para permitir acreditar nuevamente.</label>}
      {qrChange&&<label className="admin-detail-email-confirm"><input type="checkbox" required checked={form.confirmQrChange} onChange={e=>update('confirmQrChange',e.target.checked)}/> Confirmo el cambio del QR o del ingreso.</label>}
      <label className="admin-detail-email-confirm"><input type="checkbox" checked={form.notify} onChange={e=>update('notify',e.target.checked)}/> Enviar la acreditación por correo si queda confirmada y habilitada.</label>
    </fieldset><label>Motivo de la corrección<textarea required minLength={5} maxLength={500} value={form.reason} disabled={busy||uncertain} onChange={e=>update('reason',e.target.value)}/></label><div className="admin-accreditation-actions"><button className="button button-gold" disabled={busy||uncertain}>{busy?'Guardando…':'Guardar gestión'}</button><button className="button button-outline" type="button" disabled={busy} onClick={close}>Cancelar</button></div></form>}
  </section>
}
