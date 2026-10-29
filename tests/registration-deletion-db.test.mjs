import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs', import.meta.url)

test('recoverable deletion requires the word, blocks QR/access, preserves payments and supports safe restoration', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated PostgreSQL database',
}, async () => {
  const [{ getDb }, { enrollWorkshop }, { changeRegistrationDeletion }, admin, accreditation, payments] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-enrollment.ts'), import('../lib/registration-deletion.ts'),
    import('../lib/workshop-admin.ts'), import('../lib/accreditation-workflow.ts'), import('../lib/workshop-payments.ts'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), db = getDb(), slug = 'deletion-' + randomUUID()
  Object.assign(process.env, { WORKSHOP_EVENT_SLUG: slug, MP_ENVIRONMENT: 'production', MP_CHECKOUT_ENABLED: '1',
    MP_ACCESS_TOKEN: 'FAKE_LOCAL_TEST_TOKEN', MP_SELLER_USER_ID: '111', MP_APPLICATION_ID: '222',
    MP_PUBLIC_ORIGIN: 'https://example.invalid', MP_WEBHOOK_SECRET: 'test-only-webhook-key', REGISTRATION_EMAIL_READY: '1',
    WORKSHOP_CHECKOUT_TOKEN_KEY: randomBytes(48).toString('base64url'), ACCREDITATION_TOKEN_KEY_ID: 'deletion-test',
    ACCREDITATION_TOKEN_KEY: randomBytes(32).toString('base64url') })
  try {
    const event = (await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Deletion test','2026-12-19T18:00:00Z') RETURNING id", [slug])).rows[0]
    const workshop = (await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id", [event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)', [workshop.id])
    await pool.query(`INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164,mercado_pago_enabled)
      VALUES($1,'delete.alias','Banco','5493704258770',true)`, [workshop.id])
    const operator = (await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id", ['deletion-' + randomUUID() + '@example.invalid'])).rows[0]
    let index = 0
    const person = () => { const i = ++index; return { firstName: 'Persona' + i, lastName: 'Eliminar', documentNumber: String(80000000 + i),
      birthDate: '1990-01-01', phone: '37045555' + String(i).padStart(2, '0'), email: `deletion-${i}@example.invalid`,
      ecclesialState: 'laico', paymentDifficulty: false, paymentMethod: 'bank_transfer', creationKey: randomUUID() } }
    const change = (reference, operation, confirmation = 'ELIMINAR', eventSlug = slug) => changeRegistrationDeletion(db,
      { eventSlug, operatorId: operator.id, reference, operation, confirmation })
    const approve = reference => accreditation.verifyManualPayment(db, { eventSlug: slug, operatorId: operator.id, reference,
      note: 'Pago ficticio en base descartable', manualReference: randomUUID() })
    const input = person(), enrolled = await enrollWorkshop(input); assert.equal(enrolled.code, 201)
    const ref = enrolled.body.reference, access = { reference: ref, accessToken: enrolled.body.paymentAccessToken }
    assert.equal((await approve(ref)).code, 200)
    const before = await payments.workshopPaymentStatus(access, false); assert.ok(before.accreditation)
    assert.equal((await change(ref, 'delete', '')).code, 400)
    assert.equal((await change(ref, 'delete', 'BORRAR')).code, 400)
    assert.equal((await change(ref, 'delete', 'ELIMINAR', 'another-workshop')).code, 404)
    assert.equal((await change(ref, 'delete')).code, 200)
    assert.equal((await change(ref, 'delete')).body.replayed, true)
    const saved = (await pool.query('SELECT id,status,deleted_by,registration_is_current(id) AS current,registration_is_live(id) AS live FROM registrations WHERE reference=$1', [ref])).rows[0]
    assert.equal(saved.status, 'confirmed'); assert.equal(saved.current, false); assert.equal(saved.live, true)
    assert.equal(saved.deleted_by, operator.id)
    assert.equal((await pool.query('SELECT status FROM payment_attempts WHERE registration_id=$1', [saved.id])).rows[0].status, 'approved')
    const removed = await payments.workshopPaymentStatus(access, false)
    assert.equal(removed.deleted, true); assert.equal(removed.accreditation, null); assert.equal(removed.checkoutUrl, null)
    await assert.rejects(payments.startWorkshopCheckout(access, async () => { throw Error('No provider call allowed') }), /Deleted enrollment/)
    await assert.rejects(payments.changeWorkshopPaymentMethod({ ...access, attemptId: before.attemptId, method: 'on_site' }), /eliminó/)
    const credential = (await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1', [saved.id])).rows[0]
    await assert.rejects(pool.query('INSERT INTO check_ins(registration_id,credential_id,scanned_by) VALUES($1,$2,$3)', [saved.id, credential.id, operator.id]), /invalid accreditation/)
    assert.equal((await enrollWorkshop(input)).code, 409, 'an old creation key cannot resurrect an eliminated registration')
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM email_outbox WHERE registration_id=$1 AND status IN ('queued','failed','sending')", [saved.id])).rows[0].n, 0)
    const duplicate = await enrollWorkshop({ ...input, creationKey: randomUUID() }); assert.equal(duplicate.code, 201)
    assert.equal((await change(ref, 'restore')).code, 409, 'restoration must not duplicate a new enrollment')
    assert.equal((await change(duplicate.body.reference, 'delete')).code, 200)
    const other = await enrollWorkshop(person()); assert.equal(other.code, 201)
    await pool.query('UPDATE workshops SET capacity=1 WHERE id=$1', [workshop.id])
    assert.equal((await change(ref, 'restore')).code, 409, 'restoration cannot overbook a filled workshop')
    await pool.query('UPDATE workshops SET capacity=NULL WHERE id=$1', [workshop.id])
    assert.equal((await change(ref, 'restore')).code, 200)
    assert.equal((await payments.workshopPaymentStatus(access, false)).accreditation.qrDataUrl, before.accreditation.qrDataUrl)
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE subject_id=$1 AND action IN ('registration.deleted','registration.restored')", [saved.id])).rows[0].n, 2)
    // Deleting a group's payer cannot prevent the remaining person from paying.
    const draft = { mode: 'new', people: [person(), person()], payerIndex: 0, paymentMethod: 'bank_transfer', idempotencyKey: randomUUID(), eventSlug: slug, operatorId: operator.id }
    const quote = await admin.quoteOrCreateGroup(db, draft, false)
    const group = await admin.quoteOrCreateGroup(db, { ...draft, expectedQuoteHash: quote.body.quoteHash }, true); assert.equal(group.code, 201)
    assert.equal((await change(group.body.payerReference, 'delete')).code, 200)
    const member = group.body.references.find(value => value !== group.body.payerReference)
    assert.equal((await approve(member)).code, 200)
    assert.equal((await pool.query('SELECT status FROM payment_attempts WHERE id=$1', [group.body.attemptId])).rows[0].status, 'approved')
    assert.equal((await change(group.body.payerReference, 'restore')).code, 200)
    assert.equal((await pool.query('SELECT status FROM registrations WHERE reference=$1', [group.body.payerReference])).rows[0].status, 'confirmed')
    // A provider event arriving after deletion is still recorded, without issuing
    // a usable QR. Restoration may then confirm the already-paid place.
    const online = await enrollWorkshop({ ...person(), paymentMethod: 'mercado_pago' }); assert.equal(online.code, 201)
    const onlineAccess = { reference: online.body.reference, accessToken: online.body.paymentAccessToken }
    const attempt = (await pool.query('SELECT p.* FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id WHERE r.reference=$1', [online.body.reference])).rows[0]
    const orderId = 'ORD' + randomBytes(12).toString('hex').toUpperCase()
    await payments.startWorkshopCheckout(onlineAccess, async () => ({ id: orderId, checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=' + orderId }))
    assert.equal((await change(online.body.reference, 'delete')).code, 200)
    const raw = { id: orderId, external_reference: attempt.external_reference, country_code: 'ARG', currency: 'ARS',
      total_amount: '10188.49', total_paid_amount: '10188.49', status: 'processed', status_detail: 'accredited', user_id: '111',
      integration_data: { application_id: '222' }, last_updated_date: '2026-10-29T01:00:00Z', transactions: {
        payments: [{ id: 'PAY' + randomBytes(12).toString('hex').toUpperCase(), status: 'processed', status_detail: 'accredited',
          amount: '10188.49', paid_amount: '10188.49', payment_method: { type: 'credit_card', id: 'visa', installments: 1 } }], refunds: [], chargebacks: [] } }
    await payments.reconcileWorkshopOrder(orderId, async () => raw)
    assert.equal((await payments.workshopPaymentStatus(onlineAccess, false)).status, 'approved')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accreditation_credentials WHERE registration_id=$1', [attempt.registration_id])).rows[0].n, 0)
    assert.equal((await change(online.body.reference, 'restore')).code, 200)
    assert.ok((await payments.workshopPaymentStatus(onlineAccess, false)).accreditation)
    await pool.query('INSERT INTO check_ins(registration_id,credential_id,scanned_by) VALUES($1,$2,$3)', [saved.id, credential.id, operator.id])
    assert.equal((await change(ref, 'delete')).code, 409, 'an admitted person remains in attendance control')
  } finally { await pool.end(); await db.$client.end() }
})
