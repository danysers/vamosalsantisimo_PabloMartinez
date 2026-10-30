'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { paymentMethodLabel } from '../../../lib/payment-method-label'

type ScanResult = { result?: string; name?: string; reference?: string; error?: string; firstEntryAt?: string }
type ProofRow = { id: string; uploaded_at: string; reference: string; name: string;
  registration_status: string; payment_status: string; payment_source: string; amount_minor: number; filename: string; historical?: boolean }
const registrationLabel = (status: string) => status === 'confirmed' ? 'Confirmada' : status === 'pending' ? 'Registrada' : status
const paymentLabel = (status: string) => status === 'approved' ? 'Pagado' : status === 'pending' ? 'Pendiente de confirmación' : status

export default function AccreditationConsole({ canVerify, scanEnabled, initialReference }: { canVerify: boolean; scanEnabled: boolean; initialReference: string }) {
  const [reference, setReference] = useState(initialReference)
  const [note, setNote] = useState('')
  const [manualReference, setManualReference] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [proofs, setProofs] = useState<ProofRow[]>([])
  const [proofsError, setProofsError] = useState('')
  const [paymentSelection, setPaymentSelection] = useState<{ reference: string; source: string | null; difficulty: boolean; error: boolean } | null>(null)
  const [qrValue, setQrValue] = useState('')
  const [entryPoint, setEntryPoint] = useState('Ingreso principal')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const controls = useRef<{ stop: () => void } | null>(null)
  const scanning = useRef(false)

  useEffect(() => {
    if (canVerify) void loadProofs()
    return () => { controls.current?.stop() }
  }, [canVerify])

  useEffect(() => {
    const value = reference.trim()
    if (!canVerify || !/^[A-Za-z0-9_-]{10,80}$/.test(value)) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/admin/inscripciones/ficha?reference=' + encodeURIComponent(value), {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw Error('unavailable')
        const { registration } = await response.json()
        if (!controller.signal.aborted) setPaymentSelection({ reference: value, source: registration.payments[0]?.source || null, difficulty: registration.paymentDifficulty, error: false })
      } catch {
        if (!controller.signal.aborted) setPaymentSelection({ reference: value, source: null, difficulty: false, error: true })
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [reference, canVerify])

  async function loadProofs() {
    try {
      const response = await fetch('/api/admin/taller/comprobantes', { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No pudimos cargar los comprobantes.')
      setProofs(result.proofs || []); setProofsError('')
    } catch { setProofsError('No pudimos cargar los comprobantes. Reintentá en unos instantes.') }
  }

  async function post(url: string, body: object) {
    const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    return { ok: response.ok, result }
  }

  async function verifyPayment() {
    if (paymentBusy) return
    if (!window.confirm('¿Verificaste el pago fuera del sistema y querés confirmarlo? Esta acción emitirá el QR y enviará el correo de acreditación.')) return
    setPaymentBusy(true); setPaymentMessage('')
    try {
      const { ok, result } = await post('/api/admin/payments/verify', { reference: reference.trim(), note: note.trim(), manualReference: manualReference.trim() })
      setPaymentMessage(ok ? result.accreditationBlocked
        ? `Pago confirmado. Se acreditaron ${result.accreditedPeople} persona(s). Hay acreditaciones bloqueadas; revisalas desde la ficha administrativa.`
        : `Pago confirmado. Se acreditaron ${result.accreditedPeople} persona(s).${result.emailQueued ? ' El QR quedó en cola de correo.' : ''}` : result.error)
      if (ok) void loadProofs()
    } catch { setPaymentMessage('No pudimos conectar. Consultá el estado antes de reintentar.') }
    finally { setPaymentBusy(false) }
  }

  async function issueAgain() {
    if (paymentBusy) return
    setPaymentBusy(true); setPaymentMessage('')
    try {
      const { ok, result } = await post('/api/admin/accreditation/issue', { reference: reference.trim() })
      setPaymentMessage(ok ? result.alreadyIssued ? 'El QR ya estaba emitido; podés abrir el volante vigente.' : 'QR emitido; correo en cola.' : result.error)
    } catch { setPaymentMessage('No pudimos conectar. Consultá el estado antes de reintentar.') }
    finally { setPaymentBusy(false) }
  }

  async function submitQr(value: string) {
    if (!scanEnabled || scanning.current) return
    scanning.current = true
    setScanResult(null)
    controls.current?.stop(); controls.current = null; setCameraOn(false)
    try {
      const { result } = await post('/api/admin/accreditation/scan', { qrValue: value.trim(), entryPoint: entryPoint.trim() })
      setScanResult(result)
      setQrValue('')
    } catch { setScanResult({ error: 'No se pudo confirmar el ingreso. Revisá el estado antes de volver a escanear.' }) }
    finally { scanning.current = false }
  }

  async function startCamera() {
    if (!scanEnabled || cameraOn || !video.current) return
    setCameraError('')
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      controls.current = await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video.current,
        (result, _error, activeControls) => {
          if (result && !scanning.current) {
            activeControls.stop()
            controls.current = null
            setCameraOn(false)
            void submitQr(result.getText())
          }
        })
      setCameraOn(true)
    } catch { setCameraError('No se pudo abrir la cámara. Revisá el permiso o ingresá el código manualmente.') }
  }

  function stopCamera() { controls.current?.stop(); controls.current = null; setCameraOn(false) }
  function onManualScan(event: FormEvent) { event.preventDefault(); void submitQr(qrValue) }
  const printable = /^[A-Za-z0-9_-]{6,80}$/.test(reference.trim())
  const validReference = /^[A-Za-z0-9_-]{10,80}$/.test(reference.trim())
  const selected = paymentSelection?.reference === reference.trim() ? paymentSelection : null

  return <>
    {canVerify && <section className="admin-accreditation-block" id="comprobantes" aria-labelledby="proofs-title">
      <h2 id="proofs-title">Comprobantes recibidos</h2>
      <p>Revisá el archivo y el movimiento bancario antes de marcar el pago como confirmado. La inscripción y el pago se actualizan por separado en la base.</p>
      <button className="button button-outline" type="button" onClick={() => void loadProofs()}>Actualizar lista</button>
      {proofsError && <p role="alert">{proofsError}</p>}
      {!proofsError && proofs.length === 0 && <p>No hay comprobantes cargados.</p>}
      <div className="admin-proof-list">{proofs.map(proof => <article className="admin-proof-item" key={proof.id}>
        <strong>{proof.name}</strong><span> · {proof.reference} · {new Date(proof.uploaded_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</span>
        {proof.historical && <p><strong>Ensayo anterior · conservado para consulta</strong></p>}
        <p>Inscripción: {registrationLabel(proof.registration_status)} · Pago: {paymentLabel(proof.payment_status)} · Importe: ${(proof.amount_minor / 100).toLocaleString('es-AR')}</p>
        <p><strong>Medio de pago del comprobante: {paymentMethodLabel(proof.payment_source)}</strong></p>
        <a href={`/api/admin/taller/comprobantes/${proof.id}`} target="_blank" rel="noopener noreferrer">Ver comprobante</a>
        <Link className="button button-outline admin-inline-edit" href={`/admin/inscripciones/${encodeURIComponent(proof.reference)}${proof.historical ? '' : '?editar=1'}`}>{proof.historical ? 'Ver ficha de inscripción' : 'Editar inscripción'}</Link>
        {proof.payment_status === 'pending' && !proof.historical && <button type="button" className="button button-outline" onClick={() => { setReference(proof.reference); setNote(''); document.getElementById('payment-title')?.scrollIntoView({ behavior: 'smooth' }) }}>Revisar pago</button>}
      </article>)}</div>
    </section>}
    {canVerify && <section className="admin-accreditation-block" id="pagos" aria-labelledby="payment-title">
      <h2 id="payment-title">Verificar pago y emitir volante</h2>
      <p>Solo confirmá una transferencia después de verificarla, o efectivo después de cobrarlo en el taller. El efectivo usa el precio de ventanilla, no lotes ni promociones; si todavía está a definir, el sistema no permite marcarlo como pagado. La aprobación de una excepción emite el QR automáticamente.</p>
      <label>Referencia de inscripción<input value={reference} onChange={event => setReference(event.target.value)} maxLength={80} autoComplete="off" /></label>
      {validReference && <p className="admin-operator-notice"><strong>Medio de pago elegido: </strong>{selected ? selected.error ? 'No pudimos consultarlo. Abrí la ficha para revisar.' : paymentMethodLabel(selected.source, selected.difficulty) : 'Consultando…'}</p>}
      {validReference && <Link className="button button-outline" href={`/admin/inscripciones/${encodeURIComponent(reference.trim())}?editar=1`}>Editar inscripción</Link>}
      <label>Nota interna de verificación<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="Ej.: comprobante revisado o efectivo recibido" /></label>
      <label>Referencia bancaria o de caja (opcional)<input value={manualReference} onChange={event => setManualReference(event.target.value)} maxLength={120} /></label>
      <div className="admin-accreditation-actions">
        <button className="button button-gold" disabled={paymentBusy || !printable || note.trim().length < 5} onClick={verifyPayment}>Confirmar pago y emitir QR</button>
        <button className="button button-outline" disabled={paymentBusy || !printable} onClick={issueAgain}>Emitir QR de caso ya aprobado</button>
        {printable && <a className="button button-outline" href={`/api/admin/accreditation/print?reference=${encodeURIComponent(reference.trim())}`} target="_blank" rel="noopener noreferrer">Abrir volante imprimible</a>}
      </div>
      <p role="status" aria-live="polite">{paymentMessage}</p>
    </section>}
    <section className="admin-accreditation-block" id="ingreso" aria-labelledby="scan-title">
      <h2 id="scan-title">Control de ingreso</h2>
      {!scanEnabled && <p>El escáner está cerrado. Se habilita expresamente el día del evento; no registra ingresos de prueba ahora.</p>}
      <label>Punto de ingreso<input value={entryPoint} onChange={event => setEntryPoint(event.target.value)} maxLength={80} /></label>
      <div className="admin-accreditation-actions">
        <button className="button button-gold" disabled={!scanEnabled || cameraOn} onClick={startCamera}>Abrir cámara</button>
        {cameraOn && <button className="button button-outline" onClick={stopCamera}>Cerrar cámara</button>}
      </div>
      <video ref={video} className="admin-scan-video" muted playsInline aria-label="Vista de la cámara para leer el QR" />
      <p role="alert">{cameraError}</p>
      <form onSubmit={onManualScan} className="admin-scan-form"><label>Código leído por escáner externo<input value={qrValue} onChange={event => setQrValue(event.target.value)} maxLength={100} autoComplete="off" /></label>
        <button className="button button-outline" type="submit" disabled={!scanEnabled || !qrValue.trim()}>Validar ingreso</button></form>
      {scanResult && <div className={`admin-scan-result ${scanResult.result === 'admitted' ? 'is-valid' : 'is-invalid'}`} role="status" aria-live="assertive">
        <strong>{scanResult.result === 'admitted' ? 'INGRESO CONFIRMADO' : scanResult.result === 'already_admitted' ? 'YA INGRESÓ' : 'NO HABILITADO'}</strong>
        {scanResult.name && <p>{scanResult.name} · {scanResult.reference}</p>}
        {scanResult.error && <p>{scanResult.error}</p>}
        {scanResult.firstEntryAt && <p>Primer ingreso: {new Date(scanResult.firstEntryAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>}
      </div>}
    </section>
  </>
}
