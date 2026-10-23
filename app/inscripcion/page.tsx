import Link from 'next/link'

export const metadata = { title: 'Inscripciones aún no disponibles', robots: { index: false, follow: false } }

export default function Inscripcion() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-20">
      <h1 className="text-3xl font-bold">Inscripciones aún no disponibles</h1>
      <p>Estamos preparando el taller de músicos de 2026. Por ahora no recibimos inscripciones ni pagos.</p>
      <Link className="text-yellow-300 underline" href="/">Volver al evento</Link>
    </main>
  )
}
