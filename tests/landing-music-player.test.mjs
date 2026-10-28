import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const root = new URL('../public/pagina principal con efecto/', import.meta.url)

test('music frame is between the FAQ heading and questions; header controls its player', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const heading = html.indexOf('<section class="closing"')
  const music = html.indexOf('<section class="music-section"')
  const questions = html.indexOf('<section class="faq"')
  assert.ok(heading < music && music < questions)
  assert.match(html, /id="music-toggle"[^>]*aria-label="Reproducir música"/)
  assert.match(html, /RDEMnKhIZKlwJfkBHGybZ85bLg/)
  assert.match(html, /event\.animationName !== 'brand-ring-orbit'/)
  assert.match(html, /notifyOpeningComplete\(\)/)
})

test('YouTube plays after opening animation, and header pause controls that same player', async () => {
  const source = await readFile(new URL('music-player.js', root), 'utf8')
  const listeners = new Map()
  const attributes = new Map()
  const button = { disabled: true, setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, fn) => listeners.set(`button:${name}`, fn) }
  const status = { textContent: '' }
  const caption = { textContent: '' }
  const placeholder = { textContent: '', hidden: false }
  const nodes = { 'music-toggle': button, 'music-control-status': status,
    'music-frame-status': caption, 'music-video': {}, 'music-video-placeholder': placeholder }
  let appended = 0
  const document = { hidden: false, readyState: 'loading', getElementById: id => nodes[id],
    addEventListener: (name, fn) => listeners.set(name, fn),
    createElement: () => ({}), head: { append() { appended++ } } }
  const calls = { play: 0, pause: 0, options: null, state: 2 }
  const window = { addEventListener: (name, fn) => listeners.set(`window:${name}`, fn),
    YT: { PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    Player: class {
      constructor(_id, options) { calls.options = options }
      getPlayerState() { return calls.state }
      getVideoData() { return { title: 'Jesús, te seguiré' } }
      playVideo() { calls.play++ }
      pauseVideo() { calls.pause++ }
    } } }
  runInNewContext(source, { document, window, location: { origin: 'https://example.test' },
    setTimeout: () => 1, clearTimeout: () => {} })
  assert.equal(appended, 0)
  listeners.get('window:load')()
  assert.equal(appended, 1)
  window.onYouTubeIframeAPIReady()
  calls.options.events.onReady()
  assert.equal(calls.play, 0)
  assert.equal(button.disabled, false)
  assert.equal(placeholder.hidden, true)
  assert.equal(calls.options.playerVars.list, 'RDEMnKhIZKlwJfkBHGybZ85bLg')
  listeners.get('vas:opening-complete')()
  assert.equal(calls.play, 1)
  calls.options.events.onStateChange({ data: 1 })
  calls.state = 1
  assert.equal(attributes.get('aria-pressed'), 'true')
  assert.equal(status.textContent, 'Jesús, te seguiré')
  listeners.get('button:click')()
  assert.equal(calls.pause, 1)
  calls.options.events.onAutoplayBlocked()
  assert.equal(attributes.get('aria-pressed'), 'false')
  assert.match(caption.textContent, /navegador requiere/)
})
