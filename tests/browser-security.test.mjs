import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { inlineScripts } from '../lib/static-html.mjs'

test('inline script extraction honors HTML parsing and preserves the CSP hash input', () => {
  const markup = '<script data-note="a > b" nonce="test-nonce">one()\r\ntwo()</script >' +
    '<!-- <script>comment</script> -->' +
    '<script SRC=/external.js></script><template><script>inert</script></template>'
  assert.deepEqual([...inlineScripts(markup)], [{ body: 'one()\ntwo()', nonce: 'test-nonce' }])
})

test('browser security covers static landing, workshop and isolated panel', async () => {
  for (const [surface, port] of [['public', 31631], ['panel', 31632]]) {
    const base = `http://localhost:${port}`
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface,
        SITE_ORIGIN:'https://vamosalsantisimo.com', PUBLIC_SITE_ALIASES:'https://pablomartinez.vamosalsantisimo.com', REGISTRATION_EMAIL_READY:'1', WORKSHOP_EVENT_SLUG:'origin-test',
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
        for (const { body, nonce } of inlineScripts(html)) {
          if (staticPaths.includes(new URL(response.url).pathname)) assert.ok(csp.includes(createHash('sha256').update(body).digest('base64')), path)
          else {
            assert.ok(nonce && nonce !== 'attacker-controlled' && csp.includes(`'nonce-${nonce}'`), `${path}: inline script must have a fresh CSP nonce`)
          }
        }
      }
      if (surface === 'panel') {
        const response = await fetch(base + '/api/auth/sign-in/username', { method: 'POST',
          headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(20000) }) })
        assert.equal(response.status, 400)
        assert.equal((await fetch(base + '/formacion')).status, 404)
      } else {
        for (const path of ['/api/taller/inscripciones','/api/taller/inscripciones/recuperar',...['checkout','metodo','estado','comprobante','retorno'].map(p=>'/api/taller/pagos/'+p)]) {
          for (const origin of ['https://vamosalsantisimo.com','https://pablomartinez.vamosalsantisimo.com','https://evil.invalid']) {
            const result=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-forwarded-host':'vamosalsantisimo.com'},body:'{}'})
            assert.equal(result.status,origin==='https://evil.invalid'?403:400, `${path}: ${origin}`)
          }
        }
        const canonical=await fetch(base+'/formacion/inscripcion').then(r=>r.text())
        assert.ok(canonical.includes('rel="canonical" href="https://vamosalsantisimo.com/formacion/inscripcion"'))
        assert.equal(new URL((await fetch(base+'/taller/inscripcion?reference=preserved')).url).pathname,'/formacion/inscripcion')
        assert.equal((await fetch(base+'/logo-vamos.png')).status,200)
        assert.equal((await fetch(base + '/admin')).status, 404)
        for (const source of ['http://127.0.0.1:1/secret', 'http://169.254.169.254/latest/meta-data/', '/api/admin/taller/comprobantes/private', '/2026/logo.webp?secret=private']) {
          const query = new URLSearchParams({ url:source, w:'128', q:'75' })
          assert.equal((await fetch(base+'/_next/image?'+query)).status,400,'optimizer must reject unapproved origins and API paths')
        }
        const image = await fetch(base+'/_next/image?'+new URLSearchParams({url:'/2026/logo.webp',w:'128',q:'75'}))
        assert.equal(image.status,200,'approved image optimization still works')
      }
    } finally { server.kill() }
  }
})
