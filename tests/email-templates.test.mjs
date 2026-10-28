import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accreditationEmail, assistanceApprovedEmail, assistanceDeclinedEmail, assistanceReviewEmail, assistanceWhatsappUrl, paymentProofReviewEmail, proofWhatsappUrl, registrationEmail, settlementReminderEmail } from '../lib/email-templates.ts'

test('confirmation is receipt of request, not claim of confirmed payment', () => {
  const message = registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'bank_transfer', amountMinor: 1_000_000,
    transferAlias: 'alias.prueba', transferProvider: 'Personal Pay', transferHolder: 'Titular Ejemplo', transferDocument: '12345678', proofWhatsappE164: '5493718632884' })
  assert.match(message.text, /PENDIENTE/)
  assert.match(message.text, /inscripción.*registrada con éxito/)
  assert.match(message.text, /alias\.prueba/)
  assert.match(message.text, /Personal Pay/)
  assert.match(message.text, /Titular Ejemplo/)
  assert.match(message.text, /12345678/)
  assert.match(message.text, /wa\.me\/5493718632884/)
  assert.match(message.text, /subí el comprobante/)
  assert.match(message.text, /no pagues dos veces/)
  assert.match(message.text, /Enviar comprobante/)
  assert.ok(!message.text.includes('quedó confirmada'))
  const onsite = registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'on_site' })
  assert.match(onsite.text, /pago en efectivo en el taller/)
  assert.match(onsite.text, /Precio de ventanilla a definir/)
  assert.doesNotMatch(onsite.text, /\$0/)
  assert.match(onsite.text, /PENDIENTE/)
  assert.match(registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'assistance' }).text, /pendiente de revisión/)
  assert.match(registrationEmail({ firstName: 'Ana', reference: 'REF-123', choice: 'paid' }).text, /pago ya fue confirmado/)
  assert.match(assistanceApprovedEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /No tenés que abonar/)
  assert.match(assistanceDeclinedEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /pago sigue pendiente/)
})

test('QR mail is separate and settlement mail never claims automatic rate change', () => {
  assert.match(accreditationEmail({ firstName: 'Ana', reference: 'REF-123' }).text, /quedó confirmada/)
  assert.match(accreditationEmail({ firstName: 'Ana', reference: 'REF-123', paymentConfirmed: true }).text, /pago fue registrado.*Te esperamos/)
  assert.match(settlementReminderEmail({ switchDate: '2026-11-11', targetDate: '2026-12-16', releaseDays: 18 }).text, /no cambia la configuración/)
  const help=new URL(proofWhatsappUrl('5493718632884', 'REF-123'))
  assert.match(help.searchParams.get('text'), /Tengo un problema con el comprobante de pago/)
  assert.match(help.searchParams.get('text'), /REF-123/)
})

test('organizer receives a private panel proof link', () => {
  const message = paymentProofReviewEmail({ fullName: 'Ana Pérez', reference: 'REF-123', amountMinor: 1_000_000,
    proofUrl: 'https://paneltaller2026.vamosalsantisimo.com/api/admin/taller/comprobantes/01234567-89ab-4def-8123-456789abcdef',
    panelUrl: 'https://paneltaller2026.vamosalsantisimo.com/admin/acreditacion?reference=REF-123' })
  assert.match(message.text, /Comprobante|comprobante/)
  assert.match(message.html, /href="https:\/\/paneltaller2026/)
  assert.match(message.text, /pendientes hasta que verifiques/)
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
