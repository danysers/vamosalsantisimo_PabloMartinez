// Delivery variants only. Approved source artwork and downloadable flyers stay untouched.
import { createRequire } from 'node:module'
import { mkdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const root = fileURLToPath(new URL('../public/', import.meta.url))
await mkdir(root + '2026/optimized', { recursive: true })
const images = [
  ['2026/adoracion/santisimo-portada.png', 'custodia'],
  ['formacion/assets/pablo-martinez-camisa-azul.png', 'pablo-taller'],
  ['formacion/assets/logo-dorado.png', 'logo-taller'],
  ['2026/invitacion/mapa-dorado.png', 'mapa'],
]
for (const [source, name] of images) {
  const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7)
  if (only && name !== only) continue
  const output = `2026/optimized/${name}-20261106.webp`
  const image = sharp(root + source, { limitInputPixels: 24_000_000 })
  await image.webp({ lossless: true, effort: 6 }).toFile(root + output)
  console.log(output, (await stat(root + output)).size, 'bytes')
}
