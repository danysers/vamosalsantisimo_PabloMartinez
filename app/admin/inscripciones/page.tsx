import { randomUUID } from 'node:crypto'
import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { user as authUser } from '../../../lib/auth-schema'
import { getDb } from '../../../lib/db'
import { adminUsers } from '../../../lib/schema'
import AdminWorkspace from '../admin-workspace'
import RegistrationDeleteAction from './registration-delete-action'
import '../admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Inscripciones del taller', robots: { index: false, follow: false } }

const registrationStatuses = ['all', 'pending', 'waiting', 'confirmed', 'review', 'cancelled'] as const
const paymentStatuses = ['all', 'created', 'pending', 'approved', 'review', 'rejected', 'cancelled', 'refunded', 'partially_refunded', 'charged_back', 'none'] as const
const statusNames: Record<string, string> = {
  pending: 'Registrada', waiting: 'En espera', confirmed: 'Confirmada', review: 'En revisión', cancelled: 'Cancelada',
  created: 'Iniciado', approved: 'Pagado', rejected: 'Rechazado', refunded: 'Reintegrado', partially_refunded: 'Reintegro parcial',
  charged_back: 'Revertido', none: 'Sin intento',
}
const sourceNames: Record<string, string> = {
  mercado_pago: 'Mercado Pago', bank_transfer: 'Transferencia', on_site: 'En el taller', manual: 'Manual',
}
type Row = { reference: string; name: string; email: string; document_number: string | null; registration_status: string;
  created_at: Date | string; payment_status: string | null; payment_source: string | null; amount_minor: number | null;
  member_count: number | null; historical: boolean; deleted_at: Date | string | null; archived_at: Date | string | null }

function label(value: string) { return statusNames[value] ?? value }
function linkFor(page: number, q: string, status: string, payment: string, deleted: boolean, archived: boolean) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (status !== 'all') params.set('estado', status)
  if (payment !== 'all') params.set('pago', payment)
  if (page > 1) params.set('pagina', String(page))
  if (deleted) params.set('eliminadas', '1')
  else if (archived) params.set('archivadas', '1')
  return `/admin/inscripciones${params.size ? `?${params}` : ''}`
}

