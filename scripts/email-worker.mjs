import pg from 'pg'
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decryptAccreditationQr, hashAccreditationQr } from '../lib/accreditation-token.ts'
import { decryptRecoveryCode } from '../lib/recovery-code.ts'
import { workshopEmailUrl } from '../lib/email-link-token.ts'
import { processLotAutomation } from './lot-automation.mjs'
import { accreditationEmail, assistanceApprovedEmail, assistanceDeclinedEmail, assistanceReviewEmail, groupPaymentEmail, lotChangedEmail, paymentProofReviewEmail, registrationAccessEmail, registrationEmail, settlementReminderEmail } from '../lib/email-templates.ts'

async function claim(pool) {
  // A local preview may restrict delivery to jobs created during that preview;
  // production always processes the full durable outbox.
  const since=process.env.NODE_ENV==='development' && process.env.MP_ENVIRONMENT==='test' && process.env.WORKSHOP_LOCAL_TEST_MODE==='1'
    && process.env.EMAIL_LOCAL_START_AT && Number.isFinite(Date.parse(process.env.EMAIL_LOCAL_START_AT)) ? process.env.EMAIL_LOCAL_START_AT : null
  const result = await pool.query(`
    WITH selected AS (
      SELECT id FROM email_outbox
      WHERE status IN ('queued','failed','sending') AND next_attempt_at <= now()
        AND attempt_count < 10
        AND ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE email_outbox e SET status='sending', attempt_count=e.attempt_count+1,
      next_attempt_at=now()+interval '15 minutes'
    FROM selected WHERE e.id=selected.id RETURNING e.*
  `,[since])
  return result.rows[0] ?? null
}

