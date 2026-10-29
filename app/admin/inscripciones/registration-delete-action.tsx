'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegistrationDeleteAction({ reference, name, deleted, archived }: {
  reference: string; name: string; deleted: boolean; archived: boolean
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [word, setWord] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  async function save(operation: 'delete' | 'restore' | 'archive' | 'unarchive') {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/inscripciones/eliminacion', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, operation, ...(operation === 'delete' ? { confirmation: word } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) { setError(result.error || 'No se pudo guardar el cambio.'); return }
      setDone(true); dialog.current?.close(); router.refresh()
    } catch { setError('No pudimos confirmar el cambio. Actualizá la lista antes de reintentar.') }
    finally { setBusy(false) }
  }
  return <>
    {!deleted && <button type="button" className="admin-text-action" disabled={busy || done}
      onClick={() => void save(archived ? 'unarchive' : 'archive')}>{busy ? 'Guardando…' : archived ? 'Desarchivar' : 'Archivar'}</button>}
    {deleted ? <button type="button" className="admin-text-action" disabled={busy || done}
      onClick={() => void save('restore')}>{busy ? 'Restaurando…' : 'Restaurar'}</button>
      : <button type="button" className="admin-text-action admin-text-danger" disabled={busy || done} onClick={() => {
        setWord(''); setCopied(false); setError(''); setOpen(true); dialog.current?.showModal()
      }}>Eliminar registro</button>}
    {error && !open && <small role="alert">{error}</small>}
    <dialog ref={dialog} className="admin-delete-dialog" aria-labelledby={`delete-title-${reference}`}
      onClose={() => setOpen(false)}
      onCancel={event => { if (busy) event.preventDefault() }}>
      <h2 id={`delete-title-${reference}`}>¿Eliminar esta inscripción?</h2>
      <p><strong>{name}</strong><br /><small>{reference}</small></p>
      <p>Saldrá de la lista y su QR quedará inhabilitado. Podés recuperarla desde “Eliminadas”.
        Eliminar no anula cobros ni realiza devoluciones.</p>
      <div className="admin-delete-word"><code>ELIMINAR</code><button type="button" className="button button-outline" disabled={busy}
        onClick={async () => {
          try { await navigator.clipboard.writeText('ELIMINAR'); setCopied(true) }
          catch { setError('Podés seleccionar la palabra ELIMINAR y copiarla directamente.') }
        }}>{copied ? 'Copiado' : 'Copiar palabra'}</button></div>
      <form onSubmit={event => { event.preventDefault(); if (word.trim().toUpperCase() === 'ELIMINAR') void save('delete') }}>
        <label>Escribí la palabra para confirmar<input value={word} maxLength={40} autoComplete="off" disabled={busy}
          onChange={event => setWord(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="admin-delete-buttons"><button type="button" className="button button-outline" disabled={busy}
          onClick={() => dialog.current?.close()}>Cancelar</button>
        <button type="submit" className="button admin-delete-confirm" disabled={busy || word.trim().toUpperCase() !== 'ELIMINAR'}>
          {busy ? 'Eliminando…' : 'Eliminar registro'}</button></div>
      </form>
    </dialog>
  </>
}
