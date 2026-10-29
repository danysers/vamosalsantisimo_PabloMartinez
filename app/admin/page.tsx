import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { user as authUser } from '../../lib/auth-schema'
import { adminUsers, assistanceRequests, events, registrationIntakes, registrations, workshops } from '../../lib/schema'
import { getDb } from '../../lib/db'
import AdminLogin, { SignOut } from './login-form'
import AssistanceReview, { type PendingAssistance } from './assistance-review'
import AdminWorkspace from './admin-workspace'
import './admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Administración local', robots: { index: false, follow: false } }

type AdminState = { kind: 'login' } | { kind: 'denied' } | { kind: 'unavailable' } | {
  kind: 'dashboard'; events: number; registrations: number; confirmed: number; reviewEnabled: boolean;
  role: 'configuration' | 'registration_operator' | 'admission_operator' | 'unlinked';
  recent: Array<{ reference: string; name: string; status: string; createdAt: string; historical: boolean }>;
  requests: PendingAssistance[]
}

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
    const [reviewer] = await db.select({ role: adminUsers.role, disabled: adminUsers.disabled })
      .from(adminUsers).where(eq(adminUsers.authUserId, session.user.id)).limit(1)
    const role = reviewer && !reviewer.disabled ? reviewer.role : 'unlinked'
    const reviewEnabled = !!reviewer && !reviewer.disabled &&
      ['configuration', 'registration_operator'].includes(reviewer.role) && !!process.env.WORKSHOP_EVENT_SLUG
    const eventSlug = process.env.WORKSHOP_EVENT_SLUG
    const [registrationCount] = eventSlug
      ? await db.select({ total: count() }).from(registrations)
        .innerJoin(workshops, eq(workshops.id, registrations.workshopId))
        .innerJoin(events, eq(events.id, workshops.eventId)).where(eq(events.slug, eventSlug))
      : [{ total: 0 }]
    const [confirmedCount] = eventSlug
      ? await db.select({ total: count() }).from(registrations)
        .innerJoin(workshops, eq(workshops.id, registrations.workshopId))
        .innerJoin(events, eq(events.id, workshops.eventId))
        .where(and(eq(events.slug, eventSlug), eq(registrations.status, 'confirmed'), sql`registration_is_current(${registrations.id})`))
      : [{ total: 0 }]
    const recent = eventSlug && role !== 'unlinked' ? await db.select({ reference: registrations.reference, name: registrations.name,
      status: registrations.status, createdAt: registrations.createdAt, historical: sql<boolean>`NOT registration_is_current(${registrations.id})` }).from(registrations)
      .innerJoin(workshops, eq(workshops.id, registrations.workshopId))
      .innerJoin(events, eq(events.id, workshops.eventId)).where(eq(events.slug, eventSlug))
      .orderBy(desc(registrations.createdAt)).limit(8) : []
    let requests: PendingAssistance[] = []
    if (reviewEnabled) {
      const rows = await db.select({
        registrationId: assistanceRequests.registrationId,
        reference: registrations.reference,
        name: registrations.name,
        email: registrations.email,
        phone: registrations.phone,
        notes: registrationIntakes.paymentDifficultyNotes,
        requestedAt: assistanceRequests.createdAt,
      }).from(assistanceRequests)
        .innerJoin(registrations, eq(registrations.id, assistanceRequests.registrationId))
        .innerJoin(registrationIntakes, eq(registrationIntakes.registrationId, registrations.id))
        .innerJoin(workshops, eq(workshops.id, registrations.workshopId))
        .innerJoin(events, eq(events.id, workshops.eventId))
        .where(and(eq(assistanceRequests.status, 'requested'), eq(events.slug, process.env.WORKSHOP_EVENT_SLUG!), sql`registration_is_current(${registrations.id})`))
        .orderBy(asc(assistanceRequests.createdAt)).limit(50)
      requests = rows.map(row => ({ ...row, requestedAt: row.requestedAt.toISOString() }))
    }
    return { kind: 'dashboard', events: eventCount.total, registrations: registrationCount.total,
      confirmed: confirmedCount.total, role, reviewEnabled, requests,
      recent: recent.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) }
  } catch {
    console.error(JSON.stringify({ event: 'admin_page_error', kind: 'configuration_or_database', correlationId }))
    return { kind: 'unavailable' }
  }
}

