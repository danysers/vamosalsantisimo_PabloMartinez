'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type SponsorRecord = {
  id: string
  brandName: string
  ownerName: string
  logoDriveFileId: string
  logoFilename: string
  phone: string | null
  email: string | null
  announcement: string | null
  updatedAt: string
}

function SponsorForm({ sponsor, onCancel, onSaved }: {
  sponsor?: SponsorRecord
  onCancel?: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const response = await fetch(sponsor ? `/api/admin/taller/sponsors/${encodeURIComponent(sponsor.id)}` : '/api/admin/taller/sponsors', {
        method: sponsor ? 'PATCH' : 'POST', body: new FormData(form),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; logoUpdated?: boolean }
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el sponsor.')
      if (!sponsor) { form.reset(); setSelected('') }
      setStatus(sponsor
        ? result.logoUpdated ? 'Datos y logo guardados. El flyer se actualizará cuando el generador procese el cambio.' : 'Datos guardados.'
        : 'Sponsor guardado: el logo ya está disponible para la web y archivado en Drive. El flyer se generará en la próxima revisión.')
      onSaved()
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el sponsor.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="admin-card admin-sponsor-form" onSubmit={submit}>
    <div className="admin-card-heading"><div><p className="admin-card-eyebrow">{sponsor ? 'Editar registro' : 'Nuevo registro'}</p><h2>{sponsor ? sponsor.brandName : 'Agregar sponsor'}</h2></div></div>
    <div className="admin-form-grid">
      <label>Nombre de marca *<input name="brandName" required maxLength={90} defaultValue={sponsor?.brandName} autoComplete="organization" /></label>
      <label>Nombre del dueño / titular *<input name="ownerName" required maxLength={120} defaultValue={sponsor?.ownerName} autoComplete="name" /></label>
      <label>Teléfono<input name="phone" type="tel" maxLength={50} defaultValue={sponsor?.phone || ''} autoComplete="tel" inputMode="tel" /></label>
      <label>Correo<input name="email" type="email" maxLength={254} defaultValue={sponsor?.email || ''} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} /></label>
    </div>
    <label className="admin-sponsor-message">Qué se quiere decir ese día<textarea name="announcement" rows={4} maxLength={2000} defaultValue={sponsor?.announcement || ''} placeholder="Texto, presentación o agradecimiento para el momento del evento" /></label>
    <label className="admin-sponsor-logo">Logo del sponsor {sponsor ? '(opcional para reemplazarlo)' : '*'}
      <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp" required={!sponsor}
        aria-describedby="sponsor-logo-help" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]
          setSelected(''); setError('')
          if (!file) return
          if (file.size > 12 * 1024 * 1024) { setError('La imagen supera 12 MiB. Elegí una versión más pequeña.'); event.target.value = ''; return }
          setSelected(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MiB`)
        }} />
      <small id="sponsor-logo-help">Elegí desde Fotos o Archivos, también imágenes guardadas de WhatsApp. JPG, PNG o WebP estático; hasta 12 MiB y 40 megapíxeles. Se limpia y optimiza automáticamente. Para HEIC, exportá como JPG. {sponsor && <a href={`https://drive.google.com/file/d/${encodeURIComponent(sponsor.logoDriveFileId)}/view`} target="_blank" rel="noopener noreferrer">Ver logo actual en Drive</a>}</small>
      {selected && <span className="admin-sponsor-selected" role="status">Archivo seleccionado: {selected}</span>}
    </label>
    {error && <p className="admin-sponsor-feedback is-error" role="alert">{error}</p>}
    {status && <p className="admin-sponsor-feedback" role="status">{status}</p>}
    <div className="admin-sponsor-actions"><button className="button button-gold" type="submit" disabled={busy}>{busy ? 'Limpiando y guardando…' : sponsor ? 'Guardar cambios' : 'Guardar sponsor'}</button>
      {sponsor && onCancel && <button className="button button-outline" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>}</div>
    <p className="admin-sponsor-private-note">El titular, teléfono, correo y texto se guardan en la base privada del panel. Solo la imagen limpia se guarda en Drive y se publica; se eliminan metadatos y ubicación GPS.</p>
  </form>
}

export default function SponsorsPanel({ sponsors }: { sponsors: SponsorRecord[] }) {
  const [editing, setEditing] = useState<SponsorRecord | undefined>()
  return <div className="admin-sponsor-layout">
    <SponsorForm key={editing?.id || 'new'} sponsor={editing} onCancel={editing ? () => setEditing(undefined) : undefined}
      onSaved={() => { if (editing) setEditing(undefined) }} />
    <section className="admin-card admin-sponsor-records">
      <div className="admin-card-heading"><div><p className="admin-card-eyebrow">Taller 2026</p><h2>Sponsors cargados</h2></div><span>{sponsors.length} {sponsors.length === 1 ? 'registro' : 'registros'}</span></div>
      {sponsors.length ? <div className="admin-table-wrap" role="region" aria-label="Sponsors cargados" tabIndex={0}><table className="admin-table">
        <thead><tr><th>Marca / titular</th><th>Contacto</th><th>Para decir ese día</th><th>Logo</th><th>Acción</th></tr></thead>
        <tbody>{sponsors.map(item => <tr key={item.id}>
          <td data-label="Marca / titular"><strong>{item.brandName}</strong><small>{item.ownerName}</small></td>
          <td data-label="Contacto">{item.phone || item.email ? <>{item.phone || '—'}{item.email && <small>{item.email}</small>}</> : '—'}</td>
          <td data-label="Para decir ese día" className="admin-sponsor-announcement">{item.announcement || '—'}</td>
          <td data-label="Logo"><a href={`https://drive.google.com/file/d/${encodeURIComponent(item.logoDriveFileId)}/view`} target="_blank" rel="noopener noreferrer">Ver en Drive</a><small>{item.logoFilename}</small></td>
          <td data-label="Acción"><button className="button button-outline" type="button" aria-label={`Editar ${item.brandName}`} onClick={() => { setEditing(item); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="admin-empty">Todavía no hay sponsors. Cargá el primero con el formulario.</p>}
    </section>
  </div>
}
