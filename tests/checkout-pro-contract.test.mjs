import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCheckoutOrder, checkoutAmount, parseCheckoutOrderResponse } from '../lib/checkout-pro-contract.ts'

const input = { reference: 'valid_ref_123', email: 'ana@example.org', amountMinor: 1_234_500 }
const response = {
  id: 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9',
  external_reference: input.reference,
  total_amount: '12345.00',
  country_code: 'ARG',
  currency: 'ARS',
  status: 'created',
  checkout_url: 'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9',
}

test('creates a Checkout Pro Orders request using exact ARS decimal strings', () => {
  assert.equal(checkoutAmount(101), '1.01')
  assert.deepEqual(buildCheckoutOrder(input), {
    type: 'online', processing_mode: 'manual', total_amount: '12345.00',
    external_reference: input.reference, payer: { email: input.email },
    items: [{ title: 'Taller de formación católica', unit_price: '12345.00', quantity: 1 }],
  })
  for (const amountMinor of [0, -100, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildCheckoutOrder({ ...input, amountMinor }), /Invalid checkout amount/)
  }
  assert.throws(() => buildCheckoutOrder({ ...input, reference: 'bad' }), /Invalid checkout reference/)
  assert.throws(() => buildCheckoutOrder({ ...input, email: 'invalid' }), /Invalid payer email/)
})

test('requires matching provider identity, amount, status and safe redirect host', () => {
  assert.deepEqual(parseCheckoutOrderResponse(response, input), {
    id: response.id, checkoutUrl: response.checkout_url,
  })
  for (const invalid of [
    { ...response, external_reference: 'another_ref_123' },
    { ...response, total_amount: '1.00' },
    { ...response, status: 'rejected' },
    { ...response, currency: 'USD' },
    { ...response, country_code: 'BRA' },
    { ...response, checkout_url: 'https://mercadopago.com.ar.evil.example/checkout/v1/redirect' },
    { ...response, checkout_url: 'http://www.mercadopago.com.ar/checkout/v1/redirect' },
    { ...response, checkout_url: 'https://www.mercadopago.com.ar.evil.example/checkout/v1/redirect' },
    { ...response, checkout_url: 'https://www.mercadopago.com.ar/other' },
  ]) assert.throws(() => parseCheckoutOrderResponse(invalid, input))
})
