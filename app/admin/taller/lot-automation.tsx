'use client'

import { useState } from 'react'

export type LotAutomationSettings = {
  enabled: boolean; notificationEmail: string
  history: Array<{ id: string; fromLot: number; toLot: number; threshold: number; paidPlaces: number;
    toEmail: string; createdAt: string; emailStatus: string }>
}
type Lot = { number: number; advanceAfter: number | null; paidPlaces: number }

export default function LotAutomation({ settings, lots, canConfigure, onSaved }: {
  settings: LotAutomationSettings; lots: Lot[]; canConfigure: boolean; onSaved: () => Promise<void>
}) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [email, setEmail] = useState(settings.notificationEmail)
  const [limits, setLimits] = useState<Record<number, string>>(() => Object.fromEntries(lots.map(lot =>
    [lot.number, lot.advanceAfter == null ? '' : String(lot.advanceAfter)])))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = [1, 2].map(number => limits[number]?.trim() ? Number(limits[number]) : null)
    if (values.some(value => value !== null && (!Number.isInteger(value) || value < 1 || value > 1_000_000))) {
      setMessage('Los límites deben ser números enteros mayores que cero.'); return
    }
    if (enabled && (!email.trim() || values.every(value => value === null))) {
      setMessage('Ingresá el correo de aviso y al menos un límite para activar el cambio automático.'); return
    }
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/taller/configuracion', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'lot_automation', enabled,
          notificationEmail: email.trim().toLowerCase(), limits: { lot1: values[0], lot2: values[1] } }) })
      const result = await response.json()
      if (!response.ok) { setMessage(result.error || 'No se pudo guardar.'); return }
      await onSaved()
      setMessage(enabled ? 'Automatización guardada. Con la inscripción abierta, un límite ya alcanzado se aplica al guardar.'
        : 'Cambios automáticos desactivados. La configuración quedó guardada.')
    } catch { setMessage('No se pudo confirmar el guardado. Actualizá el conteo antes de reintentar.') }
    finally { setBusy(false) }
  }
  return <div className="admin-lot-automation">
    <h3>Cambio automático y aviso por correo</h3>
    <p>Cuando un lote alcanza su límite de lugares con pago confirmado, se activa el siguiente y se envía un aviso.
      Cada integrante de un grupo pagado cuenta como un lugar. Los pendientes, las ayudas, los registros históricos
      de prueba y el efectivo a precio de ventanilla quedan fuera del conteo.</p>
    <form onSubmit={save}>
      <label className="admin-check"><input type="checkbox" disabled={!canConfigure || busy}
        checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Activar cambio automático de lote</label>
      <div className="admin-form-grid">
        {[1, 2].map(number => <label key={number}>Lote {number} → lote {number + 1} · límite de lugares pagados
          <input type="number" min="1" max="1000000" step="1" inputMode="numeric" disabled={!canConfigure || busy}
            value={limits[number] ?? ''} placeholder="Sin cambio automático"
            onChange={event => setLimits(current => ({ ...current, [number]: event.target.value }))} />
          <small>Confirmados en este lote: <strong>{lots.find(lot => lot.number === number)?.paidPlaces ?? 0}</strong>.
            Dejá vacío para detener el avance automático en este lote.</small>
        </label>)}
        <label>Correo que recibe el aviso<input type="email" maxLength={254} required={enabled}
          autoComplete="email" disabled={!canConfigure || busy} value={email} onChange={event => setEmail(event.target.value)} /></label>
      </div>
      <p>El límite se cuenta por lote, no sobre el total del taller. El lote 3 es el último.
        Las cotizaciones ya emitidas mantienen su precio; un pago grupal puede superar el límite sin dividir el grupo.
        Si hay devoluciones, el sistema no vuelve a un lote anterior.
        El avance se detiene al cerrar la inscripción o al comenzar el taller.</p>
      <div className="admin-actions">
        {canConfigure && <button type="submit" className="button button-gold" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar automatización'}</button>}
        <button type="button" className="button button-outline" disabled={busy} onClick={async () => {
          setBusy(true); setMessage('')
          try { await onSaved(); setMessage('Conteo e historial actualizados.') }
          catch { setMessage('No se pudo actualizar el conteo.') }
          finally { setBusy(false) }
        }}>Actualizar conteo</button>
      </div>
      <p role="status">{message}</p>
    </form>
    <h4>Últimos cambios automáticos</h4>
    {!settings.history.length ? <p>Todavía no hubo cambios automáticos de lote.</p> : <ul className="admin-lot-history">
      {settings.history.map(change => <li key={change.id}>
        <strong>Lote {change.fromLot} → lote {change.toLot}</strong> · {change.paidPlaces} lugares pagados
        {' '}(límite {change.threshold}). <time dateTime={change.createdAt}>{new Date(change.createdAt).toLocaleString('es-AR',
          { timeZone: 'America/Argentina/Buenos_Aires' })}</time> · Aviso a {change.toEmail}:{' '}
        {change.emailStatus === 'sent' ? 'enviado' : change.emailStatus === 'failed' ? 'envío fallido; revisar correo' : 'en cola'}.
      </li>)}
    </ul>}
  </div>
}
