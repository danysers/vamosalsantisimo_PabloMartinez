import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { getDb } from './db'
import { createAccreditationQr, encryptAccreditationQr, hashAccreditationQr } from './accreditation-token'
import { registrationQrReference, verifyRegistrationQr } from './registration-qr'
import {
  accreditationCredentials, admissionScans, auditLog, checkIns, emailOutbox,
  paymentAllocations, paymentAttempts, registrations,
} from './schema'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Result = { code: number; body: Record<string, unknown> }

function qrConfig() {
  const key = process.env.ACCREDITATION_TOKEN_KEY
  const keyId = process.env.ACCREDITATION_TOKEN_KEY_ID
  if (!key || !keyId) throw new Error('accreditation_key_unavailable')
  return { key, keyId }
}

async function issueInTransaction(tx: Tx, registrationId: string, eventSlug: string, operatorId: string | null, notify = true): Promise<Result> {
  const found = await tx.execute(sql`
    SELECT r.id, r.status, r.email, r.reference, r.accreditation_blocked, w.starts_at,
      registration_has_approved_payment(r.id) AS paid,
      a.status AS assistance_status,
      (fw.registration_id IS NOT NULL) AS waived
    FROM registrations r
    JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN assistance_requests a ON a.registration_id=r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
    WHERE r.id=${registrationId} AND e.slug=${eventSlug}
      AND registration_is_current(r.id)
    FOR UPDATE OF r
  `)
  const row = found.rows[0] as {
    id: string; status: string; email: string; reference: string; starts_at: Date;
    paid: boolean; assistance_status: string | null; waived: boolean; accreditation_blocked: boolean
  } | undefined
  if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
  if (row.accreditation_blocked) return { code: 200, body: { blocked: true, emailQueued: false } }
  if (!['pending', 'confirmed'].includes(row.status)) return { code: 409, body: { error: 'La inscripción no está habilitada para acreditarse.' } }
  const reason = row.paid ? 'paid' : row.assistance_status === 'approved' ? 'assistance_approved' : row.waived ? 'waived' : null
  if (!reason) return { code: 409, body: { error: 'Primero debe verificarse el pago o aprobarse la excepción.' } }
  const [existing] = await tx.select({ id: accreditationCredentials.id }).from(accreditationCredentials)
    .where(and(eq(accreditationCredentials.registrationId, registrationId), sql`${accreditationCredentials.revokedAt} IS NULL`)).limit(1)
  if (existing) return { code: 200, body: { credentialId: existing.id, reference: row.reference, emailQueued: false, alreadyIssued: true } }
  const { key, keyId } = qrConfig()
  const versionResult = await tx.execute(sql`SELECT coalesce(max(version),0)::integer AS version FROM accreditation_credentials WHERE registration_id=${registrationId}`)
  const version = Number(versionResult.rows[0]?.version ?? 0) + 1
  const qr = createAccreditationQr()
  const encrypted = encryptAccreditationQr(qr.qrValue, key, registrationId, version)
  if (row.status !== 'confirmed') await tx.update(registrations).set({ status: 'confirmed', updatedAt: new Date() }).where(eq(registrations.id, registrationId))
  const expiresAt = new Date(new Date(row.starts_at).getTime() + 24 * 60 * 60 * 1000)
  if (expiresAt <= new Date()) return { code: 409, body: { error: 'El plazo de acreditación del taller venció.' } }
  const [credential] = await tx.insert(accreditationCredentials).values({
    registrationId, version, tokenHash: qr.tokenHash, ...encrypted,
    encryptionKeyId: keyId, reason, expiresAt,
  }).returning({ id: accreditationCredentials.id })
  if (notify) await tx.insert(emailOutbox).values({
    dedupeKey: `accreditation:${credential.id}:ready`, kind: 'accreditation_ready',
    toEmail: row.email.trim().toLowerCase(), registrationId, credentialId: credential.id,
    nextAttemptAt: new Date(Date.now() + 60_000),
  })
  await tx.insert(auditLog).values({ actorId: operatorId, action: 'accreditation.issued', subjectId: registrationId,
    changes: { credentialId: credential.id, version, reason } })
  return { code: 201, body: { credentialId: credential.id, reference: row.reference, emailQueued: notify, alreadyIssued: false } }
}

export function issueAccreditation(db: Db, input: { registrationId: string; eventSlug: string; operatorId: string }) {
  return db.transaction(tx => issueInTransaction(tx, input.registrationId, input.eventSlug, input.operatorId))
}

export async function issueAccreditationAfterApproval(tx: Tx, input: { registrationId: string; eventSlug: string; operatorId: string | null; notify?: boolean }) {
  return issueInTransaction(tx, input.registrationId, input.eventSlug, input.operatorId, input.notify)
}

