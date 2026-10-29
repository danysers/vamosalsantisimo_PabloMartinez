import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { createAccreditationQr, decryptAccreditationQr } from '../lib/accreditation-token.ts'

test('admin and auth routes fail closed without local setup', async () => {
  const port = 31589
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, APP_SURFACE: 'panel', DATABASE_URL: '', BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: '' },
  })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const panelRoot = await fetch(base, { redirect: 'manual' })
    assert.equal(panelRoot.status, 307)
    assert.equal(new URL(panelRoot.headers.get('location'), base).pathname, '/admin')
    assert.equal((await fetch(`${base}/formacion`)).status, 404)
    const admin = await fetch(`${base}/admin`, { redirect: 'manual' })
    assert.equal(admin.status, 200)
    assert.match(admin.headers.get('cache-control') ?? '', /no-store/)
    assert.match(admin.headers.get('x-robots-tag') ?? '', /noindex/)
    assert.match(await admin.text(), /Administración local no configurada/)
    assert.equal((await fetch(`${base}/admin/inscripciones`, { redirect: 'manual' })).status, 404)
    const review = await fetch(`${base}/api/admin/assistance/decision`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ registrationId: '00000000-0000-4000-8000-000000000000', decision: 'approved', note: '' }),
    })
    assert.equal(review.status, 503)
    assert.match(review.headers.get('cache-control') ?? '', /no-store/)
    const signUp = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bad@example.invalid', password: 'unsafe', name: 'Attacker' }),
    })
    assert.equal(signUp.status, 503)
    assert.match(signUp.headers.get('cache-control') ?? '', /no-store/)
    assert.match(signUp.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
  } finally { server.kill() }
})

