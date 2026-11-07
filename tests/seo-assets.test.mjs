import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const source = path => new URL('../public/' + path, import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, '$1')

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
