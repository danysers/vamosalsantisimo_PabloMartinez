'use client'

import { useState, type FormEvent } from 'react'
import type { AdminRegistration } from '../../../lib/registration-admin'
import { accreditationPreparation, registrationEmailActions } from '../../../lib/registration-email-actions'

const reasons: Record<string, string> = {
  mailbox_full: 'Buzón sin espacio. La persona debe liberar almacenamiento antes del reenvío.',
  invalid_recipient: 'Dirección inexistente o no válida. Confirmá el correo con la persona.',
  policy_rejected: 'El servidor del destinatario rechazó el mensaje por su política de correo.',
  temporary_failure: 'Problema temporal de entrega informado por el proveedor.',
  delivery_rejected: 'El proveedor informó que no pudo entregar el mensaje.',
}
const statuses: Record<string, string> = { queued: 'En cola', sending: 'Enviando', sent: 'Aceptado por el servidor de correo',
  failed: 'Error al enviar al servidor', cancelled: 'Cancelado' }
const kinds: Record<string, string> = { registration_received: 'Inscripción', accreditation_ready: 'Acreditación con QR',
  payment_proof_submitted: 'Aviso de comprobante', payment_proof_reminder: 'Comprobante pendiente', registration_access: 'Recuperación de acceso', payment_instructions: 'Instrucciones de pago',
  group_payment_notice: 'Pago de grupo', assistance_review_request: 'Solicitud de ayuda', assistance_approved: 'Ayuda aprobada', assistance_declined: 'Respuesta de ayuda' }
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false }) : '—'

