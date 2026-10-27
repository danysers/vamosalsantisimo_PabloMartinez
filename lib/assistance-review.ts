import { and, eq, sql } from 'drizzle-orm'
import type { getDb } from './db'
import { issueAccreditationAfterApproval } from './accreditation-workflow'
import { assistanceRequests, auditLog } from './schema'

export type AssistanceDecision = 'approved' | 'declined'

export async function reviewAssistance(db: ReturnType<typeof getDb>, input: {
  registrationId: string
  eventSlug: string
  operatorId: string
  decision: AssistanceDecision
  note: string
}) {
  return db.transaction(async tx => {
    const locked = await tx.execute(sql`
      SELECT a.status FROM assistance_requests a
      JOIN registrations r ON r.id=a.registration_id
      JOIN workshops w ON w.id=r.workshop_id
      JOIN events e ON e.id=w.event_id
      WHERE a.registration_id=${input.registrationId} AND e.slug=${input.eventSlug}
      FOR UPDATE OF a
    `)
    const current = locked.rows[0] as { status: string } | undefined
    if (!current) return { code: 404, body: { error: 'Solicitud no encontrada.' } }
    if (current.status !== 'requested') return { code: 409, body: { error: 'La solicitud ya fue revisada. Actualizá la página.' } }
    const now = new Date()
    await tx.update(assistanceRequests).set({
      status: input.decision,
      reviewedBy: input.operatorId,
      reviewedAt: now,
      decisionNote: input.note || null,
      updatedAt: now,
    }).where(and(eq(assistanceRequests.registrationId, input.registrationId), eq(assistanceRequests.status, 'requested')))
    await tx.insert(auditLog).values({
      actorId: input.operatorId,
      action: `assistance.${input.decision}`,
      subjectId: input.registrationId,
      reason: input.note || null,
      changes: { from: 'requested', to: input.decision },
    })
    if (input.decision === 'approved') {
      const accreditation = await issueAccreditationAfterApproval(tx, {
        registrationId: input.registrationId, eventSlug: input.eventSlug, operatorId: input.operatorId,
      })
      if (accreditation.code !== 201 && accreditation.code !== 200) throw new Error('assistance_accreditation_inconsistent')
    }
    // The database trigger queues exactly one decision email in this transaction.
    return { code: 200, body: { status: input.decision, emailQueued: true, qrQueued: input.decision === 'approved' } }
  })
}