test('configured admin remains private and denies public signup', { skip: !process.env.DATABASE_URL && 'Set a disposable PostgreSQL DATABASE_URL' }, async t => {
  const port = 31590
  const base = `http://localhost:${port}`
  const accreditationKey = randomBytes(32).toString('base64url')
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, APP_SURFACE: 'panel', BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), WORKSHOP_EVENT_SLUG: 'formacion-catolica-2026', ACCREDITATION_TOKEN_KEY_ID: 'test', ACCREDITATION_TOKEN_KEY: accreditationKey, ADMISSION_SCAN_ENABLED: '1' },
  })
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const admin = await fetch(`${base}/admin`, { redirect: 'manual' })
    assert.equal(admin.status, 200)
    assert.match(admin.headers.get('cache-control') ?? '', /no-store/)
    const page = await admin.text()
    assert.match(page, /Acceso privado/)
    assert.ok(!page.includes('Inscripciones guardadas'))
    const privateList = await fetch(`${base}/admin/inscripciones`, { redirect: 'manual' })
    assert.equal(privateList.status, 307)
    assert.equal(new URL(privateList.headers.get('location'), base).pathname, '/admin')
    const unauthenticatedReview = await fetch(`${base}/api/admin/assistance/decision`, {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ registrationId: '00000000-0000-4000-8000-000000000000', decision: 'approved', note: '' }),
    })
    assert.equal(unauthenticatedReview.status, 401)
    assert.match(unauthenticatedReview.headers.get('cache-control') ?? '', /no-store/)
    const before = await pool.query('SELECT count(*)::int AS total FROM "user"')
    const response = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ name: 'Intruso', email: 'intruso@example.test', password: randomBytes(24).toString('hex'), username: 'intruso' }),
    })
    assert.ok([400, 403, 404].includes(response.status), `unexpected sign-up status: ${response.status}`)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.match(response.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
    const usernameSignup = await fetch(`${base}/api/auth/sign-up/username`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ name: 'Intruso', email: 'intruso@example.test', password: randomBytes(24).toString('hex'), username: 'intruso' }),
    })
    assert.ok([400, 403, 404].includes(usernameSignup.status), `unexpected username sign-up status: ${usernameSignup.status}`)
    const after = await pool.query('SELECT count(*)::int AS total FROM "user"')
    assert.equal(after.rows[0].total, before.rows[0].total)
    const enumeration = await fetch(`${base}/api/auth/is-username-available`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: 'vamosalsantisimo.admin' }) })
    assert.notEqual(enumeration.status, 200)

    await t.test('initial admin signs in, retains a private session, then revokes it', { skip: !process.env.TEST_ADMIN_PASSWORD && 'Bootstrap a disposable admin and set TEST_ADMIN_PASSWORD' }, async () => {
      const operator = await pool.query('SELECT u.id,u.email,u.username,u.role,a.password FROM "user" u JOIN "account" a ON a.user_id = u.id WHERE u.username = $1', ['vamosalsantisimo.admin'])
      assert.equal(operator.rows.length, 1)
      assert.equal(operator.rows[0].role, 'admin')
      assert.notEqual(operator.rows[0].password, process.env.TEST_ADMIN_PASSWORD)
      const headers = { 'content-type': 'application/json', origin: base }
      const bad = await fetch(`${base}/api/auth/sign-in/username`, { method: 'POST', headers, body: JSON.stringify({ username: 'vamosalsantisimo.admin', password: randomBytes(24).toString('hex') }) })
      assert.notEqual(bad.status, 200)
      assert.match(bad.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
      const signIn = await fetch(`${base}/api/auth/sign-in/username`, { method: 'POST', headers, body: JSON.stringify({ username: 'vamosalsantisimo.admin', password: process.env.TEST_ADMIN_PASSWORD }) })
      assert.equal(signIn.status, 200)
      assert.match(signIn.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
      const setCookies = signIn.headers.getSetCookie()
      assert.ok(setCookies.some(cookie => /httponly/i.test(cookie)))
      const cookie = setCookies.map(value => value.split(';')[0]).join('; ')
      const dashboard = await fetch(`${base}/admin`, { headers: { cookie } })
      assert.equal(dashboard.status, 200)
      assert.match(await dashboard.text(), /Últimas inscripciones/)
      const reviewHeaders = { ...headers, cookie }
      const registrationId = randomUUID()
      const unlinkedReview = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ registrationId, decision: 'approved', note: '' }),
      })
      assert.equal(unlinkedReview.status, 403, 'Better Auth admin alone is not an operator')
      const link = spawnSync(process.execPath, ['scripts/link-admin-operator.mjs', '--email', operator.rows[0].email,
        '--role', 'registration_operator', '--apply'], { cwd: process.cwd(), env: process.env, encoding: 'utf8' })
      assert.equal(link.status, 0, link.stderr || link.stdout)
      const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id',
        ['formacion-catolica-2026', 'Admin review test', '2026-12-19T18:00:00Z'])
      const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at) VALUES ($1,$2) RETURNING id',
        [event.rows[0].id, '2026-12-19T18:00:00Z'])
      await pool.query(`INSERT INTO registrations
        (id,workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [registrationId, workshop.rows[0].id, `ADMIN-TEST-${registrationId}`, randomBytes(32).toString('hex'),
        randomUUID(), 'Ana Prueba', 'ana prueba', 'ana-admin@example.invalid', 'ana-admin@example.invalid', '3700000000', '3700000000'])
      await pool.query(`INSERT INTO registration_intakes
        (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty)
        VALUES ($1,$2,$3,$4,$5,true)`, [registrationId, 'Ana', 'Prueba', '1990-01-01', 'laico'])
      await pool.query('INSERT INTO assistance_requests (registration_id) VALUES ($1)', [registrationId])
      const pendingPage = await fetch(`${base}/admin`, { headers: { cookie } })
      assert.match(await pendingPage.text(), /Ana Prueba/)
      const noOrigin = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ registrationId, decision: 'approved', note: '' }),
      })
      assert.equal(noOrigin.status, 403)
      const approved = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ registrationId, decision: 'approved', note: 'Aprobación de prueba' }),
      })
      assert.equal(approved.status, 200)
      assert.equal((await approved.json()).emailQueued, true)
      const queued = await pool.query('SELECT kind,to_email FROM email_outbox WHERE registration_id=$1 ORDER BY kind', [registrationId])
      assert.deepEqual(queued.rows, [
        { kind: 'accreditation_ready', to_email: 'ana-admin@example.invalid' },
        { kind: 'assistance_approved', to_email: 'ana-admin@example.invalid' },
      ])
      const credential = await pool.query('SELECT count(*)::int AS total FROM accreditation_credentials WHERE registration_id=$1', [registrationId])
      assert.equal(credential.rows[0].total, 1)
      const audit = await pool.query("SELECT action,actor_id FROM audit_log WHERE subject_id=$1 AND action='assistance.approved'", [registrationId])
      assert.equal(audit.rows[0].action, 'assistance.approved')
      assert.ok(audit.rows[0].actor_id)
      const replay = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ registrationId, decision: 'approved', note: '' }),
      })
      assert.equal(replay.status, 409)
      const declinedId = randomUUID()
      await pool.query(`INSERT INTO registrations
        (id,workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [declinedId, workshop.rows[0].id, `ADMIN-TEST-${declinedId}`, randomBytes(32).toString('hex'),
        randomUUID(), 'Luis Prueba', 'luis prueba', 'luis-admin@example.invalid', 'luis-admin@example.invalid', '3700000001', '3700000001'])
      await pool.query(`INSERT INTO registration_intakes
        (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty)
        VALUES ($1,$2,$3,$4,$5,true)`, [declinedId, 'Luis', 'Prueba', '1990-01-01', 'laico'])
      await pool.query('INSERT INTO assistance_requests (registration_id) VALUES ($1)', [declinedId])
      const missingReason = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ registrationId: declinedId, decision: 'declined', note: '' }),
      })
      assert.equal(missingReason.status, 400)
      const declined = await fetch(`${base}/api/admin/assistance/decision`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ registrationId: declinedId, decision: 'declined', note: 'Revisión de prueba' }),
      })
      assert.equal(declined.status, 200)
      const declineJob = await pool.query('SELECT kind,to_email FROM email_outbox WHERE registration_id=$1', [declinedId])
      assert.deepEqual(declineJob.rows, [{ kind: 'assistance_declined', to_email: 'luis-admin@example.invalid' }])

      const manualId = randomUUID()
      const manualRef = `MANUAL-TEST-${manualId}`
      await pool.query(`INSERT INTO registrations
        (id,workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [manualId, workshop.rows[0].id, manualRef, randomBytes(32).toString('hex'), randomUUID(),
        'María Prueba', 'maría prueba', 'maria-admin@example.invalid', 'maria-admin@example.invalid', '3700000002', '3700000002'])
      await pool.query(`INSERT INTO registration_intakes
        (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty)
        VALUES ($1,'María','Prueba','1992-01-01','laico',false)`, [manualId])
      await pool.query(`INSERT INTO payment_attempts
        (registration_id,idempotency_key,source,status,amount_minor)
        VALUES ($1,$2,'bank_transfer','pending',10000)`, [manualId, randomUUID()])
      const verified = await fetch(`${base}/api/admin/payments/verify`, {
        method: 'POST', headers: reviewHeaders,
        body: JSON.stringify({ reference: manualRef, note: 'Comprobante verificado', manualReference: 'BANCO-TEST' }),
      })
      assert.equal(verified.status, 200)
      assert.equal((await verified.json()).accreditedPeople, 1)
      const paymentEvidence = await pool.query(`SELECT p.status,p.manual_verified_at,p.manual_verified_by,r.status AS registration_status
        FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id WHERE r.id=$1`, [manualId])
      assert.equal(paymentEvidence.rows[0].status, 'approved')
      assert.equal(paymentEvidence.rows[0].registration_status, 'confirmed')
      assert.ok(paymentEvidence.rows[0].manual_verified_at && paymentEvidence.rows[0].manual_verified_by)
      const flyer = await fetch(`${base}/api/admin/accreditation/print?reference=${encodeURIComponent(manualRef)}`, { headers: { cookie } })
      assert.equal(flyer.status, 200)
      assert.match(flyer.headers.get('cache-control') ?? '', /no-store/)
      assert.match(await flyer.text(), /Volante de acreditación|ACREDITACIÓN PERSONAL/)
      const credentialRows = await pool.query(`SELECT version,token_hash,token_ciphertext,token_iv,token_auth_tag FROM accreditation_credentials WHERE registration_id=$1`, [manualId])
      assert.equal(credentialRows.rows.length, 1)
      const manualCredential = credentialRows.rows[0]
      const qrValue = decryptAccreditationQr({ tokenCiphertext: manualCredential.token_ciphertext,
        tokenIv: manualCredential.token_iv, tokenAuthTag: manualCredential.token_auth_tag }, accreditationKey, manualId, manualCredential.version)
      const entryPoint = `Test ${manualId}`
      const scan = async value => fetch(`${base}/api/admin/accreditation/scan`, {
        method: 'POST', headers: reviewHeaders, body: JSON.stringify({ qrValue: value, entryPoint }),
      })
      const admitted = await scan(qrValue)
      assert.equal(admitted.status, 200)
      assert.equal((await admitted.json()).result, 'admitted')
      const repeated = await scan(qrValue)
      assert.equal(repeated.status, 409)
      assert.equal((await repeated.json()).result, 'already_admitted')
      const unknown = await scan(createAccreditationQr().qrValue)
      assert.equal(unknown.status, 404)
      const admissions = await pool.query('SELECT count(*)::int AS total FROM check_ins WHERE registration_id=$1', [manualId])
      assert.equal(admissions.rows[0].total, 1)
      const scans = await pool.query('SELECT result,scanned_at FROM admission_scans WHERE entry_point=$1 ORDER BY scanned_at', [entryPoint])
      assert.deepEqual(scans.rows.map(row => row.result).sort(), ['admitted', 'already_admitted', 'unknown'])
      assert.ok(scans.rows.every(row => row.scanned_at))
      await pool.query("UPDATE payment_attempts SET status='refunded' WHERE registration_id=$1", [manualId])
      const reversed = await scan(qrValue)
      assert.equal(reversed.status, 409)
      assert.equal((await reversed.json()).result, 'revoked')

      const signOut = await fetch(`${base}/api/auth/sign-out`, { method: 'POST', headers: { ...headers, cookie }, body: '{}' })
      assert.equal(signOut.status, 200)
      assert.match(signOut.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
      const revoked = await fetch(`${base}/admin`, { headers: { cookie } })
      assert.ok(!(await revoked.text()).includes('Inscripciones guardadas'))
    })
  } finally { server.kill(); await pool.end() }
})