async function render(pool, job) {
  if (job.kind === 'lot_changed') {
    const result = await pool.query(`SELECT c.*,e.title FROM workshop_lot_changes c
      JOIN workshops w ON w.id=c.workshop_id JOIN events e ON e.id=w.event_id WHERE c.id=$1`, [job.lot_change_id])
    const change = result.rows[0]
    if (!change || change.to_email.toLowerCase() !== job.to_email.toLowerCase()) return null
    return lotChangedEmail({ eventTitle: change.title, fromLot: change.from_lot, toLot: change.to_lot,
      threshold: change.threshold, paidPlaces: change.paid_places, amountMinor: change.to_amount_minor,
      changedAt: new Date(change.created_at).toISOString() })
  }
  if(job.kind==='registration_access') {
    const result=await pool.query(`SELECT c.id,c.code_encrypted,c.expires_at,c.consumed_at,r.email,i.first_name,
      registration_is_current(r.id) AS current_registration
      FROM registration_recoveries c JOIN registrations r ON r.id=c.registration_id
      JOIN registration_intakes i ON i.registration_id=r.id WHERE c.id=$1 AND r.id=$2`,[job.recovery_id,job.registration_id])
    const row=result.rows[0]
    if(!row || row.current_registration===false || row.consumed_at || new Date(row.expires_at)<=new Date() || row.email.toLowerCase()!==job.to_email.toLowerCase()) return null
    return registrationAccessEmail({firstName:row.first_name,code:decryptRecoveryCode(row.id,row.code_encrypted)})
  }
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
    SELECT r.id,r.creation_key,r.email,r.accreditation_email,r.reference,r.status,r.name,r.phone,i.first_name,i.payment_difficulty,i.payment_difficulty_notes,w.starts_at,
      registration_is_current(r.id) AS current_registration,
      p.source,p.amount_minor,s.transfer_alias,s.transfer_provider,s.transfer_holder,s.transfer_document,
      s.proof_whatsapp_e164,s.reminder_email,
      registration_has_approved_payment(r.id) AS paid,
      a.status AS assistance_status, (fw.registration_id IS NOT NULL) AS waived
    FROM registrations r JOIN registration_intakes i ON i.registration_id=r.id
    JOIN workshops w ON w.id=r.workshop_id
    LEFT JOIN workshop_payment_settings s ON s.workshop_id=w.id
    LEFT JOIN assistance_requests a ON a.registration_id=r.id
    LEFT JOIN fee_waivers fw ON fw.registration_id=r.id AND fw.revoked_at IS NULL
    LEFT JOIN LATERAL (
      SELECT source,amount_minor FROM payment_attempts
      WHERE registration_id=r.id OR EXISTS(SELECT 1 FROM payment_allocations own WHERE own.attempt_id=payment_attempts.id AND own.registration_id=r.id)
      ORDER BY created_at DESC,id DESC LIMIT 1
    ) p ON true
    WHERE r.id=$1
  `, [job.registration_id])
  const registration = result.rows[0]
  if (!registration || registration.current_registration === false) return null
  const emailIdentity = { id: registration.id, reference: registration.reference, creationKey: registration.creation_key, email: registration.email }
  const linkEndsAt = new Date(new Date(registration.starts_at).getTime() + 3 * 86_400_000)
  if (job.kind === 'assistance_review_request') {
    if (!registration.payment_difficulty || !registration.reminder_email ||
      registration.reminder_email.toLowerCase() !== job.to_email.toLowerCase()) return null
    return assistanceReviewEmail({
      fullName: registration.name, reference: registration.reference,
      email: registration.email, phone: registration.phone,
      reason: registration.payment_difficulty_notes,
    })
  }
  if (job.kind === 'payment_proof_submitted') {
    if (job.to_email.toLowerCase() !== 'danysers@gmail.com' || !job.payment_proof_id || !job.payment_attempt_id) return null
    const proofResult = await pool.query(`
      SELECT proof.id,p.amount_minor,p.status FROM payment_proofs proof
      JOIN payment_attempts p ON p.id=proof.payment_attempt_id
      WHERE proof.id=$1 AND proof.payment_attempt_id=$2 AND proof.registration_id=$3
    `, [job.payment_proof_id, job.payment_attempt_id, job.registration_id])
    const proof = proofResult.rows[0]
    if (!proof || proof.status !== 'pending') return null
    const panelOrigin = process.env.PANEL_ORIGIN || process.env.BETTER_AUTH_URL || 'https://paneltaller2026.vamosalsantisimo.com'
    const origin = new URL(panelOrigin)
    if (origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('Invalid panel origin')
    return paymentProofReviewEmail({ fullName: registration.name, reference: registration.reference,
      amountMinor: proof.amount_minor, proofUrl: `${origin.origin}/api/admin/taller/comprobantes/${proof.id}`,
      panelUrl: `${origin.origin}/admin/acreditacion?reference=${encodeURIComponent(registration.reference)}` })
  }
  const recipient = job.kind === 'accreditation_ready' && job.manual_resend
    ? registration.accreditation_email || registration.email : registration.email
  if (recipient.toLowerCase() !== job.to_email.toLowerCase()) return null
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
      transferHolder: registration.transfer_holder, transferDocument: registration.transfer_document,
      proofWhatsappE164: registration.proof_whatsapp_e164,
      proofUrl: group.status === 'pending' && group.payer_id === job.registration_id && group.source === 'bank_transfer'
        ? workshopEmailUrl('proof', emailIdentity, linkEndsAt) : undefined })
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
      transferHolder: registration.transfer_holder,
      transferDocument: registration.transfer_document,
      proofWhatsappE164: registration.proof_whatsapp_e164,
      proofUrl: !['paid', 'waived'].includes(choice) ? workshopEmailUrl('proof', emailIdentity, linkEndsAt) : undefined,
    })
  }
  if (job.kind === 'accreditation_ready') {
    if (registration.status !== 'confirmed' || !job.credential_id ||
        !(registration.paid || registration.assistance_status === 'approved' || registration.waived)) return null
    const credentialResult = await pool.query(`
      SELECT version,token_hash,token_ciphertext,token_iv,token_auth_tag,encryption_key_id,expires_at
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
    const cash = registration.source === 'on_site' && !registration.waived && registration.assistance_status !== 'approved'
    const email = accreditationEmail({ firstName: registration.first_name, reference: registration.reference,
      paymentConfirmed: registration.paid,
      passUrl: cash ? undefined : workshopEmailUrl('pass', { ...emailIdentity,
        email: `${registration.email}|${registration.accreditation_email || ''}`, credentialId: job.credential_id },
      new Date(Math.min(new Date(credential.expires_at || linkEndsAt).getTime(), linkEndsAt.getTime()))) })
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
    const recipientMode = job.registration_id
      ? (await pool.query('SELECT is_test FROM registrations WHERE id=$1', [job.registration_id])).rows[0]
      : null
    if (recipientMode?.is_test !== false && process.env.WORKSHOP_SANDBOX_REGISTRATIONS === '1' && process.env.MP_ENVIRONMENT === 'test') {
      message.subject = `[PRUEBA] ${message.subject}`
      const notice = 'MODO DE PRUEBA: sin cargos reales. Este correo y su QR no son válidos para ingresar al evento.'
      message.text = `${notice}\n\n${message.text}`
      if (message.html) message.html = message.html.replace(/(<body[^>]*>)/, '$1<p style="padding:16px;text-align:center;font:700 14px Arial;background:#fff3cd;color:#681b2b">'+notice+'</p>')
    }
    const sent = await transport.sendMail({ from, to: job.to_email, ...message, messageId: `<${job.id}@vamosalsantisimo.com>` })
    if (!sent.accepted?.some(address => address.toLowerCase() === job.to_email.toLowerCase())) throw new Error('smtp_not_accepted')
    await pool.query("UPDATE email_outbox SET status='sent',sent_at=now(),last_error_code=NULL WHERE id=$1", [job.id])
    if (job.kind === 'payment_proof_submitted' && job.payment_attempt_id) {
      await pool.query('UPDATE payment_attempts SET proof_notified_at=now() WHERE id=$1', [job.payment_attempt_id])
    }
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
      await processLotAutomation(pool)
      await processEmailJobOnce(pool, transport, process.env.SMTP_FROM)
    } else {
      for (;;) {
        try { await processLotAutomation(pool) }
        catch { console.error('Automatic lot check failed; retrying on the next cycle') }
        const worked = await processEmailJobOnce(pool, transport, process.env.SMTP_FROM)
        if (!worked) await new Promise(resolve => setTimeout(resolve, 20_000))
      }
    }
  } finally {
    await pool.end()
  }
}
