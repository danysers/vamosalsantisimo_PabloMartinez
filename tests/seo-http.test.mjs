import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { publicPages, siteOrigin } from '../lib/site-seo.mjs'

test('public discovery, canonical pages and event data work while private pages and the panel stay excluded', async () => {
  for (const [surface, port] of [['public', 31645], ['panel', 31646]]) {
    const base = `http://localhost:${port}`
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface, DATABASE_URL: '',
        BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: 'disposable-seo-verification-'.repeat(3) },
    })
    try {
      let ready = false
      for (let n = 0; n < 100; n++) {
        try { if ((await fetch(base + (surface === 'panel' ? '/admin' : '/'))).ok) { ready = true; break } } catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.ok(ready)
      const robots = await fetch(base + '/robots.txt')
      assert.equal(robots.status, 200)
      const rules = await robots.text()
      if (surface === 'panel') {
        assert.match(rules, /^Disallow: \/$/m)
        assert.equal((await fetch(base + '/sitemap.xml')).status, 404)
        assert.match((await fetch(base + '/admin')).headers.get('x-robots-tag'), /noindex/)
        continue
      }
      assert.match(rules, /Sitemap: https:\/\/vamosalsantisimo\.com\/sitemap\.xml/)
      assert.doesNotMatch(rules, /^Disallow: \/pagina/m, 'Google must be able to render public JS, CSS and poster images')
      assert.match(rules, /^Disallow: \/api\//m)
      assert.match(rules, /^Allow: \/api\/sponsors/m)
      // Native HTTP retains an explicit Host, unlike fetch's forbidden-header handling.
      const withHost = (path, headers, method = 'GET') => new Promise((resolve, reject) => {
        httpRequest(base + path, { headers, method }, response => { response.resume(); response.on('end', () => resolve(response)) }).on('error', reject).end()
      })
      const upgrade = await withHost('/formacion/acreditacion?token=preserved', {
        Host: 'pablomartinez.vamosalsantisimo.com', 'cf-visitor': '{"scheme":"http"}',
      })
      assert.equal(upgrade.statusCode, 308)
      assert.equal(upgrade.headers.location, 'https://pablomartinez.vamosalsantisimo.com/formacion/acreditacion?token=preserved')
      const tunnel = await withHost('/formacion', { Host: 'vamosalsantisimo.com', 'cf-visitor': '{"scheme":"https"}', 'x-forwarded-proto': 'http' })
      assert.equal(tunnel.statusCode, 200, 'HTTP transport inside the tunnel must not cause an HTTPS redirect loop')
      const post = await withHost('/api/seo-nonexistent', {
        Host: 'vamosalsantisimo.com', 'cf-visitor': '{"scheme":"http"}',
      }, 'POST')
      assert.equal(post.statusCode, 404, 'scheme canonicalization must not intercept payment or upload POST requests')
      assert.equal(post.headers.location, undefined)
      const sitemap = await (await fetch(base + '/sitemap.xml')).text()
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
      assert.deepEqual(urls.sort(), Object.keys(publicPages).map(path => siteOrigin + path).sort())
      const titles = new Set(), descriptions = new Set()
      for (const path of Object.keys(publicPages)) {
        const response = await fetch(base + path, { headers: { Host: 'pablomartinez.vamosalsantisimo.com' } })
        assert.equal(response.status, 200, path)
        assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/)
        const html = await response.text()
        const title = /<title>([^<]+)<\/title>/.exec(html)?.[1]
        const description = /<meta name="description" content="([^"]+)"/.exec(html)?.[1]
        assert.ok(title && description)
        assert.ok(!titles.has(title) && !descriptions.has(description), path + ' needs distinct metadata')
        titles.add(title); descriptions.add(description)
        assert.ok(html.includes(`rel="canonical" href="${siteOrigin + path}"`), path)
        assert.match(html, /<meta name="robots" content="index,\s*follow/)
        assert.match(html, /(?:property="og:image"|name="twitter:card")/)
        const json = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]))
        assert.ok(json.length)
        if (path === '/' || path === '/formacion') {
          const event = json.flatMap(item => item['@graph']).find(item => item['@id'] === siteOrigin + path + '#evento')
          assert.equal(event.startDate, `2026-12-19T${path === '/' ? '19' : '15'}:00:00-03:00`)
          assert.equal(event.location.address.addressLocality, 'Formosa')
          if (path === '/formacion') assert.equal(event.offers, undefined, 'changing lot prices must not leave a hard-coded offer in Google')
        }
      }
      for (const path of ['/pagina%20principal%20con%20efecto/index.html', '/formacion/index.html', '/formacion/inscripcion/index.html']) {
        const response = await fetch(base + path + '?utm_source=shared', { redirect: 'manual' })
        assert.ok([301, 308].includes(response.status), path)
        assert.match(response.headers.get('location'), /utm_source=shared/)
      }
      for (const page of ['pago', 'comprobante', 'acreditacion', 'recursos']) {
        const response = await fetch(base + '/formacion/' + page)
        assert.equal(response.status, 200)
        assert.match(response.headers.get('x-robots-tag'), /noindex/)
        assert.match(response.headers.get('cache-control'), /private, no-store/)
        assert.doesNotMatch(response.headers.get('content-security-policy'), /static\.cloudflareinsights\.com/)
        assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow"/)
      }
    } finally { server.kill() }
  }
})
