import type { Metadata } from 'next'
import './not-found.css'

export const metadata: Metadata = { title: 'Página no encontrada · Vamos al Santísimo', robots: { index: false, follow: false } }
export default function GlobalNotFound() {
  return <html lang="es-AR"><body className="vas-not-found"><main>
    <h1 className="vas-not-found-title">404 · Página no encontrada</h1>
    {/* Plain static image: no server image transformation or client scripts. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/404/vamos-al-santisimo-20261030.webp" width="800" height="1000" alt="Vamos al Santísimo · 404 · Página no encontrada" decoding="async" />
    <nav aria-label="Volver al sitio"><a href="/">Volver al inicio</a><a href="/formacion">Ir al taller</a></nav>
  </main></body></html>
}
