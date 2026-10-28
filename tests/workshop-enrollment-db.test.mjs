import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

test('complete enrollment stores pending payment and one confirmation email per registration', {
  skip: !process.env.DATABASE_URL && 'Set a disposable, migrated PostgreSQL DATABASE_URL',
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const slug = `email-flow-test-${randomUUID()}`
  const port = 31591
  const origin = `http://localhost:${port}`
  const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id',
    [slug, 'Email flow test', '2026-12-19T18:00:00Z'])
  const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at,registration_open) VALUES ($1,$2,true) RETURNING id',
    [event.rows[0].id, '2026-12-19T18:00:00Z'])
  await pool.query("INSERT INTO workshop_lots (workshop_id,number,amount_minor) VALUES ($1,1,1000000)", [workshop.rows[0].id])
  await pool.query(`INSERT INTO workshop_payment_settings
    (workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164,reminder_email)
    VALUES ($1,'danielservin.mp','Mercado Pago','5493718632884','danysers@gmail.com')`, [workshop.rows[0].id])
  // This flag only tests queuing. No SMTP is configured or contacted.
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, WORKSHOP_EVENT_SLUG: slug, SITE_ORIGIN: origin, REGISTRATION_EMAIL_READY: '1' },
  })
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(origin)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const key = randomUUID()
    const person = {
      firstName: 'Ana', lastName: 'Pérez', birthDate: '1990-04-15',
      phone: '370 4123456', email: 'ana-test@example.invalid', prayerGroup: '', movement: '',
      ecclesialState: 'laico', occupation: '', paymentDifficulty: false,
      paymentDifficultyNotes: '', paymentMethod: 'bank_transfer',
    }
    const send = (value, idempotencyKey = key) => fetch(`${origin}/api/taller/inscripciones`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(value),
    })
    const first = await send(person)
    const firstReceipt = await first.json()
    assert.equal(first.status, 201, JSON.stringify(firstReceipt))
    const replay = await send(person)
    assert.equal(replay.status, 200)
    const receipt = await replay.json()
    assert.deepEqual(receipt, firstReceipt)
    assert.equal(receipt.payment, 'bank_transfer')
    assert.equal(receipt.amountMinor, 1_000_000)
    assert.equal(receipt.transfer.alias, 'danielservin.mp')
    assert.match(receipt.transfer.whatsappUrl, /wa\.me\/5493718632884/)
    const tampered = await send({ ...person, lastName: 'Gómez' })
    assert.equal(tampered.status, 409)
    const email = await pool.query(`SELECT e.kind,e.status,r.reference,p.status AS payment_status
      FROM email_outbox e JOIN registrations r ON r.id=e.registration_id
      JOIN payment_attempts p ON p.registration_id=r.id
      WHERE r.workshop_id=$1`, [workshop.rows[0].id])
    assert.equal(email.rows.length, 1)
    assert.equal(email.rows[0].kind, 'registration_received')
    assert.equal(email.rows[0].status, 'queued')
    assert.equal(email.rows[0].payment_status, 'pending')
    assert.equal(email.rows[0].reference, receipt.reference)
    await assert.rejects(pool.query(`UPDATE payment_allocations SET due_amount_minor=1
      WHERE registration_id IN (SELECT id FROM registrations WHERE workshop_id=$1 AND reference=$2)`,
    [workshop.rows[0].id, receipt.reference]), /payment allocation snapshot is immutable/)
    await assert.rejects(pool.query(`UPDATE payment_attempts SET amount_minor=1
      WHERE registration_id IN (SELECT id FROM registrations WHERE workshop_id=$1 AND reference=$2)`,
    [workshop.rows[0].id, receipt.reference]), /payment quote is immutable/)

    const assistance = await send({ ...person, firstName: 'Luis', email: 'luis-test@example.invalid',
      paymentDifficulty: true, paymentDifficultyNotes: 'Necesita ayuda', paymentMethod: undefined }, randomUUID())
    assert.equal(assistance.status, 201)
    const assistanceReceipt = await assistance.json()
    assert.equal(assistanceReceipt.payment, 'assistance')
    assert.match(assistanceReceipt.assistanceWhatsappUrl, /wa\.me\/5493718632884/)
    const assisted = await pool.query(`SELECT a.status,e.kind,e.to_email FROM assistance_requests a
      JOIN registrations r ON r.id=a.registration_id JOIN email_outbox e ON e.registration_id=r.id
      WHERE r.workshop_id=$1`, [workshop.rows[0].id])
    assert.ok(assisted.rows.every(row => row.status === 'requested'))
    assert.deepEqual(assisted.rows.map(row => row.kind).sort(), ['assistance_review_request', 'registration_received'])
    assert.equal(assisted.rows.find(row => row.kind === 'assistance_review_request').to_email, 'danysers@gmail.com')
    const admin = await pool.query("INSERT INTO admin_users (email,role) VALUES ($1,'registration_operator') RETURNING id", [`reviewer-${randomUUID()}@example.invalid`])
    await pool.query(`UPDATE assistance_requests a SET status='approved',reviewed_by=$1,reviewed_at=now()
      FROM registrations r WHERE r.id=a.registration_id AND r.workshop_id=$2`, [admin.rows[0].id, workshop.rows[0].id])
    const approval = await pool.query(`SELECT e.kind,e.to_email FROM email_outbox e JOIN registrations r ON r.id=e.registration_id
      WHERE r.workshop_id=$1 AND e.kind='assistance_approved'`, [workshop.rows[0].id])
    assert.equal(approval.rows.length, 1)
    assert.equal(approval.rows[0].to_email, 'luis-test@example.invalid')
  } finally {
    server.kill()
    // This integration test requires a disposable database. Payment allocation
    // snapshots are intentionally immutable, so do not disable audit triggers
    // merely to delete test rows; discard the test database after the suite.
    await pool.end()
  }
})
