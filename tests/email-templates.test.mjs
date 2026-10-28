import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accreditationEmail, assistanceApprovedEmail, assistanceDeclinedEmail, assistanceReviewEmail, assistanceWhatsappUrl, proofWhatsappUrl, registrationEmail, settlementReminderEmail } from '../lib/email-templates.ts'

test('confirmation is receipt of request, not claim of confirmed payment', () => {
  const message = registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'bank_transfer', amountMinor: 1_000_000, transferAlias: 'danielservin.mp', transferProvider: 'Mercado Pago', proofWhatsappE164: '5493718632884' })
  assert.match(message.text, /PENDIENTE/)
  assert.match(message.text, /inscripción.*registrada con éxito/)
  assert.match(message.text, /danielservin\.mp/)
  assert.match(message.text, /wa\.me\/5493718632884/)
  assert.match(message.text, /no adjunta ni verifica/)
  assert.ok(!message.text.includes('quedó confirmada'))
  const onsite = registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'on_site' })
  assert.match(onsite.text, /pagar en el lugar/)
  assert.match(onsite.text, /PENDIENTE/)
  assert.match(registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'assistance' }).text, /pendiente de revisión/)
  assert.match(registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'paid' }).text, /pago ya fue confirmado/)
  assert.match(assistanceApprovedEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /No tenés que abonar/)
  assert.match(assistanceDeclinedEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /pago sigue pendiente/)
})

test('QR mail is separate and settlement mail never claims automatic rate change', () => {
  assert.match(accreditationEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /quedó confirmada/)
  assert.match(settlementReminderEmail({ switchDate: '2026-11-11', targetDate: '2026-12-16', releaseDays: 18 }).text, /no cambia la configuración/)
  assert.match(proofWhatsappUrl('5493718632884', 'REF-123'), /Referencia%3A%20REF-123/)
})

test('Mercado Pago copy avoids settlement claims and branded HTML omits priest contact', () => {
  const message = registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'mercado_pago' })
  assert.doesNotMatch(message.text, /pendiente|acreditaci[oó]n|volver a la página/i)
  assert.match(message.html, /background:#000000/)
  assert.match(message.html, /logo-vamos\.png/)
  assert.match(message.html, /Sergio Daniel Servin/)
  assert.match(message.html, /Luciano Barrios/)
  assert.match(message.html, /Enzo Machuca/)
  assert.doesNotMatch(message.html, /Guillermo Estavilla|Padre Asesor/)
})

test('assistance alert goes to organizer and approval message is separate', () => {
  const alert = assistanceReviewEmail({ fullName: 'Ana Pérez', reference: 'REF-123', email: 'ana@example.invalid', phone: '370 0000000' })
  assert.match(alert.text, /pendiente de revisión/)
  assert.doesNotMatch(alert.text, /fue aprobada/)
  const decision = assistanceApprovedEmail({ firstName: 'Ana', reference: 'REF-123' })
  assert.match(decision.text, /fue aprobada/)
  assert.match(decision.html, /No tenés que abonar/)
  const declined = assistanceDeclinedEmail({ firstName: 'Ana', reference: 'REF-123' })
  assert.match(declined.text, /no pudimos aprobar/)
  assert.doesNotMatch(declined.text, /No tenés que abonar/)
  assert.match(assistanceWhatsappUrl('5493718632884', 'REF-123'), /wa\.me\/5493718632884/)
})
