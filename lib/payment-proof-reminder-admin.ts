import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { getDb } from './db'
import { workshopEmailUrl } from './email-link-token'

type Db = ReturnType<typeof getDb>
const common = { reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/), version: z.string().regex(/^[a-f0-9]{32}$/) }
const actionSchema = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('link') }).strict(),
  z.object({ ...common, action: z.literal('resend'), requestId: z.uuid(), confirmRecipient: z.literal(true) }).strict(),
])

export async function managePaymentProofReminder(db: Db, eventSlug: string, operatorId: string, data: unknown) {
  const parsed = actionSchema.safeParse(data)
  if (!parsed.success) return { code: 400, body: { error: 'Revisá la inscripción y confirmá el destinatario.' } }
  const input = parsed.data
  return db.transaction(async tx => {
    const workshop = await tx.execute(sql`SELECT w.id FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=${eventSlug} FOR UPDATE OF w`)
    if (!workshop.rows[0]) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    const found = await tx.execute(sql`SELECT r.id,r.reference,r.creation_key,r.email,r.status,w.starts_at,
      registration_is_current(r.id) AS current,
      md5(r.updated_at::text || '|' || COALESCE(i.updated_at::text,'')) AS version,
      p.id AS attempt_id,p.registration_id AS payer_id,p.source,p.status AS payment_status,
      EXISTS(SELECT 1 FROM payment_proofs proof WHERE proof.payment_attempt_id=p.id) AS proof_submitted,
      registration_has_approved_payment(r.id) AS paid,
      EXISTS(SELECT 1 FROM assistance_requests a WHERE a.registration_id=r.id AND a.status='approved') AS assisted,
      EXISTS(SELECT 1 FROM fee_waivers fw WHERE fw.registration_id=r.id AND fw.revoked_at IS NULL) AS waived
      FROM registrations r JOIN workshops w ON w.id=r.workshop_id
      LEFT JOIN registration_intakes i ON i.registration_id=r.id
      LEFT JOIN LATERAL (SELECT p.* FROM payment_attempts p WHERE p.superseded_by_admin IS NULL
        AND (p.registration_id=r.id OR EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=p.id AND a.registration_id=r.id))
        ORDER BY p.created_at DESC,p.id DESC LIMIT 1) p ON true
      WHERE r.reference=${input.reference} AND r.workshop_id=${String(workshop.rows[0].id)} FOR UPDATE OF r`)
    const row = found.rows[0]
    if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    if (!row.current || row.status !== 'pending' || row.source !== 'bank_transfer' || row.payment_status !== 'pending' ||
      row.payer_id !== row.id || row.proof_submitted || row.paid || row.assisted || row.waived) {
      return { code: 409, body: { error: 'El enlace sólo está disponible para el pagador con transferencia pendiente y sin comprobante cargado.' } }
    }
    if (row.version !== input.version) return { code: 409, body: { error: 'La ficha cambió. Recargala antes de continuar.', conflict: true } }
    const id = String(row.id)
    if (input.action === 'link') {
      const url = workshopEmailUrl('proof', { id, reference: String(row.reference), creationKey: String(row.creation_key),
        email: String(row.email) }, new Date(new Date(String(row.starts_at)).getTime() + 3 * 86_400_000))
      await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes)
        VALUES(${operatorId},'registration.proof_link_viewed',${id},'Enlace personal consultado desde el panel','{}'::jsonb)`)
      return { code: 200, body: { ok: true, url } }
    }
    const dedupe = `proof-reminder:${id}:${input.requestId}`
    const previous = await tx.execute(sql`SELECT 1 FROM email_outbox WHERE registration_id=${id} AND dedupe_key=${dedupe}`)
    if (previous.rows.length) return { code: 200, body: { ok: true, alreadyQueued: true } }
    const pending = await tx.execute(sql`SELECT 1 FROM email_outbox WHERE registration_id=${id} AND kind='payment_proof_reminder'
      AND status IN ('queued','sending','failed') AND attempt_count<10 LIMIT 1`)
    if (pending.rows.length) return { code: 409, body: { error: 'Ya hay un aviso pendiente de envío. Esperá su resultado antes de reenviar.' } }
    const limits = await tx.execute(sql`SELECT count(*)::int AS total,MAX(created_at)>now()-interval '5 minutes' AS recent
      FROM email_outbox WHERE registration_id=${id} AND kind='payment_proof_reminder' AND created_at>now()-interval '24 hours'`)
    if (limits.rows[0]?.recent || Number(limits.rows[0]?.total) >= 5) {
      return { code: 429, body: { error: 'Esperá cinco minutos entre avisos. Se permiten hasta cinco en 24 horas por inscripción.' } }
    }
    const jobId = randomUUID()
    await tx.execute(sql`INSERT INTO email_outbox(id,dedupe_key,kind,to_email,registration_id,payment_attempt_id)
      VALUES(${jobId},${dedupe},'payment_proof_reminder',${String(row.email)},${id},${String(row.attempt_id)})`)
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes)
      VALUES(${operatorId},'registration.proof_reminder_queued',${id},'Aviso de comprobante faltante solicitado desde el panel',
        ${JSON.stringify({ emailId: jobId, paymentAttemptId: String(row.attempt_id) })}::jsonb)`)
    return { code: 202, body: { ok: true, queued: true } }
  })
}
