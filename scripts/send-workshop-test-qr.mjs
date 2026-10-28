import pg from 'pg'
import nodemailer from 'nodemailer'
import { brandedEmailHtml } from '../lib/email-templates.ts'
import { processEmailJob } from './email-worker.mjs'

const argument = name => {
  const index = process.argv.indexOf(name)
  return index < 0 ? '' : process.argv[index + 1] || ''
}
const reference = argument('--reference')
const recipient = argument('--to').trim().toLowerCase()
const send = process.argv.includes('--send')
const connection = new URL(process.env.DATABASE_URL || 'about:blank')
if (!['127.0.0.1', 'localhost'].includes(connection.hostname) || process.env.MP_ENVIRONMENT !== 'test' || process.env.WORKSHOP_LOCAL_TEST_MODE !== '1') {
  throw new Error('This command is restricted to the local workshop test environment')
}
if (!/^[A-Za-z0-9_-]{10,80}$/.test(reference) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  throw new Error('Use --reference REFERENCE --to RECIPIENT [--send]')
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
let smtp
try {
  const found = await pool.query(`SELECT r.id,r.email,p.provider_order_id,m.id AS email_id,m.status
    FROM registrations r JOIN payment_attempts p ON p.registration_id=r.id
    JOIN email_outbox m ON m.registration_id=r.id AND m.kind='accreditation_ready'
    WHERE r.reference=$1 AND r.status='confirmed' AND p.status='approved'
      AND p.provider_live_mode=false AND p.provider_order_id LIKE 'ORDTST%'
    ORDER BY m.created_at DESC LIMIT 1`, [reference])
  const row = found.rows[0]
  if (!row || (row.email !== 'prueba.taller@example.com' && row.email !== recipient)) {
    throw new Error('No eligible synthetic registration; no message sent')
  }
  if (row.status === 'sent') { console.log('The QR email was already sent; no duplicate sent.'); process.exitCode = 0 }
  else if (!send) console.log(`Ready: one test QR email for ${recipient}. Use --send to deliver it.`)
  else {
    if (['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'].some(key => !process.env[key]) || process.env.SMTP_FROM !== 'contactos@vamosalsantisimo.com') {
      throw new Error('SMTP configuration is incomplete; no message sent')
    }
    const port = Number(process.env.SMTP_PORT)
    if (![465, 587].includes(port)) throw new Error('Unsupported SMTP port')
    smtp = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port === 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 15000, socketTimeout: 30000 })
    await smtp.verify()
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const locked = await client.query(`SELECT * FROM email_outbox WHERE id=$1
        AND status IN ('queued','failed') FOR UPDATE SKIP LOCKED`, [row.email_id])
      if (!locked.rows[0]) throw new Error('Email already claimed or sent; no duplicate sent')
      // Only this known synthetic registration changes destination. The Orders
      // payer and frozen quote are untouched; no bulk email worker is started.
      await client.query('UPDATE registrations SET email=$1,normalized_email=$1 WHERE id=$2', [recipient, row.id])
      const claimed = await client.query(`UPDATE email_outbox SET to_email=$1,status='sending',attempt_count=attempt_count+1,
        next_attempt_at=now()+interval '15 minutes' WHERE id=$2 RETURNING *`, [recipient,row.email_id])
      job = claimed.rows[0]
      await client.query(`UPDATE email_outbox SET status='cancelled',last_error_code='test_confirmation_combined_with_qr'
        WHERE registration_id=$1 AND kind='registration_received' AND status IN ('queued','failed')`, [row.id])
      await client.query(`INSERT INTO audit_log(action,subject_id,reason,changes)VALUES($1,$2,$3,$4)`,
        ['email.test_delivery_requested',row.id,'Envío de prueba solicitado por el organizador',JSON.stringify({ emailId:job.id })])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
    const transport = { sendMail: async message => {
      const text = 'PRUEBA LOCAL — SIN VALIDEZ PARA EL EVENTO. No hubo un cargo real. Este QR pertenece exclusivamente a la base de pruebas.\n\n' + message.text
      return smtp.sendMail({ ...message, to:recipient, subject:'[PRUEBA — QR del taller] '+message.subject,
        text, html:brandedEmailHtml(text,'acreditacion') })
    } }
    const result = await processEmailJob(pool,transport,job,process.env.SMTP_FROM)
    if (result !== 'sent') throw new Error('The QR email was not accepted; check the local queue')
    console.log('One QR test email accepted by SMTP. Inbox delivery still needs confirmation.')
  }
} catch (error) {
  // Do not dump provider/authentication errors that might contain credentials.
  const safe = error instanceof Error && /SMTP configuration is incomplete|No eligible|already claimed|not accepted|Use --reference|restricted to/.test(error.message)
  console.error(safe ? error.message : 'Could not complete the test email. Verify SMTP credentials and the local queue.')
  process.exitCode = 1
} finally { smtp?.close(); await pool.end() }
