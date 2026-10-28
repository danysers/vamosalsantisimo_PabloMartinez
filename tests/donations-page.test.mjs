import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('donations show the supplied interoperable QR and current account without DNI', async () => {
  const page = await read('app/donaciones/page.tsx')
  const details = await read('lib/community-support.ts')
  const account = await read('components/donation-account.tsx')
  assert.match(page, /Pagá con cualquier billetera/)
  assert.match(page, /\/2026\/donaciones\/qr-billeteras\.png/)
  assert.doesNotMatch(page, /QR de prueba|qr-prueba|No permite realizar donaciones/)
  assert.match(details, /alias: 'vamosalsantisimo'/)
  assert.match(details, /holder: 'Sergio Daniel Servín'/)
  assert.doesNotMatch(details, /platform:/)
  assert.doesNotMatch(details, /dni:/i)
  assert.doesNotMatch(account, /<h2>|Personal Pay/)
  assert.doesNotMatch(account, /<dt>DNI<\/dt>/)
  await access(new URL('../public/2026/donaciones/qr-billeteras.png', import.meta.url))
})