export function verifyManualPayment(db: Db, input: {
  reference: string; eventSlug: string; operatorId: string; note: string; manualReference: string
}) {
  return db.transaction(async tx => {
    // Use the same lock order as online reconciliation and enrollment.
    const workshop = await tx.execute(sql`SELECT w.id FROM workshops w JOIN events e ON e.id=w.event_id
      WHERE e.slug=${input.eventSlug} FOR UPDATE OF w`)
    if (!workshop.rows[0]) return { code: 404, body: { error: 'Taller no encontrado.' } }
    const found = await tx.execute(sql`
      SELECT p.id,p.registration_id,p.source,p.status,p.amount_minor,p.payer_name,p.payer_email
      FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE e.slug=${input.eventSlug} AND p.superseded_by_admin IS NULL AND p.status='pending' AND
        registration_is_live(r.id) AND
        ((r.reference=${input.reference} AND r.deleted_at IS NULL AND r.archived_at IS NULL) OR EXISTS (
          SELECT 1 FROM payment_allocations a JOIN registrations member ON member.id=a.registration_id
          WHERE a.attempt_id=p.id AND member.reference=${input.reference} AND registration_is_current(member.id)
        ))
      ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p
    `)
    let attempt = found.rows[0] as { id: string; registration_id: string; source: string; status: string; amount_minor: number | null; payer_name: string | null; payer_email: string | null } | undefined
    if (!attempt) return { code: 404, body: { error: 'Pago pendiente no encontrado.' } }
    if (!['bank_transfer', 'on_site', 'manual'].includes(attempt.source) || attempt.status !== 'pending') {
      return { code: 409, body: { error: 'Este pago no está pendiente de verificación manual.' } }
    }
    if (attempt.amount_minor === null) {
      if (attempt.source !== 'on_site') return { code: 409, body: { error: 'Este pago todavía no tiene importe.' } }
      const settings = await tx.execute(sql`SELECT s.on_site_price_minor FROM workshop_payment_settings s
        JOIN registrations r ON r.workshop_id=s.workshop_id WHERE r.id=${attempt.registration_id} FOR UPDATE OF s`)
      const price = settings.rows[0]?.on_site_price_minor
      if (price == null) return { code: 409, body: { error: 'Primero definí el precio de ventanilla en la configuración del taller.' } }
      const allocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.attemptId, attempt.id))
      if (allocations.length !== 1 || allocations[0].dueAmountMinor !== null || allocations[0].promotionId !== null) {
        return { code: 409, body: { error: 'Esta inscripción requiere revisión antes de cobrar en el taller.' } }
      }
      const previousId = attempt.id
      await tx.update(paymentAttempts).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(paymentAttempts.id, previousId))
      const [priced] = await tx.insert(paymentAttempts).values({ registrationId: attempt.registration_id,
        replacesAttemptId: previousId, source: 'on_site', status: 'created', amountMinor: Number(price),
        idempotencyKey: randomUUID(), payerName: attempt.payer_name, payerEmail: attempt.payer_email,
      }).returning({ id: paymentAttempts.id })
      await tx.insert(paymentAllocations).values({ attemptId: priced.id, registrationId: attempt.registration_id,
        lotId: allocations[0].lotId, lotNumber: allocations[0].lotNumber,
        baseAmountMinor: Number(price), discountMinor: 0, dueAmountMinor: Number(price) })
      await tx.update(paymentAttempts).set({ status: 'pending' }).where(eq(paymentAttempts.id, priced.id))
      await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'pricing.on_site_quote_finalized', subjectId: priced.id,
        changes: { previousAttemptId: previousId, amountMinor: Number(price) } })
      attempt = { ...attempt, id: priced.id, amount_minor: Number(price) }
    }
    if (attempt.amount_minor === null) return { code: 409, body: { error: 'El precio de ventanilla aún no está definido.' } }
    const now = new Date()
    await tx.update(paymentAttempts).set({
      status: 'approved', paidAmountMinor: attempt.amount_minor,
      manualVerifiedBy: input.operatorId, manualVerifiedAt: now,
      manualReference: input.manualReference || null, proofReviewedAt: now,
      proofReviewNote: input.note, updatedAt: now,
    }).where(eq(paymentAttempts.id, attempt.id))
    const allocated = await tx.execute(sql`SELECT a.registration_id FROM payment_allocations a
      JOIN registrations r ON r.id=a.registration_id WHERE a.attempt_id=${attempt.id} AND registration_is_current(r.id)`)
    const members = [...new Set((allocated.rows.length ? allocated.rows : [{ registration_id: attempt.registration_id }])
      .map(row => String(row.registration_id)))]
    for (const registrationId of members) {
      const issued = await issueInTransaction(tx, registrationId, input.eventSlug, input.operatorId)
      if (issued.code !== 201 && issued.code !== 200) throw new Error('payment_accreditation_inconsistent')
    }
    await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'payment.manually_verified',
      subjectId: attempt.id, reason: input.note,
      changes: { source: attempt.source, amountMinor: attempt.amount_minor, manualReference: input.manualReference || null, accreditedPeople: members.length } })
    await tx.execute(sql`SELECT advance_workshop_lot(${String(workshop.rows[0].id)})`)
    return { code: 200, body: { status: 'approved', accreditedPeople: members.length, emailQueued: true } }
  })
}

