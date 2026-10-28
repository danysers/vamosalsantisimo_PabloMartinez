import { redirect } from 'next/navigation'

export const metadata = { title: 'Inscripción al taller', robots: { index: false, follow: false } }

export default function Inscripcion() {
  redirect('/formacion/inscripcion')
}
