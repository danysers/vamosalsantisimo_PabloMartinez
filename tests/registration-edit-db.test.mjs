import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import { spawn } from 'node:child_process'
import { hashPassword } from 'better-auth/crypto'
import pg from 'pg'
register('./ts-server-loader.mjs', import.meta.url)

test('registration detail and edits preserve financial history, enforce conflicts, protect recovery and require a linked operator', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated PostgreSQL database',
}, async t => {
  const [{ getDb }, { enrollWorkshop }, { verifyManualPayment }, { readAdminRegistration, editAdminRegistration }] = await Promise.all([
    import('../lib/db.ts'), import('../lib/workshop-enrollment.ts'), import('../lib/accreditation-workflow.ts'), import('../lib/registration-admin.ts'),
  ])
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), db = getDb(), slug = 'editing-' + randomUUID()
  Object.assign(process.env, { WORKSHOP_EVENT_SLUG: slug, MP_ENVIRONMENT: 'production', REGISTRATION_EMAIL_READY: '1',
    MP_CHECKOUT_ENABLED: '1', MP_ACCESS_TOKEN: 'FAKE_LOCAL_TEST_TOKEN', MP_SELLER_USER_ID: '111', MP_APPLICATION_ID: '222',
    MP_PUBLIC_ORIGIN: 'https://example.invalid', MP_WEBHOOK_SECRET: 'fake-test-webhook-key',
    WORKSHOP_CHECKOUT_TOKEN_KEY: randomBytes(48).toString('base64url'), ACCREDITATION_TOKEN_KEY_ID: 'editing-test',
    ACCREDITATION_TOKEN_KEY: randomBytes(32).toString('base64url') })
  const servers = []
  const origin = 'http://localhost:31751'
  // This disposable server trusts a simulated proxy. Its client bucket is
  // separate from auth-login-db, which intentionally exhausts the shared
  // no-trusted-IP bucket. Production configuration is never changed.
  const proxyHeaders = { 'x-real-ip': '198.51.100.197' }
  const pause = () => new Promise(resolve => setTimeout(resolve, 100))
  let cookie = ''
  async function start(surface, port) {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface, BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), TRAFFIC_GUARD_ENABLED: '0', TRUST_REVERSE_PROXY: '1' },
    })
    servers.push(child)
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://localhost:${port}` + (surface === 'panel' ? '/admin' : '/'))).status === 200) return } catch {}
      await pause()
    }
    assert.fail('Disposable test server not ready')
  }
  try {
    const event = (await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Editing test','2026-12-19T18:00:00Z') RETURNING id", [slug])).rows[0]
    const workshop = (await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id", [event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)', [workshop.id])
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164) VALUES($1,'editing.alias','Banco','5493704258770')", [workshop.id])
    const operatorEmail = 'editor-' + randomUUID() + '@example.invalid'
    const operator = (await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id", [operatorEmail])).rows[0]
    const person = { firstName: 'Ana', lastName: 'Ruiz', documentNumber: '88220001', email: 'ana-editor@example.invalid', phone: '+5493704001234',
      country: 'Argentina', province: 'Formosa', locality: 'Formosa', birthDate: '1990-01-01', ecclesialState: 'laico', paymentDifficulty: false, paymentMethod: 'bank_transfer' }
    const receipt = await enrollWorkshop({ ...person, creationKey: randomUUID() })
    assert.equal(receipt.code, 201)
    const other = await enrollWorkshop({ ...person, firstName: 'Beatriz', documentNumber: '88220002', email: 'bea-editor@example.invalid', phone: '+5493704005678', creationKey: randomUUID() })
    assert.equal(other.code, 201)
    const reference = receipt.body.reference
    const registered = (await pool.query('SELECT id,creation_key,access_token_hash FROM registrations WHERE reference=$1', [reference])).rows[0]
    assert.equal((await verifyManualPayment(db, { eventSlug: slug, operatorId: operator.id, reference, note: 'Pago ficticio en base descartable', manualReference: randomUUID() })).code, 200)
    const paymentBefore = (await pool.query('SELECT id,status,source,amount_minor,paid_amount_minor FROM payment_attempts WHERE registration_id=$1', [registered.id])).rows
    const credentialsBefore = (await pool.query('SELECT id,version,token_hash,revoked_at FROM accreditation_credentials WHERE registration_id=$1', [registered.id])).rows
    await pool.query(`INSERT INTO payment_proofs(payment_attempt_id,registration_id,filename,content_type,size_bytes,sha256,data)
      VALUES($1,$2,'ejemplo.png','image/png',8,$3,$4)`, [paymentBefore[0].id, registered.id, 'a'.repeat(64), Buffer.from('89504e470d0a1a0a', 'hex')])
    const read = () => readAdminRegistration(db, slug, reference)
    const input = detail => ({ ...detail.fields, reference, version: detail.version, reason: 'Corrección solicitada por la persona', confirmEmailChange: false })
    const edit = data => editAdminRegistration(db, slug, operator.id, data)

    await t.test('complete private details exclude access secrets; profile corrections preserve paid status and QR', async () => {
      const detail = await read()
      assert.equal(detail.editable, true)
      assert.equal(detail.fields.birthDate, '1990-01-01')
      assert.equal(detail.payments[0].status, 'approved')
      assert.equal(detail.proofs[0].filename, 'ejemplo.png')
      assert.equal(detail.credential.issued, true)
      assert.doesNotMatch(JSON.stringify(detail), /access_token|accessToken|creation_key|creationKey|token_hash|tokenHash|ciphertext|qrDataUrl/)
      const original = input(detail)
      assert.equal((await edit({ ...original, firstName: 'Anita', nickname: 'Anita', locality: 'Clorinda' })).code, 200)
      const after = await read()
      assert.equal(after.name, 'Anita Ruiz'); assert.equal(after.fields.locality, 'Clorinda')
      assert.equal((await edit({ ...original, nickname: 'Stale change' })).code, 409)
      assert.deepEqual((await pool.query('SELECT id,status,source,amount_minor,paid_amount_minor FROM payment_attempts WHERE registration_id=$1', [registered.id])).rows, paymentBefore)
      assert.deepEqual((await pool.query('SELECT id,version,token_hash,revoked_at FROM accreditation_credentials WHERE registration_id=$1', [registered.id])).rows, credentialsBefore)
      assert.deepEqual((await pool.query('SELECT id,creation_key,access_token_hash FROM registrations WHERE id=$1', [registered.id])).rows[0], registered)
      const audit = (await pool.query("SELECT actor_id,reason,changes FROM audit_log WHERE subject_id=$1 AND action='registration.updated'", [registered.id])).rows[0]
      assert.equal(audit.actor_id, operator.id); assert.ok(audit.reason)
      assert.deepEqual(audit.changes.fields.sort(), ['firstName', 'locality', 'nickname'].sort())
    })
    await t.test('duplicates, financial payload injection and cross-event references cannot change records', async () => {
      const current = input(await read())
      assert.equal((await edit({ ...current, documentNumber: '88220002' })).code, 409)
      assert.equal((await edit({ ...current, firstName: 'Beatriz', lastName: 'Ruiz', email: 'bea-editor@example.invalid' })).code, 409)
      assert.equal((await edit({ ...current, amountMinor: 1, status: 'confirmed' })).code, 400)
      assert.equal((await editAdminRegistration(db, 'another-event', operator.id, current)).code, 404)
      assert.equal(await readAdminRegistration(db, 'another-event', reference), null)
    })
    await t.test('email changes require confirmation, wait for sending jobs, invalidate recovery and preserve operator notifications', async () => {
      const current = input(await read())
      const recovery = randomUUID()
      await pool.query("INSERT INTO registration_recoveries(id,registration_id,code_hash,code_encrypted,expires_at) VALUES($1,$2,'fake-hash','fake-code',now()+interval '10 minutes')", [recovery, registered.id])
      const internal = (await pool.query(`INSERT INTO email_outbox(dedupe_key,kind,registration_id,to_email)
        VALUES($1,'assistance_review_request',$2,$3) RETURNING id`, ['editing-internal-' + randomUUID(), registered.id, current.email])).rows[0]
      assert.equal((await edit({ ...current, email: 'corrected-editor@example.invalid' })).code, 400)
      await pool.query("UPDATE email_outbox SET status='sending' WHERE registration_id=$1 AND kind='accreditation_ready'", [registered.id])
      assert.equal((await edit({ ...current, email: 'corrected-editor@example.invalid', confirmEmailChange: true })).code, 409)
      await pool.query("UPDATE email_outbox SET status='queued' WHERE registration_id=$1 AND kind='accreditation_ready'", [registered.id])
      assert.equal((await edit({ ...current, email: 'corrected-editor@example.invalid', confirmEmailChange: true })).code, 200)
      assert.equal((await read()).fields.email, 'corrected-editor@example.invalid')
      const recovered = (await pool.query('SELECT consumed_at,code_encrypted FROM registration_recoveries WHERE id=$1', [recovery])).rows[0]
      assert.ok(recovered.consumed_at); assert.equal(recovered.code_encrypted, '')
      assert.equal((await pool.query('SELECT status FROM email_outbox WHERE id=$1', [internal.id])).rows[0].status, 'queued')
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM email_outbox WHERE registration_id=$1 AND kind IN ('registration_received','accreditation_ready') AND status<>'cancelled'", [registered.id])).rows[0].n, 0)
    })
    await t.test('concurrent corrections cannot overwrite each other and inactive records remain read-only', async () => {
      const current = input(await read())
      const results = await Promise.all([edit({ ...current, nickname: 'Una corrección' }), edit({ ...current, nickname: 'Otra corrección' })])
      assert.deepEqual(results.map(result => result.code).sort(), [200, 409])
      await pool.query('UPDATE registrations SET archived_at=now(),archived_by=$2 WHERE id=$1', [registered.id, operator.id])
      const archived = await read(); assert.equal(archived.editable, false)
      assert.equal((await edit(input(archived))).code, 409)
      await pool.query('UPDATE registrations SET archived_at=NULL,archived_by=NULL WHERE id=$1', [registered.id])
    })
    await t.test('actual HTTP routes enforce authentication, roles, origin, bounded JSON and private responses', async () => {
      const userId = randomUUID(), username = 'edit_' + randomBytes(8).toString('hex'), password = randomBytes(32).toString('hex')
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,username,role) VALUES($1,$2,$3,true,$4,$5)', [userId, 'Operador de prueba', operatorEmail, username, 'admin'])
      await pool.query('INSERT INTO "account"(id,account_id,provider_id,user_id,password,updated_at) VALUES($1,$2,$3,$2,$4,now())', [randomUUID(), userId, 'credential', await hashPassword(password)])
      await pool.query('UPDATE admin_users SET auth_user_id=$2 WHERE id=$1', [operator.id, userId])
      await start('panel', 31751)
      const path = '/api/admin/inscripciones/ficha', query = path + '?reference=' + encodeURIComponent(reference)
      assert.equal((await fetch(origin + query)).status, 401)
      const login = await fetch(origin + '/api/auth/sign-in/username', { method: 'POST', headers: { ...proxyHeaders, origin, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
      assert.equal(login.status, 200)
      cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const headers = { ...proxyHeaders, origin, cookie, 'content-type': 'application/json' }
      const mailAction = (body, change = {}) => fetch(origin + '/api/admin/inscripciones/correo', { method: 'POST', headers: { ...headers, ...change }, body: JSON.stringify(body) })
      assert.equal((await mailAction({}, { origin: 'https://evil.invalid' })).status, 403)
      assert.equal((await mailAction({ forged: true })).status, 400)
      assert.equal((await mailAction({ reason: 'x'.repeat(5000) })).status, 400)
      const result = await fetch(origin + query, { headers: { cookie } })
      assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /private.*no-store/)
      assert.equal((await fetch(origin + '/admin/inscripciones/' + reference, { headers: { cookie } })).status, 200)
      const list = await (await fetch(origin + '/admin/inscripciones', { headers: { cookie } })).text()
      assert.match(list, /Medio de pago elegido/); assert.match(list, /Transferencia \(alias \/ QR\)/)
      assert.match(list, new RegExp(`/admin/inscripciones/${reference}\\?editar=1`))
      const editPage = await (await fetch(origin + '/admin/inscripciones/' + reference + '?editar=1', { headers: { cookie } })).text()
      assert.match(editPage, /Editar datos de inscripción/); assert.match(editPage, /Guardar cambios/)
      const editableInput = editPage.match(/<input[^>]*id="edit-firstName"[^>]*>/)?.[0]
      assert.ok(editableInput); assert.doesNotMatch(editableInput, /readonly/i)
      const overview = await (await fetch(origin + '/admin', { headers: { cookie } })).text()
      assert.match(overview, /Medio de pago elegido/); assert.match(overview, /Transferencia \(alias \/ QR\)/)
      const proofList = await fetch(origin + '/api/admin/taller/comprobantes', { headers: { cookie } })
      assert.equal(proofList.status, 200)
      assert.equal((await proofList.json()).proofs.find(proof => proof.reference === reference).payment_source, 'bank_transfer')
      const payload = { ...input((await result.json()).registration), nickname: 'Corrección desde el panel' }
      const post = (body, change = {}) => fetch(origin + path, { method: 'PATCH', headers: { ...headers, ...change }, body: JSON.stringify(body) })
      assert.equal((await post(payload, { origin: 'https://evil.invalid' })).status, 403)
      assert.equal((await post({ ...payload, operatorId: 'forged' })).status, 400)
      assert.equal((await post({ ...payload, reason: 'x'.repeat(20000) })).status, 400)
      const beforeCount = (await pool.query('SELECT count(*)::int AS n FROM email_outbox WHERE registration_id=$1', [registered.id])).rows[0].n
      assert.equal((await post(payload)).status, 200)
      assert.equal((await read()).fields.nickname, 'Corrección desde el panel')
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM email_outbox WHERE registration_id=$1', [registered.id])).rows[0].n, beforeCount)
      await pool.query("UPDATE admin_users SET role='admission_operator' WHERE id=$1", [operator.id])
      assert.equal((await mailAction({})).status, 403)
      assert.equal((await fetch(origin + query, { headers: { cookie } })).status, 403)
      assert.equal((await post(payload)).status, 403)
      assert.equal((await fetch(origin + '/admin/inscripciones/' + reference, { headers: { cookie } })).status, 404)
      await pool.query("UPDATE admin_users SET role='configuration',disabled=true WHERE id=$1", [operator.id])
      assert.equal((await fetch(origin + query, { headers: { cookie } })).status, 403)
      const logout = await fetch(origin + '/api/auth/sign-out', { method: 'POST', headers, body: '{}' })
      assert.equal(logout.status, 200); cookie = ''
      await start('public', 31752)
      assert.equal((await fetch('http://localhost:31752' + query)).status, 404)
      assert.equal((await fetch('http://localhost:31752/admin/inscripciones/' + reference)).status, 404)
    })
    assert.deepEqual((await pool.query('SELECT id,status,source,amount_minor,paid_amount_minor FROM payment_attempts WHERE registration_id=$1', [registered.id])).rows, paymentBefore)
    assert.deepEqual((await pool.query('SELECT id,version,token_hash,revoked_at FROM accreditation_credentials WHERE registration_id=$1', [registered.id])).rows, credentialsBefore)
    assert.deepEqual((await pool.query('SELECT id,creation_key,access_token_hash FROM registrations WHERE id=$1', [registered.id])).rows[0], registered)
  } finally {
    for (const child of servers) child.kill()
    await pool.end(); await db.$client.end()
  }
})
