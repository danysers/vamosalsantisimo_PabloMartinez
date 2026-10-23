import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import pg from 'pg'

test('admin and auth routes fail closed without local setup', async () => {
  const port = 31589
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: '', BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: '' },
  })
  const base = `http://localhost:${port}`
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
    assert.match(admin.headers.get('x-robots-tag') ?? '', /noindex/)
    assert.match(await admin.text(), /Administración local no configurada/)
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
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString('hex') },
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
      const operator = await pool.query('SELECT u.username, u.role, a.password FROM "user" u JOIN "account" a ON a.user_id = u.id WHERE u.username = $1', ['vamosalsantisimo.admin'])
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
      assert.match(await dashboard.text(), /Inscripciones guardadas/)
      const signOut = await fetch(`${base}/api/auth/sign-out`, { method: 'POST', headers: { ...headers, cookie }, body: '{}' })
      assert.equal(signOut.status, 200)
      assert.match(signOut.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/)
      const revoked = await fetch(`${base}/admin`, { headers: { cookie } })
      assert.ok(!(await revoked.text()).includes('Inscripciones guardadas'))
    })
  } finally { server.kill(); await pool.end() }
})