export default function AccreditationEmailControls({ detail, blocked, refresh, onBusy, canAdminister = false }: {
  detail: AdminRegistration; blocked: boolean; refresh: () => Promise<void>; onBusy: (value: boolean) => void; canAdminister?: boolean
}) {
  const [alternate, setAlternate] = useState(detail.accreditationEmail)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [passLinkData, setPassLinkData] = useState<{ url: string; version: string; email: string; alternate: string } | null>(null)
  const [proofLinkData, setProofLinkData] = useState<{ url: string; version: string; email: string } | null>(null)
  const [proofConfirmed, setProofConfirmed] = useState(false)
  const [proofRequestId, setProofRequestId] = useState('')
  const [proofMessage, setProofMessage] = useState('')
  const [proofError, setProofError] = useState('')
  const [preparing, setPreparing] = useState<'generate' | 'replace' | 'revoke' | null>(null)
  const [prepareReason, setPrepareReason] = useState('')
  const [prepareConfirmed, setPrepareConfirmed] = useState(false)
  const [prepareRequestId, setPrepareRequestId] = useState('')
  const availability = registrationEmailActions(detail)
  const prepareUnavailable = preparing === 'revoke' ? availability.revokeReason : preparing === 'replace' ? availability.replaceReason : availability.generateReason
  const dirty = alternate.trim().toLowerCase() !== detail.accreditationEmail
  const recipient = detail.accreditationEmail || detail.fields.email
  const inactive = detail.deleted || detail.archived || !detail.editable
  const staleSync = detail.bounceSync.stale
  const proofLink = proofLinkData?.version === detail.version && proofLinkData.email === detail.fields.email && detail.proofReminderEligible
    ? proofLinkData.url : ''
  const passLink = passLinkData?.version === detail.version && passLinkData.email === detail.fields.email &&
    passLinkData.alternate === detail.accreditationEmail && detail.credential.issued ? passLinkData.url : ''

  function startQrChange(action: 'generate' | 'replace' | 'revoke') {
    setPreparing(action); setPrepareReason(''); setPrepareConfirmed(false); setPrepareRequestId(''); setError(''); setMessage('')
  }

  async function prepareAccreditation(event: FormEvent) {
    event.preventDefault()
    if (!preparing || !canAdminister || busy || blocked || reload || prepareUnavailable || !detail.operations || !prepareConfirmed || prepareReason.trim().length < 5) return
    setBusy(true); onBusy(true); setMessage(''); setError('')
    const nextId = prepareRequestId || crypto.randomUUID()
    setPrepareRequestId(nextId)
    let accepted = false
    try {
      const response = await fetch('/api/admin/inscripciones/operaciones', { method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(accreditationPreparation(detail.reference, detail.operations, nextId, prepareReason, prepareConfirmed, preparing === 'revoke' ? 'revoke' : 'reissue')) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'No pudimos generar la acreditación.'); if (response.status === 409) setReload(true); return }
      accepted = true
      await refresh()
      setPreparing(null); setPrepareReason(''); setPrepareConfirmed(false); setPrepareRequestId('')
      setPassLinkData(null)
      setMessage(preparing === 'revoke' ? 'QR revocado. Sus enlaces anteriores ya no son válidos. No se modificó el pago.'
        : 'QR generado. Ya podés copiar el enlace vigente o reenviar la acreditación. No se envió ningún correo ni se modificó el pago.')
    } catch {
      setError(accepted ? 'El cambio del QR fue registrado. Recargá la ficha para ver el resultado.' : 'No pudimos confirmar el resultado. Recargá la ficha antes de reintentar.')
      setReload(true)
    } finally { setBusy(false); onBusy(false) }
  }

  async function copyPersonalLink(url: string, target: 'pass' | 'proof') {
    try {
      await navigator.clipboard.writeText(url)
      if (target === 'pass') setMessage('Enlace de acreditación copiado. Compartilo sólo con la persona inscripta.')
      else setProofMessage('Enlace para subir comprobante copiado. Compartilo sólo con la persona inscripta.')
    } catch {
      const fallback = 'El enlace está disponible en el campo. Seleccionalo y copialo; el navegador no permitió copiar automáticamente.'
      if (target === 'pass') setMessage(fallback)
      else setProofMessage(fallback)
    }
  }

  async function proofAction(action: 'link' | 'resend') {
    if (busy || reload || blocked || inactive || !detail.proofReminderEligible || (action === 'resend' && !proofConfirmed)) return
    setBusy(true); onBusy(true); setProofMessage(''); setProofError('')
    let accepted = false
    const nextId = proofRequestId || crypto.randomUUID()
    if (action === 'resend') setProofRequestId(nextId)
    try {
      const response = await fetch('/api/admin/inscripciones/comprobante-pendiente', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reference: detail.reference, version: detail.version,
          ...(action === 'resend' ? { requestId: nextId, confirmRecipient: proofConfirmed } : {}) }) })
      const data = await response.json()
      if (!response.ok) { setProofError(data.error || 'No pudimos completar la operación.'); if (data.conflict) setReload(true); return }
      accepted = true
      if (action === 'link') {
        setProofLinkData({ url: data.url, version: detail.version, email: detail.fields.email })
        await copyPersonalLink(data.url, 'proof')
      } else {
        setProofMessage('Aviso en cola para el correo original de la inscripción. El pago sigue pendiente de verificación.')
        setProofConfirmed(false)
        await refresh()
        setProofRequestId('')
      }
    } catch {
      setProofError(accepted ? 'La operación fue registrada. Recargá la ficha para ver el resultado.' : 'No pudimos confirmar el resultado. Recargá la ficha antes de reintentar.')
      setReload(true)
    } finally { setBusy(false); onBusy(false) }
  }

  async function sendAction(action: 'recipient' | 'resend' | 'link', event?: FormEvent) {
    event?.preventDefault()
    if (busy || reload || blocked) return
    if (action !== 'recipient' && (dirty || inactive || availability.passReason)) return
    setBusy(true); onBusy(true); setMessage(''); setError('')
    let accepted = false
    const nextId = requestId || crypto.randomUUID()
    if (action === 'resend') setRequestId(nextId)
    try {
      const response = await fetch('/api/admin/inscripciones/correo', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reference: detail.reference, version: detail.version,
          ...(action === 'recipient' ? { alternateEmail: alternate.trim(), reason } : action === 'resend' ? { requestId: nextId, confirmRecipient: true } : {}) }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'No pudimos completar la operación.'); if (data.conflict) setReload(true); return }
      accepted = true
      if (action === 'link') {
        setPassLinkData({ url: data.url, version: detail.version, email: detail.fields.email, alternate: detail.accreditationEmail })
        await copyPersonalLink(data.url, 'pass')
        return
      }
      setMessage(action === 'recipient' ? 'Correo alternativo guardado. No se envió ningún mensaje.' : 'Acreditación en cola para el destinatario indicado. Se reutiliza el mismo QR; la recepción aún no está confirmada.')
      setReason('')
      await refresh()
      setRequestId('')
    } catch {
      setError(accepted ? 'La operación fue registrada. Recargá la ficha para ver el resultado.' : 'No pudimos confirmar el resultado. Recargá la ficha antes de reintentar.')
      setReload(true)
    } finally { setBusy(false); onBusy(false) }
  }
  return <>
    <h2>Correos de la inscripción</h2>
    <p className="admin-context-note">“Aceptado” significa que el proveedor recibió el mensaje para enviarlo. Los rechazos posteriores aparecen como rebotes cuando el buzón devuelve un informe; no confirman la recepción en bandeja.</p>
    <p className="admin-context-note">Última consulta manual de rebotes: {date(detail.bounceSync.checkedAt)}. Se consulta sólo cuando pulsás «Actualizar estado de correos». La consulta es compartida para todas las inscripciones.</p>
    <button type="button" className="button button-outline" disabled={busy || blocked || dirty || reload} onClick={async () => {
      setBusy(true); onBusy(true)
      try {
        setError(''); setMessage('Consultando los informes de entrega…')
        const response = await fetch('/api/admin/correos/actualizar', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID() }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No pudimos consultar los correos.')
        await refresh()
        setMessage(result.pending ? 'La consulta manual sigue en curso. Podés volver a actualizar más tarde; no se inició otra consulta.'
          : result.status === 'failed' ? 'No se pudo completar la consulta manual. Revisá la conexión y volvé a solicitarla.'
          : result.cached ? 'Estado actualizado con la consulta manual más reciente. No se repitió la consulta al buzón.' : 'Consulta manual completada. Los estados ya están actualizados.')
      } catch { setError('No pudimos actualizar el estado. Reintentá en unos instantes.'); setMessage('') }
      finally { setBusy(false); onBusy(false) }
    }}>Actualizar estado de correos</button>
    {(staleSync || detail.bounceSync.error) && <p className="admin-operator-notice">{staleSync ? 'Hay una consulta manual de rebotes en curso.' : 'La última consulta de rebotes quedó incompleta.'} Un mensaje sin rebote registrado todavía puede no haber llegado.</p>}
    <div className="admin-detail-save"><h3>Acreditación y volante personal</h3>
      <p className="admin-context-note">El correo original de la inscripción es {detail.fields.email}. El alternativo se usa sólo al reenviar el QR desde este panel. Guardarlo no envía correos ni cambia el acceso de la persona.</p>
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
      {reload && <button className="button button-outline" type="button" onClick={() => window.location.reload()}>Recargar ficha</button>}
      <form onSubmit={event => sendAction('recipient', event)}>
        <fieldset disabled={busy || inactive || blocked || reload} className="admin-detail-fieldset"><legend>Correo alternativo opcional</legend>
          <label htmlFor="accreditation-alternate-email">Correo alternativo para el QR<input id="accreditation-alternate-email" type="email" maxLength={254} value={alternate}
            onChange={event => setAlternate(event.target.value)} placeholder="Sin cargar · se usa el correo original" /></label>
          {dirty && <><label htmlFor="accreditation-email-reason">Motivo<textarea id="accreditation-email-reason" minLength={5} maxLength={500} required value={reason}
            onChange={event => setReason(event.target.value)} rows={2} placeholder="Ej.: dirección alternativa confirmada por la persona" /></label>
            <button type="submit" className="button button-outline" disabled={reason.trim().length < 5}>Guardar correo alternativo</button></>}
        </fieldset>
      </form>
      <p><strong>Se reenviará a: {recipient}</strong></p>
        <div className="admin-accreditation-actions">
          <button type="button" className="button button-outline" aria-describedby="accreditation-action-reason" disabled={busy || inactive || blocked || dirty || reload || !!preparing || !!availability.passReason}
            onClick={() => sendAction('link')}>Copiar enlace de acreditación</button>
          <button type="button" className="button button-gold" aria-describedby="accreditation-action-reason" disabled={busy || inactive || blocked || dirty || reload || !!preparing || !!availability.passReason}
            onClick={() => sendAction('resend')}>{busy ? 'Procesando…' : 'Reenviar acreditación con el mismo QR'}</button>
        </div>
        <p id="accreditation-action-reason" className="admin-context-note">{availability.passReason || 'El enlace abre el volante personal con su QR y la opción de imprimir. Copiarlo no envía correos.'}</p>
        {passLink && <div className="admin-proof-link"><label htmlFor="personal-pass-link">Enlace personal de acreditación
          <input id="personal-pass-link" type="text" readOnly value={passLink} onFocus={event => event.target.select()} /></label>
        </div>}
      {canAdminister && <div className="admin-prepare-accreditation"><h4>Gestión del QR</h4>
        <p className="admin-context-note">Para conservar el QR existente, usá «Copiar enlace de acreditación» o «Reenviar acreditación con el mismo QR». No hace falta generar otro.</p>
        <button type="button" className="button button-outline" aria-describedby="accreditation-prepare-reason" disabled={busy || blocked || reload || dirty || !!availability.generateReason || !!preparing}
          onClick={() => startQrChange('generate')}>Generar QR de acreditación</button>
        <p id="accreditation-prepare-reason" className="admin-context-note">{availability.generateReason || 'Generá el QR faltante sin volver a cargar ni aprobar el pago. Luego podrás copiar el enlace o enviarlo por correo.'}</p>
        <div className="admin-accreditation-actions">
          <button type="button" className="button button-outline" aria-describedby="accreditation-replace-reason" disabled={busy || blocked || reload || dirty || !!availability.replaceReason || !!preparing}
            onClick={() => startQrChange('replace')}>Revocar y generar un QR nuevo</button>
          <button type="button" className="button button-outline" aria-describedby="accreditation-revoke-reason" disabled={busy || blocked || reload || dirty || !!availability.revokeReason || !!preparing}
            onClick={() => startQrChange('revoke')}>Revocar QR</button>
        </div>
        <p id="accreditation-replace-reason" className="admin-context-note">{availability.replaceReason || 'Reemplaza el QR y su enlace personal. Después de confirmar, el QR y los enlaces anteriores dejarán de ser válidos.'}</p>
        <p id="accreditation-revoke-reason" className="admin-context-note">{availability.revokeReason || 'Revoca el QR y bloquea nuevas emisiones automáticas hasta que decidas generar otro.'}</p>
        {preparing && <form onSubmit={prepareAccreditation}><fieldset disabled={busy || blocked || reload} className="admin-detail-fieldset"><legend>{preparing === 'revoke' ? 'Revocar acreditación' : 'Generar acreditación'}</legend>
          <p>{preparing === 'revoke' ? 'Se revocará el QR vigente y se bloqueará su emisión automática. No se genera otro QR.'
            : 'Se emitirá un QR nuevo para esta persona y se quitará el bloqueo administrativo. Los QR anteriores revocados seguirán inválidos.'} El pago, los importes, la fecha y los demás integrantes se conservan. No se envía correo automáticamente.</p>
          <label htmlFor="prepare-accreditation-reason">Motivo del cambio del QR<textarea id="prepare-accreditation-reason" required minLength={5} maxLength={500} rows={2} value={prepareReason} onChange={event => setPrepareReason(event.target.value)} /></label>
          <label className="admin-detail-email-confirm"><input type="checkbox" required checked={prepareConfirmed} onChange={event => setPrepareConfirmed(event.target.checked)} />{preparing === 'revoke' ? 'Confirmo revocar el QR y bloquear esta acreditación.' : 'Confirmo generar un QR nuevo e invalidar cualquier QR y enlace anterior.'}</label>
          <div className="admin-accreditation-actions"><button type="submit" className="button button-gold" disabled={!prepareConfirmed || prepareReason.trim().length < 5 || !!prepareUnavailable}>{preparing === 'revoke' ? 'Confirmar revocación del QR' : 'Confirmar generación del QR'}</button>
            <button type="button" className="button button-outline" onClick={() => setPreparing(null)}>Cancelar cambio del QR</button></div>
        </fieldset></form>}
      </div>}
      <p className="admin-context-note">El reenvío no modifica el pago ni emite un nuevo QR. {blocked ? 'Terminá o cancelá la edición de datos antes de continuar.' : dirty ? 'Guardá el correo alternativo antes de continuar.' : ''}</p>
    </div>
    <div className="admin-detail-save"><h3>Comprobante de pago pendiente</h3>
      <p className="admin-context-note">Si la persona pagó por transferencia o QR y aún no pudo adjuntar el comprobante, podés reenviarle el aviso o copiar su enlace personal. El mensaje se envía a <strong>{detail.fields.email}</strong>, no al correo alternativo del QR.</p>
      {proofMessage && <p role="status">{proofMessage}</p>}{proofError && <p role="alert">{proofError}</p>}
      <div className="admin-accreditation-actions">
        <button type="button" className="button button-outline" aria-describedby="proof-action-reason" disabled={busy || blocked || inactive || reload || !detail.proofReminderEligible} onClick={() => proofAction('link')}>
          Copiar enlace para subir comprobante</button>
        <button type="button" className="button button-gold" aria-describedby="proof-action-reason" disabled={busy || blocked || inactive || reload || !detail.proofReminderEligible || !proofConfirmed}
          onClick={() => proofAction('resend')}>{busy ? 'Procesando…' : 'Reenviar pedido de comprobante'}</button>
      </div>
      <p id="proof-action-reason" className="admin-context-note">{availability.proofReason || 'El enlace abre directamente la carga del archivo, sin volver a completar los datos. El correo incluye las instrucciones de subida.'}</p>
        {proofLink && <div className="admin-proof-link"><label htmlFor="personal-proof-link">Enlace personal para compartir
          <input id="personal-proof-link" type="text" readOnly value={proofLink} onFocus={event => event.target.select()} /></label>
        </div>}
      {detail.proofReminderEligible && <>
        <label className="admin-detail-email-confirm"><input type="checkbox" checked={proofConfirmed} disabled={busy || blocked || inactive || reload}
          onChange={event => setProofConfirmed(event.target.checked)} />Confirmé que falta el comprobante y que el correo de la inscripción es correcto.</label>
        <p className="admin-context-note">No cambia el estado del pago. Si el comprobante se carga antes de que el trabajador procese el aviso, éste se cancela.</p>
      </>}
    </div>
    <h3>Historial de correos</h3>
    {detail.emails.length ? <ul className="admin-detail-history">{detail.emails.map(email => <li key={email.id} className={email.deliveryAction ? 'admin-email-bounce' : undefined}>
      <strong>{kinds[email.kind] || email.kind}{email.manualResend ? ' · Reenvío' : ''}</strong>
      <span>{email.deliveryAction === 'failed' ? 'Rebotó · No entregado' : email.deliveryAction === 'delayed' ? 'Entrega demorada' : statuses[email.status] || email.status}</span>
      {email.deliveryAction && <><p>{reasons[email.reasonCode] || reasons.delivery_rejected}</p>
        <small>Código: {email.enhancedStatus} · Informe: {date(email.reportedAt)}</small>
        {email.diagnostic && <details><summary>Detalle del proveedor</summary><p>{email.diagnostic}</p></details>}</>}
      {email.status === 'failed' && <small>El intento no fue aceptado. El trabajador reintenta los errores de envío; si se agotan los intentos, se requiere revisión.</small>}
      <small>Para: {email.toEmail}</small><small>{date(email.sentAt || email.createdAt)}</small>
    </li>)}</ul> : <p className="admin-empty">Sin correos registrados.</p>}
  </>
}
