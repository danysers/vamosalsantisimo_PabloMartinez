'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type PendingAssistance = {
  registrationId: string
  reference: string
  name: string
  email: string
  phone: string
  notes: string | null
  requestedAt: string
}

export default function AssistanceReview({ requests }: { requests: PendingAssistance[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState<Record<string, string>>({})

  async function decide(item: PendingAssistance, decision: 'approved' | 'declined') {
    if (busy) return
    const note = (notes[item.registrationId] ?? '').trim()
    if (decision === 'declined' && note.length < 5) {
      setErrors(previous => ({ ...previous, [item.registrationId]: 'Escribí un motivo breve para rechazar.' }))
      return
    }
    const action = decision === 'approved' ? 'aprobar la excepción de pago' : 'rechazar la solicitud'
    if (!window.confirm(`¿Confirmás ${action} de ${item.name}? Se encolará un correo para la persona.`)) return
    setBusy(item.registrationId)
    setErrors(previous => ({ ...previous, [item.registrationId]: '' }))
    try {
      const response = await fetch('/api/admin/assistance/decision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: item.registrationId, decision, note }),
      })
      const result = await response.json()
      if (!response.ok) {
        setErrors(previous => ({ ...previous, [item.registrationId]: result.error ?? 'No pudimos guardar la decisión.' }))
        return
      }
      setCompleted(previous => ({ ...previous, [item.registrationId]: decision === 'approved' ? 'Excepción aprobada; QR y correos en cola.' : 'Solicitud rechazada; correo en cola.' }))
      router.refresh()
    } catch {
      setErrors(previous => ({ ...previous, [item.registrationId]: 'No pudimos conectar con el servidor. Verificá el estado antes de reintentar.' }))
    } finally {
      setBusy(null)
    }
  }

  return <section className="admin-assistance" id="solicitudes" aria-labelledby="assistance-title">
    <h2 id="assistance-title">Solicitudes de ayuda pendientes</h2>
    <p>Revisá cada caso antes de decidir. Aprobar la excepción emite un QR único y deja el volante en cola de correo; no registra el ingreso.</p>
    {requests.length === 0 ? <p>No hay solicitudes pendientes.</p> : <div className="admin-assistance-list">
      {requests.map(item => <article className="admin-assistance-card" key={item.registrationId}>
        <div className="admin-assistance-heading"><h3>{item.name}</h3><span>Referencia: {item.reference}</span></div>
        <p className="admin-assistance-date">Solicitada: {new Date(item.requestedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
        <p><a href={`mailto:${item.email}`}>{item.email}</a> · <a href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}>{item.phone}</a></p>
        <p><strong>Situación informada:</strong> {item.notes || 'No indicó más detalles.'}</p>
        <label htmlFor={`decision-note-${item.registrationId}`}>Nota interna de la decisión</label>
        <textarea id={`decision-note-${item.registrationId}`} maxLength={1000} rows={3} value={notes[item.registrationId] ?? ''}
          onChange={event => setNotes(previous => ({ ...previous, [item.registrationId]: event.target.value }))}
          disabled={busy === item.registrationId || !!completed[item.registrationId]} />
        <p className="admin-assistance-hint">Para rechazar, escribí al menos 5 caracteres. Esta nota queda en el registro interno; el correo usa un texto general.</p>
        <div className="admin-assistance-actions">
          <button className="button button-gold" type="button" disabled={!!busy || !!completed[item.registrationId]} onClick={() => decide(item, 'approved')}>Aprobar excepción</button>
          <button className="button button-outline" type="button" disabled={!!busy || !!completed[item.registrationId]} onClick={() => decide(item, 'declined')}>Rechazar solicitud</button>
        </div>
        <p role="status" aria-live="polite">{completed[item.registrationId]}</p>
        <p role="alert" aria-live="assertive">{errors[item.registrationId]}</p>
      </article>)}
    </div>}
  </section>
}
