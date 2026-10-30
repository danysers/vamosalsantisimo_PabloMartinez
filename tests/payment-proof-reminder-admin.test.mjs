import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./ts-server-loader.mjs', import.meta.url)

const version = 'a'.repeat(32)
const reference = 'ProofReminder123'
const id = '00000000-0000-4000-8000-000000000001'
const attemptId = '00000000-0000-4000-8000-000000000002'
const eligible = { id, reference, creation_key: 'creation-key', email: 'person@example.invalid', status: 'pending',
  starts_at: '2026-12-19T18:00:00Z', current: true, version, attempt_id: attemptId, payer_id: id,
  source: 'bank_transfer', payment_status: 'pending', proof_submitted: false, paid: false, assisted: false, waived: false }
const input = action => ({ action, reference, version, ...(action === 'resend' ? {
  requestId: '00000000-0000-4000-8000-000000000003', confirmRecipient: true } : {}) })
function fakeDb(...rows) {
  const calls = []
  return { calls, db: { transaction: async callback => callback({ execute: async statement => {
    calls.push(statement)
    return { rows: rows.shift() || [] }
  } }) } }
}

test('proof link is private, purpose-bound and only issued to an eligible payer', async () => {
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY = 'reminder-unit-key-'.repeat(3)
  process.env.SITE_ORIGIN = 'https://example.invalid'
  const { managePaymentProofReminder } = await import('../lib/payment-proof-reminder-admin.ts')
  const denied = fakeDb([{ id }], [{ ...eligible, proof_submitted: true }])
  assert.equal((await managePaymentProofReminder(denied.db, 'event', id, input('link'))).code, 409)
  assert.equal(denied.calls.length, 2)
  const allowed = fakeDb([{ id }], [eligible], [])
  const result = await managePaymentProofReminder(allowed.db, 'event', id, input('link'))
  assert.equal(result.code, 200)
  const url = new URL(result.body.url)
  assert.equal(url.origin, 'https://example.invalid')
  assert.equal(url.pathname, '/formacion/comprobante')
  assert.equal(url.searchParams.get('reference'), reference)
  assert.match(url.hash, /^#proof=v1\./)
  assert.equal(allowed.calls.length, 3)
})

test('resend queues once, confirms recipient and rejects pending or too-frequent reminders', async () => {
  const { managePaymentProofReminder } = await import('../lib/payment-proof-reminder-admin.ts')
  const invalid = fakeDb()
  assert.equal((await managePaymentProofReminder(invalid.db, 'event', id, { ...input('resend'), confirmRecipient: false })).code, 400)
  assert.equal(invalid.calls.length, 0)
  const queued = fakeDb([{ id }], [eligible], [], [], [{ total: 0, recent: false }], [], [])
  assert.equal((await managePaymentProofReminder(queued.db, 'event', id, input('resend'))).code, 202)
  assert.equal(queued.calls.length, 7)
  const duplicate = fakeDb([{ id }], [eligible], [{ id: 'existing' }])
  assert.equal((await managePaymentProofReminder(duplicate.db, 'event', id, input('resend'))).body.alreadyQueued, true)
  const pending = fakeDb([{ id }], [eligible], [], [{ id: 'pending' }])
  assert.equal((await managePaymentProofReminder(pending.db, 'event', id, input('resend'))).code, 409)
  const limited = fakeDb([{ id }], [eligible], [], [], [{ total: 5, recent: false }])
  assert.equal((await managePaymentProofReminder(limited.db, 'event', id, input('resend'))).code, 429)
})
