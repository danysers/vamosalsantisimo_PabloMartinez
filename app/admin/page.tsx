import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { count, eq } from 'drizzle-orm'
import { user as authUser } from '../../lib/auth-schema'
import { events, registrations } from '../../lib/schema'
import { getDb } from '../../lib/db'
import AdminLogin, { SignOut } from './login-form'
import './admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Administración local', robots: { index: false, follow: false } }

type AdminState = { kind: 'login' } | { kind: 'denied' } | { kind: 'unavailable' } | { kind: 'dashboard'; events: number; registrations: number }

async function loadAdminState(correlationId: string): Promise<AdminState> {
  try {
    const { auth } = await import('../../lib/auth')
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return { kind: 'login' }
    const db = getDb()
    const [operator] = await db.select({ role: authUser.role, banned: authUser.banned })
      .from(authUser).where(eq(authUser.id, session.user.id)).limit(1)
    if (!operator || operator.role !== 'admin' || operator.banned) return { kind: 'denied' }
    const [eventCount] = await db.select({ total: count() }).from(events)
    const [registrationCount] = await db.select({ total: count() }).from(registrations)
    return { kind: 'dashboard', events: eventCount.total, registrations: registrationCount.total }
  } catch {
    console.error(JSON.stringify({ event: 'admin_page_error', kind: 'configuration_or_database', correlationId }))
    return { kind: 'unavailable' }
  }
}

export default async function AdminPage() {
  await headers() // Keep the page request-bound; no static or shared user data.
  const correlationId = randomUUID()
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || !process.env.BETTER_AUTH_URL) {
    console.info(JSON.stringify({ event: 'admin_page_access', state: 'unconfigured', correlationId }))
    return <main className="admin-shell"><h1>Administración local no configurada</h1><p>La página pública funciona sin base ni usuario. Configurá la base, el secreto de sesión y el primer administrador mediante el procedimiento local; nunca hay contraseña predeterminada.</p></main>
  }
  const state = await loadAdminState(correlationId)
  console.info(JSON.stringify({ event: 'admin_page_access', state: state.kind, correlationId }))
  if (state.kind === 'unavailable') return <main className="admin-shell"><h1>Administración local no disponible</h1><p>Revisá la configuración local; no se mostraron datos privados.</p></main>
  if (state.kind === 'login') return <main className="admin-shell"><h1>Acceso privado</h1><p>Solo personas autorizadas por la organización.</p><AdminLogin /></main>
  if (state.kind === 'denied') return <main className="admin-shell"><h1>Acceso no autorizado</h1><p>Tu cuenta no tiene permiso para administrar el taller.</p><SignOut /></main>
  return (
    <main className="admin-shell">
      <h1>Administración local</h1>
      <p>Vista privada de diagnóstico. Editar datos y validar pagos manuales todavía no está habilitado.</p>
      <dl className="admin-counts"><div><dt>Eventos registrados</dt><dd>{state.events}</dd></div><div><dt>Inscripciones guardadas</dt><dd>{state.registrations}</dd></div></dl>
      <SignOut />
    </main>
  )
}
