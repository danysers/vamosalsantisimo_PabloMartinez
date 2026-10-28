import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const formation = path.join(root, 'public', 'formacion')
const pages = [
  'index.html',
  'contacto/index.html',
  'inscripcion/index.html',
  'pablo-martinez/index.html',
  'preguntas-frecuentes/index.html',
  'recursos/index.html',
]

test('workshop information names the venue and links to directions', async () => {
  const home = await readFile(path.join(formation, 'index.html'), 'utf8')
  const faq = await readFile(path.join(formation, 'preguntas-frecuentes/index.html'), 'utf8')
  const script = await readFile(path.join(formation, 'app.js'), 'utf8')
  for (const html of [home, faq]) {
    assert.match(html, /<strong>Modalidad<\/strong><span>Presencial<\/span>/)
    assert.match(html, /<strong>Hora de inicio<\/strong><span>15:00 h<\/span>/)
    assert.match(html, /<strong>Fecha<\/strong><span>19 de diciembre de 2026<\/span>/)
    assert.match(html, /<strong>Lugar<\/strong><span>Parroquia San Luis de Francia<\/span>/)
    assert.match(html, /id="workshop-directions"[^>]*https:\/\/www\.google\.com\/maps\/dir\//)
  }
  assert.match(script, /maps\.apple\.com/)
  assert.match(script, /www\.google\.com\/maps\/dir\//)
  assert.match(faq, /El taller es presencial/)
})

test('retired program page links go directly to registration', async () => {
  assert.equal(existsSync(path.join(formation, 'el-taller', 'index.html')), false)
  for (const page of pages) {
    const html = await readFile(path.join(formation, page), 'utf8')
    assert.doesNotMatch(html, /href="\/formacion\/el-taller"/)
  }
  const home = await readFile(path.join(formation, 'index.html'), 'utf8')
  assert.match(home, /href="\/formacion\/inscripcion">Ir a inscripción/)
  assert.doesNotMatch(home, /Conocer el programa/)
  const config = await readFile(path.join(root, 'next.config.mjs'), 'utf8')
  assert.match(config, /source: '\/formacion\/el-taller', destination: '\/formacion\/inscripcion'/)
})

test('workshop home replaces the invitation block with frequently asked questions', async () => {
  const home = await readFile(path.join(formation, 'index.html'), 'utf8')
  const faq = await readFile(path.join(formation, 'preguntas-frecuentes/index.html'), 'utf8')
  assert.doesNotMatch(home, /<section class="invitation">|¿Querés participar\?/)
  assert.doesNotMatch(faq, /<section class="invitation">/)
  assert.match(home, /<section class="faqs home-faq" aria-label="Preguntas frecuentes"><details class="faq-overview"><summary>/)
  assert.doesNotMatch(home, /<details class="faq-overview" open/)
  for (const question of ['¿Cuándo se realiza el taller?', '¿Cómo puedo inscribirme?', '¿Cuánto cuesta el taller?', '¿Puedo llevar algo para estar más cómodo y alabar?']) {
    assert.ok(home.includes(question), `missing workshop FAQ question: ${question}`)
  }
  assert.match(home, /href="\/formacion\/preguntas-frecuentes">Ver todas las preguntas frecuentes/)
  assert.match(home, /href="\/formacion\/inscripcion">Ir a inscripción/)
})

test('registration validates typed fields and submits only to the gated workshop endpoint', async () => {
  const html = await readFile(path.join(formation, 'inscripcion/index.html'), 'utf8')
  const script = await readFile(path.join(formation, 'app.js'), 'utf8')
  assert.match(html, /name="fechaNacimiento" type="date" autocomplete="bday" min="1900-01-01" required/)
  assert.match(html, /name="documento"[^>]*required/)
  assert.match(html, /<label>DNI \/ documento \*<input name="documento"[^>]*required[^>]*><\/label><label>Apodo \(opcional\)/)
  assert.match(script, /documentNumber: data\.get\('documento'\)/)
  assert.doesNotMatch(html, /name="edad"/)
  assert.match(html, /name="telefono" type="tel"[^>]*placeholder="Ej\.: 370 4123456"/)
  assert.doesNotMatch(html, /phone-hint|Incluí la característica/)
  assert.match(html, /name="correo" type="email"[^>]*required/)
  assert.match(html, /name="estado" required/)
  assert.match(script, /namePattern = \/\^\[/)
  assert.match(script, /digits\.length < 7 \|\| digits\.length > 15/)
  assert.doesNotMatch(script, /teléfono argentino de 10 dígitos/)
  assert.match(script, /birthDate\.value > birthDate\.max/)
  assert.match(script, /form\.reportValidity\(\)/)
  assert.match(html, /class="registration-result"[^>]*hidden/)
  assert.doesNotMatch(html, /Vista previa: los datos no se envían ni se guardan/)
  assert.match(html, /name="formaPago" value="bank_transfer_alias"/)
  assert.match(html, /name="formaPago" value="bank_transfer_qr"/)
  assert.match(script, /paymentMethod: String\(data\.get\('formaPago'\)\)\.startsWith\('bank_transfer_'\) \? 'bank_transfer'/)
  assert.match(html, /name="formaPago" value="on_site"/)
  assert.match(html, /id="payment-next" hidden/)
  assert.doesNotMatch(html, /Pagar con Mercado Pago<\/button>/)
  assert.match(script, /fetch\('\/api\/taller\/inscripciones'/)
  assert.match(script, /Idempotency-Key/)
  assert.doesNotMatch(script, /La recepción de inscripciones se habilitará próximamente/)
  assert.doesNotMatch(script, /fetch\(['"]\/api\/inscripciones/)
})
