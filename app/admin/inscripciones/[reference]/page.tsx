import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../lib/db'
import { adminUsers } from '../../../../lib/schema'
import { user as authUser } from '../../../../lib/auth-schema'
import { readAdminRegistration } from '../../../../lib/registration-admin'
import AdminWorkspace from '../../admin-workspace'
import RegistrationEditor from '../registration-editor'
import '../../admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ficha de inscripción', robots: { index: false, follow: false } }

export default async function RegistrationPage({ params, searchParams }: {
  params: Promise<{ reference: string }>; searchParams: Promise<{ editar?: string | string[] }>
}) {
  if (process.env.APP_SURFACE !== 'panel' || !process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_SECRET) notFound()
  const { reference } = await params
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(reference)) notFound()
  let role: 'configuration' | 'registration_operator'
  try {
    const { auth } = await import('../../../../lib/auth')
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect('/admin')
    const [operator] = await getDb().select({ role: adminUsers.role, disabled: adminUsers.disabled, authRole: authUser.role, banned: authUser.banned })
      .from(adminUsers).innerJoin(authUser, eq(adminUsers.authUserId, authUser.id)).where(eq(authUser.id, session.user.id)).limit(1)
    if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin' || operator.role === 'admission_operator') notFound()
    role = operator.role
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    console.error(JSON.stringify({ event: 'admin_registration_page_auth_failed', correlation: randomUUID() }))
    return <main className="admin-login-page"><section className="admin-login-card"><h1>Panel no disponible</h1><p>Reintentá en unos instantes.</p></section></main>
  }
  let registration
  try { registration = await readAdminRegistration(getDb(), process.env.WORKSHOP_EVENT_SLUG || '', reference) }
  catch {
    console.error(JSON.stringify({ event: 'admin_registration_page_unavailable', correlation: randomUUID() }))
    return <AdminWorkspace title="Ficha de inscripción" description="Datos de la persona registrada." section="registrations" role={role} canManageWorkshop>
      <p role="alert">No pudimos cargar la ficha. Reintentá en unos instantes.</p><Link href="/admin/inscripciones">Volver a inscripciones</Link>
    </AdminWorkspace>
  }
  if (!registration) notFound()
  return <AdminWorkspace title={registration.name} description="Ficha completa de la inscripción. Podés corregir los datos personales y gestionar el estado, el pago y la acreditación."
    section="registrations" role={role} canManageWorkshop>
    <RegistrationEditor initial={registration} canAdminister={role === 'configuration'} startEditing={(await searchParams).editar === '1'} />
  </AdminWorkspace>
}
