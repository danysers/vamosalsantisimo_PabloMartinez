import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { hasCheckoutAccess } from './checkout-access'
import { getDb } from './db'
import { emailOutbox, paymentProofs } from './schema'

export const MAX_PROOF_BYTES = 5 * 1024 * 1024
export const MAX_MULTIPART_BYTES = MAX_PROOF_BYTES + 64 * 1024

export function detectProofType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

export function proofDriveFileName(documentNumber: string, uploadedAt: Date, proofId: string, contentType: string) {
  const document = documentNumber.trim().toUpperCase().replace(/[.\s]/g, '')
  if (!/^[A-Z0-9-]{5,20}$/.test(document)) throw new Error('Invalid document number')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(uploadedAt)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const time = `${part('hour')}${part('minute')}${part('second')}`
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[contentType]
  if (!extension) throw new Error('Invalid proof type')
  return `${document}_${date}_${time}_${proofId.slice(0, 8)}.${extension}`
}

export async function submitPaymentProof(input: { reference: string; accessToken: string; filename: string; bytes: Buffer }) {
  const db = getDb()
  return db.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT p.id,p.source,p.status,r.id AS registration_id,r.creation_key,r.status AS registration_status,
        i.document_number
      FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id
      JOIN registration_intakes i ON i.registration_id=r.id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE r.reference=${input.reference} AND e.slug=${process.env.WORKSHOP_EVENT_SLUG || ''}
        AND registration_is_current(r.id)
      ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p,r
    `)
    const attempt = found.rows[0]
    if (!attempt || !hasCheckoutAccess(input.accessToken, String(attempt.registration_id), String(attempt.creation_key))) {
      return { code: 404, body: { error: 'No encontramos esta inscripción en este navegador.' } }
    }
    if (attempt.source !== 'bank_transfer' || attempt.status !== 'pending' || attempt.registration_status !== 'pending') {
      return { code: 409, body: { error: 'Este pago ya no admite comprobantes.' } }
    }
    const documentNumber = String(attempt.document_number || '')
    if (!/^[A-Z0-9-]{5,20}$/.test(documentNumber)) return { code: 409, body: { error: 'Esta inscripción no tiene un D.N.I registrado. Contactá a la organización.' } }
    const existing = await tx.select({ id: paymentProofs.id, sha256: paymentProofs.sha256 }).from(paymentProofs)
      .where(eq(paymentProofs.paymentAttemptId, String(attempt.id))).orderBy(sql`${paymentProofs.uploadedAt} DESC`).limit(3)
    const sha256 = createHash('sha256').update(input.bytes).digest('hex')
    const duplicate = existing.find(proof => proof.sha256 === sha256)
    if (duplicate) return { code: 200, body: { status: 'review', message: 'Tu comprobante está en proceso de confirmación.' } }
    if (existing.length >= 3) return { code: 409, body: { error: 'Se alcanzó el límite de archivos para este pago. Contactá a la organización.' } }
    const contentType = detectProofType(input.bytes)
    if (!contentType || !input.bytes.length || input.bytes.length > MAX_PROOF_BYTES) return { code: 400, body: { error: 'Adjuntá una imagen JPG, PNG, WebP o un PDF de hasta 5 MB.' } }
    const proofId = randomUUID(), uploadedAt = new Date()
    const [proof] = await tx.insert(paymentProofs).values({
      id: proofId, uploadedAt, documentNumber,
      paymentAttemptId: String(attempt.id), registrationId: String(attempt.registration_id),
      filename: input.filename.slice(0, 120), contentType, sizeBytes: input.bytes.length, sha256, data: input.bytes,
      driveFileName: proofDriveFileName(documentNumber, uploadedAt, proofId, contentType),
    }).returning({ id: paymentProofs.id })
    await tx.insert(emailOutbox).values({
      dedupeKey: `payment-proof:${proof.id}:review`, kind: 'payment_proof_submitted',
      toEmail: 'danysers@gmail.com', registrationId: String(attempt.registration_id),
      paymentAttemptId: String(attempt.id), paymentProofId: proof.id,
    })
    return { code: 201, body: { status: 'review', message: 'Tu comprobante está en proceso de confirmación.' } }
  })
}
