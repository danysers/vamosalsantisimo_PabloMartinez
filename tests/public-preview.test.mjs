import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

// Run after npm run build. The real HTTP surface must not use a database.
test('2026 preview advertises only confirmed facts and keeps legacy APIs closed', async () => {
  const port = 31581
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(base)
        if (response.ok) { ready = true; break }
      } catch { /* Wait for startup; do not treat missing service as success. */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'production server did not start')
    const home = await fetch(base)
    assert.equal(home.status, 200)
    const html = await home.text()
    for (const text of ['Pablo Martínez', '19 de diciembre de 2026', 'María Auxiliadora', '20:00 h', '17:00 h', '10.000', '15.000', '20.000', 'Entrada gratuita', 'no tiene límite de cupos', 'habilitará manualmente cada lote']) {
      assert.ok(html.includes(text), `missing public text: ${text}`)
    }
    assert.ok(!html.includes('Daniel Poli'), 'archived performer leaked into new homepage')
    assert.match(html, /https:\/\/wa\.me\/5493704258770\?text=/)
    assert.match(html, /abrir el chat no inscribe, reserva ni confirma un pago/)
    assert.ok(!html.includes('accessToken='), 'private status token leaked into the public WhatsApp link')
    assert.match(home.headers.get('content-type') ?? '', /text\/html/)
    const asset = await fetch(`${base}/2026/logo.webp`)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('content-type') ?? '', /image\/webp/)
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=86400, stale-while-revalidate=604800')
    const form = await fetch(`${base}/inscripcion`)
    assert.equal(form.status, 200)
    assert.match(await form.text(), /Inscripciones aún no disponibles/)
    for (const route of ['/api/inscripciones', '/api/test-db']) {
      const response = await fetch(`${base}${route}`)
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: 'No disponible.' })
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    const rejected = await fetch(`${base}/api/inscripciones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Prueba', correo: 'person@example.invalid' }),
    })
    assert.equal(rejected.status, 503)
    assert.deepEqual(await rejected.json(), { error: 'Las inscripciones todavía no están habilitadas.' })
    assert.equal(rejected.headers.get('cache-control'), 'no-store')
  } finally {
    server.kill()
  }
})
