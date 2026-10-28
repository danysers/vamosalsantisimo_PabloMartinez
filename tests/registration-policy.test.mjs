import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDuplicate, minorToArs, normalizeIdentity } from '../lib/registration-policy.ts'

test('integer-cent amounts convert without floats; lot prices live in PostgreSQL', () => {
  assert.equal(minorToArs(1_500_000), '15000.00')
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
