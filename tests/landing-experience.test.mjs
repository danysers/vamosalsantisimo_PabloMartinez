import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const landingPath = path.join(root, 'public', 'pagina principal con efecto', 'index.html')
const faqPath = path.join(root, 'public', 'formacion', 'preguntas-frecuentes', 'index.html')
const supportShellPath = path.join(root, 'components', 'support-page-shell.tsx')

test('landing removes the chapter number and effects toggle', async () => {
  const html = await readFile(landingPath, 'utf8')
  const supportShell = await readFile(supportShellPath, 'utf8')

  assert.doesNotMatch(html, /class="chapter-number"|\.chapter-number\{/)
  assert.doesNotMatch(html, /id="motion"|Pausar efectos|vas-effect-paused/)
  assert.doesNotMatch(supportShell, /motionControl|Pausar animaciones|setPaused/)
})

test('landing scroll and browser restoration do not pin the adoration section', async () => {
  const html = await readFile(landingPath, 'utf8')

  assert.doesNotMatch(html, /pin\s*:\s*true/)
  assert.match(html, /addEventListener\('popstate',restoreInitialAnchor\)/)
  assert.match(html, /if \(event\.persisted\) \{ applyPreference\(\); restoreInitialAnchor\(\); \}/)
  assert.ok(html.indexOf('function restoreInitialAnchor()') < html.indexOf('const ready = () =>'))
})

test('event copy distinguishes free adoration, paid workshop, and onsite registration', async () => {
  const html = await readFile(landingPath, 'utf8')
  const faq = await readFile(faqPath, 'utf8')

  assert.match(html, /La adoración es gratuita\. El taller de músicos tiene un pequeño costo/)
  assert.match(html, /anotarte en el lugar el mismo día/)
  assert.match(html, /¿Puedo llevar algo para estar más cómodo y alabar\?/)
  assert.match(html, /una silleta, agua, un anotador, una pandereta u otros instrumentos/)
  assert.match(faq, /¿Cuánto cuesta el taller\?/)
  assert.match(faq, /inscribirte en el lugar el mismo día del taller/)
})

test('landing inline scripts remain syntactically valid', async () => {
  const html = await readFile(landingPath, 'utf8')
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]

  assert.ok(scripts.length > 0)
  for (const [, source] of scripts) assert.doesNotThrow(() => new Function(source))
})