export default async function RegistrationsPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; estado?: string | string[]; pago?: string | string[]; pagina?: string | string[]; eliminadas?: string; archivadas?: string }>
}) {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  const requestHeaders = await headers()
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_SECRET || !process.env.WORKSHOP_EVENT_SLUG) notFound()
  let role: 'configuration' | 'registration_operator' | 'admission_operator'
  try {
    const { auth } = await import('../../../lib/auth')
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session) redirect('/admin')
    const [operator] = await getDb().select({ role: adminUsers.role, disabled: adminUsers.disabled,
      authRole: authUser.role, banned: authUser.banned }).from(adminUsers)
      .innerJoin(authUser, eq(adminUsers.authUserId, authUser.id))
      .where(eq(authUser.id, session.user.id)).limit(1)
    if (!operator || operator.disabled || operator.banned || operator.authRole !== 'admin') notFound()
    role = operator.role
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    const correlationId = randomUUID()
    console.error(JSON.stringify({ event: 'admin_registrations_auth_failed', correlationId }))
    return <main className="admin-login-page"><section className="admin-login-card"><h1>Panel no disponible</h1><p>Revisá la conexión con la base de datos.</p></section></main>
  }

  const params = await searchParams
  const deleted = params.eliminadas === '1'
  const archived = !deleted && params.archivadas === '1'
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 80) : ''
  const status = typeof params.estado === 'string' && registrationStatuses.includes(params.estado as typeof registrationStatuses[number]) ? params.estado : 'all'
  const payment = typeof params.pago === 'string' && paymentStatuses.includes(params.pago as typeof paymentStatuses[number]) ? params.pago : 'all'
  const requestedPage = typeof params.pagina === 'string' && /^\d{1,5}$/.test(params.pagina) ? Number(params.pagina) : 1
  const page = Math.max(1, Math.min(10000, requestedPage))
  const like = `%${q}%`
  const criteria = sql`e.slug = ${process.env.WORKSHOP_EVENT_SLUG}
    AND (${deleted} = (r.deleted_at IS NOT NULL))
    AND (${deleted} OR ${archived} = (r.archived_at IS NOT NULL))
    AND (${q === ''} OR r.reference ILIKE ${like} OR r.name ILIKE ${like} OR r.email ILIKE ${like} OR i.document_number ILIKE ${like})
    AND (${status === 'all'} OR r.status::text = ${status})
    AND (${payment === 'all'} OR COALESCE(p.status::text, 'none') = ${payment})`
  let rows: Row[] = []
  let total = 0
  let currentPage = page
  try {
    const db = getDb()
    const from = sql`FROM registrations r
      JOIN workshops w ON w.id = r.workshop_id JOIN events e ON e.id = w.event_id
      LEFT JOIN registration_intakes i ON i.registration_id = r.id
      LEFT JOIN LATERAL (SELECT attempt.status, attempt.source,
        COALESCE(allocation.due_amount_minor, attempt.amount_minor) AS amount_minor,
        (SELECT count(*)::integer FROM payment_allocations member WHERE member.attempt_id = attempt.id) AS member_count
        FROM payment_attempts attempt
        LEFT JOIN payment_allocations allocation ON allocation.attempt_id = attempt.id AND allocation.registration_id = r.id
        WHERE allocation.id IS NOT NULL OR (attempt.registration_id = r.id
          AND NOT EXISTS (SELECT 1 FROM payment_allocations other WHERE other.attempt_id = attempt.id))
        ORDER BY attempt.created_at DESC, attempt.id DESC LIMIT 1) p ON TRUE`
    const counts = await db.execute(sql`SELECT COUNT(*)::integer AS total ${from} WHERE ${criteria}`)
    total = Number(counts.rows[0]?.total ?? 0)
    currentPage = Math.min(page, Math.max(1, Math.ceil(total / 25)))
    const result = await db.execute(sql`SELECT r.reference, r.name, r.email, i.document_number, r.deleted_at, r.archived_at, NOT registration_is_live(r.id) AS historical,
      r.status AS registration_status, r.created_at, p.status AS payment_status,
      p.source AS payment_source, p.amount_minor, p.member_count ${from} WHERE ${criteria}
      ORDER BY r.created_at DESC, r.id DESC LIMIT 25 OFFSET ${(currentPage - 1) * 25}`)
    rows = result.rows as Row[]
  } catch {
    const correlationId = randomUUID()
    console.error(JSON.stringify({ event: 'admin_registrations_query_failed', correlationId }))
    return <AdminWorkspace title="Inscripciones" description="Consulta de personas registradas en el taller."
      section="registrations" role={role} canManageWorkshop={role !== 'admission_operator'}>
      <p className="admin-operator-notice" role="alert">No pudimos cargar las inscripciones. Reintentá en unos instantes.</p>
    </AdminWorkspace>
  }
  const pages = Math.max(1, Math.ceil(total / 25))
  return <AdminWorkspace title="Inscripciones" description="Buscá personas, revisá estados y abrí su acreditación."
    section="registrations" role={role} canManageWorkshop={role !== 'admission_operator'}>
    <nav className="admin-section-tabs" aria-label="Inscripciones visibles">
      <Link href="/admin/inscripciones" aria-current={!deleted && !archived ? 'page' : undefined}>Inscripciones</Link>
      <Link href="/admin/inscripciones?archivadas=1" aria-current={archived ? 'page' : undefined}>Archivadas</Link>
      <Link href="/admin/inscripciones?eliminadas=1" aria-current={deleted ? 'page' : undefined}>Eliminadas</Link>
    </nav>
    <form className="admin-filters" method="get" action="/admin/inscripciones">
      {deleted && <input type="hidden" name="eliminadas" value="1" />}
      {archived && <input type="hidden" name="archivadas" value="1" />}
      <label>Buscar por nombre, referencia, correo o D.N.I<input type="search" name="q" defaultValue={q} maxLength={80} placeholder="Nombre, referencia o D.N.I" /></label>
      <label>Inscripción<select name="estado" defaultValue={status}><option value="all">Todos los estados</option>
        {registrationStatuses.filter(value => value !== 'all').map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Pago<select name="pago" defaultValue={payment}><option value="all">Todos los pagos</option>
        {paymentStatuses.filter(value => value !== 'all').map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <button className="button button-gold" type="submit">Aplicar filtros</button>
    </form>
    <section className="admin-card" aria-label="Resultados de inscripciones"><div className="admin-card-heading"><div><p className="admin-card-eyebrow">Base del taller</p><h2>{total} {archived ? (total === 1 ? 'registro archivado' : 'registros archivados') : deleted ? (total === 1 ? 'registro eliminado' : 'registros eliminados') : total === 1 ? 'inscripción' : 'inscripciones'}</h2></div><span>25 por página</span></div>
      {rows.length ? <div className="admin-table-wrap"><table className="admin-table admin-registration-table"><thead><tr><th>Persona</th><th>D.N.I</th><th>Inscripción</th><th>Pago</th><th>Importe</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.reference}><td><strong>{row.name}</strong><small>{row.email}</small>{row.historical && <small>Ensayo anterior · conservado para consulta</small>}</td><td>{row.document_number ?? '—'}</td>
          <td><span className={`admin-status admin-status-${row.deleted_at ? 'cancelled' : row.archived_at ? 'archived' : row.registration_status}`}>{row.deleted_at ? 'Eliminada' : row.archived_at ? 'Archivada' : label(row.registration_status)}</span></td>
          <td><span className={`admin-status admin-status-${row.payment_status ?? 'none'}`}>{label(row.payment_status ?? 'none')}</span><small>{row.payment_source ? `${sourceNames[row.payment_source] ?? row.payment_source}${Number(row.member_count) > 1 ? ' · Grupo' : ''}` : ''}</small></td>
          <td>{row.amount_minor == null ? 'A definir' : (row.amount_minor / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
          <td><time dateTime={new Date(row.created_at).toISOString()}>{new Date(row.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</time></td>
          <td>{!deleted && !archived && <Link href={`/admin/acreditacion?reference=${encodeURIComponent(row.reference)}`}>Revisar →</Link>}
            {role !== 'admission_operator' && <RegistrationDeleteAction reference={row.reference} name={row.name} deleted={!!row.deleted_at} archived={!!row.archived_at} />}
            <small>{row.reference}</small></td></tr>)}</tbody></table></div>
        : <p className="admin-empty">No se encontraron inscripciones con esos filtros.</p>}
      <nav className="admin-pagination" aria-label="Páginas de inscripciones"><span>Página {currentPage} de {pages}</span>
        {currentPage > 1 && <Link href={linkFor(currentPage - 1, q, status, payment, deleted, archived)}>← Anterior</Link>}
        {currentPage < pages && <Link href={linkFor(currentPage + 1, q, status, payment, deleted, archived)}>Siguiente →</Link>}
      </nav>
    </section>
  </AdminWorkspace>
}
