import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'

register('./ts-server-loader.mjs', import.meta.url)

test('private proof upload, organizer email, manual verification and participant accreditation are one coherent flow', {
  skip: !process.env.DATABASE_URL || process.env.RUN_PAYMENT_PROOF_DB_TEST !== '1'
    ? 'Use a disposable, migrated PostgreSQL DATABASE_URL with RUN_PAYMENT_PROOF_DB_TEST=1' : false,
}, async () => {
  const [{ submitPaymentProof }, { checkoutAccessToken }, { verifyManualPayment }, { processEmailJob }, { workshopPaymentStatus, changeWorkshopPaymentMethod }] = await Promise.all([
    import('../lib/payment-proof.ts'), import('../lib/checkout-access.ts'),
    import('../lib/accreditation-workflow.ts'), import('../scripts/email-worker.mjs'), import('../lib/workshop-payments.ts'),
  ])
  const { getDb } = await import('../lib/db.ts')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const slug = `proof-flow-${randomUUID()}`
  process.env.WORKSHOP_EVENT_SLUG = slug
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY = 'proof-integration-key-'.repeat(3)
  process.env.ACCREDITATION_TOKEN_KEY_ID = 'proof-test'
  process.env.ACCREDITATION_TOKEN_KEY = randomBytes(32).toString('base64url')
  process.env.PANEL_ORIGIN = 'http://localhost:3002'
  process.env.WORKSHOP_SANDBOX_REGISTRATIONS = '0'
  try {
    const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id',
      [slug, 'Proof test', '2026-12-19T18:00:00Z'])
    const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at,registration_open) VALUES ($1,$2,true) RETURNING id',
      [event.rows[0].id, '2026-12-19T18:00:00Z'])
    const lot = await pool.query('INSERT INTO workshop_lots (workshop_id,number,amount_minor) VALUES ($1,1,1000000) RETURNING id', [workshop.rows[0].id])
    const operator = await pool.query("INSERT INTO admin_users (email,role) VALUES ($1,'registration_operator') RETURNING id", [`operator-${randomUUID()}@example.invalid`])
    const reference = `PROOF-${randomUUID()}`.slice(0, 34)
    const creationKey = randomUUID(), token = checkoutAccessToken('placeholder', creationKey)
    const registration = await pool.query(`INSERT INTO registrations
      (workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
      VALUES ($1,$2,$3,$4,'Ana Prueba','ana prueba','ana@example.invalid','ana@example.invalid','3704123456','3704123456') RETURNING id`,
    [workshop.rows[0].id, reference, token, creationKey])
    const registrationId = registration.rows[0].id
    const accessToken = checkoutAccessToken(registrationId, creationKey)
    await pool.query(`INSERT INTO registration_intakes
      (registration_id,first_name,last_name,document_number,birth_date,ecclesial_state,payment_difficulty)
      VALUES ($1,'Ana','Prueba','12345678','1990-04-15','laico',false)`, [registrationId])
    const attempt = await pool.query(`INSERT INTO payment_attempts
      (registration_id,idempotency_key,source,status,amount_minor)
      VALUES ($1,$2,'bank_transfer','created',1000000) RETURNING id`, [registrationId, randomUUID()])
    await pool.query(`INSERT INTO payment_allocations
      (attempt_id,registration_id,lot_id,lot_number,base_amount_minor,discount_minor,due_amount_minor)
      VALUES ($1,$2,$3,1,1000000,0,1000000)`, [attempt.rows[0].id, registrationId, lot.rows[0].id])
    await pool.query("UPDATE payment_attempts SET status='pending' WHERE id=$1", [attempt.rows[0].id])
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
    const wrong = await submitPaymentProof({ reference, accessToken: 'x'.repeat(43), filename: 'proof.png', bytes: png })
    assert.equal(wrong.code, 404)
    assert.equal((await submitPaymentProof({ reference, accessToken, filename: 'evil.svg', bytes: Buffer.from('<svg onload="alert(1)"/>') })).code, 400)
    const uploaded = await submitPaymentProof({ reference, accessToken, filename: 'proof.png', documentNumber: '87654321', bytes: png })
    assert.equal(uploaded.code, 201, JSON.stringify(uploaded.body))
    assert.equal(uploaded.body.status, 'review')
    assert.equal((await submitPaymentProof({ reference, accessToken, filename: 'proof.png', bytes: png })).code, 200)
    const status = await workshopPaymentStatus({ reference, accessToken }, false)
    assert.equal(status.proofSubmitted, true)
    assert.equal(status.canChangeMethod, false)
    await assert.rejects(changeWorkshopPaymentMethod({ reference, accessToken, attemptId: attempt.rows[0].id, method: 'on_site' }), /comprobante está en revisión/)
    const proofs = await pool.query('SELECT id,size_bytes,content_type,data,document_number,drive_file_name,drive_file_id FROM payment_proofs WHERE payment_attempt_id=$1', [attempt.rows[0].id])
    assert.equal(proofs.rows.length, 1)
    assert.equal(proofs.rows[0].content_type, 'image/png')
    assert.deepEqual(proofs.rows[0].data, png)
    assert.equal(proofs.rows[0].document_number, '12345678')
    assert.match(proofs.rows[0].drive_file_name, /^12345678_\d{4}-\d{2}-\d{2}_\d{6}_[a-f0-9]{8}\.png$/)
    assert.equal(proofs.rows[0].drive_file_id, null)
    const jobs = await pool.query("SELECT * FROM email_outbox WHERE payment_attempt_id=$1 AND kind='payment_proof_submitted'", [attempt.rows[0].id])
    assert.equal(jobs.rows.length, 1)
    assert.equal(jobs.rows[0].to_email, 'danysers@gmail.com')
    const messages = []
    const transport = { sendMail: async message => { messages.push(message); return { accepted: [message.to] } } }
    assert.equal(await processEmailJob(pool, transport, jobs.rows[0], 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(messages[0].text, /\/api\/admin\/taller\/comprobantes\//)
    assert.equal((await pool.query('SELECT status FROM registrations WHERE id=$1', [registrationId])).rows[0].status, 'pending')
    const verified = await verifyManualPayment(getDb(), { reference, eventSlug: slug, operatorId: operator.rows[0].id,
      note: 'Transferencia comprobada en la cuenta', manualReference: 'BANCO-123' })
    assert.equal(verified.code, 200, JSON.stringify(verified.body))
    const states = await pool.query('SELECT r.status AS registration_status,p.status AS payment_status FROM registrations r JOIN payment_attempts p ON p.registration_id=r.id WHERE r.id=$1', [registrationId])
    assert.equal(states.rows[0].registration_status, 'confirmed')
    assert.equal(states.rows[0].payment_status, 'approved')
    const accreditation = await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'", [registrationId])
    assert.equal(accreditation.rows.length, 1)
    assert.equal(await processEmailJob(pool, transport, accreditation.rows[0], 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(messages[1].text, /pago fue registrado.*Te esperamos/)
  } finally { await pool.end() }
})
