import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

// Run after pnpm build. The real HTTP surface must not use a database.
test('animated homepage is served at the root and keeps legacy APIs closed', async () => {
  const port = 31581
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: '', WORKSHOP_EVENT_SLUG: '' },
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
    assert.equal((await fetch(`${base}/encuentro`)).status, 404, 'retired encounter page must not be served')
    const html = await home.text()
    assert.match(html,/Se pide, como colaboración voluntaria, un alimento no perecedero que será donado a las personas que más lo necesitan/)
    const missing=await fetch(base+'/pagina-inexistente-comprobacion')
    assert.equal(missing.status,404)
    const missingHtml=await missing.text()
    assert.match(missingHtml,/\/404\/vamos-al-santisimo-20261030.webp/)
    assert.match(missingHtml,/Volver al inicio/)
    assert.doesNotMatch(missingHtml,/Adoración con Pablo|music-player\.js|invitation\.js/)
    const poster=await fetch(base+'/404/vamos-al-santisimo-20261030.webp')
    assert.equal(poster.status,200);assert.match(poster.headers.get('content-type'),/image\/webp/)
    assert.match(poster.headers.get('cache-control'),/max-age=31536000, immutable/)
    assert.ok((await poster.arrayBuffer()).byteLength<25000)
    for (const text of ['Pablo Martínez', '19 de diciembre de 2026', 'María Auxiliadora', '20:00', '15:00 h', 'Entrada libre y gratuita', 'Colaboración voluntaria: un alimento no perecedero', 'Cada gesto de', 'directions-main']) {
      assert.ok(html.includes(text), `missing public text: ${text}`)
    }
    assert.ok(!html.includes('Daniel Poli'), 'archived performer leaked into new homepage')
    assert.match(html, /https:\/\/wa\.me\/5493704258770\?text=/)
    assert.match(html, /<meta name="robots" content="index, follow">/)
    assert.match(html, /href="https:\/\/vamosalsantisimo\.com\/"/)
    assert.ok(!html.includes('src="./'), 'homepage assets must resolve from the root URL')
    assert.ok(!html.includes('accessToken='), 'private status token leaked into the public WhatsApp link')
    assert.match(home.headers.get('content-type') ?? '', /text\/html/)
    const asset = await fetch(`${base}/2026/logo.webp`)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('content-type') ?? '', /image\/webp/)
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=86400, stale-while-revalidate=604800')
    for (const file of ['directions.js', 'invitation.js', 'invitation.css', 'vendor/gsap.min.js', 'assets/invitacion-vamos-al-santisimo-2026-final.png']) {
      const resource = await fetch(`${base}/pagina%20principal%20con%20efecto/${file}`)
      assert.equal(resource.status, 200, `homepage asset unavailable: ${file}`)
    }
    const venue = await fetch(`${base}/api/evento/sede`)
    assert.equal(venue.status, 200)
    assert.equal(venue.headers.get('cache-control'), 'no-store')
    assert.ok(['outdoor', 'indoor'].includes((await venue.json()).venue.id))
    const brands = await fetch(`${base}/sumar-marca`)
    assert.equal(brands.status, 200)
    assert.match(await brands.text(), /href="\/#colabora"/)
    const form = await fetch(`${base}/inscripcion`)
    assert.equal(form.status, 200)
    assert.match(await form.text(), /Inscribite/)
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
