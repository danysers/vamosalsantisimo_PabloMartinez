import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { user as authUser } from '../../../lib/auth-schema'
import { getDb } from '../../../lib/db'
import { adminUsers } from '../../../lib/schema'
import AccreditationConsole from './accreditation-console'
import '../admin.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Acreditación del taller', robots: { index: false, follow: false } }

async function loadRole(): Promise<'login' | 'denied' | 'unavailable' | 'configuration' | 'registration_operator' | 'admission_operator'> {
  try {
    const { auth } = await import('../../../lib/auth')
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return 'login'
    const db = getDb()
    const [operator] = await db.select({ role: adminUsers.role, disabled: adminUsers.disabled,
      authRole: authUser.role, banned: authUser.banned }).from(adminUsers)
      .innerJoin(authUser, eq(adminUsers.authUserId, authUser.id))
      .where(eq(authUser.id, session.user.id)).limit(1)
    if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin') return 'denied'
    return operator.role
  } catch {
    return 'unavailable'
  }
}

export default async function AccreditationPage() {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  await headers()
  if (!process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) notFound()
  const role = await loadRole()
  if (role === 'login') redirect('/admin')
  if (role === 'denied') notFound()
  if (role === 'unavailable') return <main className="admin-shell"><h1>Panel no disponible</h1><p>Revisá la conexión con la base de datos.</p></main>
  return <main className="admin-shell"><p><a href="/admin">← Volver al panel</a></p><h1>Acreditación del taller</h1>
    <p>Los pagos y excepciones requieren verificación humana. El QR se emite solo al confirmar esa revisión; el ingreso queda registrado con fecha, hora y operador.</p>
    <AccreditationConsole canVerify={role !== 'admission_operator'} scanEnabled={process.env.ADMISSION_SCAN_ENABLED === '1'} />
  </main>
}
