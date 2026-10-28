import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createAccreditationQr, decryptAccreditationQr, encryptAccreditationQr, hashAccreditationQr } from '../lib/accreditation-token.ts'

test('accreditation QR is opaque, unique and stores only its hash', () => {
  const first = createAccreditationQr()
  const second = createAccreditationQr()
  assert.match(first.qrValue, /^VAS1\.[A-Za-z0-9_-]{43}$/)
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/)
  assert.notEqual(first.qrValue, second.qrValue)
  assert.notEqual(first.tokenHash, second.tokenHash)
  assert.equal(hashAccreditationQr(first.qrValue), first.tokenHash)
  assert.ok(!first.tokenHash.includes(first.qrValue))
  for (const invalid of ['', 'PAY01ABC', 'VAS1.short', 'VAS1.' + 'A'.repeat(43) + '.extra']) {
    assert.throws(() => hashAccreditationQr(invalid), /Invalid accreditation QR/)
  }
})

test('encrypted QR can be rendered again but cannot be swapped to another registration', () => {
  const qr = createAccreditationQr()
  const key = randomBytes(32).toString('base64url')
  const encrypted = encryptAccreditationQr(qr.qrValue, key, 'registration-1', 1)
  assert.equal(decryptAccreditationQr(encrypted, key, 'registration-1', 1), qr.qrValue)
  assert.ok(!JSON.stringify(encrypted).includes(qr.qrValue))
  assert.throws(() => decryptAccreditationQr(encrypted, key, 'registration-2', 1))
  assert.throws(() => decryptAccreditationQr(encrypted, key, 'registration-1', 2))
})
