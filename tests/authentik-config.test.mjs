import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { authentikAuthorizationURL, authentikConfig, authentikFullLogoutURL, authentikLogoutURL } from '../lib/authentik-config.ts'

const env = { AUTHENTIK_ENABLED: '1', AUTHENTIK_CLIENT_ID: 'test-client',
  AUTHENTIK_CLIENT_SECRET: 'test-only-not-a-real-secret',
  BETTER_AUTH_URL: 'https://paneltaller2026.vamosalsantisimo.com',
  AUTHENTIK_DISCOVERY_URL: 'https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/.well-known/openid-configuration' }
test('Authentik is opt-in and fails closed for incomplete configuration', () => {
  assert.equal(authentikConfig({}), null)
  assert.throws(() => authentikConfig({ AUTHENTIK_ENABLED: '1' }))
})
test('Authentik enforces exact trusted HTTPS discovery and verified PKCE identity', () => {
  const config = authentikConfig(env)
  assert.equal(config.pkce, true)
  assert.equal(config.requireIdTokenVerification, true)
  assert.equal(config.disableSignUp, true)
  assert.equal(config.overrideUserInfo, false)
  assert.equal(config.disableProviderLogout, false)
  assert.equal(config.postLogoutRedirectURI, undefined)
  for (const url of ['http://aute.codss.com.ar/', 'https://evil.invalid/',
    env.AUTHENTIK_DISCOVERY_URL + '?redirect=evil',
    env.AUTHENTIK_DISCOVERY_URL.replace('https://', 'https://user:pass@'),
    env.AUTHENTIK_DISCOVERY_URL.replace('vamosalsantisimo-panel', 'another-app')]) {
    assert.throws(() => authentikConfig({ ...env, AUTHENTIK_DISCOVERY_URL: url }))
  }
})
test('automatic login accepts only Authentik authorization URLs', () => {
  assert.equal(authentikAuthorizationURL('https://aute.codss.com.ar/application/o/authorize/?client_id=panel')?.origin, 'https://aute.codss.com.ar')
  for (const url of [undefined, 'not a URL', 'http://aute.codss.com.ar/application/o/authorize/',
    'https://evil.invalid/application/o/authorize/', 'https://aute.codss.com.ar/if/user/',
    'https://user@aute.codss.com.ar/application/o/authorize/', 'https://aute.codss.com.ar/application/o/authorize/#fragment']) {
    assert.equal(authentikAuthorizationURL(url), null)
  }
})
test('provider logout accepts only this panel client end-session URL', () => {
  assert.equal(authentikLogoutURL('https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/end-session/?client_id=panel')?.origin,
    'https://aute.codss.com.ar')
  for (const url of [undefined, 'not a URL', 'http://aute.codss.com.ar/application/o/vamosalsantisimo-panel/end-session/',
    'https://evil.invalid/application/o/vamosalsantisimo-panel/end-session/',
    'https://aute.codss.com.ar/application/o/other/end-session/', 'https://aute.codss.com.ar/if/user/',
    'https://user@aute.codss.com.ar/application/o/vamosalsantisimo-panel/end-session/',
    'https://aute.codss.com.ar/application/o/vamosalsantisimo-panel/end-session/#fragment']) {
    assert.equal(authentikLogoutURL(url), null)
  }
})

test('logout submits natively and prevents immediate automatic reauthentication', () => {
  const form = readFileSync(new URL('../app/admin/login-form.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/auth/[...all]/route.ts', import.meta.url), 'utf8')
  assert.match(form, /method="post" action="\/api\/auth\/authentik-logout"/)
  assert.doesNotMatch(form, /onSubmit=\{signOut\}|Cerrando…/)
  assert.match(route, /body: JSON\.stringify\(\{ disableRedirect: true \}\)/)
  assert.match(route, /authentikFullLogoutURL\(\)/)
})

test('full logout uses the verified Authentik SSO invalidation flow', () => {
  const valid = authentikFullLogoutURL()
  assert.equal(valid.origin, 'https://aute.codss.com.ar')
  assert.equal(valid.pathname, '/if/flow/default-invalidation-flow/')
  assert.equal(valid.search, '')
  assert.equal(valid.searchParams.has('id_token_hint'), false)
  assert.equal(valid.searchParams.has('post_logout_redirect_uri'), false)
})
