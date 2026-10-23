import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

// Integration test against the actual Next.js production HTTP routes.
test('legacy endpoints reject reads and registrations without revealing database details', async () => {
  const port = 31582
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { cwd: process.cwd(), stdio: 'ignore' })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(`${base}/inscripcion`)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'server unavailable')
    assert.match(await (await fetch(`${base}/inscripcion`)).text(), /Inscripciones aún no disponibles/)
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
