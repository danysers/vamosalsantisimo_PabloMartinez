import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authentikConfig } from '../lib/authentik-config.ts'

const env = { AUTHENTIK_ENABLED: '1', AUTHENTIK_CLIENT_ID: 'test-client',
  AUTHENTIK_CLIENT_SECRET: 'test-only-not-a-real-secret',
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
  for (const url of ['http://aute.codss.com.ar/', 'https://evil.invalid/',
    env.AUTHENTIK_DISCOVERY_URL + '?redirect=evil',
    env.AUTHENTIK_DISCOVERY_URL.replace('https://', 'https://user:pass@'),
    env.AUTHENTIK_DISCOVERY_URL.replace('vamosalsantisimo-panel', 'another-app')]) {
    assert.throws(() => authentikConfig({ ...env, AUTHENTIK_DISCOVERY_URL: url }))
  }
})
