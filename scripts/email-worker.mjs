import pg from 'pg'
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decryptAccreditationQr, hashAccreditationQr } from '../lib/accreditation-token.ts'
import { accreditationEmail, assistanceApprovedEmail, assistanceDeclinedEmail, assistanceReviewEmail, groupPaymentEmail, registrationEmail, settlementReminderEmail } from '../lib/email-templates.ts'

async function claim(pool) {
  const result = await pool.query(`
    WITH selected AS (
      SELECT id FROM email_outbox
      WHERE status IN ('queued','failed','sending') AND next_attempt_at <= now()
        AND attempt_count < 10
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE email_outbox e SET status='sending', attempt_count=e.attempt_count+1,
      next_attempt_at=now()+interval '15 minutes'
    FROM selected WHERE e.id=selected.id RETURNING e.*
  `)
  return result.rows[0] ?? null
}

async function render(pool, job) {
  if (job.kind === 'settlement_reminder') {
    const result = await pool.query(
      'SELECT switch_at,target_available_at,recommended_release_days,acknowledged_at,cancelled_at FROM settlement_reminders WHERE id=$1',
      [job.settlement_reminder_id],
    )
    const reminder = result.rows[0]
    if (!reminder || reminder.acknowledged_at || reminder.cancelled_at) return null
    return settlementReminderEmail({
      switchDate: reminder.switch_at.toISOString().slice(0, 10),
      targetDate: reminder.target_available_at.toISOString().slice(0, 10),
      releaseDays: reminder.recommended_release_days,
    })
  }
  const result = await pool.query(`
    SELECT r.email,r.reference,r.status,r.name,r.phone,i.first_name,i.payment_difficulty,
      p.source,p.amount_minor,s.transfer_alias,s.transfer_provider,s.proof_whatsapp_e164,s.reminder_email,
      registration_has_approved_payment(r.id) AS paid,
      a.status AS assistance_status, (fw.registration_id IS NOT NULL) AS waived
    FROM registrations r JOIN registration_intakes i ON i.registration_id=r.id
    JOIN workshops w ON w.id=r.workshop_id
    LEFT JOIN workshop_payment_settings s ON s.workshop_id=w.id
    LEFT JOIN assistance_requests a ON a.registration_id=r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
    LEFT JOIN LATERAL (
      SELECT source,amount_minor FROM payment_attempts
      WHERE registration_id=r.id ORDER BY created_at DESC LIMIT 1
    ) p ON true
    WHERE r.id=$1
  `, [job.registration_id])
  const registration = result.rows[0]
  if (!registration) return null
  if (job.kind === 'assistance_review_request') {
    if (!registration.payment_difficulty || !registration.reminder_email ||
      registration.reminder_email.toLowerCase() !== job.to_email.toLowerCase()) return null
    return assistanceReviewEmail({
      fullName: registration.name, reference: registration.reference,
      email: registration.email, phone: registration.phone,
    })
  }
  if (registration.email.toLowerCase() !== job.to_email.toLowerCase()) return null
  if (job.kind === 'group_payment_notice') {
    if (!job.payment_attempt_id) return null
    const groupResult = await pool.query(`
      SELECT p.id,p.status,p.source,p.amount_minor,p.registration_id AS payer_id,
        payer.name AS payer_name,payer.reference AS payer_reference,
        count(allocation.id)::integer AS member_count
      FROM payment_attempts p
      JOIN registrations payer ON payer.id=p.registration_id
      JOIN payment_allocations allocation ON allocation.attempt_id=p.id
      WHERE p.id=$1 AND EXISTS (
        SELECT 1 FROM payment_allocations own WHERE own.attempt_id=p.id AND own.registration_id=$2
      ) GROUP BY p.id,payer.id
    `, [job.payment_attempt_id, job.registration_id])
    const group = groupResult.rows[0]
    if (!group || !['pending', 'approved'].includes(group.status) || group.member_count < 2) return null
    return groupPaymentEmail({ firstName: registration.first_name, reference: registration.reference,
      payerName: group.payer_name, payerReference: group.payer_reference,
      isPayer: group.payer_id === job.registration_id, memberCount: group.member_count,
      amountMinor: group.amount_minor, status: group.status, source: group.source,
      transferAlias: registration.transfer_alias, transferProvider: registration.transfer_provider,
      proofWhatsappE164: registration.proof_whatsapp_e164 })
  }
  if (job.kind === 'assistance_approved') {
    if (!registration.payment_difficulty || registration.assistance_status !== 'approved') return null
    return assistanceApprovedEmail({ firstName: registration.first_name, reference: registration.reference })
  }
  if (job.kind === 'assistance_declined') {
    if (!registration.payment_difficulty || registration.assistance_status !== 'declined') return null
    return assistanceDeclinedEmail({ firstName: registration.first_name, reference: registration.reference })
  }
  if (job.kind === 'registration_received' || job.kind === 'payment_instructions') {
    // An earlier individual instruction is stale after the operator replaces
    // that unpaid attempt with a group charge; send the group notice instead.
    const grouped = await pool.query(`
      SELECT 1 FROM payment_allocations a JOIN payment_attempts p ON p.id=a.attempt_id
      WHERE a.registration_id=$1 AND p.status IN ('pending','approved')
        AND (SELECT count(*) FROM payment_allocations x WHERE x.attempt_id=p.id)>1 LIMIT 1
    `, [job.registration_id])
    if (grouped.rows.length) return null
    const choice = registration.paid ? 'paid'
      : registration.waived ? 'waived'
      : registration.payment_difficulty ? 'assistance' : registration.source
    if (!['paid', 'assistance', 'bank_transfer', 'on_site', 'mercado_pago', 'waived'].includes(choice)) return null
    return registrationEmail({
      firstName: registration.first_name,
      reference: registration.reference,
      choice,
      amountMinor: registration.amount_minor,
      transferAlias: registration.transfer_alias,
      transferProvider: registration.transfer_provider,
      proofWhatsappE164: registration.proof_whatsapp_e164,
    })
  }
  if (job.kind === 'accreditation_ready') {
    if (registration.status !== 'confirmed' || !job.credential_id) return null
    const credentialResult = await pool.query(`
      SELECT version,token_hash,token_ciphertext,token_iv,token_auth_tag,encryption_key_id
      FROM accreditation_credentials
      WHERE id=$1 AND registration_id=$2 AND revoked_at IS NULL AND expires_at>now()
    `, [job.credential_id, job.registration_id])
    const credential = credentialResult.rows[0]
    if (!credential || credential.encryption_key_id !== process.env.ACCREDITATION_TOKEN_KEY_ID || !process.env.ACCREDITATION_TOKEN_KEY) return null
    const qrValue = decryptAccreditationQr({
      tokenCiphertext: credential.token_ciphertext,
      tokenIv: credential.token_iv,
      tokenAuthTag: credential.token_auth_tag,
    }, process.env.ACCREDITATION_TOKEN_KEY, job.registration_id, credential.version)
    if (hashAccreditationQr(qrValue) !== credential.token_hash) throw new Error('accreditation_hash_mismatch')
    const email = accreditationEmail({ firstName: registration.first_name, reference: registration.reference })
    const png = await QRCode.toBuffer(qrValue, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
    return { ...email, attachments: [{ filename: 'acreditacion.png', content: png, cid: 'acreditacion', contentType: 'image/png' }] }
  }
  return null
}

export async function processEmailJob(pool, transport, job, from) {
  try {
    const message = await render(pool, job)
    if (!message) {
      await pool.query("UPDATE email_outbox SET status='cancelled',last_error_code='stale_or_ineligible' WHERE id=$1", [job.id])
      return 'cancelled'
    }
    const sent = await transport.sendMail({ from, to: job.to_email, ...message, messageId: `<${job.id}@vamosalsantisimo.com>` })
    if (!sent.accepted?.some(address => address.toLowerCase() === job.to_email.toLowerCase())) throw new Error('smtp_not_accepted')
    await pool.query("UPDATE email_outbox SET status='sent',sent_at=now(),last_error_code=NULL WHERE id=$1", [job.id])
    if (job.kind === 'settlement_reminder') await pool.query('UPDATE settlement_reminders SET sent_at=now() WHERE id=$1', [job.settlement_reminder_id])
    console.log(`Email accepted kind=${job.kind} id=${job.id}`)
    return 'sent'
  } catch (error) {
    const backoffMinutes = Math.min(360, 2 ** Math.min(job.attempt_count, 8))
    await pool.query(`UPDATE email_outbox SET status='failed',last_error_code=$2,
      next_attempt_at=now()+($3::integer * interval '1 minute') WHERE id=$1`,
      [job.id, error instanceof Error && /^accreditation_hash_mismatch|smtp_not_accepted$/.test(error.message) ? error.message : 'delivery_failed', backoffMinutes])
    console.error(`Email delivery failed id=${job.id}`)
    return 'failed'
  }
}

export async function processEmailJobOnce(pool, transport, from) {
  const job = await claim(pool)
  if (!job) return false
  await processEmailJob(pool, transport, job, from)
  return true
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const required = ['DATABASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
  if (required.some(name => !process.env[name])) {
    console.error('Email worker is not configured; no messages were sent.')
    process.exit(2)
  }
  if (process.env.SMTP_FROM !== 'contactos@vamosalsantisimo.com') throw new Error('Unexpected sender address')
  const port = Number(process.env.SMTP_PORT)
  if (![465, 587].includes(port)) throw new Error('SMTP_PORT must be 465 or 587')
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    if (process.argv.includes('--once')) {
      await processEmailJobOnce(pool, transport, process.env.SMTP_FROM)
    } else {
      for (;;) {
        const worked = await processEmailJobOnce(pool, transport, process.env.SMTP_FROM)
        if (!worked) await new Promise(resolve => setTimeout(resolve, 20_000))
      }
    }
  } finally {
    await pool.end()
  }
}
