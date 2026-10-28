import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSchedule, dueEvents, emptyState, validateState, reminderMessage, setupMessage, deliver } from '../notifications/settlement-alerts/schedule.mjs'

const config = JSON.parse(await readFile(new URL('../notifications/settlement-alerts/config.json', import.meta.url), 'utf8'))
const events = buildSchedule(config)
const at = (date) => Date.parse(date)

test('81 reminders use the approved dates and Argentina midnight, including all 24 hours', () => {
  assert.equal(events.length, 81)
  assert.equal(new Set(events.map((event) => event.id)).size, 81)
  const expected = [
    ['18-dias', '2026-11-11', ['2026-11-07', '2026-11-08', '2026-11-09']],
    ['10-dias', '2026-11-28', ['2026-11-24', '2026-11-25', '2026-11-26']],
    ['al-instante', '2026-12-06', ['2026-12-02', '2026-12-03', '2026-12-04']],
  ]
  for (const [id, day, earlier] of expected) {
    const phase = events.filter((event) => event.phaseId === id)
    assert.deepEqual(phase.filter((event) => event.kind === 'advance').map((event) => event.at),
      earlier.map((date) => at(`${date}T09:00:00-03:00`)))
    const hourly = phase.filter((event) => event.kind === 'hourly')
    assert.equal(hourly.length, 24)
    assert.equal(hourly[0].at, at(`${day}T00:00:00-03:00`))
    assert.equal(hourly[23].at, at(`${day}T23:00:00-03:00`))
    assert.equal(hourly[23].expiresAt, hourly[0].at + 86_400_000)
  }
})

test('restart after missed slots sends only the current hourly reminder, not a backlog', () => {
  const state = emptyState(config)
  const due = dueEvents(config, state, at('2026-11-11T15:37:00-03:00'))
  assert.equal(due.length, 1)
  assert.equal(due[0].hour, 15)
  assert.equal(dueEvents(config, state, at('2026-11-12T00:00:00-03:00')).length, 0)
  assert.equal(dueEvents(config, state, at('2026-11-10T09:00:00-03:00')).length, 0)
  assert.equal(dueEvents(config, state, at('2027-11-11T09:00:00-03:00')).length, 0)
})

test('daily advance notices expire at midnight and are never sent before 09:00', () => {
  const state = emptyState(config)
  assert.equal(dueEvents(config, state, at('2026-11-07T08:59:59-03:00')).length, 0)
  assert.equal(dueEvents(config, state, at('2026-11-07T09:00:00-03:00')).length, 1)
  assert.equal(dueEvents(config, state, at('2026-11-08T00:00:00-03:00')).length, 0)
})

test('accepted email survives state reload and cannot be sent twice', async () => {
  const state = emptyState(config)
  const event = events[0]
  let stored
  let sent = 0
  const result = await deliver(state, { id: event.id, message: reminderMessage(config, event), now: event.at,
    save: async (value) => { stored = JSON.stringify(value) },
    send: async () => { sent += 1; return { accepted: true, messageId: '<stable@test>' } },
  })
  assert.equal(result.status, 'sent')
  const reloaded = validateState(config, JSON.parse(stored))
  assert.equal(dueEvents(config, reloaded, event.at + 60_000).length, 0)
  assert.equal(sent, 1)
  assert.equal(Object.keys(reloaded.uncertain).length, 0)
})

test('rejected SMTP messages retry after five minutes, at most three times per slot', async () => {
  const state = emptyState(config)
  const event = events[0]
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = event.at + attempt * 300_000
    assert.equal(dueEvents(config, state, now).length, 1)
    const result = await deliver(state, { id: event.id, message: {}, now, save: async () => {},
      send: async () => { throw Object.assign(new Error('ignored private details'), { code: 'EENVELOPE', responseCode: 451 }) },
    })
    assert.equal(result.status, 'failed')
    assert.equal(dueEvents(config, state, now + 299_999).length, 0)
  }
  assert.equal(dueEvents(config, state, event.at + 900_000).length, 0)
  assert.equal(state.sent[event.id], undefined)
})

test('ambiguous disconnect or crash is retained for review instead of duplicate delivery', async () => {
  const state = emptyState(config)
  const event = events[0]
  const result = await deliver(state, { id: event.id, message: {}, now: event.at, save: async () => {},
    send: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) },
  })
  assert.equal(result.status, 'uncertain')
  assert.equal(dueEvents(config, JSON.parse(JSON.stringify(state)), event.at + 900_000).length, 0)
})

test('an operator acknowledgement suppresses only that phase', () => {
  const state = emptyState(config)
  state.acknowledged['18-dias'] = '2026-11-11T03:05:00.000Z'
  assert.equal(dueEvents(config, state, at('2026-11-11T06:00:00-03:00')).length, 0)
  assert.equal(dueEvents(config, state, at('2026-11-28T06:00:00-03:00')).length, 1)
})

test('recipient rejection cannot be recorded as sent', async () => {
  const state = emptyState(config)
  const result = await deliver(state, { id: events[0].id, message: {}, now: events[0].at,
    save: async () => {}, send: async () => ({ accepted: false }) })
  assert.equal(result.status, 'failed')
  assert.equal(Object.keys(state.sent).length, 0)
})

test('invalid dates, cadence, phases and damaged state fail closed', () => {
  assert.throws(() => buildSchedule({ ...config, targetDate: '2026-02-30' }))
  assert.throws(() => buildSchedule({ ...config, advanceDays: [4, 3, 2, 1] }))
  assert.throws(() => buildSchedule({ ...config, phases: [config.phases[0], config.phases[0], config.phases[2]] }))
  assert.throws(() => validateState(config, { version: 0 }))
  assert.throws(() => validateState(config, { ...emptyState(config), planId: 'other' }))
})

test('mail explains manual action and setup states the complete approved cadence', () => {
  const message = reminderMessage(config, events.find((event) => event.phaseId === 'al-instante' && event.hour === 23))
  assert.match(message.subject, /al instante.*23:00/)
  assert.match(message.text, /Guardar/)
  assert.match(message.html, /https:\/\/www\.mercadopago\.com\.ar\/costs-section/)
  const setup = setupMessage(config)
  assert.match(setup.text, /81 avisos/)
  assert.match(setup.text, /07\/11\/2026, 08\/11\/2026, 09\/11\/2026/)
  assert.match(setup.text, /00:00 a 23:00/)
  assert.match(setup.text, /aunque tu PC esté apagada/)
})
