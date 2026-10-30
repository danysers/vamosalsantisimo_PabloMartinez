import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import { authorizeOperator } from '../../../lib/admin-api'
import { readIncidents } from '../../../lib/operational-incidents'
import { incidentLabels, type IncidentInput } from '../../../lib/incident-policy'
import AdminWorkspace from '../admin-workspace'
import '../admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Errores e incidencias', robots: { index: false, follow: false } }
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  if (process.env.APP_SURFACE !== 'panel') notFound()
  const access = await authorizeOperator(new NextRequest(new URL('/admin/incidencias', process.env.BETTER_AUTH_URL || 'http://localhost'), { headers: await headers() }), ['configuration', 'registration_operator'], false)
  if ('response' in access) { if (access.response.status === 401) redirect('/admin'); notFound() }
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.slice(0, 80) : ''
  const page = Math.min(100, Math.max(1, Number(params.pagina) || 1)) | 0
  const result = await readIncidents(access.eventSlug, query, page)
  const link = (next: number) => `/admin/incidencias?${new URLSearchParams({ q: query, pagina: String(next) })}`
  return <AdminWorkspace title="Errores e incidencias" description="Consultá los problemas de la página y los envíos de comprobantes." section="incidents" role={access.role} canManageWorkshop={access.role === 'configuration'}>
    <p>Se conservan hasta 5.000 eventos de los últimos 30 días. Los reportes del navegador indican lo que pudo observar ese dispositivo; no prueban por sí solos la causa del fallo. Si no hay conexión o la base está caída, el registro puede demorar o no llegar.</p>
    <form className="admin-filters" action="/admin/incidencias"><label>Gestión o código de seguimiento<input name="q" defaultValue={query} maxLength={80} placeholder="Referencia o código completo" /></label><button type="submit">Buscar / actualizar</button><Link href="/admin/incidencias">Ver todos</Link></form>
    <section className="admin-card"><h2>Registro de errores</h2>{result.rows.length ? <div className="admin-table-wrap" role="region" aria-label="Registro de incidencias" tabIndex={0}><table className="admin-table"><thead><tr><th>Fecha</th><th>Origen / operación</th><th>Problema</th><th>Gestión</th><th>Detalle técnico limitado</th></tr></thead><tbody>
      {result.rows.map((row, index) => { const details = (row.details || {}) as Partial<IncidentInput>; return <tr key={`${row.correlation_id}-${row.source}-${row.code}-${index}`}>
        <td>{new Date(String(row.created_at)).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })}</td>
        <td>{row.source === 'server' ? 'Servidor' : 'Reporte del navegador'}<small>{String(row.operation)}</small></td>
        <td><strong>{String(row.code)}</strong><small>{incidentLabels[row.code as IncidentInput['code']] || 'Operación no completada.'}</small><small>Seguimiento: {String(row.correlation_id)}</small></td>
        <td>{row.reference ? <Link href={`/admin/inscripciones/${encodeURIComponent(String(row.reference))}`}>{String(row.reference)}</Link> : 'Sin gestión verificada'}</td>
        <td>{details.httpStatus ? `HTTP ${details.httpStatus}` : 'Sin respuesta HTTP registrada'}{details.fileSize !== undefined && <small>Archivo: {(details.fileSize / 1024).toFixed(0)} KB · {details.fileType || 'tipo no informado'}</small>}{details.outcome && <small>Consulta posterior: {({ saved: 'ya había un comprobante guardado', missing: 'sin comprobante guardado', unavailable: 'no se pudo consultar', unknown: 'sin verificar' })[details.outcome]}</small>}{details.online !== undefined && <small>Conexión declarada por el navegador: {details.online ? 'disponible' : 'sin conexión'}</small>}</td>
      </tr> })}
    </tbody></table></div> : <p>No hay incidencias para esta consulta.</p>}</section>
    <nav aria-label="Páginas de incidencias">{page > 1 && <Link href={link(page - 1)}>← Anterior</Link>} <span>Página {page}</span> {result.hasNext && <Link href={link(page + 1)}>Siguiente →</Link>}</nav>
  </AdminWorkspace>
}
