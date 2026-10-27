import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'

// Run only against a newly created, disposable and migrated PostgreSQL DB:
// RUN_GROUP_WORKFLOW_DB_TEST=1 DATABASE_URL=... node --experimental-loader ./tests/ts-server-loader.mjs --experimental-strip-types --test tests/group-workflow-db.test.mjs
test('admin pricing and group charges integrate with allocations, email and QR', {
  skip: !process.env.DATABASE_URL || process.env.RUN_GROUP_WORKFLOW_DB_TEST !== '1'
    ? 'Set RUN_GROUP_WORKFLOW_DB_TEST=1 with a disposable, migrated PostgreSQL DATABASE_URL' : false,
}, async () => {
  const [{ getDb }, admin, { verifyManualPayment }, { processEmailJob }] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-admin.ts'), import('../lib/accreditation-workflow.ts'),
    import('../scripts/email-worker.mjs'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = getDb()
  const slug = `group-test-${randomUUID()}`
  process.env.REGISTRATION_EMAIL_READY = '1'
  process.env.ACCREDITATION_TOKEN_KEY_ID = 'group-test'
  process.env.ACCREDITATION_TOKEN_KEY = randomBytes(32).toString('base64url')
  try {
    const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id',
      [slug, 'Group test', '2026-12-19T18:00:00Z'])
    const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at,registration_open) VALUES ($1,$2,true) RETURNING id',
      [event.rows[0].id, '2026-12-19T18:00:00Z'])
    const workshopId = workshop.rows[0].id
    const operator = await pool.query("INSERT INTO admin_users (email,role) VALUES ($1,'configuration') RETURNING id",
      [`group-${randomUUID()}@example.invalid`])
    const operatorId = operator.rows[0].id
    for (const [number, amount] of [[1, 1_000_000], [2, 1_500_000], [3, 2_000_000]]) {
      await pool.query('INSERT INTO workshop_lots (workshop_id,number,amount_minor) VALUES ($1,$2,$3)', [workshopId, number, amount])
    }
    await pool.query(`INSERT INTO workshop_payment_settings
      (workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164)
      VALUES ($1,'danielservin.mp','Mercado Pago','5493718632884')`, [workshopId])
    assert.equal((await admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId,
      change: { type: 'lot', number: 1, amountMinor: 1_200_000 } })).code, 200)
    const promo = { type: 'promotion', code: '3X2-TEST', kind: 'bundle', active: true,
      bundleSize: 3, payablePeople: 2, startsAt: null, endsAt: null }
    assert.equal((await admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId, change: promo })).code, 200)
    const config = await admin.readWorkshopPricing(db, slug)
    assert.equal(config.lots.find(lot => lot.number === 1).amountMinor, 1_200_000)
    const promoId = config.promotions.find(value => value.code === promo.code).id
    const people = ['Ana', 'Luis', 'Clara'].map((firstName, i) => ({ firstName, lastName: 'Prueba',
      birthDate: '1990-04-15', phone: `37041234${i}0`, email: `person-${i}@example.invalid`, ecclesialState: 'laico' }))
    const draft = { mode: 'new', people, payerIndex: 0, paymentMethod: 'bank_transfer', promotionId: promoId,
      idempotencyKey: randomUUID(), eventSlug: slug, operatorId }
    const preview = await admin.quoteOrCreateGroup(db, draft, false)
    assert.equal(preview.code, 200, JSON.stringify(preview.body))
    assert.equal(preview.body.amountMinor, 2_400_000)
    assert.deepEqual(preview.body.members.map(member => member.dueAmountMinor), [1_200_000, 1_200_000, 0])
    assert.equal((await admin.quoteOrCreateGroup(db, { ...draft, expectedQuoteHash: '0'.repeat(64) }, true)).code, 409)
    const created = await admin.quoteOrCreateGroup(db, { ...draft, expectedQuoteHash: preview.body.quoteHash }, true)
    assert.equal(created.code, 201, JSON.stringify(created.body))
    assert.equal(created.body.references.length, 3)
    assert.equal((await admin.quoteOrCreateGroup(db, { ...draft, expectedQuoteHash: preview.body.quoteHash }, true)).body.replayed, true)
    const allocations = await pool.query(`SELECT a.due_amount_minor,p.amount_minor,p.status,p.group_request_hash
      FROM payment_allocations a JOIN payment_attempts p ON p.id=a.attempt_id WHERE p.id=$1 ORDER BY a.created_at,a.id`,
    [created.body.attemptId])
    assert.equal(allocations.rows.length, 3)
    assert.equal(allocations.rows.reduce((sum, row) => sum + row.due_amount_minor, 0), 2_400_000)
    assert.ok(allocations.rows.every(row => row.status === 'pending' && row.group_request_hash))
    const jobs = await pool.query('SELECT kind,payment_attempt_id FROM email_outbox WHERE payment_attempt_id=$1', [created.body.attemptId])
    assert.equal(jobs.rows.length, 3)
    assert.ok(jobs.rows.every(row => row.kind === 'group_payment_notice'))
    const notices = (await pool.query('SELECT * FROM email_outbox WHERE payment_attempt_id=$1 ORDER BY created_at,id',
      [created.body.attemptId])).rows
    const delivered = []
    const fakeTransport = { sendMail: async message => { delivered.push(message); return { accepted: [message.to] } } }
    for (const job of notices) assert.equal(await processEmailJob(pool, fakeTransport, job, 'contactos@vamosalsantisimo.com'), 'sent')
    assert.equal(delivered.length, 3)
    assert.equal(delivered.filter(message => message.text.includes('Importe') || message.text.includes('total del grupo')).length, 1)
    assert.equal(delivered.filter(message => message.text.includes('danielservin.mp')).length, 1)
    const usedChange = await admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId,
      change: { ...promo, id: promoId, payablePeople: 1 } })
    assert.equal(usedChange.code, 409, 'used promo terms must remain immutable')
    assert.equal((await admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId,
      change: { ...promo, id: promoId, active: false } })).code, 200)
    const verified = await verifyManualPayment(db, { reference: created.body.references[1],
      eventSlug: slug, operatorId, note: 'Transferencia grupal verificada', manualReference: 'TEST-TRANSFER' })
    assert.equal(verified.code, 200, JSON.stringify(verified.body))
    assert.equal(verified.body.accreditedPeople, 3)
    const credentials = await pool.query(`SELECT count(*)::int AS n FROM accreditation_credentials c
      JOIN payment_allocations a ON a.registration_id=c.registration_id WHERE a.attempt_id=$1`, [created.body.attemptId])
    assert.equal(credentials.rows[0].n, 3)

    // Existing individual registrations can be regrouped only while unpaid.
    const existingRefs = []
    for (let i = 0; i < 2; i++) {
      const ref = `EXISTING-${randomUUID()}`
      existingRefs.push(ref)
      const person = await pool.query(`INSERT INTO registrations
        (workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [workshopId, ref, randomBytes(32).toString('hex'), randomUUID(), `Member ${i}`, `member ${i}`,
        `member-${i}@example.invalid`, `member-${i}@example.invalid`, `37049999${i}0`, `37049999${i}0`])
      const registrationId = person.rows[0].id
      await pool.query(`INSERT INTO registration_intakes (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty)
        VALUES ($1,'Member','Prueba','1990-04-15','laico',false)`, [registrationId])
      await pool.query('INSERT INTO reservations (registration_id,expires_at) VALUES ($1,$2)', [registrationId, '2026-12-19T18:00:00Z'])
      const attempt = await pool.query(`INSERT INTO payment_attempts (registration_id,idempotency_key,source,status,amount_minor)
        VALUES ($1,$2,'bank_transfer','created',1200000) RETURNING id`, [registrationId, randomUUID()])
      const lotId = config.lots.find(lot => lot.number === 1).id
      await pool.query(`INSERT INTO payment_allocations (attempt_id,registration_id,lot_id,lot_number,base_amount_minor,due_amount_minor)
        VALUES ($1,$2,$3,1,1200000,1200000)`, [attempt.rows[0].id, registrationId, lotId])
      await pool.query("UPDATE payment_attempts SET status='pending' WHERE id=$1", [attempt.rows[0].id])
      await pool.query(`INSERT INTO email_outbox (dedupe_key,kind,to_email,registration_id)
        VALUES ($1,'registration_received',$2,$3)`, [`individual:${registrationId}`, `member-${i}@example.invalid`, registrationId])
    }
    const searchable = await admin.searchPendingIndividualRegistrations(db, slug, 'member-')
    assert.deepEqual(searchable.map(row => row.reference).sort(), [...existingRefs].sort())
    const second = { mode: 'existing', references: existingRefs, payerReference: existingRefs[0],
      paymentMethod: 'on_site', idempotencyKey: randomUUID(), eventSlug: slug, operatorId }
    const secondQuote = await admin.quoteOrCreateGroup(db, second, false)
    assert.equal(secondQuote.code, 200, JSON.stringify(secondQuote.body))
    assert.equal(secondQuote.body.amountMinor, 2_400_000)
    const regrouped = await admin.quoteOrCreateGroup(db, { ...second, expectedQuoteHash: secondQuote.body.quoteHash }, true)
    assert.equal(regrouped.code, 201, JSON.stringify(regrouped.body))
    const old = await pool.query(`SELECT status FROM payment_attempts WHERE registration_id IN
      (SELECT id FROM registrations WHERE reference=ANY($1)) AND id<>$2`, [existingRefs, regrouped.body.attemptId])
    assert.ok(old.rows.every(row => row.status === 'cancelled'))
    const oldMail = await pool.query(`SELECT status FROM email_outbox WHERE dedupe_key LIKE 'individual:%'
      AND registration_id IN (SELECT id FROM registrations WHERE reference=ANY($1))`, [existingRefs])
    assert.ok(oldMail.rows.every(row => row.status === 'cancelled'))
    assert.equal((await admin.searchPendingIndividualRegistrations(db, slug, 'member-')).length, 0)
    const secondVerified = await verifyManualPayment(db, { reference: existingRefs[1], eventSlug: slug,
      operatorId, note: 'Efectivo grupal recibido', manualReference: 'TEST-CASH' })
    assert.equal(secondVerified.code, 200, JSON.stringify(secondVerified.body))
    assert.equal(secondVerified.body.accreditedPeople, 2)
  } finally { await pool.end() }
})
