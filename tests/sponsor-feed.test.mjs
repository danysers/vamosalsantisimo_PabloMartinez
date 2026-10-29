import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../public/pagina principal con efecto/sponsor-feed.js', import.meta.url), 'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))
const sponsor = (version, name = 'Marca de prueba') => ({ id: 'sponsor_test_2026', name,
  image: `/api/sponsors/media/sponsor_test_2026-${version.repeat(32)}.png` })

test('Drive gallery adds a logo, updates a replaced Drive image and removes it without changing original brands', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {} }
    append(child) { child.parent = this; this.children.push(child) }
    querySelector(tag) { return this.children.find(child => child.tag === tag) || this.children.map(child => child.querySelector(tag)).find(Boolean) }
    querySelectorAll() { return this.children.filter(child => child.dataset.driveId) }
    getAttribute(name) { return this[name] || null }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this) }
  }
  const grid = new Element('ul'), original = new Element('li'), events = new Map(), requests = []
  grid.append(original)
  let result = { available: true, sponsors: [sponsor('a')] }, refresh
  runInNewContext(source, {
    document: { hidden: false, querySelector: () => grid, createElement: tag => new Element(tag),
      addEventListener: (type, callback) => events.set(type, callback) },
    fetch: async path => { requests.push(path); return { ok: true, json: async () => result } },
    setInterval: callback => { refresh = callback },
  })
  await settle()
  assert.equal(grid.children.length, 2)
  const logo = grid.children[1], image = logo.querySelector('img')
  assert.equal(image.src, sponsor('a').image)
  assert.equal(image.alt, 'Marca de prueba')

  result = { available: true, sponsors: [sponsor('b', 'Marca actualizada')] }
  await refresh(); await settle()
  assert.equal(grid.children.length, 2, 'replacing a Drive file must not duplicate a sponsor')
  assert.equal(logo.querySelector('img'), image)
  assert.equal(image.src, sponsor('b').image, 'an already-open page must load the new revision')
  assert.equal(image.alt, 'Marca actualizada')

  result = { available: false, sponsors: [] }
  events.get('visibilitychange')(); await settle()
  assert.equal(grid.children.length, 2, 'temporary Drive failure retains the last usable gallery')

  result = { available: true, sponsors: [{ ...sponsor('c'), image: 'https://untrusted.example/logo.svg' }] }
  await refresh(); await settle()
  assert.deepEqual(grid.children, [original], 'only validated local raster media is published')
  assert.ok(requests.every(path => path === '/api/sponsors'))
})
