import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs', import.meta.url)

test('archival excludes old records from live counts, preserves data and leaves new enrollments active', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated PostgreSQL database',
}, async () => {
  const [{ getDb }, { enrollWorkshop }, { changeRegistrationDeletion }, accreditation, payments] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-enrollment.ts'), import('../lib/registration-deletion.ts'),
    import('../lib/accreditation-workflow.ts'), import('../lib/workshop-payments.ts'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), db = getDb(), slug = 'archive-' + randomUUID()
  Object.assign(process.env, { WORKSHOP_EVENT_SLUG: slug, MP_ENVIRONMENT: 'production', REGISTRATION_EMAIL_READY: '1',
    MP_CHECKOUT_ENABLED: '1', MP_ACCESS_TOKEN: 'FAKE_LOCAL_TEST_TOKEN', MP_SELLER_USER_ID: '111', MP_APPLICATION_ID: '222',
    MP_PUBLIC_ORIGIN: 'https://example.invalid', MP_WEBHOOK_SECRET: 'test-webhook-key',
    WORKSHOP_CHECKOUT_TOKEN_KEY: randomBytes(48).toString('base64url'), ACCREDITATION_TOKEN_KEY_ID: 'archive-test',
    ACCREDITATION_TOKEN_KEY: randomBytes(32).toString('base64url') })
  try {
    const event = (await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Archive test','2026-12-19T18:00:00Z') RETURNING id", [slug])).rows[0]
    const workshop = (await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at,capacity) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day',1) RETURNING id", [event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)', [workshop.id])
    await pool.query(`INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164)
      VALUES($1,'archive.alias','Banco','5493704258770')`, [workshop.id])
    const operator = (await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id", ['archive-' + randomUUID() + '@example.invalid'])).rows[0]
    const person = { firstName: 'Ana', lastName: 'Archivo', documentNumber: '88000001', birthDate: '1990-01-01',
      phone: '3704000001', email: 'archive@example.invalid', ecclesialState: 'laico', paymentDifficulty: false,
      paymentMethod: 'bank_transfer', creationKey: randomUUID() }
    const receipt = await enrollWorkshop(person); assert.equal(receipt.code, 201)
    assert.equal((await accreditation.verifyManualPayment(db, { eventSlug: slug, operatorId: operator.id, reference: receipt.body.reference,
      note: 'Pago ficticio en base descartable', manualReference: randomUUID() })).code, 200)
    const access = { reference: receipt.body.reference, accessToken: receipt.body.paymentAccessToken }
    const before = await payments.workshopPaymentStatus(access, false)
    const change = operation => changeRegistrationDeletion(db, { eventSlug: slug, operatorId: operator.id, reference: access.reference, operation, confirmation: 'ELIMINAR' })
    const activeCount = async () => (await pool.query('SELECT count(*)::int AS n FROM registrations WHERE workshop_id=$1 AND archived_at IS NULL AND deleted_at IS NULL', [workshop.id])).rows[0].n
    assert.equal(await activeCount(), 1)
    assert.equal((await change('archive')).code, 200)
    assert.equal((await change('archive')).body.replayed, true)
    assert.equal(await activeCount(), 0)
    const stored = (await pool.query('SELECT * FROM registrations WHERE reference=$1', [access.reference])).rows[0]
    assert.equal(stored.status, 'confirmed'); assert.equal(stored.deleted_at, null); assert.ok(stored.archived_at)
    assert.equal(stored.archived_by, operator.id)
    assert.equal((await pool.query('SELECT status FROM payment_attempts WHERE registration_id=$1', [stored.id])).rows[0].status, 'approved')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM registration_intakes WHERE registration_id=$1', [stored.id])).rows[0].n, 1)
    assert.equal((await pool.query('SELECT workshop_lot_paid_places($1,1) AS n', [workshop.id])).rows[0].n, 0)
    const archived = await payments.workshopPaymentStatus(access, false)
    assert.equal(archived.archived, true); assert.equal(archived.accreditation, null); assert.equal(archived.checkoutUrl, null)
    await assert.rejects(payments.startWorkshopCheckout(access, async () => { throw Error('No provider request allowed') }), /Archived enrollment/)
    const credential = (await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1', [stored.id])).rows[0]
    await assert.rejects(pool.query('INSERT INTO check_ins(registration_id,credential_id,scanned_by) VALUES($1,$2,$3)', [stored.id, credential.id, operator.id]), /invalid accreditation/)
    const fresh = await enrollWorkshop({ ...person, firstName: 'Nueva', documentNumber: '88000002', email: 'new-archive@example.invalid', creationKey: randomUUID() })
    assert.equal(fresh.code, 201, 'an archived seat must not block new production enrollments')
    assert.equal(await activeCount(), 1)
    assert.equal((await pool.query('SELECT archived_at,deleted_at FROM registrations WHERE reference=$1', [fresh.body.reference])).rows[0].archived_at, null)
    assert.equal((await change('unarchive')).code, 409, 'restoration must respect capacity')
    await pool.query('UPDATE workshops SET capacity=NULL WHERE id=$1', [workshop.id])
    assert.equal((await change('unarchive')).code, 200)
    assert.equal((await payments.workshopPaymentStatus(access, false)).accreditation.qrDataUrl, before.accreditation.qrDataUrl)
    assert.equal((await change('archive')).code, 200)
    assert.equal((await change('delete')).code, 200)
    assert.equal((await change('restore')).code, 200)
    const restored = (await pool.query('SELECT deleted_at,archived_at FROM registrations WHERE reference=$1', [access.reference])).rows[0]
    assert.equal(restored.deleted_at, null); assert.ok(restored.archived_at, 'restoring from Eliminadas must preserve archival')
    assert.equal(await activeCount(), 1)
  } finally { await pool.end(); await db.$client.end() }
})
