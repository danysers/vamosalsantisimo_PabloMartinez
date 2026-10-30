import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./ts-server-loader.mjs', import.meta.url)

const id = '00000000-0000-4000-8000-000000000001'
const credentialId = '00000000-0000-4000-8000-000000000002'
const reference = 'PassLink12345'
const version = 'a'.repeat(32)
const registration = { id, reference, creation_key: 'creation-key', email: 'person@example.invalid',
  accreditation_email: 'alternate@example.invalid', status: 'confirmed', starts_at: '2026-12-19T18:00:00Z',
  current: true, version }
const credential = { id: credentialId, expires_at: '2026-12-20T18:00:00Z' }
const input = { action: 'link', reference, version }
function fakeDb(...rows) {
  const calls = []
  return { calls, db: { transaction: async callback => callback({ execute: async statement => {
    calls.push(statement)
    return { rows: rows.shift() || [] }
  } }) } }
}

test('admin pass link requires a current issued QR and uses the same purpose-bound link as email', async () => {
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY = 'admin-pass-link-key-'.repeat(3)
  process.env.SITE_ORIGIN = 'https://example.invalid'
  const [{ manageAccreditationEmail }, { hasEmailLink }] = await Promise.all([
    import('../lib/accreditation-email-admin.ts'), import('../lib/email-link-token.ts'),
  ])
  const noCredential = fakeDb([{ id }], [registration], [])
  assert.equal((await manageAccreditationEmail(noCredential.db, 'event', id, input)).code, 409)
  const stale = fakeDb([{ id }], [{ ...registration, version: 'b'.repeat(32) }])
  assert.equal((await manageAccreditationEmail(stale.db, 'event', id, input)).code, 409)
  const allowed = fakeDb([{ id }], [registration], [credential], [])
  const result = await manageAccreditationEmail(allowed.db, 'event', id, input)
  assert.equal(result.code, 200)
  const url = new URL(result.body.url)
  assert.equal(url.origin, 'https://example.invalid')
  assert.equal(url.pathname, '/formacion/acreditacion')
  assert.equal(url.searchParams.get('reference'), reference)
  const token = new URLSearchParams(url.hash.slice(1)).get('pass')
  assert.equal(hasEmailLink(token, 'pass', { id, reference, creationKey: registration.creation_key,
    email: `${registration.email}|${registration.accreditation_email}`, credentialId }), true)
  assert.equal(hasEmailLink(token, 'proof', { id, reference, creationKey: registration.creation_key,
    email: registration.email }), false)
  assert.equal(allowed.calls.length, 4, 'link view is audited without queuing email or changing payment')
})
