import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BOUNCE_BYTES, parseDeliveryReport, safeDiagnostic } from '../lib/email-bounce.mjs'
import { syncEmailBounces } from '../scripts/email-bounce-worker.mjs'

import { exampleMessageId, deliveryFixture } from './fixtures/email-delivery-report.mjs'

test('structured DSN recognizes mailbox full and exact original message, including folded diagnostics and headers-only originals', async () => {
  for (const originalType of ['message/rfc822', 'text/rfc822-headers']) {
    const reports = await parseDeliveryReport(deliveryFixture({ originalType, diagnostic: 'smtp; 550-5.2.2 Buzón sin espacio.\r\n 550-5.2.2 Please try again later. person@example.invalid https://provider.invalid/path' }))
    assert.equal(reports.length, 1)
    assert.equal(reports[0].emailId, exampleMessageId); assert.equal(reports[0].reasonCode, 'mailbox_full')
    assert.equal(reports[0].action, 'failed'); assert.equal(reports[0].recipient, 'person@example.invalid')
    assert.doesNotMatch(reports[0].diagnostic, /person@example|https:|\r|\n/)
  }
})
test('ordinary emails, quoted IDs, wrong domains, successful DSNs and oversized messages never become bounce evidence', async () => {
  assert.deepEqual(await parseDeliveryReport(Buffer.from(`From: postmaster@example.invalid\r\nContent-Type: text/plain\r\n\r\nMessage-ID: <${exampleMessageId}@vamosalsantisimo.com>`)), [])
  assert.deepEqual(await parseDeliveryReport(Buffer.from(deliveryFixture().toString().replace('@vamosalsantisimo.com>', '@evil.invalid>'))), [])
  assert.deepEqual(await parseDeliveryReport(deliveryFixture({ action: 'delivered', status: '2.0.0' })), [])
  assert.deepEqual(await parseDeliveryReport(Buffer.alloc(MAX_BOUNCE_BYTES + 1)), [])
  assert.equal(safeDiagnostic('a'.repeat(1000)).length, 500)
})
test('delayed and nonexistent mailbox reports remain distinct from permanent mailbox-full failures', async () => {
  const delayed = await parseDeliveryReport(deliveryFixture({ action: 'delayed', status: '4.4.1', diagnostic: 'smtp; Connection timed out' }))
  assert.equal(delayed[0].reasonCode, 'temporary_failure'); assert.equal(delayed[0].action, 'delayed')
  assert.equal((await parseDeliveryReport(deliveryFixture({ status: '5.1.1', diagnostic: 'smtp; User unknown' })))[0].reasonCode, 'invalid_recipient')
})
test('one mail cannot duplicate a report or cause unbounded database work with many recipients', async () => {
  const source = deliveryFixture().toString()
  const block = 'Final-Recipient: rfc822; person@example.invalid\r\nAction: failed\r\nStatus: 5.0.0\r\nDiagnostic-Code: smtp; 550-5.2.2 insufficient storage.\r\n'
  const insertion = source.indexOf('--report\r\nContent-Type: message/rfc822')
  const repeated = source.slice(0, insertion) + (block + '\r\n').repeat(50) + source.slice(insertion)
  assert.equal((await parseDeliveryReport(Buffer.from(repeated))).length, 1)
  const many = Array.from({ length: 60 }, (_, i) => block.replace('person@', `recipient${i}@`)).join('\r\n')
  assert.equal((await parseDeliveryReport(Buffer.from(source.slice(0, insertion) + many + source.slice(insertion)))).length, 20)
})
test('monitor opens mailboxes read-only, bounds fetching, persists UID cursor and retries failures without deleting or marking messages', async () => {
  let cursors = {}, records = 0, queried = false, released = false
  const db = { query: async (query, values) => {
    if (query.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] }
    if (query.startsWith('SELECT cursors')) return { rows: [{ cursors }] }
    if (query.includes('INSERT INTO email_delivery_reports')) { records++; return { rowCount: 1 } }
    if (query.includes('SET cursors')) cursors = JSON.parse(values[0])
    return { rows: [] }
  } }
  const client = { connect: async () => {}, list: async () => [{ path: 'INBOX', flags: new Set() }],
    mailbox: { uidValidity: 99n }, getMailboxLock: async (path, options) => {
      assert.equal(options.readOnly, true); return { release() { released = true } }
    }, search: async (criteria, options) => { queried = true; assert.equal(options.uid, true); return [7] },
    fetchOne: async (uid, query) => query.size ? { size: 1500 } : { source: deliveryFixture() }, logout: async () => {}, close() {} }
  assert.equal((await syncEmailBounces(db, client)).recorded, 1)
  assert.ok(queried && released); assert.equal(records, 1); assert.deepEqual(cursors.INBOX, { validity: '99', uid: 7 })
  assert.equal((await syncEmailBounces(db, client)).recorded, 0); assert.equal(records, 1)
  client.connect = async () => { throw Error('private credentials must not be logged') }
  assert.equal((await syncEmailBounces(db, client)).failed, true)
})
