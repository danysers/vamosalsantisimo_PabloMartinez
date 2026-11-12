import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { stat, readFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const source = path => fileURLToPath(new URL('../public/' + path, import.meta.url))

test('workshop navigation, CSS and HTML preload reuse one identical full-quality portrait request', async () => {
  const app = await readFile(source('formacion/app.js'), 'utf8')
  const css = await readFile(source('formacion/styles.css'), 'utf8')
  const portrait = /portrait\.src = '([^']+)'/.exec(app)?.[1]
  assert.ok(portrait)
  assert.ok(css.includes(`background:url('${portrait}')`))
  for (const page of ['', 'inscripcion', 'pago', 'comprobante', 'acreditacion', 'contacto', 'recursos', 'preguntas-frecuentes']) {
    const html = await readFile(source('formacion/' + (page ? page + '/' : '') + 'index.html'), 'utf8')
    assert.ok(html.includes(`rel="preload" as="image" href="${portrait}"`), page)
    assert.ok(html.includes('/formacion/app.js?v=20261106-seo-portrait'), 'new navigation script must replace any cached previous version')
  }
})

test('delivery images preserve every visible source pixel and the full original resolution', async () => {
  for (const [original, optimized] of [
    ['formacion/assets/pablo-martinez-camisa-azul.png', '2026/optimized/pablo-taller-20261106.webp'],
    ['formacion/assets/logo-dorado.png', '2026/optimized/logo-taller-20261106.webp'],
    ['2026/adoracion/santisimo-portada.png', '2026/optimized/custodia-20261106.webp'],
    ['2026/invitacion/mapa-dorado.png', '2026/optimized/mapa-20261106.webp'],
  ]) {
    const before = await sharp(source(original)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const after = await sharp(source(optimized)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(after.info, before.info, 'no crop, figure change or resolution loss')
    let error = 0
    for (let i = 0; i < before.data.length; i += 4) {
      assert.equal(before.data[i + 3], after.data[i + 3], 'transparency is preserved')
      for (let channel = 0; channel < 3; channel++) {
        // RGB underneath fully transparent pixels has no visible representation.
        error += Math.abs(before.data[i + channel] - after.data[i + channel]) * before.data[i + 3] / 255
      }
    }
    assert.equal(error, 0, 'lossless delivery must preserve every visible source color, including face and figure')
    assert.ok((await stat(source(optimized))).size < (await stat(source(original))).size)
  }
})
