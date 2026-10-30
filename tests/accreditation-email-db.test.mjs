import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
import { processEmailJob } from '../scripts/email-worker.mjs'
import { parseDeliveryReport, recordDeliveryReport } from '../lib/email-bounce.mjs'
import { deliveryFixture } from './fixtures/email-delivery-report.mjs'
register('./ts-server-loader.mjs', import.meta.url)

test('manual accreditation resends and reported bounces preserve the existing payment, original email, access keys and exact QR', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated PostgreSQL database',
}, async t => {
  const [{ getDb }, { enrollWorkshop }, { verifyManualPayment }, { manageAccreditationEmail }, { readAdminRegistration }] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-enrollment.ts'), import('../lib/accreditation-workflow.ts'),
    import('../lib/accreditation-email-admin.ts'), import('../lib/registration-admin.ts'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), db = getDb(), slug = 'email-resend-' + randomUUID()
  Object.assign(process.env, { WORKSHOP_EVENT_SLUG: slug, MP_ENVIRONMENT: 'production', REGISTRATION_EMAIL_READY: '1',
    WORKSHOP_CHECKOUT_TOKEN_KEY: randomBytes(48).toString('base64url'), ACCREDITATION_TOKEN_KEY_ID: 'resend-test',
    ACCREDITATION_TOKEN_KEY: randomBytes(32).toString('base64url') })
  const sent = [], transport = { sendMail: async message => { sent.push(message); return { accepted: [message.to] } } }
  try {
    const event = (await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Resend test','2026-12-19T18:00:00Z') RETURNING id", [slug])).rows[0]
    const workshop = (await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id", [event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)', [workshop.id])
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164) VALUES($1,'resend.alias','Banco','5493704258770')", [workshop.id])
    const operator = (await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id", ['resend-' + randomUUID() + '@example.invalid'])).rows[0]
    const receipt = await enrollWorkshop({ firstName: 'Prueba', lastName: 'Correo', documentNumber: '99778811', email: 'original-resend@example.invalid', phone: '+5493704009876',
      country: 'Argentina', province: 'Formosa', locality: 'Formosa', birthDate: '1990-01-01', ecclesialState: 'laico', paymentDifficulty: false, paymentMethod: 'bank_transfer', creationKey: randomUUID() })
    assert.equal(receipt.code, 201)
    const reference = receipt.body.reference
    const registration = (await pool.query('SELECT id,email,creation_key,access_token_hash,accreditation_email FROM registrations WHERE reference=$1', [reference])).rows[0]
    assert.equal(registration.accreditation_email, null, 'alternate recipient defaults to NULL without backfill')
    assert.equal((await verifyManualPayment(db, { eventSlug: slug, operatorId: operator.id, reference, note: 'Pago ficticio descartable', manualReference: randomUUID() })).code, 200)
    const beforeQr = (await pool.query('SELECT * FROM accreditation_credentials WHERE registration_id=$1', [registration.id])).rows
    const beforePayment = (await pool.query('SELECT * FROM payment_attempts WHERE registration_id=$1', [registration.id])).rows
    const initial = (await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'", [registration.id])).rows[0]
    assert.equal(await processEmailJob(pool, transport, initial, 'contactos@vamosalsantisimo.com'), 'sent')
    const qrPng = sent[0].attachments[0].content
    const read = () => readAdminRegistration(db, slug, reference)
    const call = async input => manageAccreditationEmail(db, slug, operator.id, { reference, version: (await read()).version, ...input })
    const resend = () => ({ action: 'resend', requestId: randomUUID(), confirmRecipient: true })

    await t.test('a structured rejection is matched by both message ID and recipient and displayed without implying inbox delivery', async () => {
      const [report] = await parseDeliveryReport(deliveryFixture({ id: initial.id, recipient: registration.email }))
      assert.equal(await recordDeliveryReport(pool, { ...report, recipient: 'different@example.invalid' }, randomUUID()), false)
      const key = randomUUID()
      assert.equal(await recordDeliveryReport(pool, report, key), true)
      assert.equal(await recordDeliveryReport(pool, report, key), false)
      const email = (await read()).emails.find(email => email.id === initial.id)
      assert.equal(email.status, 'sent'); assert.equal(email.deliveryAction, 'failed'); assert.equal(email.reasonCode, 'mailbox_full')
      assert.equal((await call({ ...resend(), confirmRecipient: false })).code, 400)
      assert.equal((await call({ ...resend(), credentialId: randomUUID() })).code, 400)
    })
    await t.test('alternate recipient is independent, version checked and audited without sending', async () => {
      const oldVersion = (await read()).version
      assert.equal((await call({ action: 'recipient', alternateEmail: 'bad\r\nBcc: evil@example.invalid', reason: 'Invalid input' })).code, 400)
      assert.equal((await call({ action: 'recipient', alternateEmail: 'Alternative@Example.invalid', reason: 'Dirección confirmada por la persona' })).code, 200)
      assert.equal((await read()).accreditationEmail, 'alternative@example.invalid')
      assert.equal((await read()).fields.email, registration.email)
      assert.equal(sent.length, 1)
      assert.equal((await manageAccreditationEmail(db, slug, operator.id, { reference, version: oldVersion, action: 'recipient', alternateEmail: '', reason: 'Old stale update' })).code, 409)
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE subject_id=$1 AND action='accreditation.email_recipient_updated'", [registration.id])).rows[0].n, 1)
    })
    await t.test('concurrent idempotent requests queue once, preserve the QR and render only to the confirmed alternate', async () => {
      const request = resend(), version = (await read()).version
      const results = await Promise.all([1, 2].map(() => manageAccreditationEmail(db, slug, operator.id, { reference, version, ...request })))
      assert.deepEqual(results.map(x => x.code).sort(), [200, 202])
      const jobs = (await pool.query('SELECT * FROM email_outbox WHERE registration_id=$1 AND manual_resend', [registration.id])).rows
      assert.equal(jobs.length, 1); assert.equal(jobs[0].credential_id, initial.credential_id)
      assert.equal(jobs[0].to_email, 'alternative@example.invalid')
      assert.equal((await call(resend())).code, 409, 'another queued resend is blocked')
      await pool.query("UPDATE email_outbox SET status='sending' WHERE id=$1", [jobs[0].id])
      assert.equal((await call({ action: 'recipient', alternateEmail: '', reason: 'Cambio durante envío' })).code, 409)
      assert.equal(await processEmailJob(pool, transport, jobs[0], 'contactos@vamosalsantisimo.com'), 'sent')
      assert.equal(sent.at(-1).to, 'alternative@example.invalid'); assert.deepEqual(sent.at(-1).attachments[0].content, qrPng)
      const detail = await read()
      assert.equal(detail.emails.find(email => email.id === jobs[0].id).deliveryAction, '')
      assert.equal(detail.emails.find(email => email.id === initial.id).deliveryAction, 'failed')
      assert.equal((await call(resend())).code, 202, 'a new request can be sent immediately after the previous one finishes')
      const next = (await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND manual_resend AND status='queued' ORDER BY created_at DESC LIMIT 1", [registration.id])).rows[0]
      assert.equal(await processEmailJob(pool, transport, next, 'contactos@vamosalsantisimo.com'), 'sent')
    })
    await t.test('archival, stale recipient, revocation and cross-event access block sending; queued overrides can be cancelled safely', async () => {
      await pool.query("UPDATE email_outbox SET created_at=now()-interval '10 minutes' WHERE registration_id=$1 AND manual_resend", [registration.id])
      assert.equal((await call(resend())).code, 202)
      const queued = (await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND manual_resend AND status='queued'", [registration.id])).rows[0]
      assert.equal((await call({ action: 'recipient', alternateEmail: '', reason: 'Retirar el alternativo' })).code, 200)
      assert.equal((await pool.query('SELECT status FROM email_outbox WHERE id=$1', [queued.id])).rows[0].status, 'cancelled')
      const n = sent.length
      assert.equal(await processEmailJob(pool, transport, queued, 'contactos@vamosalsantisimo.com'), 'cancelled')
      assert.equal(sent.length, n, 'outdated alternate is never sent')
      for (let i = 0; i < 3; i++) await pool.query(`INSERT INTO email_outbox(dedupe_key,kind,status,to_email,registration_id,credential_id,manual_resend,created_at)
        VALUES($1,'accreditation_ready','cancelled',$2,$3,$4,true,now()-interval '10 minutes')`, [randomUUID(), registration.email, registration.id, initial.credential_id])
      await pool.query("UPDATE email_outbox SET created_at=now()-interval '10 minutes' WHERE registration_id=$1 AND manual_resend", [registration.id])
      assert.equal((await call(resend())).code, 202, 'cancelled or earlier messages do not impose a daily limit')
      await pool.query("UPDATE email_outbox SET status='cancelled' WHERE registration_id=$1 AND manual_resend AND status='queued'", [registration.id])
      assert.equal((await manageAccreditationEmail(db, 'another-event', operator.id, { reference, version: (await read()).version, ...resend() })).code, 404)
      await pool.query('UPDATE registrations SET archived_at=now(),archived_by=$2 WHERE id=$1', [registration.id, operator.id])
      assert.equal((await call(resend())).code, 409)
      await pool.query('UPDATE registrations SET archived_at=NULL,archived_by=NULL WHERE id=$1', [registration.id])
      await pool.query("UPDATE accreditation_credentials SET revoked_at=now(),revocation_reason='test' WHERE registration_id=$1", [registration.id])
      assert.equal((await call(resend())).code, 409)
      await pool.query('UPDATE accreditation_credentials SET revoked_at=NULL,revocation_reason=NULL WHERE registration_id=$1', [registration.id])
    })
    assert.deepEqual((await pool.query('SELECT * FROM accreditation_credentials WHERE registration_id=$1', [registration.id])).rows, beforeQr)
    assert.deepEqual((await pool.query('SELECT * FROM payment_attempts WHERE registration_id=$1', [registration.id])).rows, beforePayment)
    assert.deepEqual((await pool.query('SELECT id,email,creation_key,access_token_hash,accreditation_email FROM registrations WHERE id=$1', [registration.id])).rows[0], registration)
  } finally { await pool.end(); await db.$client.end() }
})
