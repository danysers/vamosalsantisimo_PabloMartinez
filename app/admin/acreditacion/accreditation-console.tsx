'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

type ScanResult = { result?: string; name?: string; reference?: string; error?: string; firstEntryAt?: string }

export default function AccreditationConsole({ canVerify, scanEnabled }: { canVerify: boolean; scanEnabled: boolean }) {
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [manualReference, setManualReference] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [qrValue, setQrValue] = useState('')
  const [entryPoint, setEntryPoint] = useState('Ingreso principal')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const controls = useRef<{ stop: () => void } | null>(null)
  const scanning = useRef(false)

  useEffect(() => () => { controls.current?.stop() }, [])

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
      setPaymentMessage(ok ? `Pago confirmado. Se acreditaron ${result.accreditedPeople} persona(s) y el QR quedó en cola de correo.` : result.error)
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

  return <>
    {canVerify && <section className="admin-accreditation-block" aria-labelledby="payment-title">
      <h2 id="payment-title">Verificar pago y emitir volante</h2>
      <p>Solo confirmá una transferencia o un pago en el lugar después de comprobarlo. La aprobación de una excepción emite el QR automáticamente.</p>
      <label>Referencia de inscripción<input value={reference} onChange={event => setReference(event.target.value)} maxLength={80} autoComplete="off" /></label>
      <label>Nota interna de verificación<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="Ej.: comprobante revisado o efectivo recibido" /></label>
      <label>Referencia bancaria o de caja (opcional)<input value={manualReference} onChange={event => setManualReference(event.target.value)} maxLength={120} /></label>
      <div className="admin-accreditation-actions">
        <button className="button button-gold" disabled={paymentBusy || !printable || note.trim().length < 5} onClick={verifyPayment}>Confirmar pago y emitir QR</button>
        <button className="button button-outline" disabled={paymentBusy || !printable} onClick={issueAgain}>Emitir QR de caso ya aprobado</button>
        {printable && <a className="button button-outline" href={`/api/admin/accreditation/print?reference=${encodeURIComponent(reference.trim())}`} target="_blank" rel="noopener noreferrer">Abrir volante imprimible</a>}
      </div>
      <p role="status" aria-live="polite">{paymentMessage}</p>
    </section>}
    <section className="admin-accreditation-block" aria-labelledby="scan-title">
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
