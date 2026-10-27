import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

// Integration test against the actual Next.js production HTTP routes.
test('legacy endpoints reject reads and registrations without revealing database details', async () => {
  const port = 31582
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, DATABASE_URL: '', WORKSHOP_EVENT_SLUG: '', REGISTRATION_EMAIL_READY: '' } })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(`${base}/inscripcion`)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'server unavailable')
    const registration = await (await fetch(`${base}/inscripcion`)).text()
    assert.match(registration, /un pequeño costo/)
    assert.match(registration, /anotarte en el lugar el mismo día del taller/)
    for (const route of ['/api/inscripciones', '/api/test-db']) {
      const response = await fetch(`${base}${route}`)
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await response.json(), { error: 'No disponible.' })
    }
    const response = await fetch(`${base}/api/inscripciones`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Prueba', correo: 'person@example.invalid' }),
    })
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { error: 'Las inscripciones todavía no están habilitadas.' })
  } finally {
    server.kill()
  }
})

test('public surface never exposes panel routes even if auth secrets are present', async () => {
  const port = 31592
  const base = `http://localhost:${port}`
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, APP_SURFACE: 'public', BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: 'x'.repeat(40) },
  })
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    for (const route of ['/admin', '/admin/acreditacion', '/api/auth/sign-in/username',
      '/api/admin/assistance/decision', '/api/admin/payments/verify', '/api/admin/accreditation/scan']) {
      const response = await fetch(`${base}${route}`)
      assert.equal(response.status, 404, route)
      assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    }
  } finally { server.kill() }
})
