import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../public/deferred-images.js', import.meta.url), 'utf8')
test('full-quality offscreen originals load near the viewport; approved current flyers are never overwritten', () => {
  const photo = { src: 'data:image/svg+xml,blank', dataset: { deferredSrc: '/original-photo.jpg' },
    getAttribute(name) { return this[name] }, removeAttribute() { delete this.dataset.deferredSrc } }
  const poster = { ...photo, src: '/api/flyers/media/current.png', dataset: { deferredSrc: '/old-fallback.png' } }
  let enter
  vm.runInNewContext(source, { document: { querySelectorAll: () => [photo, poster] },
    IntersectionObserver: class { constructor(callback) { enter = callback } observe() {} unobserve() {} } })
  assert.ok(photo.src.startsWith('data:'))
  enter([{ isIntersecting: true, target: photo }, { isIntersecting: true, target: poster }])
  assert.equal(photo.src, '/original-photo.jpg')
  assert.equal(poster.src, '/api/flyers/media/current.png')
})
