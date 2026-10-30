import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { processEmailJob } from '../scripts/email-worker.mjs'
import { createAccreditationQr, encryptAccreditationQr } from '../lib/accreditation-token.ts'

test('assistance outbox renders organizer notice and reviewed decisions without real SMTP', {
  skip: !process.env.DATABASE_URL && 'Set a disposable, migrated PostgreSQL DATABASE_URL',
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const unique = randomUUID()
  const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id',
    [`email-worker-test-${unique}`, 'Email worker test', '2026-12-19T18:00:00Z'])
  const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at) VALUES ($1,$2) RETURNING id',
    [event.rows[0].id, '2026-12-19T18:00:00Z'])
  await pool.query('INSERT INTO workshop_payment_settings (workshop_id,reminder_email) VALUES ($1,$2)',
    [workshop.rows[0].id, 'organizer@example.invalid'])
  const admin = await pool.query('INSERT INTO admin_users (email,role) VALUES ($1,$2) RETURNING id',
    [`reviewer-${unique}@example.invalid`, 'registration_operator'])
  const sent = []
  const previousKey = process.env.ACCREDITATION_TOKEN_KEY
  const previousKeyId = process.env.ACCREDITATION_TOKEN_KEY_ID
  const previousCheckoutKey = process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY = randomBytes(48).toString('base64url')
  const qrKey = randomBytes(32).toString('base64url')
  process.env.ACCREDITATION_TOKEN_KEY = qrKey
  process.env.ACCREDITATION_TOKEN_KEY_ID = 'email-test'
  const fakeTransport = { sendMail: async message => {
    sent.push(message)
    return { accepted: [message.to] }
  } }

  async function createRequest(firstName) {
    const key = randomUUID()
    const email = `${firstName.toLowerCase()}-${key}@example.invalid`
    const registration = await pool.query(`INSERT INTO registrations
      (workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [workshop.rows[0].id, `TEST-${key}`, key.replaceAll('-', ''), key, `${firstName} Prueba`,
      `${firstName.toLowerCase()} prueba`, email, email, '3700000000', '3700000000'])
    const id = registration.rows[0].id
    await pool.query(`INSERT INTO registration_intakes
      (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty,payment_difficulty_notes)
      VALUES ($1,$2,$3,$4,$5,true,$6)`, [id, firstName, 'Prueba', '1990-01-01', 'laico', 'Necesito ayuda para cubrir el importe.\nSituación de prueba <temporal>.'])
    await pool.query('INSERT INTO assistance_requests (registration_id) VALUES ($1)', [id])
    return { id, email }
  }

  async function job(registrationId, kind) {
    const result = await pool.query('SELECT * FROM email_outbox WHERE registration_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 1',
      [registrationId, kind])
    assert.equal(result.rowCount, 1, `missing ${kind}`)
    return result.rows[0]
  }

  try {
    const person = await createRequest('Ana')
    await pool.query('INSERT INTO email_outbox (dedupe_key,kind,to_email,registration_id) VALUES ($1,$2,$3,$4),($5,$6,$7,$4)',
      [`receipt:${person.id}`, 'registration_received', person.email,
        person.id, `review:${person.id}`, 'assistance_review_request', 'organizer@example.invalid'])
    await pool.query('UPDATE assistance_requests SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE registration_id=$3',
      ['approved', admin.rows[0].id, person.id])
    assert.equal(await processEmailJob(pool, fakeTransport, await job(person.id, 'registration_received'), 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(sent.at(-1).text, /pendiente de revisión/)
    assert.doesNotMatch(sent.at(-1).text, /fue aprobada/)
    assert.equal(await processEmailJob(pool, fakeTransport, await job(person.id, 'assistance_review_request'), 'contactos@vamosalsantisimo.com'), 'sent')
    assert.equal(sent.at(-1).to, 'organizer@example.invalid')
    assert.match(sent.at(-1).text, /no puede abonar/)
    assert.match(sent.at(-1).text, /Motivo de la solicitud:\nNecesito ayuda para cubrir el importe\.\nSituación de prueba <temporal>\./)
    assert.match(sent.at(-1).html, /Situación de prueba &lt;temporal&gt;\./)
    assert.equal(await processEmailJob(pool, fakeTransport, await job(person.id, 'assistance_approved'), 'contactos@vamosalsantisimo.com'), 'sent')
    assert.equal(sent.at(-1).to, person.email)
    assert.match(sent.at(-1).text, /fue aprobada/)
    assert.match(sent.at(-1).html, /logo-vamos\.png/)
    assert.doesNotMatch(sent.at(-1).html, /Padre Asesor/)

    await pool.query("UPDATE registrations SET status='confirmed' WHERE id=$1", [person.id])
    const qr = createAccreditationQr()
    const encrypted = encryptAccreditationQr(qr.qrValue, qrKey, person.id, 1)
    const credential = await pool.query(`INSERT INTO accreditation_credentials
      (registration_id,version,token_hash,token_ciphertext,token_iv,token_auth_tag,encryption_key_id,reason,expires_at)
      VALUES ($1,1,$2,$3,$4,$5,'email-test','assistance_approved',now()+interval '1 day') RETURNING id`,
    [person.id, qr.tokenHash, encrypted.tokenCiphertext, encrypted.tokenIv, encrypted.tokenAuthTag])
    await pool.query(`INSERT INTO email_outbox (dedupe_key,kind,to_email,registration_id,credential_id)
      VALUES ($1,'accreditation_ready',$2,$3,$4)`, [`qr:${person.id}`, person.email, person.id, credential.rows[0].id])
    assert.equal(await processEmailJob(pool, fakeTransport, await job(person.id, 'accreditation_ready'), 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(sent.at(-1).html, /cid:acreditacion/)
    assert.equal(sent.at(-1).attachments?.[0]?.contentType, 'image/png')
    assert.ok(sent.at(-1).attachments[0].content.length > 1000)

    const declined = await createRequest('Luis')
    await pool.query('UPDATE assistance_requests SET status=$1,reviewed_by=$2,reviewed_at=now(),decision_note=$3 WHERE registration_id=$4',
      ['declined', admin.rows[0].id, 'Revisión de prueba', declined.id])
    assert.equal(await processEmailJob(pool, fakeTransport, await job(declined.id, 'assistance_declined'), 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(sent.at(-1).text, /no pudimos aprobar/)
    const changed = await createRequest('Marta')
    await pool.query('UPDATE assistance_requests SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE registration_id=$3',
      ['approved', admin.rows[0].id, changed.id])
    const staleApproval = await job(changed.id, 'assistance_approved')
    await pool.query('UPDATE assistance_requests SET status=$1,reviewed_by=$2,reviewed_at=now(),decision_note=$3 WHERE registration_id=$4',
      ['declined', admin.rows[0].id, 'Decisión revertida en la prueba', changed.id])
    const sentBeforeStale = sent.length
    assert.equal(await processEmailJob(pool, fakeTransport, staleApproval, 'contactos@vamosalsantisimo.com'), 'cancelled')
    assert.equal(sent.length, sentBeforeStale)
    assert.equal(await processEmailJob(pool, fakeTransport, await job(changed.id, 'assistance_declined'), 'contactos@vamosalsantisimo.com'), 'sent')
    const statuses = await pool.query('SELECT kind,status FROM email_outbox WHERE registration_id=$1', [person.id])
    assert.ok(statuses.rows.every(row => row.status === 'sent'))
  } finally {
    if (previousKey === undefined) delete process.env.ACCREDITATION_TOKEN_KEY
    else process.env.ACCREDITATION_TOKEN_KEY = previousKey
    if (previousKeyId === undefined) delete process.env.ACCREDITATION_TOKEN_KEY_ID
    else process.env.ACCREDITATION_TOKEN_KEY_ID = previousKeyId
    if (previousCheckoutKey === undefined) delete process.env.WORKSHOP_CHECKOUT_TOKEN_KEY
    else process.env.WORKSHOP_CHECKOUT_TOKEN_KEY = previousCheckoutKey
    await pool.end()
  }
})
