import 'server-only'
import { sql } from 'drizzle-orm'
import QRCode from 'qrcode'
import { getDb } from './db'
import { hasEmailLink, type EmailLinkPurpose } from './email-link-token'
import { decryptAccreditationQr, hashAccreditationQr } from './accreditation-token'

export async function readWorkshopEmailLink(input: { reference: string; token: string; purpose: EmailLinkPurpose }) {
  const result = await getDb().execute(sql`SELECT r.id,r.reference,r.creation_key,r.email,r.accreditation_email,r.status,
    i.nickname,w.starts_at,p.id AS attempt_id,p.source,p.status AS payment_status,
    (SELECT status FROM email_outbox WHERE registration_id=r.id AND kind='accreditation_ready' ORDER BY created_at DESC LIMIT 1) AS email_status,
    EXISTS(SELECT 1 FROM payment_proofs proof WHERE proof.payment_attempt_id=p.id) AS proof_submitted,
    registration_has_approved_payment(r.id) AS paid,
    EXISTS(SELECT 1 FROM assistance_requests a WHERE a.registration_id=r.id AND a.status='approved') AS assisted,
    EXISTS(SELECT 1 FROM fee_waivers fw WHERE fw.registration_id=r.id AND fw.revoked_at IS NULL) AS waived,
    c.id AS credential_id,c.version,c.token_hash,c.token_ciphertext,c.token_iv,c.token_auth_tag,c.encryption_key_id,c.expires_at
    FROM registrations r JOIN registration_intakes i ON i.registration_id=r.id
    JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN LATERAL (SELECT p.* FROM payment_attempts p WHERE p.superseded_by_admin IS NULL AND (p.registration_id=r.id
      OR EXISTS(SELECT 1 FROM payment_allocations a WHERE a.attempt_id=p.id AND a.registration_id=r.id))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT c.* FROM accreditation_credentials c WHERE c.registration_id=r.id
      AND c.revoked_at IS NULL AND c.expires_at>now() ORDER BY c.version DESC LIMIT 1) c ON true
    WHERE r.reference=${input.reference} AND e.slug=${process.env.WORKSHOP_EVENT_SLUG || ''}
      AND registration_is_current(r.id) LIMIT 1`)
  const row = result.rows[0]
  const identity = row ? { id: String(row.id), reference: String(row.reference), creationKey: String(row.creation_key),
    email: input.purpose === 'pass' ? `${row.email}|${row.accreditation_email || ''}` : String(row.email),
    ...(input.purpose === 'pass' ? { credentialId: String(row.credential_id || '') } : {}) } : null
  if (!row || !identity || !hasEmailLink(input.token, input.purpose, identity)) return null
  if (input.purpose === 'proof') {
    const payer = await getDb().execute(sql`SELECT 1 FROM payment_attempts WHERE id=${row.attempt_id || null}::uuid AND registration_id=${row.id}`)
    return { reference: String(row.reference), paymentMethod: row.source || 'assistance',
      status: row.payment_status || row.status, registrationStatus: row.status, proofSubmitted: !!row.proof_submitted,
      canUpload: row.status === 'pending' && row.source === 'bank_transfer' && row.payment_status === 'pending' && !!payer.rows[0],
      canChangeMethod: false, accreditation: null }
  }
  const eligible = row.status === 'confirmed' && (row.paid || row.assisted || row.waived) &&
    (row.source !== 'on_site' || row.assisted || row.waived)
  if (!eligible || !row.credential_id || row.encryption_key_id !== process.env.ACCREDITATION_TOKEN_KEY_ID || !process.env.ACCREDITATION_TOKEN_KEY) return null
  const value = decryptAccreditationQr({ tokenCiphertext: String(row.token_ciphertext), tokenIv: String(row.token_iv),
    tokenAuthTag: String(row.token_auth_tag) }, process.env.ACCREDITATION_TOKEN_KEY, String(row.id), Number(row.version))
  if (hashAccreditationQr(value) !== row.token_hash) throw new Error('accreditation_hash_mismatch')
  return { reference: String(row.reference), status: row.payment_status || 'not_required', registrationStatus: 'confirmed', passAvailable: true,
    paymentMethod: row.assisted || row.waived ? 'assistance' : row.source, canChangeMethod: false,
    nickname: typeof row.nickname === 'string' ? row.nickname : null,
    accreditation: { qrDataUrl: await QRCode.toDataURL(value, { width: 480, margin: 2, errorCorrectionLevel: 'M' }),
      startsAt: new Date(String(row.starts_at)).toISOString(), venue: 'Parroquia San Luis de Francia' },
    emailStatus: row.email_status || 'not_ready', testMode: process.env.MP_ENVIRONMENT === 'test' }
}
