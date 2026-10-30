import test from 'node:test'
import assert from 'node:assert/strict'
import { registrationEditSchema } from '../lib/registration-edit-policy.ts'

const data = { reference: 'TEST-REFERENCE-123', version: 'a'.repeat(32), firstName: 'Ana', lastName: 'Ruiz',
  documentNumber: '30.123.456', nickname: '', email: 'ANA@example.invalid', phone: '+54 370 400-1234',
  birthDate: '1990-01-01', country: 'Argentina', province: 'Formosa', locality: '', prayerGroup: '', movement: '',
  occupation: '', ecclesialState: 'laico', reason: 'Corrección solicitada', confirmEmailChange: false }

test('registration edits normalize contacts and reject financial fields, stale-version formats and invalid personal data', () => {
  const parsed = registrationEditSchema.parse(data)
  assert.equal(parsed.documentNumber, '30123456')
  assert.equal(parsed.email, 'ana@example.invalid')
  for (const change of [{ status: 'confirmed' }, { amountMinor: 1 }, { operatorId: 'forged' }, { accessToken: 'forged' },
    { version: '' }, { birthDate: '2026-02-31' }, { documentNumber: '' }, { firstName: '<script>' },
    { email: 'not-an-email' }, { phone: 'abc1234567' }, { reason: '' }]) {
    assert.equal(registrationEditSchema.safeParse({ ...data, ...change }).success, false, JSON.stringify(change))
  }
})
