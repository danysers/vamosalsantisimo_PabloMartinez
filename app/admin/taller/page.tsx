import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { user as authUser } from '../../../lib/auth-schema'
import { getDb } from '../../../lib/db'
import { adminUsers } from '../../../lib/schema'
import WorkshopAdminConsole from './workshop-admin-console'
import '../admin.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Taller: precios e inscripciones grupales', robots: { index: false, follow: false } }

async function role() {
  const { auth } = await import('../../../lib/auth')
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return 'login'
  const [operator] = await getDb().select({ role: adminUsers.role, disabled: adminUsers.disabled,
    authRole: authUser.role, banned: authUser.banned }).from(adminUsers)
    .innerJoin(authUser, eq(adminUsers.authUserId, authUser.id))
    .where(eq(authUser.id, session.user.id)).limit(1)
  if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin') return 'denied'
  return operator.role
}

export default async function WorkshopAdminPage() {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  await headers()
  if (!process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) notFound()
  let access: string
  try { access = await role() } catch { return <main className="admin-shell"><h1>Panel no disponible</h1><p>Revisá la conexión con la base de datos.</p></main> }
  if (access === 'login') redirect('/admin')
  if (access !== 'configuration' && access !== 'registration_operator') notFound()
  return <main className="admin-shell admin-workshop-shell">
    <p><a href="/admin">← Volver al panel</a></p>
    <h1>Precios e inscripciones grupales</h1>
    <p>Los importes se consultan y calculan en PostgreSQL. Las cotizaciones quedan congeladas al crear el intento de pago; editar un lote nunca reescribe cobros anteriores.</p>
    <WorkshopAdminConsole canConfigure={access === 'configuration'} />
  </main>
}
