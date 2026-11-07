import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../public/pagina principal con efecto/flyer-feed.js', import.meta.url), 'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))
const file = (format, version = 3, page = 1) => ({ format, page,
  name: `flyer-evento-${format}-v${version}.png`,
  image: `/api/flyers/media/flyer-evento-${format}-v${version}-${'a'.repeat(32)}.png` })

function setup({ deferred = false } = {}) {
  const images = [{ src: 'fallback.png' }, { src: 'fallback.png' }]
  const links = [{ href: 'fallback.png' }, { href: 'fallback.png' }]
  const wall = { hidden: true }, more = { replaceChildren() {}, append() {} }, events = []
  let visibility, intersect, requests = 0, payload = { available: true, version: 3, files: [file('historia'), file('muro')] }, fail = false
  const document = { hidden: false,
    querySelectorAll: selector => selector.startsWith('.invite-thumbnail') ? images : links,
    querySelector: selector => selector === '#invite-save-wall' ? wall : more,
    addEventListener: (_name, fn) => { visibility = fn },
  }
  class Image { set src(_url) { queueMicrotask(() => fail ? this.onerror() : this.onload()) } }
  vm.runInNewContext(source, { document, window: { dispatchEvent: event => events.push(event) }, Image,
    ...(deferred ? { IntersectionObserver: class { constructor(callback) { intersect = callback } observe() {} disconnect() {} } } : {}),
    CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail } },
    fetch: async () => { requests++; return { ok: true, json: async () => payload } }, setInterval() {}, queueMicrotask,
  })
  return { images, links, wall, events, refresh: () => visibility(),
    payload: value => { payload = value }, fail: () => { fail = true }, requests: () => requests,
    approach: () => intersect([{ isIntersecting: true }]) }
}

test('one verified pair updates poster, preview, downloads and native share event together', async () => {
  const app = setup(); await settle()
  assert.ok(app.images.every(image => image.src === file('historia').image))
  assert.ok(app.links.every(link => link.href === file('historia').image && link.download === file('historia').name))
  assert.equal(app.wall.href, file('muro').image)
  assert.equal(app.wall.hidden, false)
  assert.equal(app.events[0].detail.image, file('historia').image)
  app.payload({ available: true, version: 4, files: [file('historia', 4)] })
  app.refresh(); await settle()
  assert.equal(app.events.length, 1, 'partial pair is never applied')
  app.payload({ available: true, version: 4, files: [file('historia', 4), file('muro', 4)] })
  app.fail(); app.refresh(); await settle()
  assert.equal(app.events.length, 1, 'unavailable image preserves the last good invitation')
})

test('offscreen flyer pair waits until the poster or opened dialog approaches the viewport', async () => {
  const app = setup({ deferred: true }); await settle()
  assert.equal(app.requests(), 0)
  app.refresh(); await settle()
  assert.equal(app.requests(), 0, 'visibility changes must not preload offscreen posters')
  app.approach(); await settle()
  assert.equal(app.requests(), 1)
  assert.ok(app.images.every(image => image.src === file('historia').image))
  assert.equal(app.wall.href, file('muro').image)
})

test('untrusted external media cannot replace the invitation', async () => {
  const app = setup(); await settle()
  app.payload({ available: true, version: 4, files: [{ ...file('historia', 4), image: 'https://attacker.invalid/logo.png' }, file('muro', 4)] })
  app.refresh(); await settle()
  assert.equal(app.events.length, 1)
  assert.ok(app.images.every(image => image.src === file('historia').image))
})
