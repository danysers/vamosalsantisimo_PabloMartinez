import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import pg from 'pg'

test('bounded auth requests preserve login, origin checks and session revocation', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable migrated PostgreSQL database',
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const id = randomUUID()
  const username = 'security_' + randomBytes(8).toString('hex')
  const password = randomBytes(32).toString('base64url')
  const base = 'http://localhost:31633'
  let server
  try {
    await pool.query('INSERT INTO "user" (id,name,email,email_verified,username,role) VALUES ($1,$2,$3,true,$4,$5)',
      [id, 'Security test', `${username}@example.invalid`, username, 'admin'])
    await pool.query('INSERT INTO "account" (id,account_id,provider_id,user_id,password,updated_at) VALUES ($1,$2,$3,$2,$4,now())',
      [randomUUID(), id, 'credential', await hashPassword(password)])
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '31633'], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: 'panel',
        BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), TRUST_REVERSE_PROXY: '0' },
    })
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/admin')).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const headers = { origin: base, 'content-type': 'application/json' }
    const login = await fetch(base + '/api/auth/sign-in/username', {
      method: 'POST', headers, body: JSON.stringify({ username, password }),
    })
    assert.equal(login.status, 200)
    const cookies = login.headers.getSetCookie()
    assert.ok(cookies.some(cookie => /httponly/i.test(cookie) && /samesite=lax/i.test(cookie)))
    const cookie = cookies.map(value => value.split(';')[0]).join('; ')
    const session = await fetch(base + '/api/auth/get-session', { headers: { cookie } })
    assert.equal((await session.json()).user.id, id)
    const crossOrigin = await fetch(base + '/api/auth/sign-out', {
      method: 'POST', headers: { ...headers, cookie, origin: 'https://attacker.invalid' }, body: '{}',
    })
    assert.equal(crossOrigin.status, 403)
    const logout = await fetch(base + '/api/auth/sign-out', {
      method: 'POST', headers: { ...headers, cookie }, body: '{}',
    })
    assert.equal(logout.status, 200)
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM "session" WHERE user_id=$1', [id])).rows[0].total, 0)
    const injection = await fetch(base + '/api/auth/sign-in/username', { method:'POST', headers,
      body:JSON.stringify({username:"' OR 1=1 --",password:'wrong-credential-for-test'}) })
    assert.ok([400,401,422].includes(injection.status), 'SQL injection must never authenticate')
    for (const endpoint of ['username', 'email']) {
      const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => fetch(base + '/api/auth/sign-in/' + endpoint, {
        method: 'POST', headers: { ...headers, 'x-forwarded-for': `198.51.100.${i + 1}`,
          'x-real-ip': `203.0.113.${i + 1}`, 'cf-connecting-ip': `192.0.2.${i + 1}` },
        body: JSON.stringify({ username, email: 'intruder@example.invalid', password: 'wrong-credential-for-test' }),
      })))
      assert.ok(responses.every(response => response.status !== 200), 'injection must never authenticate')
      assert.ok(responses.filter(response => response.status !== 429).length <= 5,
        `${endpoint}: concurrent requests and forged IP headers must not bypass the limit`)
      assert.ok(responses.filter(response => response.status === 429).every(response => Number(response.headers.get('retry-after')) > 0))
    }
  } finally {
    server?.kill()
    await pool.end()
  }
})
