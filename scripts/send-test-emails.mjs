import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { accreditationEmail, assistanceApprovedEmail, assistanceDeclinedEmail, assistanceReviewEmail, brandedEmailHtml, registrationEmail, settlementReminderEmail } from '../lib/email-templates.ts'

const send = process.argv.includes('--send')
const recipientIndex = process.argv.indexOf('--to')
const to = recipientIndex < 0 ? '' : process.argv[recipientIndex + 1]
const onlyIndex = process.argv.indexOf('--only')
const only = onlyIndex < 0 ? null : process.argv[onlyIndex + 1]
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: pnpm email:test --send --to recipient@example.com [--only assistance_approved]')
  process.exit(2)
}

const reference = 'PRUEBA-SIN-INSCRIPCION'
const choices = [
  ['bank_transfer', 'Transferencia pendiente'],
  ['on_site', 'Pago en el lugar'],
  ['mercado_pago', 'Mercado Pago'],
  ['assistance', 'Solicitud de ayuda'],
  ['paid', 'Pago confirmado'],
  ['waived', 'Exención aprobada'],
]
const messages = choices.map(([id, label]) => ({
  id, label,
  ...registrationEmail({
    firstName: 'Persona de prueba',
    reference,
    choice: id,
    amountMinor: 1_000_000,
    transferAlias: 'danielservin.mp',
    transferProvider: 'Mercado Pago',
    proofWhatsappE164: '5493718632884',
  }),
}))
messages.push({
  id: 'assistance_review_request', label: 'Aviso de ayuda al organizador',
  ...assistanceReviewEmail({
    fullName: 'Persona de prueba', reference,
    email: 'persona@example.invalid', phone: '370 0000000',
  }),
})
messages.push({
  id: 'assistance_approved', label: 'Ayuda aprobada',
  ...assistanceApprovedEmail({ firstName: 'Persona de prueba', reference }),
})
messages.push({
  id: 'assistance_declined', label: 'Ayuda no aprobada',
  ...assistanceDeclinedEmail({ firstName: 'Persona de prueba', reference }),
})

const qr = await QRCode.toBuffer('PRUEBA-SIN-VALIDEZ-NO-ES-UNA-ACREDITACION', {
  width: 480,
  margin: 2,
  errorCorrectionLevel: 'M',
})
messages.push({
  id: 'accreditation_ready',
  label: 'Acreditación con QR ficticio',
  ...accreditationEmail({ firstName: 'Persona de prueba', reference }),
  attachments: [{ filename: 'acreditacion-prueba.png', content: qr, cid: 'acreditacion', contentType: 'image/png' }],
})
messages.push({
  id: 'settlement_reminder',
  label: 'Recordatorio de plazo de Mercado Pago',
  ...settlementReminderEmail({ switchDate: '2026-11-28', targetDate: '2026-12-16', releaseDays: 18 }),
})
const selected = only ? messages.filter(message => message.id === only) : messages
if (!selected.length) {
  console.error('Unknown --only value; no messages were sent.')
  process.exit(2)
}

if (!send) {
  console.log(`${selected.length} previews ready for ${to}. Add --send to send them.`)
  process.exit(0)
}
const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
if (required.some(key => !process.env[key]) || process.env.SMTP_FROM !== 'contactos@vamosalsantisimo.com') {
  console.error('SMTP configuration is incomplete; no messages were sent.')
  process.exit(2)
}
const port = Number(process.env.SMTP_PORT)
if (![465, 587].includes(port)) throw new Error('SMTP_PORT must be 465 or 587')
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: port === 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

let failures = 0
try {
  await transport.verify()
  for (const [index, message] of selected.entries()) {
    const number = index + 1
    const subject = `[PRUEBA ${number}/${selected.length} — ${message.label}] ${message.subject}`
    const text = 'PRUEBA — SIN VALIDEZ. No existe una inscripción, pago ni acreditación real.\n\n' + message.text
    const html = brandedEmailHtml(text, message.attachments?.length ? 'acreditacion' : undefined)
    try {
      const result = await transport.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        text,
        html,
        ...(message.attachments ? { attachments: message.attachments } : {}),
        messageId: `<test-${randomUUID()}@vamosalsantisimo.com>`,
      })
      const accepted = result.accepted?.some(address => address.toLowerCase() === to.toLowerCase())
      if (!accepted) throw new Error('recipient_not_accepted')
      console.log(`${number}/${selected.length} accepted: ${message.label}`)
    } catch (error) {
      failures += 1
      console.error(`${number}/${selected.length} failed: ${message.label} (${error.code ?? 'send_failed'})`)
    }
    if (number < selected.length) await new Promise(resolve => setTimeout(resolve, 1200))
  }
} finally {
  transport.close()
}
if (failures) process.exitCode = 1
