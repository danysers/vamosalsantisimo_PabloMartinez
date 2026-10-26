import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
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

test('landing keeps its original title palette, shows supporting text in white, and links Pablo Martínez to Wikipedia', async () => {
  const html = await readFile(landingPath, 'utf8')
  const hero = await readFile(path.join(root, 'components', 'golden-hero.tsx'), 'utf8')
  const footer = await readFile(path.join(root, 'components', 'site-footer.tsx'), 'utf8')
  const wikipedia = 'https://es.wikipedia.org/wiki/Pablo_Mart%C3%ADnez_(cantante)'
  const landingLink = `<a href="${wikipedia}">Pablo Martínez</a>`

  assert.match(html, /\.heading em\{font-weight:400;color:var\(--gold\)\}/)
  assert.match(html, /\.hero h1 \.gold-title\{[^}]*color:var\(--gold-light\)\}/)
  assert.ok(html.includes('#contenido p,'))
  assert.ok(html.includes('#contenido .hero-meta small,'))
  assert.ok(html.includes('#app .invitation-dialog .invite-utilities button{color:#fff}'))
  assert.doesNotMatch(html, /h1,h2,h3,\.panel-title,\.question summary\{color:#fff\}/)
  assert.equal((html.match(/<span data-event-venue-label>/g) ?? []).length, 4)
  assert.equal(html.split(landingLink).length - 1, 2)
  assert.ok(hero.includes(`href="${wikipedia}"`))
  assert.ok(footer.includes(`href="${wikipedia}"`))
})

test('retired encounter page, its exclusive assets, and links to it are removed', async () => {
  const html = await readFile(landingPath, 'utf8')
  const adoration = await readFile(path.join(root, 'components', 'adoration-section.tsx'), 'utf8')
  const footer = await readFile(path.join(root, 'components', 'site-footer.tsx'), 'utf8')
  const gallery = await readFile(path.join(root, 'app', 'propuestas-inicio', 'proposal-gallery.tsx'), 'utf8')
  const layout = await readFile(path.join(root, 'app', 'layout.tsx'), 'utf8')

  assert.doesNotMatch(html.slice(html.indexOf('<section class="encounter"'), html.indexOf('<section class="formation"')), /Más información/)
  for (const source of [html, adoration, footer, gallery]) assert.doesNotMatch(source, /\/encuentro(?:#|["'])/)
  assert.doesNotMatch(adoration, /Más información/)
  assert.doesNotMatch(layout, /event\.css/)
  for (const file of [
    'app/encuentro/page.tsx', 'app/event.css',
    ...['artist', 'cream', 'crowd', 'curtains', 'custodia', 'footer', 'guitar', 'hero'].map(name => `public/2026/${name}.webp`),
  ]) await assert.rejects(access(path.join(root, file)), { code: 'ENOENT' })
})

test('landing inline scripts remain syntactically valid', async () => {
  const html = await readFile(landingPath, 'utf8')
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]

  assert.ok(scripts.length > 0)
  for (const [, source] of scripts) assert.doesNotThrow(() => new Function(source))
})