export default async function AdminPage() {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  await headers() // Keep the page request-bound; no static or shared user data.
  const correlationId = randomUUID()
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || !process.env.BETTER_AUTH_URL) {
    console.info(JSON.stringify({ event: 'admin_page_access', state: 'unconfigured', correlationId }))
    return <main className="admin-login-page"><section className="admin-login-card"><h1>Administración local no configurada</h1><p>Configurá la base, el secreto de sesión y el primer administrador mediante el procedimiento local. Nunca hay contraseña predeterminada.</p></section></main>
  }
  const state = await loadAdminState(correlationId)
  console.info(JSON.stringify({ event: 'admin_page_access', state: state.kind, correlationId }))
  if (state.kind === 'unavailable') return <main className="admin-login-page"><section className="admin-login-card"><h1>Panel no disponible</h1><p>Revisá la configuración local; no se mostraron datos privados.</p></section></main>
  if (state.kind === 'login') return <main className="admin-login-page"><section className="admin-login-card"><span className="admin-monogram" aria-hidden="true">VAS</span><p className="admin-kicker">Vamos al Santísimo · Taller 2026</p><h1>Acceso privado</h1><p>Ingresá con tu cuenta autorizada para administrar el taller.</p><AdminLogin /></section></main>
  if (state.kind === 'denied') return <main className="admin-login-page"><section className="admin-login-card"><h1>Acceso no autorizado</h1><p>Tu cuenta no tiene permiso para administrar el taller.</p><SignOut /></section></main>
  return (
    <AdminWorkspace title="Resumen" description="Seguimiento del taller y acceso a las tareas de la organización."
      section="overview" role={state.role} canManageWorkshop={state.reviewEnabled}>
      <dl className="admin-counts">
        <div><dt>Inscripciones</dt><dd>{state.registrations}</dd><small>Incluye el histórico conservado</small></div>
        <div><dt>Confirmadas</dt><dd>{state.confirmed}</dd><small>Con acreditación aprobada</small></div>
        <div><dt>Ayudas pendientes</dt><dd>{state.reviewEnabled ? state.requests.length : '—'}</dd><small>Esperando revisión</small></div>
        <div><dt>Eventos</dt><dd>{state.events}</dd><small>En la organización</small></div>
      </dl>
      {state.role !== 'unlinked' && <div className="admin-dashboard-grid">
        <section className="admin-card"><div className="admin-card-heading"><div><p className="admin-card-eyebrow">Actividad reciente</p><h2>Últimas inscripciones</h2></div><a href="/admin/inscripciones">Ver todas →</a></div>
          {state.recent.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Persona</th><th>Referencia</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>
            {state.recent.map(item => <tr key={item.reference}><td>{item.name}{item.historical && <small>Ensayo anterior</small>}</td><td><a href={`/admin/acreditacion?reference=${encodeURIComponent(item.reference)}`}>{item.reference}</a></td>
              <td>{new Date(item.createdAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</td><td><span className={`admin-status admin-status-${item.status}`}>{item.status === 'confirmed' ? 'Confirmada' : item.status === 'pending' ? 'Registrada' : item.status}</span></td></tr>)}</tbody></table></div>
            : <p className="admin-empty">Aún no hay inscripciones para este taller.</p>}
        </section>
        <section className="admin-card admin-shortcuts"><p className="admin-card-eyebrow">Atajos</p><h2>Qué necesitás hacer</h2>
          <a href="/admin/inscripciones"><strong>Buscar inscripciones</strong><span>Consultar personas y estados →</span></a>
          <a href="/admin/acreditacion"><strong>Revisar pagos e ingresos</strong><span>Comprobantes, QR y control →</span></a>
          {state.reviewEnabled && <a href="/admin/taller"><strong>Administrar el taller</strong><span>Lotes, promociones y grupos →</span></a>}
        </section>
      </div>}
      {state.reviewEnabled ? <AssistanceReview requests={state.requests} /> : state.role === 'unlinked' &&
        <p className="admin-operator-notice">La cuenta necesita un rol operativo para revisar solicitudes y administrar inscripciones.</p>}
    </AdminWorkspace>
  )
}