export function admitAccreditation(db: Db, input: { qrValue: string; eventSlug: string; operatorId: string; entryPoint: string }): Promise<Result> {
  let tokenHash: string | undefined
  const reference = registrationQrReference(input.qrValue)
  try { if (!reference) tokenHash = hashAccreditationQr(input.qrValue) } catch { return Promise.resolve({ code: 400, body: { error: 'El código QR no tiene un formato válido.' } }) }
  return db.transaction(async tx => {
    if (reference) {
      const registrationsFound = await tx.execute(sql`SELECT r.id,r.reference,r.creation_key,r.name,r.status,
        (SELECT c.token_hash FROM accreditation_credentials c WHERE c.registration_id=r.id AND c.revoked_at IS NULL ORDER BY c.version DESC LIMIT 1) AS active_token_hash
        FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
        WHERE r.reference=${reference} AND e.slug=${input.eventSlug} AND r.deleted_at IS NULL AND r.archived_at IS NULL AND registration_is_current(r.id)`)
      const registration = registrationsFound.rows[0]
      if (!registration || !verifyRegistrationQr(input.qrValue, String(registration.id), reference, String(registration.creation_key))) {
        return { code: 404, body: { result: 'unknown', error: 'QR no reconocido.' } }
      }
      if (!registration.active_token_hash) {
        await tx.insert(admissionScans).values({ scannedBy: input.operatorId, result: 'not_eligible', entryPoint: input.entryPoint || null })
        return { code: 409, body: { result: 'not_eligible', error: 'Inscripción localizada. Primero debe registrarse el pago o la autorización en recepción.', name: registration.name, reference } }
      }
      // The same printed registration QR can be used after reception approves
      // payment. Continue through every existing eligibility/check-in guard.
      tokenHash = String(registration.active_token_hash)
    }
    const found = await tx.execute(sql`
      SELECT c.id AS credential_id,c.registration_id,c.reason,c.revoked_at,c.expires_at,
        r.status,r.name,r.reference,registration_has_approved_payment(r.id) AS paid,
        a.status AS assistance_status,(fw.registration_id IS NOT NULL) AS waived
      FROM accreditation_credentials c JOIN registrations r ON r.id=c.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      LEFT JOIN assistance_requests a ON a.registration_id=r.id
      LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
      WHERE c.token_hash=${tokenHash} AND e.slug=${input.eventSlug}
        AND r.deleted_at IS NULL AND r.archived_at IS NULL AND registration_is_current(r.id)
      FOR UPDATE OF c,r
    `)
    const row = found.rows[0] as {
      credential_id: string; registration_id: string; reason: string; revoked_at: Date | null; expires_at: Date;
      status: string; name: string; reference: string; paid: boolean; assistance_status: string | null; waived: boolean; accreditation_blocked: boolean
    } | undefined
    if (!row) {
      await tx.insert(admissionScans).values({ scannedBy: input.operatorId, result: 'unknown', entryPoint: input.entryPoint || null })
      return { code: 404, body: { result: 'unknown', error: 'QR no reconocido.' } }
    }
    const currentEligibility = row.reason === 'paid' ? row.paid : row.reason === 'assistance_approved' ? row.assistance_status === 'approved' : row.waived
    const result = row.revoked_at ? 'revoked' : new Date(row.expires_at) <= new Date() ? 'expired'
      : row.status !== 'confirmed' || !currentEligibility ? 'not_eligible' : null
    if (result) {
      await tx.insert(admissionScans).values({ credentialId: row.credential_id, scannedBy: input.operatorId, result, entryPoint: input.entryPoint || null })
      return { code: 409, body: { result, error: 'Esta acreditación no es válida para ingresar.' } }
    }
    const [previous] = await tx.select({ scannedAt: checkIns.scannedAt }).from(checkIns)
      .where(eq(checkIns.registrationId, row.registration_id)).limit(1)
    if (previous) {
      await tx.insert(admissionScans).values({ credentialId: row.credential_id, scannedBy: input.operatorId, result: 'already_admitted', entryPoint: input.entryPoint || null })
      return { code: 409, body: { result: 'already_admitted', error: 'Esta persona ya ingresó.', name: row.name, reference: row.reference, firstEntryAt: previous.scannedAt.toISOString() } }
    }
    await tx.insert(checkIns).values({ registrationId: row.registration_id, credentialId: row.credential_id,
      scannedBy: input.operatorId, entryPoint: input.entryPoint || null })
    await tx.insert(admissionScans).values({ credentialId: row.credential_id, scannedBy: input.operatorId, result: 'admitted', entryPoint: input.entryPoint || null })
    await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'admission.admitted', subjectId: row.registration_id,
      changes: { credentialId: row.credential_id, entryPoint: input.entryPoint || null } })
    return { code: 200, body: { result: 'admitted', name: row.name, reference: row.reference } }
  })
}
