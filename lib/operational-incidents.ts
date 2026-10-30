import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb } from './db'
import { hasCheckoutAccess } from './checkout-access'
import { hasEmailLink } from './email-link-token'
import { incidentSchema, type IncidentInput } from './incident-policy'

export function incidentId(request: { headers: Headers }) {
  const id = request.headers.get('x-vas-request-id') || ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : randomUUID()
}
export type IncidentAccess = { reference: string; token: string; purpose?: 'proof' | 'pass' }
async function authorizedRegistration(access: IncidentAccess | undefined, db: Pick<ReturnType<typeof getDb>, 'execute'>) {
  if (!access || !process.env.WORKSHOP_CHECKOUT_TOKEN_KEY) return null
  const result = await db.execute(sql`SELECT r.id,r.reference,r.creation_key,r.email,r.accreditation_email,
    (SELECT id FROM accreditation_credentials c WHERE c.registration_id=r.id AND c.revoked_at IS NULL AND c.expires_at>now() ORDER BY version DESC LIMIT 1) AS credential_id
    FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    WHERE r.reference=${access.reference} AND e.slug=${process.env.WORKSHOP_EVENT_SLUG || ''} AND registration_is_current(r.id) LIMIT 1`)
  const row = result.rows[0]
  if (!row) return null
  const allowed = access.purpose ? hasEmailLink(access.token, access.purpose, { id: String(row.id), reference: String(row.reference),
    creationKey: String(row.creation_key), email: access.purpose === 'pass' ? `${row.email}|${row.accreditation_email || ''}` : String(row.email),
    ...(access.purpose === 'pass' ? { credentialId: String(row.credential_id || '') } : {}) })
    : hasCheckoutAccess(access.token, String(row.id), String(row.creation_key))
  return allowed ? String(row.id) : null
}
// Strict allowlists only: no message/stack, URL, filename, IP, browser string,
// form fields, email, token or uploaded bytes can enter the incident table.
export async function recordIncident(input: IncidentInput, source: 'client' | 'server', access?: IncidentAccess) {
  const parsed = incidentSchema.safeParse(input)
  if (!parsed.success || !process.env.WORKSHOP_EVENT_SLUG) return false
  const event = parsed.data
  try {
    return await getDb().transaction(async tx => {
      await tx.execute(sql`SET LOCAL statement_timeout='1500ms'`)
      const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(2026, 1030) AS acquired`)
      if (!lock.rows[0]?.acquired) return false
      const rate = await tx.execute(sql`INSERT INTO rate_limits(key,count,window_end) VALUES (${`operational-incidents:${process.env.WORKSHOP_EVENT_SLUG}`},1,now()+interval '1 minute')
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_end<=now() THEN 1 ELSE LEAST(rate_limits.count+1,121) END,
        window_end=CASE WHEN rate_limits.window_end<=now() THEN now()+interval '1 minute' ELSE rate_limits.window_end END RETURNING count`)
      if (Number(rate.rows[0]?.count) > 120) return false
      // Serialize the bounded store; old entries cannot grow without limit.
      await tx.execute(sql`DELETE FROM operational_incidents WHERE created_at<now()-interval '30 days' OR id IN
        (SELECT id FROM operational_incidents ORDER BY created_at DESC,id DESC OFFSET 4999)`)
      const registrationId = await authorizedRegistration(access, tx)
      await tx.execute(sql`INSERT INTO operational_incidents(event_slug,correlation_id,source,operation,code,registration_id,details)
        VALUES(${process.env.WORKSHOP_EVENT_SLUG},${event.correlationId}::uuid,${source},${event.operation},${event.code},${registrationId}::uuid,
          ${JSON.stringify({ page: event.page, httpStatus: event.httpStatus, fileSize: event.fileSize, fileType: event.fileType, online: event.online, outcome: event.outcome })}::jsonb)
        ON CONFLICT(source,correlation_id,code) DO NOTHING`)
      return true
    })
  } catch {
    console.error(JSON.stringify({ kind: 'incident_store_unavailable', correlationId: event.correlationId, operation: event.operation, code: event.code }))
    return false
  }
}
export async function observePublicRequest(request: { headers: Headers }, operation: IncidentInput['operation'], handler: () => Promise<Response>) {
  const correlationId = incidentId(request)
  let response: Response
  try { response = await handler() }
  catch { response = Response.json({ error: 'No pudimos completar la operación. Intentá nuevamente.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }) }
  response.headers.set('X-VAS-Request-ID', correlationId)
  if (response.status >= 400) await recordIncident({ correlationId, operation, httpStatus: response.status,
    code: response.status >= 500 ? 'server_unavailable' : operation === 'proof_upload' ? 'upload_rejected'
      : operation === 'email_link' ? 'link_unavailable' : 'invalid_request' }, 'server')
  return response
}
export async function readIncidents(eventSlug: string, query = '', page = 1) {
  const filter = query.trim().slice(0, 80)
  const result = await getDb().execute(sql`SELECT i.correlation_id,i.source,i.operation,i.code,i.details,i.created_at,r.reference
    FROM operational_incidents i LEFT JOIN registrations r ON r.id=i.registration_id
    WHERE i.event_slug=${eventSlug} AND i.created_at>=now()-interval '30 days'
      AND (${filter}='' OR i.correlation_id::text=${filter} OR r.reference=${filter})
    ORDER BY i.created_at DESC,i.id DESC LIMIT 51 OFFSET ${(page - 1) * 50}`)
  return { rows: result.rows.slice(0, 50), hasNext: result.rows.length > 50 }
}
