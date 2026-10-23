import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppLink, organizationWhatsApp } from '../lib/whatsapp-link.ts'

test('an Argentine number opens a reviewable message without claiming a reservation', () => {
  assert.equal(organizationWhatsApp, '5493704258770')
  const url = new URL(buildWhatsAppLink(organizationWhatsApp))
  assert.equal(url.origin, 'https://wa.me')
  assert.equal(url.pathname, '/5493704258770')
  const message = url.searchParams.get('text')
  assert.match(message, /Vamos al Santísimo/)
  assert.match(message, /taller de músicos/)
  assert.match(message, /19 de diciembre de 2026/)
  assert.doesNotMatch(message, /inscripto|confirmado|pago aprobado|token|correo/i)
})

test('a saved registration may include only its public reference, never a status token', () => {
  const url = new URL(buildWhatsAppLink(organizationWhatsApp, 'abcdefghijklmnop'))
  assert.match(url.searchParams.get('text'), /abcdefghijklmnop/)
  assert.throws(() => buildWhatsAppLink('3704258770'), /Invalid WhatsApp number/)
  assert.throws(() => buildWhatsAppLink(organizationWhatsApp, 'unsafe?token=abc'), /Invalid registration reference/)
})
