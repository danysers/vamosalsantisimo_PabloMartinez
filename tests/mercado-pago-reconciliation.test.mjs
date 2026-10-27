import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arsMinor, projectMercadoPagoOrder } from '../lib/mercado-pago-reconciliation.ts'

const expected = { orderId: 'ORD12345678', externalReference: 'attempt_ref_123', amountMinor: 10_000, sellerUserId: '12345', applicationId: '98765' }
const order = {
  id: expected.orderId, external_reference: expected.externalReference,
  country_code: 'ARG', currency: 'ARS', total_amount: '100.00', total_paid_amount: '100.00',
  status: 'processed', status_detail: 'accredited', user_id: '12345',
  integration_data: { application_id: '98765' }, last_updated_date: '2026-10-27T12:00:00Z',
  client_token: 'DO_NOT_STORE',
  transactions: {
    payments: [{ id: 'PAY12345678', status: 'processed', status_detail: 'accredited', amount: '100.00', paid_amount: '100.00', payment_method: { type: 'credit_card', id: 'visa', installments: 1, token: 'DO_NOT_STORE', qr_code: 'DO_NOT_STORE' } }],
    refunds: [], chargebacks: [],
  },
}

test('projects only payment data needed for accounting and accreditation', () => {
  const projected = projectMercadoPagoOrder(order, expected)
  assert.equal(projected.decision, 'approved')
  assert.equal(projected.paidAmountMinor, 10_000)
  assert.equal(projected.payments[0].paymentMethodId, 'visa')
  assert.ok(!JSON.stringify(projected).includes('DO_NOT_STORE'))
  assert.equal(arsMinor('100'), 10_000)
  assert.equal(arsMinor('100.5'), 10_050)
  for (const invalid of ['1.234', '1e3', '-1', '999999999.99', 100]) assert.throws(() => arsMinor(invalid))
})

test('blocks mismatched seller, app, amount, country and reversed/pending orders', () => {
  for (const changed of [
    { ...order, external_reference: 'another_ref_123' },
    { ...order, user_id: 'other_seller' },
    { ...order, integration_data: { application_id: 'other_app' } },
    { ...order, total_amount: '1.00' },
    { ...order, currency: 'USD' },
    { ...order, country_code: 'BRA' },
  ]) assert.throws(() => projectMercadoPagoOrder(changed, expected))
  assert.equal(projectMercadoPagoOrder({ ...order, status: 'processing' }, expected).decision, 'review')
  assert.equal(projectMercadoPagoOrder({ ...order, status_detail: 'partially_refunded' }, expected).decision, 'review')
  assert.equal(projectMercadoPagoOrder({ ...order, transactions: { ...order.transactions, refunds: [{ id: 'REF12345678', amount: '10.00', status: 'processed' }] } }, expected).decision, 'review')
  assert.equal(projectMercadoPagoOrder({ ...order, transactions: { ...order.transactions, chargebacks: [{ id: 'CBK12345678', status: 'in_process' }] } }, expected).decision, 'review')
  assert.throws(() => projectMercadoPagoOrder({ ...order, transactions: { payments: [] } }, expected), /Incomplete provider transactions/)
})
