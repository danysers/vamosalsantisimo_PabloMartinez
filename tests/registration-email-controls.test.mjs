import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
register('./ts-server-loader.mjs', import.meta.url)
register('./tsx-loader.mjs', import.meta.url)
const { default: Controls } = await import('../app/admin/inscripciones/accreditation-email-controls.tsx')
const { registrationEmailActions } = await import('../lib/registration-email-actions.ts')

const existing = { reference: 'Fictitious12345', status: 'confirmed', editable: true, archived: false, deleted: false,
  fields: { email: 'person@example.invalid' }, accreditationEmail: '', version: 'a'.repeat(32),
  credential: { issued: true }, proofReminderEligible: false, proofs: [{ id: 'proof' }], emails: [], bounceSync: {},
  operations: { version: 'b'.repeat(32), registrationStatus: 'confirmed', registeredAt: '2026-10-30T12:00:00Z',
    paymentMethod: 'bank_transfer', paymentStatus: 'approved', amountMinor: 1000000, paidAmountMinor: 1000000,
    feeMinor: 0, manualReference: 'Fictitious', qrBlocked: false, admitted: false, waived: false, assisted: false, members: 1 } }
const render = (detail, props = {}) => renderToStaticMarkup(createElement(Controls, { detail, canAdminister: true,
  blocked: false, refresh: async () => {}, onBusy: () => {}, ...props }))
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([^<]+)<\/button>/g)].map(([, attrs, label]) => ({ label, disabled: attrs.includes('disabled=""') }))
const disabled = (html, label) => {
  const found = buttons(html).find(b => b.label === label)
  assert.ok(found, `The action must remain visible: ${label}`)
  return found.disabled
}

test('paid registration keeps all four email/link actions visible and keeps its existing QR by default', () => {
  const html = render(existing)
  assert.equal(disabled(html, 'Copiar enlace de acreditación'), false)
  assert.equal(disabled(html, 'Reenviar acreditación con el mismo QR'), false)
  assert.equal(disabled(html, 'Copiar enlace para subir comprobante'), true)
  assert.equal(disabled(html, 'Reenviar pedido de comprobante'), true)
  assert.equal(disabled(html, 'Generar QR de acreditación'), true)
  assert.equal(disabled(html, 'Revocar y generar un QR nuevo'), false)
  assert.equal(disabled(html, 'Revocar QR'), false)
  assert.match(html, /No corresponde pedir otro comprobante/)
  assert.ok(html.indexOf('Copiar enlace de acreditación') < html.indexOf('Historial de correos'))
})

test('approved but administratively blocked QR offers explicit generation without hiding the other actions', () => {
  const detail = { ...existing, credential: { issued: false }, operations: { ...existing.operations, qrBlocked: true } }
  const html = render(detail)
  assert.equal(disabled(html, 'Generar QR de acreditación'), false)
  assert.equal(disabled(html, 'Copiar enlace de acreditación'), true)
  assert.equal(disabled(html, 'Reenviar acreditación con el mismo QR'), true)
  assert.equal(disabled(html, 'Copiar enlace para subir comprobante'), true)
  assert.equal(disabled(html, 'Reenviar pedido de comprobante'), true)
  assert.match(html, /bloqueado por una corrección administrativa/)
})

test('pending transfer offers the direct proof link; resend still requires recipient confirmation', () => {
  const html = render({ ...existing, status: 'pending', proofs: [], proofReminderEligible: true, credential: { issued: false },
    operations: { ...existing.operations, registrationStatus: 'pending', paymentStatus: 'pending', paidAmountMinor: 0 } })
  assert.equal(disabled(html, 'Copiar enlace para subir comprobante'), false)
  assert.equal(disabled(html, 'Reenviar pedido de comprobante'), true)
  assert.match(html, /Confirmé que falta el comprobante/)
  assert.equal(disabled(html, 'Copiar enlace de acreditación'), true)
  assert.equal(disabled(html, 'Generar QR de acreditación'), true)
})

test('cash, archive, an existing check-in and operator role retain their distinct restrictions', () => {
  const cash = { ...existing, operations: { ...existing.operations, paymentMethod: 'on_site' } }
  assert.match(registrationEmailActions(cash).passReason, /ventanilla/)
  assert.equal(disabled(render(cash), 'Revocar y generar un QR nuevo'), true)
  const archived = { ...existing, archived: true }
  assert.equal(disabled(render(archived), 'Reenviar acreditación con el mismo QR'), true)
  const admitted = { ...existing, operations: { ...existing.operations, admitted: true } }
  assert.equal(disabled(render(admitted), 'Revocar QR'), true)
  assert.equal(disabled(render(admitted), 'Revocar y generar un QR nuevo'), true)
  const html = render(existing, { canAdminister: false })
  assert.doesNotMatch(html, /Generar QR de acreditación|Revocar y generar un QR nuevo|>Revocar QR</)
  assert.equal(disabled(html, 'Reenviar acreditación con el mismo QR'), false)
})
