import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicRequestOrigin, workshopCheckoutReturnUrl } from '../lib/public-site-origin.ts'

test('both public domains are allowed explicitly and payment returns keep the initiating domain', () => {
  const saved = { ...process.env }
  try {
    process.env.SITE_ORIGIN = 'https://vamosalsantisimo.com'
    process.env.PUBLIC_SITE_ALIASES = 'https://pablomartinez.vamosalsantisimo.com'
    process.env.MP_PUBLIC_ORIGIN = process.env.SITE_ORIGIN
    const request = origin => ({ headers: new Headers(origin ? { origin, 'x-forwarded-host':'vamosalsantisimo.com' } : {}), nextUrl:{origin:'http://untrusted-host.invalid'} })
    for (const origin of [process.env.SITE_ORIGIN, process.env.PUBLIC_SITE_ALIASES]) {
      assert.equal(publicRequestOrigin(request(origin)), origin)
      assert.equal(workshopCheckoutReturnUrl('registration_123', origin), origin+'/formacion/pago?reference=registration_123')
    }
    for (const origin of [null, 'null', 'https://evil.invalid', 'https://vamosalsantisimo.com.evil.invalid', 'https://other.vamosalsantisimo.com', 'http://vamosalsantisimo.com', 'https://vamosalsantisimo.com/path']) {
      assert.equal(publicRequestOrigin(request(origin)), null, String(origin))
    }
    assert.throws(() => workshopCheckoutReturnUrl('registration_123', 'https://evil.invalid'), /Untrusted/)
    const callback=new URL(workshopCheckoutReturnUrl('registration_123', process.env.SITE_ORIGIN, 'v1.1234567890.'+'a'.repeat(43)))
    assert.equal(callback.searchParams.has('return'),false,'the return credential must not enter HTTP queries or referrers')
    assert.ok(callback.hash.startsWith('#return='))
    assert.equal(workshopCheckoutReturnUrl('registration_123'), process.env.SITE_ORIGIN+'/formacion/pago?reference=registration_123')
    process.env.SITE_ORIGIN = 'http://localhost:3000'
    delete process.env.PUBLIC_SITE_ALIASES
    delete process.env.MP_PUBLIC_ORIGIN
    assert.equal(workshopCheckoutReturnUrl('registration_123'), undefined)
    delete process.env.SITE_ORIGIN
    assert.equal(publicRequestOrigin({headers:new Headers({origin:'http://localhost:3000'}),nextUrl:{origin:'http://localhost:3000'}}), 'http://localhost:3000')
    assert.equal(publicRequestOrigin(request('https://unknown.invalid')), null)
  } finally {
    for (const key of ['SITE_ORIGIN','PUBLIC_SITE_ALIASES','MP_PUBLIC_ORIGIN']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})
