import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupRequestSchema } from '../lib/group-request-schema.ts'
import { groupPaymentEmail } from '../lib/email-templates.ts'

const person = { firstName: 'Ana', lastName: 'Pérez', documentNumber: '12345678', birthDate: '1990-05-02', phone: '3704123456',
  email: 'ana@example.invalid', ecclesialState: 'laico' }

test('group request requires real people or distinct existing references and a payer', () => {
  const fresh = { mode: 'new', people: [person, { ...person, firstName: 'Luis', documentNumber: '87654321', email: 'luis@example.invalid' }],
    payerIndex: 0, paymentMethod: 'bank_transfer' }
  assert.equal(groupRequestSchema.safeParse(fresh).success, true)
  assert.equal(groupRequestSchema.safeParse({ ...fresh, people: [{ ...person, documentNumber: '' }, fresh.people[1]] }).success, false)
  assert.equal(groupRequestSchema.safeParse({ ...fresh, people: [{ ...person, birthDate: '2030-01-01' }, fresh.people[1]] }).success, false)
  assert.equal(groupRequestSchema.safeParse({ ...fresh, payerIndex: 20 }).success, false)
  assert.equal(groupRequestSchema.safeParse({ mode: 'existing', references: ['ref-a1', 'ref-b2'], payerReference: 'ref-a1', paymentMethod: 'on_site' }).success, true)
  assert.equal(groupRequestSchema.safeParse({ mode: 'existing', references: ['ref-a1'], payerReference: 'ref-a1', paymentMethod: 'on_site' }).success, false)
  assert.equal(groupRequestSchema.safeParse({ ...fresh, amountMinor: 1 }).success, false, 'browser cannot supply a price')
})

test('group notice instructs only the payer to transfer the total', () => {
  const base = { firstName: 'Ana', reference: 'REF-ANA', payerName: 'Ana Pérez', payerReference: 'REF-ANA',
    memberCount: 3, amountMinor: 2_000_000, status: 'pending', source: 'bank_transfer',
    transferAlias: 'alias.prueba', transferProvider: 'Personal Pay', transferHolder: 'Titular Ejemplo',
    transferDocument: '12345678', proofWhatsappE164: '5493718632884' }
  const payer = groupPaymentEmail({ ...base, isPayer: true })
  assert.match(payer.text, /20.000,00/)
  assert.match(payer.text, /alias.prueba/)
  assert.match(payer.text, /Titular Ejemplo/)
  assert.match(payer.text, /12345678/)
  assert.match(payer.text, /wa\.me\/5493718632884/)
  const member = groupPaymentEmail({ ...base, firstName: 'Luis', reference: 'REF-LUIS', isPayer: false })
  assert.match(member.text, /No hagas otro pago individual/)
  assert.ok(!member.text.includes('alias.prueba'))
  assert.ok(!member.text.includes('20.000,00'))
  const paid = groupPaymentEmail({ ...base, status: 'approved', isPayer: false })
  assert.match(paid.text, /pago grupal ya fue confirmado/)
})
