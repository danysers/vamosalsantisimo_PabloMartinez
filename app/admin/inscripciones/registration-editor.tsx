'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AdminRegistration } from '../../../lib/registration-admin'
import { ecclesialOptions, personalLabels, type PersonalFields } from '../../../lib/registration-edit-policy'

const names: Record<string, string> = { pending: 'Pendiente', waiting: 'En espera', confirmed: 'Confirmada', review: 'En revisión', cancelled: 'Cancelada',
  created: 'Iniciado', approved: 'Aprobado', rejected: 'Rechazado', refunded: 'Reintegrado', partially_refunded: 'Reintegro parcial', charged_back: 'Revertido',
  mercado_pago: 'Mercado Pago', bank_transfer: 'Transferencia', on_site: 'Efectivo en el taller', manual: 'Manual',
  queued: 'En cola', sending: 'Enviando', sent: 'Aceptado por el servidor de correo', failed: 'Error de entrega', requested: 'Solicitada', declined: 'Rechazada',
  registration_received: 'Inscripción', payment_instructions: 'Instrucciones de pago', accreditation_ready: 'Acreditación con QR',
  registration_access: 'Recuperación de acceso', group_payment_notice: 'Pago de grupo', payment_proof_submitted: 'Aviso de comprobante' }
const label = (value: string) => names[value] || value || '—'
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'
const money = (value: number | null) => value == null ? 'A definir' : (value / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
const limits: Partial<Record<keyof PersonalFields, number>> = { firstName: 100, lastName: 100, documentNumber: 30,
  email: 254, phone: 40, nickname: 80, country: 100, province: 100, locality: 150 }
const groups: { title: string; fields: (keyof PersonalFields)[] }[] = [
  { title: 'Datos personales', fields: ['firstName', 'lastName', 'documentNumber', 'nickname', 'birthDate'] },
  { title: 'Contacto', fields: ['email', 'phone'] },
  { title: 'Procedencia', fields: ['country', 'province', 'locality'] },
  { title: 'Comunidad y actividad', fields: ['prayerGroup', 'movement', 'ecclesialState', 'occupation'] },
]

export default function RegistrationEditor({ initial }: { initial: AdminRegistration }) {
  const router = useRouter()
  const [detail, setDetail] = useState(initial)
  const [fields, setFields] = useState(initial.fields)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reloadRequired, setReloadRequired] = useState(false)
  const dirty = JSON.stringify(fields) !== JSON.stringify(detail.fields)
  const emailChanged = fields.email.trim().toLowerCase() !== detail.fields.email.trim().toLowerCase()
  useEffect(() => {
    if (!editing || !dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editing, dirty])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !dirty) return
    setBusy(true); setError(''); setMessage('')
    let saved = false
    try {
      const response = await fetch('/api/admin/inscripciones/ficha', { method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, reference: detail.reference,
          version: detail.version, reason, confirmEmailChange: emailConfirmed }) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || 'No pudimos guardar la corrección.'); if (result.conflict) setReloadRequired(true); return }
      saved = true
      setEditing(false); setReason(''); setEmailConfirmed(false)
      setMessage('Cambios guardados. La corrección quedó registrada con tu usuario.')
      const fresh = await fetch('/api/admin/inscripciones/ficha?reference=' + encodeURIComponent(detail.reference), { credentials: 'same-origin', cache: 'no-store' })
      if (!fresh.ok) throw Error('refresh')
      const data = await fresh.json()
      setDetail(data.registration); setFields(data.registration.fields)
      router.refresh()
    } catch {
      setError(saved ? 'La corrección se guardó. Recargá la ficha para ver el estado actualizado.' : 'No pudimos confirmar el guardado. Recargá la ficha antes de reintentar.')
      setReloadRequired(true)
    } finally { setBusy(false) }
  }

  return <div className="admin-registration-detail">
    <div className="admin-detail-toolbar"><Link href="/admin/inscripciones">← Volver a inscripciones</Link>
      <Link className="button button-outline" href={`/admin/acreditacion?reference=${encodeURIComponent(detail.reference)}`}>Pagos y acreditación</Link></div>
    <section className="admin-card admin-detail-summary"><div><span>Referencia</span><strong>{detail.reference}</strong></div>
      <div><span>Inscripción</span><strong>{detail.deleted ? 'Eliminada' : detail.archived ? 'Archivada' : label(detail.status)}</strong></div>
      <div><span>Registrada</span><strong>{date(detail.createdAt)}</strong></div>
      <div><span>Acreditación</span><strong>{detail.credential.admittedAt ? 'Ya ingresó · ' + date(detail.credential.admittedAt) : detail.credential.issued ? 'QR emitido' : 'Sin QR vigente'}</strong></div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><p className="admin-card-eyebrow">Ficha de la persona</p><h2>Datos de inscripción</h2></div>
      {!editing && detail.editable && <button className="button button-gold" disabled={busy || reloadRequired} onClick={() => { setEditing(true); setError(''); setMessage('') }}>Editar datos</button>}</div>
      {!detail.editable && <p className="admin-operator-notice">{detail.archived || detail.deleted
        ? 'Para editar esta inscripción, recuperala primero desde Archivadas o Eliminadas en la lista.'
        : 'Este registro pertenece a una etapa anterior o no tiene el formulario completo. Se conserva para consulta.'}</p>}
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
      {reloadRequired && <button type="button" className="button button-outline" onClick={() => window.location.reload()}>Recargar ficha</button>}
      <form onSubmit={save}>
        {groups.map(group => <fieldset className="admin-detail-fieldset" key={group.title} disabled={busy}><legend>{group.title}</legend><div className="admin-form-grid">
          {group.fields.map(key => <label key={key} htmlFor={'edit-' + key}>{personalLabels[key]}
            {key === 'ecclesialState' ? <select id={'edit-' + key} value={fields[key] || ''} disabled={!editing || busy} onChange={event => setFields({ ...fields, [key]: event.target.value as PersonalFields['ecclesialState'] })}>
              <option value="" disabled>Sin informar</option>
              {ecclesialOptions.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
              : <input id={'edit-' + key} name={key} value={fields[key]} readOnly={!editing} type={key === 'email' ? 'email' : key === 'birthDate' ? 'date' : key === 'phone' ? 'tel' : 'text'}
                required={['firstName', 'lastName', 'email', 'phone', 'birthDate', 'documentNumber'].includes(key)} maxLength={limits[key] || 200}
                onChange={event => { setFields({ ...fields, [key]: event.target.value }); if (key === 'email') setEmailConfirmed(false) }} />}
          </label>)}</div></fieldset>)}
        {editing && <div className="admin-detail-save">
          {emailChanged && <label className="admin-detail-email-confirm"><input type="checkbox" checked={emailConfirmed} disabled={busy} onChange={event => setEmailConfirmed(event.target.checked)} required />
            Confirmé la nueva dirección de correo. Se anularán los códigos de recuperación anteriores y los correos pendientes al correo anterior.</label>}
          <label htmlFor="edit-reason">Motivo de la corrección<textarea id="edit-reason" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} required minLength={5} maxLength={500} rows={2} placeholder="Ej.: corrección de datos solicitada por la persona" /></label>
          <div className="admin-accreditation-actions"><button className="button button-gold" type="submit" disabled={busy || reloadRequired || !dirty || reason.trim().length < 5 || emailChanged && !emailConfirmed}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => {
              if (dirty && !window.confirm('¿Descartar las correcciones sin guardar?')) return
              setFields(detail.fields); setReason(''); setEditing(false); setEmailConfirmed(false); setError('')
            }}>Cancelar</button></div>
        </div>}
      </form>
    </section>
    <div className="admin-detail-columns"><section className="admin-card"><h2>Pagos y comprobantes</h2>
      {detail.paymentDifficulty && <p className="admin-operator-notice">Solicitó ayuda para pagar · {label(detail.credential.assistanceStatus)}<br />{detail.paymentDifficultyNotes}</p>}
      {!detail.payments.length && <p className="admin-empty">Sin intentos de pago.</p>}
      {detail.payments.map(payment => <article className="admin-detail-payment" key={payment.id}><strong>{label(payment.source)} · {label(payment.status)}</strong>
        <dl><div><dt>Importe de esta persona</dt><dd>{money(payment.amountMinor)}</dd></div>
          {payment.members > 1 && <><div><dt>Grupo</dt><dd>{payment.members} personas</dd></div><div><dt>Total de la operación</dt><dd>{money(payment.transactionAmountMinor)}</dd></div></>}
          <div><dt>Pagado en la operación</dt><dd>{money(payment.paidAmountMinor)}</dd></div><div><dt>Creado</dt><dd>{date(payment.createdAt)}</dd></div>
          {payment.verifiedAt && <div><dt>Verificado</dt><dd>{date(payment.verifiedAt)}</dd></div>}{payment.manualReference && <div><dt>Referencia bancaria / caja</dt><dd>{payment.manualReference}</dd></div>}</dl></article>)}
      <h3>Archivos recibidos</h3>{detail.proofs.length ? <ul>{detail.proofs.map(proof => <li key={proof.id}><a href={`/api/admin/taller/comprobantes/${proof.id}`} target="_blank" rel="noopener noreferrer">{proof.filename || 'Ver comprobante'}</a><small> · {date(proof.uploadedAt)}</small></li>)}</ul> : <p className="admin-empty">No hay comprobantes adjuntos.</p>}
    </section><section className="admin-card"><h2>Correos de la inscripción</h2><p className="admin-context-note">“Aceptado” indica que el servidor de correo lo recibió para enviarlo.</p>
      {detail.emails.length ? <ul className="admin-detail-history">{detail.emails.map((email, index) => <li key={index}><strong>{label(email.kind)}</strong><span>{label(email.status)}</span><small>{date(email.sentAt || email.createdAt)}</small></li>)}</ul> : <p className="admin-empty">Sin correos registrados.</p>}
      <h3>Historial de correcciones</h3>{detail.history.length ? <ul className="admin-detail-history">{detail.history.map((item, index) => <li key={index}><strong>{item.operator} · {date(item.createdAt)}</strong><span>{item.reason}</span>
        <small>{item.changes.fields?.map(key => personalLabels[key as keyof PersonalFields] || key).join(', ')}</small></li>)}</ul> : <p className="admin-empty">Todavía no hay correcciones.</p>}
    </section></div>
  </div>
}
