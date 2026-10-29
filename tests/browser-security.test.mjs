import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

test('browser security covers static landing, workshop and isolated panel', async () => {
  for (const [surface, port] of [['public', 31631], ['panel', 31632]]) {
    const base = `http://localhost:${port}`
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface,
        BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: 'test-only-secret-'.repeat(4), DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/invalid' },
    })
    try {
      let ready = false
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + (surface === 'panel' ? '/admin' : '/'))).ok) { ready = true; break } } catch {}
        await new Promise(r => setTimeout(r, 100))
      }
      assert.ok(ready)
      const staticPaths = ['/', '/formacion', '/formacion/inscripcion', '/eventos-anteriores/index.html']
      const paths = surface === 'public' ? [...staticPaths, '/inscripcion', '/donaciones', '/voluntarios', '/sumar-marca'] : ['/admin']
      for (const path of paths) {
        const response = await fetch(base + path, { headers: { 'x-nonce': 'attacker-controlled' } })
        assert.equal(response.status, 200, path)
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
        assert.equal(response.headers.get('x-frame-options'), 'DENY')
        assert.equal(response.headers.get('x-powered-by'), null)
        const csp = response.headers.get('content-security-policy') || ''
        assert.match(csp, /frame-ancestors 'none'/)
        assert.match(csp, /script-src-attr 'none'/)
        assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"))
        const html = await response.text()
        for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (/\bsrc\s*=/.test(script[1]) || !script[2].trim()) continue
          if (staticPaths.includes(new URL(response.url).pathname)) assert.ok(csp.includes(createHash('sha256').update(script[2].replace(/\r\n?/g, '\n')).digest('base64')), path)
          else {
            const nonce = /nonce="([^"]+)"/.exec(script[1])?.[1]
            assert.ok(nonce && nonce !== 'attacker-controlled' && csp.includes(`'nonce-${nonce}'`), `${path}: inline script must have a fresh CSP nonce`)
          }
        }
      }
      if (surface === 'panel') {
        const response = await fetch(base + '/api/auth/sign-in/username', { method: 'POST',
          headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(20000) }) })
        assert.equal(response.status, 400)
        assert.equal((await fetch(base + '/formacion')).status, 404)
      } else assert.equal((await fetch(base + '/admin')).status, 404)
    } finally { server.kill() }
  }
})
