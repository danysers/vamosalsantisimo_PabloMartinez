import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDuplicate, lotAmountMinor, minorToArs, normalizeIdentity } from '../lib/registration-policy.ts'

test('the active lot price comes from server policy and converts without floats', () => {
  assert.equal(lotAmountMinor(1), 1_000_000)
  assert.equal(lotAmountMinor(2), 1_500_000)
  assert.equal(lotAmountMinor(3), 2_000_000)
  assert.equal(minorToArs(lotAmountMinor(2)), '15000.00')
  assert.throws(() => lotAmountMinor(0), /Invalid lot/)
  assert.throws(() => lotAmountMinor(4), /Invalid lot/)
  assert.throws(() => minorToArs(1.5), /Invalid amount/)
})

test('retries for the same person are identified without blocking relatives sharing contact', () => {
  const original = normalizeIdentity({ name: '  Ana   María  Pérez ', email: ' FAMILY@EXAMPLE.INVALID ', phone: '+54 9 11 2222-3333' })
  const retry = normalizeIdentity({ name: 'ana maría pérez', email: 'family@example.invalid', phone: '5491122223333' })
  const relative = normalizeIdentity({ name: 'Luis Pérez', email: 'family@example.invalid', phone: '5491122223333' })
  assert.equal(classifyDuplicate(original, retry), 'same-person-review')
  assert.equal(classifyDuplicate(original, relative), 'distinct-person')
  assert.equal(classifyDuplicate(original, normalizeIdentity({ name: 'Ana María Pérez', email: 'other@example.invalid', phone: '5491100000000' })), 'distinct-contact')
})
