import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { getDb } from './db'

type Db = ReturnType<typeof getDb>
const common = { reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), version: z.string().regex(/^[a-f0-9]{32}$/) }
export const accreditationEmailAction = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('recipient'),
    alternateEmail: z.union([z.literal(''), z.string().trim().pipe(z.email().max(254))]).transform(value => value.toLowerCase()),
    reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ ...common, action: z.literal('resend'), requestId: z.uuid(), confirmRecipient: z.literal(true) }).strict(),
])

export async function manageAccreditationEmail(db: Db, eventSlug: string, operatorId: string, data: unknown) {
  const parsed = accreditationEmailAction.safeParse(data)
  if (!parsed.success) return { code: 400, body: { error: 'Revisá el correo, el motivo y la confirmación del destinatario.' } }
  const input = parsed.data
  return db.transaction(async tx => {
    const workshop = await tx.execute(sql`SELECT w.id FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=${eventSlug} FOR UPDATE OF w`)
    if (!workshop.rows[0]) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    const found = await tx.execute(sql`SELECT r.id,r.email,r.accreditation_email,r.status,registration_is_current(r.id) AS current,
      md5(r.updated_at::text || '|' || COALESCE(i.updated_at::text,'')) AS version
      FROM registrations r LEFT JOIN registration_intakes i ON i.registration_id=r.id
      WHERE r.reference=${input.reference} AND r.workshop_id=${String(workshop.rows[0].id)} FOR UPDATE OF r`)
    const row = found.rows[0]
    if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    if (!row.current) return { code: 409, body: { error: 'La inscripción no está vigente.' } }
    const id = String(row.id)
    const dedupe = input.action === 'resend' ? `accreditation-resend:${id}:${input.requestId}` : ''
    if (dedupe) {
      const previous = await tx.execute(sql`SELECT id FROM email_outbox WHERE dedupe_key=${dedupe} AND registration_id=${id}`)
      if (previous.rows.length) return { code: 200, body: { ok: true, alreadyQueued: true } }
    }
    if (row.version !== input.version) return { code: 409, body: { error: 'La ficha cambió. Recargala antes de continuar.', conflict: true } }
    if (input.action === 'recipient') {
      const jobs = await tx.execute(sql`SELECT status FROM email_outbox WHERE registration_id=${id} AND kind='accreditation_ready'
        AND manual_resend AND status IN ('queued','failed','sending') FOR UPDATE`)
      if (jobs.rows.some(job => job.status === 'sending')) return { code: 409, body: { error: 'Hay una acreditación en envío. Esperá antes de cambiar el destino.' } }
      await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error_code='accreditation_recipient_corrected'
        WHERE registration_id=${id} AND kind='accreditation_ready' AND manual_resend AND status IN ('queued','failed')`)
      await tx.execute(sql`UPDATE registrations SET accreditation_email=${input.alternateEmail || null},updated_at=now() WHERE id=${id}`)
      await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes)
        VALUES(${operatorId},'accreditation.email_recipient_updated',${id},${input.reason},${JSON.stringify({ alternateConfigured: !!input.alternateEmail })}::jsonb)`)
      return { code: 200, body: { ok: true } }
    }
    const credential = await tx.execute(sql`SELECT c.id FROM accreditation_credentials c WHERE c.registration_id=${id}
      AND c.revoked_at IS NULL AND c.expires_at>now() AND ${String(row.status)}='confirmed'
      AND (registration_has_approved_payment(${id}) OR EXISTS(SELECT 1 FROM assistance_requests WHERE registration_id=${id} AND status='approved')
        OR EXISTS(SELECT 1 FROM fee_waivers WHERE registration_id=${id} AND revoked_at IS NULL))
      ORDER BY c.version DESC LIMIT 1`)
    if (!credential.rows[0]) return { code: 409, body: { error: 'No hay una acreditación vigente para reenviar. Revisá el pago y el QR.' } }
    const pending = await tx.execute(sql`SELECT 1 FROM email_outbox WHERE registration_id=${id} AND kind='accreditation_ready'
      AND status IN ('queued','sending','failed') AND attempt_count<10 LIMIT 1`)
    if (pending.rows.length) return { code: 409, body: { error: 'Ya hay una acreditación pendiente de envío. Esperá su resultado antes de reenviar.' } }
    const jobId = randomUUID()
    await tx.execute(sql`INSERT INTO email_outbox(id,dedupe_key,kind,to_email,registration_id,credential_id,manual_resend)
      VALUES(${jobId},${dedupe},'accreditation_ready',${String(row.accreditation_email || row.email)},${id},${String(credential.rows[0].id)},true)`)
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes)
      VALUES(${operatorId},'accreditation.email_resent',${id},'Reenvío solicitado desde el panel con destinatario confirmado',
        ${JSON.stringify({ emailId: jobId, credentialId: String(credential.rows[0].id), alternateRecipient: !!row.accreditation_email })}::jsonb)`)
    return { code: 202, body: { ok: true, queued: true } }
  })
}
