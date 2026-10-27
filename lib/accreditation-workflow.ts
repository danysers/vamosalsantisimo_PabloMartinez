import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import type { getDb } from './db'
import { createAccreditationQr, encryptAccreditationQr, hashAccreditationQr } from './accreditation-token'
import {
  accreditationCredentials, admissionScans, auditLog, checkIns, emailOutbox,
  paymentAttempts, registrations,
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

async function issueInTransaction(tx: Tx, registrationId: string, eventSlug: string, operatorId: string): Promise<Result> {
  const found = await tx.execute(sql`
    SELECT r.id, r.status, r.email, r.reference, w.starts_at,
      registration_has_approved_payment(r.id) AS paid,
      a.status AS assistance_status,
      (fw.registration_id IS NOT NULL) AS waived
    FROM registrations r
    JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN assistance_requests a ON a.registration_id=r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
    WHERE r.id=${registrationId} AND e.slug=${eventSlug}
    FOR UPDATE OF r
  `)
  const row = found.rows[0] as {
    id: string; status: string; email: string; reference: string; starts_at: Date;
    paid: boolean; assistance_status: string | null; waived: boolean
  } | undefined
  if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
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
  await tx.insert(emailOutbox).values({
    dedupeKey: `accreditation:${credential.id}:ready`, kind: 'accreditation_ready',
    toEmail: row.email.trim().toLowerCase(), registrationId, credentialId: credential.id,
    nextAttemptAt: new Date(Date.now() + 60_000),
  })
  await tx.insert(auditLog).values({ actorId: operatorId, action: 'accreditation.issued', subjectId: registrationId,
    changes: { credentialId: credential.id, version, reason } })
  return { code: 201, body: { credentialId: credential.id, reference: row.reference, emailQueued: true, alreadyIssued: false } }
}

export function issueAccreditation(db: Db, input: { registrationId: string; eventSlug: string; operatorId: string }) {
  return db.transaction(tx => issueInTransaction(tx, input.registrationId, input.eventSlug, input.operatorId))
}

export async function issueAccreditationAfterApproval(tx: Tx, input: { registrationId: string; eventSlug: string; operatorId: string }) {
  return issueInTransaction(tx, input.registrationId, input.eventSlug, input.operatorId)
}

export function verifyManualPayment(db: Db, input: {
  reference: string; eventSlug: string; operatorId: string; note: string; manualReference: string
}) {
  return db.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT p.id,p.registration_id,p.source,p.status,p.amount_minor
      FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE r.reference=${input.reference} AND e.slug=${input.eventSlug}
      ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p
    `)
    const attempt = found.rows[0] as { id: string; registration_id: string; source: string; status: string; amount_minor: number } | undefined
    if (!attempt) return { code: 404, body: { error: 'Pago pendiente no encontrado.' } }
    if (!['bank_transfer', 'on_site', 'manual'].includes(attempt.source) || attempt.status !== 'pending') {
      return { code: 409, body: { error: 'Este pago no está pendiente de verificación manual.' } }
    }
    const now = new Date()
    await tx.update(paymentAttempts).set({
      status: 'approved', paidAmountMinor: attempt.amount_minor,
      manualVerifiedBy: input.operatorId, manualVerifiedAt: now,
      manualReference: input.manualReference || null, proofReviewedAt: now,
      proofReviewNote: input.note, updatedAt: now,
    }).where(eq(paymentAttempts.id, attempt.id))
    const allocated = await tx.execute(sql`SELECT registration_id FROM payment_allocations WHERE attempt_id=${attempt.id}`)
    const members = [...new Set((allocated.rows.length ? allocated.rows : [{ registration_id: attempt.registration_id }])
      .map(row => String(row.registration_id)))]
    for (const registrationId of members) {
      const issued = await issueInTransaction(tx, registrationId, input.eventSlug, input.operatorId)
      if (issued.code !== 201 && issued.code !== 200) throw new Error('payment_accreditation_inconsistent')
    }
    await tx.insert(auditLog).values({ actorId: input.operatorId, action: 'payment.manually_verified',
      subjectId: attempt.id, reason: input.note,
      changes: { source: attempt.source, amountMinor: attempt.amount_minor, manualReference: input.manualReference || null, accreditedPeople: members.length } })
    return { code: 200, body: { status: 'approved', accreditedPeople: members.length, emailQueued: true } }
  })
}

export function admitAccreditation(db: Db, input: { qrValue: string; eventSlug: string; operatorId: string; entryPoint: string }): Promise<Result> {
  let tokenHash: string
  try { tokenHash = hashAccreditationQr(input.qrValue) } catch { return Promise.resolve({ code: 400, body: { error: 'El código QR no tiene un formato válido.' } }) }
  return db.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT c.id AS credential_id,c.registration_id,c.reason,c.revoked_at,c.expires_at,
        r.status,r.name,r.reference,registration_has_approved_payment(r.id) AS paid,
        a.status AS assistance_status,(fw.registration_id IS NOT NULL) AS waived
      FROM accreditation_credentials c JOIN registrations r ON r.id=c.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      LEFT JOIN assistance_requests a ON a.registration_id=r.id
      LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
      WHERE c.token_hash=${tokenHash} AND e.slug=${input.eventSlug}
      FOR UPDATE OF c,r
    `)
    const row = found.rows[0] as {
      credential_id: string; registration_id: string; reason: string; revoked_at: Date | null; expires_at: Date;
      status: string; name: string; reference: string; paid: boolean; assistance_status: string | null; waived: boolean
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
