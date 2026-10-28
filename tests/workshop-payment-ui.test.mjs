import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('the configured online surcharge is itemized; alias, QR and on-site have no service fee', async () => {
  const form = await read('public/formacion/inscripcion/index.html')
  const checkout = await read('public/formacion/checkout.js')
  assert.match(form, /Transferencia por alias · sin gastos de servicio/)
  assert.match(form, /Pago con QR · sin gastos de servicio/)
  assert.match(form, /Pago en efectivo en el taller · precio de ventanilla a definir · sin promociones/)
  assert.match(checkout, /config\.onSitePriceMinor == null \? 'precio de ventanilla a definir'/)
  assert.match(checkout, /note\.textContent='Valor del taller: '\+money\(baseAmountMinor\)/)
  assert.match(checkout, /onlineFeeMinor=config\.feeMinor/)
  assert.match(checkout, /\[name="formaPago"\]\[value="mercado_pago"\]:checked/)
  assert.match(checkout, /description\.textContent='Taller '\+money\(baseAmountMinor\)\+' \+ gasto de plataforma '\+money\(onlineFeeMinor\)/)
  assert.doesNotMatch(checkout, /gasto de plataforma '\+money\(onlineFeeMinor\)\+' = '/)
  assert.doesNotMatch(form, /name="formaPago"[^>]*disabled/)
  for (const method of ['mercado_pago', 'bank_transfer_alias', 'bank_transfer_qr', 'on_site']) {
    assert.match(form, new RegExp(`name="formaPago" value="${method}"`))
  }
  assert.match(checkout, /' · Sin gastos de servicio'/)
})

test('transfer QR uses donation asset, and proof is uploaded privately with WhatsApp only for help', async () => {
  const checkout = await read('public/formacion/checkout.js')
  assert.doesNotMatch(checkout, /checkout-transfer-qr-warning|PRUEBA|Modo de prueba/)
  assert.match(checkout, /\/2026\/donaciones\/qr-billeteras\.png/)
  assert.match(checkout, /Subir comprobante/)
  assert.match(checkout, /\/api\/taller\/pagos\/comprobante/)
  assert.match(checkout, /Ayuda por WhatsApp/)
  assert.doesNotMatch(checkout, /Enviar comprobante por WhatsApp/)
  const qr = await readFile(new URL('../public/2026/donaciones/qr-billeteras.png', import.meta.url))
  assert.ok(qr.byteLength > 1000)
})

test('sandbox enables all three methods and replaces only the former placeholder transfer recipient', async () => {
  const sandbox = await read('scripts/prepare-sandbox.mjs')
  assert.match(sandbox, /mercado_pago_enabled=true, transfer_enabled=true, on_site_enabled=true/)
  assert.match(sandbox, /transfer_alias=CASE WHEN transfer_alias='NO TRANSFERIR - SOLO PRUEBA' THEN 'vamosalsantisimo' ELSE transfer_alias END/)
  assert.match(sandbox, /MP_ENVIRONMENT !== 'test'/)
  assert.match(sandbox, /MP_CHECKOUT_ENABLED !== '1'/)
})

test('workshop pages use the sharper high-resolution logo', async () => {
  const logo = await readFile(new URL('../public/formacion/assets/logo-dorado.png', import.meta.url))
  assert.equal(logo.readUInt32BE(16), 900)
  assert.equal(logo.readUInt32BE(20), 686)
  for (const page of ['index.html', 'inscripcion/index.html', 'preguntas-frecuentes/index.html']) {
    assert.match(await read(`public/formacion/${page}`), /logo-dorado\.png" width="900" height="686"/)
  }
})
