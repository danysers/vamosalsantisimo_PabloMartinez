import Link from 'next/link'

export const metadata = { title: 'Inscripción al taller', robots: { index: false, follow: false } }

export default function Inscripcion() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-20">
      <h1 className="text-3xl font-bold">Inscripción al taller</h1>
      <p>El taller de músicos tiene un pequeño costo. La inscripción previa es la opción recomendada, pero también vas a poder anotarte en el lugar el mismo día del taller.</p>
      <p>El formulario y los medios de pago previos todavía no están habilitados. Publicaremos aquí los detalles cuando estén disponibles.</p>
      <Link className="text-yellow-300 underline" href="/">Volver al evento</Link>
    </main>
  )
}
