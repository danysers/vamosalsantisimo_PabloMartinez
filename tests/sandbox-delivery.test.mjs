import test from 'node:test'
import assert from 'node:assert/strict'
import { processEmailJob } from '../scripts/email-worker.mjs'

test('public sandbox emails are clearly marked as tests and never alter production emails', async () => {
  const previous = { flag: process.env.WORKSHOP_SANDBOX_REGISTRATIONS, environment: process.env.MP_ENVIRONMENT, checkoutKey: process.env.WORKSHOP_CHECKOUT_TOKEN_KEY }
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='sandbox-email-fixture-key-'.repeat(3)
  const sent = []
  const pool = { async query(sql) {
    if (sql.includes('FROM registrations r')) return { rows: [{ id:'sandbox-registration',creation_key:'sandbox-creation',starts_at:new Date('2026-12-19T18:00:00Z'),email:'test@example.invalid',reference:'SANDBOX2026',first_name:'Ana',source:'mercado_pago',amount_minor:1100000,paid:false }] }
    return { rows: [] }
  } }
  const transport = { async sendMail(message) { sent.push(message); return { accepted:['test@example.invalid'] } } }
  const job = { id:'sandbox-job',registration_id:'sandbox-registration',kind:'registration_received',to_email:'test@example.invalid',attempt_count:1 }
  try {
    process.env.WORKSHOP_SANDBOX_REGISTRATIONS='1'
    process.env.MP_ENVIRONMENT='test'
    assert.equal(await processEmailJob(pool,transport,job,'contactos@vamosalsantisimo.com'),'sent')
    assert.match(sent[0].subject,/^\[PRUEBA\]/)
    assert.match(sent[0].text,/sin cargos reales/)
    assert.match(sent[0].html,/no son válidos para ingresar/)
    process.env.MP_ENVIRONMENT='production'
    assert.equal(await processEmailJob(pool,transport,job,'contactos@vamosalsantisimo.com'),'sent')
    assert.doesNotMatch(sent[1].subject,/^\[PRUEBA\]/)
    assert.doesNotMatch(sent[1].text,/MODO DE PRUEBA/)
  } finally {
    if(previous.flag===undefined)delete process.env.WORKSHOP_SANDBOX_REGISTRATIONS;else process.env.WORKSHOP_SANDBOX_REGISTRATIONS=previous.flag
    if(previous.environment===undefined)delete process.env.MP_ENVIRONMENT;else process.env.MP_ENVIRONMENT=previous.environment
    if(previous.checkoutKey===undefined)delete process.env.WORKSHOP_CHECKOUT_TOKEN_KEY;else process.env.WORKSHOP_CHECKOUT_TOKEN_KEY=previous.checkoutKey
  }
})
