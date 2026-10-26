import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../public/pagina principal con efecto/directions.js', import.meta.url), 'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))
async function setup({ ua = 'Android', platform = 'Linux', touch = 0, status = 'scheduled', venue = 'outdoor', failure = false } = {}) {
  const nodes = new Map()
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: id === 'directions-place' ? 'Anfiteatro de la Juventud' : '', setAttribute(name, value) { this[name] = value } })
    return nodes.get(id)
  }
  const labels = [{}, {}, {}, {}], listeners = {}, timers = []
  const documentElement = { dataset: {}, textContent: null }
  const document = { hidden: false, documentElement, getElementById: get,
    querySelectorAll: selector => {
      if (selector === '[data-event-venue-label]') return labels
      if (selector === '[data-event-venue]') return documentElement.dataset.eventVenue ? [documentElement, ...labels] : labels
      return []
    }, addEventListener: (name, fn) => { listeners[name] = fn } }
  let requests = 0
  vm.runInNewContext(source, { document, navigator: { userAgent: ua, platform, maxTouchPoints: touch }, URL, URLSearchParams, AbortSignal, Date,
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length }, clearTimeout() {},
    addEventListener: (name, fn) => { listeners[name] = fn },
    fetch: async () => { requests++; if (failure) throw new Error('offline'); return { ok: true, json: async () => ({ status, venue: { id: venue }, refreshAfterMs: 300000 }) } },
  })
  await settle()
  return { get, labels, document, listeners, timers, requests }
}

test('one Cómo llegar link uses Apple on iPhone and iPad, Google Maps on Android/desktop', async () => {
  for (const [ua, platform, touch, expected] of [
    ['iPhone', 'iPhone', 5, 'maps.apple.com'], ['Macintosh', 'MacIntel', 5, 'maps.apple.com'],
    ['Android', 'Linux', 5, 'www.google.com'], ['Windows', 'Win32', 0, 'www.google.com'],
  ]) {
    const app = await setup({ ua, platform, touch })
    assert.equal(new URL(app.get('directions-main').href).hostname, expected)
    assert.equal(new URL(app.get('directions-rain').href).hostname, expected)
    assert.match(app.get('directions-rain')['aria-label'], /María Auxiliadora/)
    assert.match(app.get('directions-status').textContent, /18:00/)
  }
})

test('rain updates every visible location and both platform-specific routes', async () => {
  for (const ua of ['iPhone', 'Android']) {
    const app = await setup({ ua, venue: 'indoor', status: 'rain' })
    assert.equal(app.get('directions-place').textContent, 'Parroquia María Auxiliadora')
    assert.match(app.get('directions-address').textContent, /1015/)
    assert.ok(app.labels.every(node => node.textContent === 'Parroquia María Auxiliadora'))
    const url = new URL(app.get('directions-main').href)
    assert.match(url.searchParams.get(ua === 'iPhone' ? 'daddr' : 'destination'), /María Auxiliadora/)
    assert.equal(app.document.documentElement.dataset.eventVenue, 'indoor')
    assert.match(app.get('directions-status').textContent, /indica lluvia/)
    assert.equal(app.get('weather-source').hidden, false)
  }
})

test('repeated venue refreshes never replace the document with the venue name', async () => {
  const app = await setup()
  await app.timers.at(-1).fn()
  assert.equal(app.document.documentElement.textContent, null)
  assert.equal(app.document.documentElement.dataset.eventVenue, 'outdoor')
  assert.ok(app.labels.every(node => node.textContent === 'Anfiteatro de la Juventud'))
})
test('offline weather preserves a usable map and explicit alternative without claiming a dry venue', async () => {
  const app = await setup({ failure: true })
  assert.match(app.get('directions-status').textContent, /No pudimos consultar/)
  assert.ok(app.get('directions-main').href.startsWith('https://'))
  assert.match(new URL(app.get('directions-rain').href).searchParams.get('destination'), /María Auxiliadora/)
  assert.equal(app.timers.at(-1).delay, 300000)
})

test('API failure after indoor selection retains the indoor destination', async () => {
  const app = await setup({ venue: 'indoor', status: 'unavailable' })
  assert.match(new URL(app.get('directions-main').href).searchParams.get('destination'), /María Auxiliadora/)
  assert.match(app.get('directions-status').textContent, /verificá la sede/)
})
