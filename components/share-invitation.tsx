'use client'

import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import styles from './invitation-section.module.css'

export default function ShareInvitation() {
  const [status, setStatus] = useState('')
  const invitation = () => ({
    title: 'Vamos al Santísimo · Pablo Martínez',
    text: 'Te invito a Vamos al Santísimo, una noche de adoración con Pablo Martínez. Sábado 19 de diciembre de 2026 · 19:00 h · Lugar a confirmar. Entrada gratuita.',
    url: new URL('/', window.location.href).href,
  })

  async function share() {
    setStatus('')
    const data = invitation()
    if (navigator.share) {
      try { await navigator.share(data) }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('No se pudo abrir la invitación. Podés usar «Copiar enlace».')
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${data.text}\n${data.url}`)}`, '_blank', 'noopener,noreferrer')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation().url)
      setStatus('Enlace copiado. Ya podés compartirlo.')
    } catch { setStatus('No se pudo copiar. Podés copiar la dirección desde tu navegador.') }
  }

  return <div>
    <div className={styles.shareActions}>
      <button className={styles.shareButton} onClick={share}><Share2 size={16} aria-hidden="true" />Compartir invitación</button>
      <button className={styles.copyButton} onClick={copy}><Copy size={15} aria-hidden="true" />Copiar enlace</button>
    </div>
    <p className={styles.status} role="status">{status}</p>
  </div>
}
