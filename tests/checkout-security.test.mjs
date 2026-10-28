import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { checkoutAccessToken, hasCheckoutAccess } from '../lib/checkout-access.ts'
import { verifyMercadoPagoSignature } from '../lib/mercado-pago-webhook.ts'
import { individualRegistrationSchema } from '../lib/workshop-input.ts'

test('checkout access is secret-bound and unique to one registration and creation request', () => {
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='local-test-key-'.repeat(4)
  const token=checkoutAccessToken('registration-one','creation-one')
  assert.equal(token.length,43)
  assert.equal(hasCheckoutAccess(token,'registration-one','creation-one'),true)
  assert.equal(hasCheckoutAccess(token,'registration-two','creation-one'),false)
  assert.equal(hasCheckoutAccess(token,'registration-one','creation-two'),false)
  assert.equal(hasCheckoutAccess('x'.repeat(43),'registration-one','creation-one'),false)
  assert.equal(hasCheckoutAccess('short','registration-one','creation-one'),false)
})

test('order notifications require the genuine signature and canonical lowercase resource id', () => {
  const secret='signature-test-key-'.repeat(3),resourceId='ORDTST1234567890',requestId='request-12345678',ts='1793111000000'
  const digest=createHmac('sha256',secret).update(`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex')
  const signed={resourceId,requestId,secret,signature:`ts=${ts},v1=${digest}`}
  assert.equal(verifyMercadoPagoSignature(signed),true)
  for (const modified of [
    {...signed,resourceId:'ORDTST9999999999'}, {...signed,requestId:'request-other'}, {...signed,secret:'other-secret-key-'.repeat(3)},
    {...signed,signature:null}, {...signed,signature:`ts=${ts},ts=${ts},v1=${digest}`},
    {...signed,signature:`ts=${ts},v1=${'0'.repeat(64)}`}, {...signed,requestId:'bad;request-id:spoof'},
  ]) assert.equal(verifyMercadoPagoSignature(modified),false)
})

test('the enrollment contract never accepts an amount or a Mercado Pago choice with an assistance request', () => {
  const person={firstName:'Ana',lastName:'Prueba',documentNumber:'12345678',birthDate:'1990-04-15',phone:'370 4123456',email:'ana@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'mercado_pago'}
  assert.equal(individualRegistrationSchema.safeParse(person).success,true)
  assert.equal(individualRegistrationSchema.safeParse({...person,documentNumber:'12.345.678'}).data.documentNumber,'12345678')
  assert.equal(individualRegistrationSchema.safeParse({...person,documentNumber:''}).success,false)
  assert.equal(individualRegistrationSchema.safeParse({...person,amountMinor:1}).success,false)
  assert.equal(individualRegistrationSchema.safeParse({...person,paymentDifficulty:true}).success,false)
})
