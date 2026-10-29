import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
import { processLotAutomation } from '../scripts/lot-automation.mjs'
import { processEmailJob } from '../scripts/email-worker.mjs'
register('./ts-server-loader.mjs', import.meta.url)

test('paid-place thresholds advance lots atomically, preserve quotes and queue recoverable organizer mail', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated test database',
}, async () => {
  const [{ getDb }, { enrollWorkshop }, admin, { verifyManualPayment }] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-enrollment.ts'), import('../lib/workshop-admin.ts'),
    import('../lib/accreditation-workflow.ts'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), db = getDb(), slug = 'lots-' + randomUUID()
  Object.assign(process.env, { WORKSHOP_EVENT_SLUG: slug, REGISTRATION_EMAIL_READY: '1', MP_ENVIRONMENT: 'production',
    WORKSHOP_SANDBOX_REGISTRATIONS: '0', WORKSHOP_CHECKOUT_TOKEN_KEY: 'lot-checkout-secret-'.repeat(4),
    ACCREDITATION_TOKEN_KEY_ID: 'lot-test', ACCREDITATION_TOKEN_KEY: randomBytes(32).toString('base64url') })
  try {
    const event = (await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Lotes de prueba','2026-12-19T18:00:00Z') RETURNING id", [slug])).rows[0]
    const workshop = (await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id", [event.id])).rows[0]
    for (const [number, amount] of [[1, 1_000_000], [2, 1_500_000], [3, 2_000_000]]) {
      await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,$2,$3)', [workshop.id, number, amount])
    }
    await pool.query(`INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164,on_site_price_minor,reminder_email)
      VALUES($1,'lot.alias','Banco','5493704258770',2500000,'organizer@example.invalid')`, [workshop.id])
    const operator = (await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id", ['lots-' + randomUUID() + '@example.invalid'])).rows[0]
    let index = 0
    const person = () => {
      const i = ++index
      return { firstName: 'Persona' + i, lastName: 'Lotes', documentNumber: String(90000000 + i), birthDate: '1990-01-01',
        phone: '37040000' + String(i).padStart(2, '0'), email: `lots-${i}@example.invalid`, country: 'Argentina', province: 'Formosa',
        ecclesialState: 'laico', paymentDifficulty: false, paymentMethod: 'bank_transfer', creationKey: randomUUID() }
    }
    const config = enabled => admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId: operator.id,
      change: { type: 'lot_automation', enabled, notificationEmail: 'organizer@example.invalid', limits: { lot1: 2, lot2: 1 } } })
    const active = async () => (await pool.query('SELECT active_lot FROM workshops WHERE id=$1', [workshop.id])).rows[0].active_lot
    const approve = reference => verifyManualPayment(db, { eventSlug: slug, operatorId: operator.id, reference,
      note: 'Pago ficticio en base descartable', manualReference: randomUUID() })
    const count = async number => (await pool.query('SELECT workshop_lot_paid_places($1,$2) AS count', [workshop.id, number])).rows[0].count
    assert.equal((await config(true)).code, 200)
    const oldPending = await enrollWorkshop(person()); assert.equal(oldPending.code, 201)
    assert.equal(await count(1), 0)
    const promotion = (await pool.query(`INSERT INTO workshop_promotions(workshop_id,code,kind,active,bundle_size,payable_people)
      VALUES($1,'2X1','bundle',true,2,1) RETURNING id`, [workshop.id])).rows[0]
    const groupDraft = { mode: 'new', people: [person(), person()], payerIndex: 0, paymentMethod: 'bank_transfer',
      promotionId: promotion.id, idempotencyKey: randomUUID(), eventSlug: slug, operatorId: operator.id }
    const quote = await admin.quoteOrCreateGroup(db, groupDraft, false); assert.equal(quote.code, 200)
    assert.equal(quote.body.amountMinor, 1_000_000, 'a 2x1 payment still covers two places')
    const group = await admin.quoteOrCreateGroup(db, { ...groupDraft, expectedQuoteHash: quote.body.quoteHash }, true)
    assert.equal(group.code, 201, JSON.stringify(group.body))
    await processLotAutomation(pool); assert.equal(await active(), 1, 'pending places do not advance the lot')
    assert.equal((await approve(group.body.payerReference)).code, 200)
    assert.equal(await count(1), 2, 'one group payment covers two places')
    assert.equal(await active(), 2, 'the confirming payment advances in its own transaction')
    const after = await admin.readWorkshopPricing(db, slug)
    assert.equal(after.lotAutomation.history.length, 1)
    assert.equal(after.lotAutomation.history[0].emailStatus, 'queued')
    assert.equal(after.lots[0].paidPlaces, 2)
    const oldAllocation = (await pool.query(`SELECT a.base_amount_minor FROM payment_allocations a
      JOIN registrations r ON r.id=a.registration_id WHERE r.reference=$1`, [oldPending.body.reference])).rows[0]
    assert.equal(oldAllocation.base_amount_minor, 1_000_000, 'already issued quotes are frozen')
    const oldId = (await pool.query('SELECT id FROM registrations WHERE reference=$1', [oldPending.body.reference])).rows[0].id
    await pool.query('UPDATE registrations SET is_test=true WHERE id=$1', [oldId])
    await pool.query(`UPDATE payment_attempts SET status='approved',paid_amount_minor=amount_minor,
      manual_verified_by=$2,manual_verified_at=now() WHERE registration_id=$1`, [oldId, operator.id])
    await pool.query("UPDATE registrations SET status='confirmed' WHERE id=$1", [oldId])
    assert.equal(await count(1), 2, 'the historical registration is excluded')
    const onsite = await enrollWorkshop({ ...person(), paymentMethod: 'on_site' }); assert.equal(onsite.code, 201)
    assert.equal((await approve(onsite.body.reference)).code, 200)
    assert.equal(await count(2), 0, 'ventanilla payments do not consume lots')
    const secondLot = await enrollWorkshop(person()); assert.equal(secondLot.body.amountMinor, 1_500_000)
    assert.equal((await config(false)).code, 200)
    assert.equal((await approve(secondLot.body.reference)).code, 200)
    assert.equal(await active(), 2, 'disabled automation preserves manual control')
    // Simulate a restart after a payment commits while automation is paused.
    await pool.query('UPDATE workshops SET lot_automation_enabled=true WHERE id=$1', [workshop.id])
    await Promise.all([processLotAutomation(pool), processLotAutomation(pool), processLotAutomation(pool)])
    assert.equal(await active(), 3)
    const changes = (await pool.query('SELECT * FROM workshop_lot_changes WHERE workshop_id=$1 ORDER BY created_at', [workshop.id])).rows
    assert.equal(changes.length, 2, 'concurrent workers do not duplicate transitions')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_outbox WHERE lot_change_id=ANY($1::uuid[])', [changes.map(x => x.id)])).rows[0].n, 2)
    // Repeated checks and reversals cannot reopen a cheaper lot.
    await pool.query("UPDATE payment_attempts SET status='refunded' WHERE id=$1", [group.body.attemptId])
    assert.equal(await count(1), 0)
    await processLotAutomation(pool); assert.equal(await active(), 3)
    const final = await enrollWorkshop(person()); assert.equal(final.body.amountMinor, 2_000_000)
    assert.equal((await approve(final.body.reference)).code, 200); assert.equal(await active(), 3)
    const jobs = (await pool.query('SELECT * FROM email_outbox WHERE lot_change_id=ANY($1::uuid[]) ORDER BY created_at', [changes.map(x => x.id)])).rows
    const messages = [], transport = { sendMail: async message => { messages.push(message); return { accepted: [message.to] } } }
    assert.equal(await processEmailJob(pool, { sendMail: async () => { throw Error('temporary SMTP outage') } }, jobs[0], 'contactos@vamosalsantisimo.com'), 'failed')
    assert.equal(await active(), 3, 'mail failures never undo the pricing change')
    const failed = (await pool.query('SELECT * FROM email_outbox WHERE id=$1', [jobs[0].id])).rows[0]
    assert.equal(await processEmailJob(pool, transport, failed, 'contactos@vamosalsantisimo.com'), 'sent')
    assert.match(messages[0].subject, /Lote 2 activado/)
    assert.match(messages[0].text, /2 personas/)
    assert.doesNotMatch(messages[0].subject, /PRUEBA/)
    assert.equal(messages[0].to, 'organizer@example.invalid')
    const invalid = await admin.updateWorkshopPricing(db, { eventSlug: slug, operatorId: operator.id,
      change: { type: 'lot_automation', enabled: true, notificationEmail: '', limits: { lot1: 1, lot2: 1 } } })
    assert.equal(invalid.code, 400)
    await pool.query('SELECT advance_workshop_lot($1)', [workshop.id])
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM workshop_lot_changes WHERE workshop_id=$1', [workshop.id])).rows[0].n, 2)
  } finally { await pool.end(); await db.$client.end() }
})
