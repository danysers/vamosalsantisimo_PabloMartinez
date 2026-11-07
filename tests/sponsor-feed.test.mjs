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
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.classList = { toggle() {} } }
    get tagName() { return this.tag.toUpperCase() }
    get firstChild() { return this.children[0] }
    append(child) { if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child); child.parent = this; this.children.push(child) }
    querySelector(tag) { return this.children.find(child => tag.startsWith('.') ? child.className?.split(' ').includes(tag.slice(1)) : child.tag === tag) || this.children.map(child => child.querySelector(tag)).find(Boolean) }
    querySelectorAll() { return this.children.filter(child => child.dataset.driveId) }
    getAttribute(name) { return this[name] || null }
    setAttribute(name, value) { this[name] = value }
    removeAttribute(name) { delete this[name] }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this) }
    replaceWith(next) { if(this.parent) { const parent=this.parent; parent.children[parent.children.indexOf(this)]=next; next.parent=parent; this.parent=null } }
  }
  const grid = new Element('ul'), original = new Element('li'), events = new Map(), requests = []
  grid.append(original)
  const baseParent = new Element('section'), base = new Element('a'); base.className='brand-card'; base.dataset.brandName = 'Mila Club'; base.href = 'https://www.instagram.com/milaclub.ar/'; baseParent.append(base)
  let result = { available: true, sponsors: [sponsor('a')] }, refresh
  runInNewContext(source, {
    URL,
    document: { hidden: false, querySelector: () => grid, querySelectorAll: () => [base], createElement: tag => new Element(tag),
      addEventListener: (type, callback) => events.set(type, callback) },
    fetch: async path => { requests.push(path); return { ok: true, json: async () => result } },
    setInterval: callback => { refresh = callback },
  })
  await settle()
  assert.equal(grid.children.length, 2)
  const logo = grid.children[1], image = logo.querySelector('img')
  assert.equal(image.src, sponsor('a').image)
  assert.equal(image.alt, 'Marca de prueba')
  assert.equal(logo.querySelector('a'), undefined, 'logos without a URL are cards, not uncrawlable anchors')

  result = { available: true, sponsors: [sponsor('b', 'Marca actualizada')], links: [
    { name: 'MÁRCA-actualizada.png', href: 'https://www.instagram.com/marca/' },
    { name: 'Mila Club', href: 'https://www.facebook.com/milaclub/' },
  ] }
  await refresh(); await settle()
  assert.equal(grid.children.length, 2, 'replacing a Drive file must not duplicate a sponsor')
  assert.equal(logo.querySelector('img'), image)
  assert.equal(image.src, sponsor('b').image, 'an already-open page must load the new revision')
  assert.equal(image.alt, 'Marca actualizada')
  const card = logo.querySelector('a')
  assert.equal(card.href, 'https://www.instagram.com/marca/')
  assert.equal(card.rel, 'noopener noreferrer')
  assert.equal(card.target, '_blank')
  assert.match(card['aria-label'], /Visitar las redes de Marca actualizada/)
  assert.equal(base.href, 'https://www.facebook.com/milaclub/')

  result.links = [{ name: 'Marca actualizada', href: 'javascript:alert(1)' }, { name: 'Mila Club', href: null }]
  await refresh(); await settle()
  assert.equal(logo.querySelector('a'), undefined, 'untrusted links are never made clickable')
  assert.equal(logo.querySelector('img'), image, 'converting a link into a card preserves its image')
  assert.equal(baseParent.querySelector('a'), undefined, 'an empty TXT URL can disable a built-in link')

  result.links = []
  await refresh(); await settle()
  assert.equal(baseParent.querySelector('a').href, 'https://www.instagram.com/milaclub.ar/', 'removing a TXT entry restores the original default')

  result = { available: false, sponsors: [] }
  events.get('visibilitychange')(); await settle()
  assert.equal(grid.children.length, 2, 'temporary Drive failure retains the last usable gallery')

  result = { available: true, sponsors: [{ ...sponsor('c'), image: 'https://untrusted.example/logo.svg' }] }
  await refresh(); await settle()
  assert.deepEqual(grid.children, [original], 'only validated local raster media is published')
  assert.ok(requests.every(path => path === '/api/sponsors'))
})
