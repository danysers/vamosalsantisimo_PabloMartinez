import test from 'node:test'
import assert from 'node:assert/strict'
import { createEventVenueService, hasRainSinceCheck, weatherApiUrl, WEATHER_CHECK_START, WEATHER_CHECK_END, WEATHER_REFRESH_MS } from '../lib/event-weather.ts'

const at = minutes => WEATHER_CHECK_START + minutes * 60_000
function weather(values = [0]) {
  return { minutely_15_units: { precipitation: 'mm' }, minutely_15: {
    time: values.map((_, index) => at(index * 15) / 1000), precipitation: values,
  } }
}

test('activates at 18:00 Argentina, one hour before the 19:00 gathering; no weather calls before then', async () => {
  let calls = 0
  let now = at(-1)
  const service = createEventVenueService(async () => { calls++; return weather() }, () => now)
  assert.equal(new Date(WEATHER_CHECK_START).toISOString(), '2026-12-19T21:00:00.000Z')
  let result = await service()
  assert.equal(result.status, 'scheduled')
  assert.equal(result.venue.id, 'outdoor')
  assert.equal(calls, 0)
  assert.equal(result.refreshAfterMs, 60_000)
  now = at(0)
  result = await service()
  assert.equal(result.status, 'dry')
  assert.equal(calls, 1)
})

test('rain since 18:00 changes the venue; future rain is ignored', () => {
  assert.equal(hasRainSinceCheck(weather([0, 2]), at(5)), false)
  assert.equal(hasRainSinceCheck(weather([0, .1, 0]), at(30)), true)
  assert.equal(hasRainSinceCheck(weather([0, 0, 0]), at(30)), false)
})

test('missing, null, stale or incorrect-unit measurements never count as dry weather', () => {
  for (const data of [null, {}, weather([null]), weather([-1]), weather([NaN]), weather([]), weather([0])]) {
    assert.throws(() => hasRainSinceCheck(data, at(30)))
  }
  const wrongUnit = weather([1]); wrongUnit.minutely_15_units.precipitation = 'inch'
  assert.throws(() => hasRainSinceCheck(wrongUnit, at(0)))
})

test('caches requests for five minutes and deduplicates simultaneous visitors', async () => {
  let calls = 0
  let now = at(0)
  let complete
  const service = createEventVenueService(() => { calls++; return new Promise(resolve => { complete = resolve }) }, () => now)
  const a = service(); const b = service()
  assert.equal(calls, 1)
  complete(weather())
  assert.equal((await a).status, 'dry')
  await b
  now += WEATHER_REFRESH_MS - 1
  assert.equal((await service()).status, 'dry')
  assert.equal(calls, 1)
  now++
  const c = service(); complete(weather())
  await c
  assert.equal(calls, 2)
})

test('rain does not send visitors back outdoors when it stops or the provider fails', async () => {
  let now = at(0), fail = false
  const service = createEventVenueService(async () => { if (fail) throw new Error('offline'); return weather(now === at(0) ? [.1] : [0, 0]) }, () => now)
  assert.equal((await service()).venue.id, 'indoor')
  now = at(15)
  assert.equal((await service()).status, 'rain')
  fail = true; now = at(20)
  const outage = await service()
  assert.equal(outage.status, 'unavailable')
  assert.equal(outage.venue.id, 'indoor')
  assert.ok(outage.checkedAt)
})

test('a fresh visitor recovers earlier rain from elapsed intervals; an outage is explicit', async () => {
  const service = createEventVenueService(async () => weather([.2, 0, 0]), () => at(30))
  assert.equal((await service()).venue.id, 'indoor')
  const unavailable = createEventVenueService(async () => { throw new Error('offline') }, () => at(0))
  assert.equal((await unavailable()).status, 'unavailable')
})

test('organizer override takes precedence and polling ends after the encounter', async () => {
  let calls = 0, now = at(0)
  const service = createEventVenueService(async () => { calls++; return weather([1]) }, () => now)
  assert.equal((await service('indoor')).venue.id, 'indoor')
  assert.equal((await service('outdoor')).venue.id, 'outdoor')
  assert.equal(calls, 0)
  now = WEATHER_CHECK_END
  const end = await service()
  assert.equal(end.status, 'ended')
  assert.equal(end.refreshAfterMs, 0)
  assert.equal(calls, 0)
})

test('weather is requested for the public event location and event date only', () => {
  const url = new URL(weatherApiUrl())
  assert.equal(url.hostname, 'api.open-meteo.com')
  assert.equal(url.searchParams.get('start_date'), '2026-12-19')
  assert.equal(url.searchParams.get('minutely_15'), 'precipitation')
  assert.equal(url.searchParams.get('timeformat'), 'unixtime')
  assert.equal(url.searchParams.get('latitude'), '-26.1936919')
})
