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

async function createPlayer({ openingComplete = false, hidden = false } = {}) {
  const source = await readFile(new URL('music-player.js', root), 'utf8')
  const listeners = new Map()
  const attributes = new Map()
  const button = { disabled: true, setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, fn) => listeners.set(`button:${name}`, fn) }
  const status = { textContent: '' }
  const caption = { textContent: '' }
  const placeholder = { textContent: '', hidden: false }
  const soundPrompt = { hidden: true, addEventListener: (name, fn) => listeners.set(`sound:${name}`, fn) }
  const nodes = { 'music-toggle': button, 'music-control-status': status,
    'music-frame-status': caption, 'music-video': {}, 'music-video-placeholder': placeholder, 'music-sound-prompt': soundPrompt }
  let appended = 0
  const document = { hidden, readyState: 'loading', documentElement: { dataset: { openingComplete: String(openingComplete) } }, getElementById: id => nodes[id],
    addEventListener: (name, fn) => listeners.set(name, fn),
    createElement: () => ({}), head: { append() { appended++ } } }
  const calls = { play: 0, pause: 0, mute: 0, unMute: 0, muted: false, options: null, state: 2 }
  const iframe = { allow: 'fullscreen', getAttribute() { return this.allow }, setAttribute(_name,value) { this.allow=value } }
  const window = { addEventListener: (name, fn) => listeners.set(`window:${name}`, fn),
    YT: { PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    Player: class {
      constructor(_id, options) { calls.options = options }
      getPlayerState() { return calls.state }
      getVideoData() { return { title: 'Jesús, te seguiré' } }
      getIframe() { return iframe }
      isMuted() { return calls.muted }
      mute() { calls.mute++; calls.muted=true }
      unMute() { calls.unMute++; calls.muted=false }
      playVideo() { calls.play++ }
      pauseVideo() { calls.pause++ }
    } } }
  const timers=new Map();let timerId=0
  runInNewContext(source, { document, window, location: { origin: 'https://example.test' },
    setTimeout: (fn,delay) => { timers.set(++timerId,{fn,delay});return timerId }, clearTimeout: id => timers.delete(id) })
  assert.equal(appended, 0)
  listeners.get('window:load')()
  assert.equal(appended, 1)
  window.onYouTubeIframeAPIReady()
  return {listeners,attributes,button,status,caption,placeholder,soundPrompt,calls,document,timers,iframe}
}

test('YouTube plays after opening animation, and header pause controls that same player', async () => {
  const {listeners,calls,button,placeholder,attributes,status,iframe}=await createPlayer()
  calls.options.events.onReady()
  assert.equal(calls.play, 0)
  assert.equal(button.disabled, false)
  assert.equal(placeholder.hidden, true)
  assert.equal(calls.options.playerVars.list, 'RDEMnKhIZKlwJfkBHGybZ85bLg')
  assert.match(iframe.allow,/autoplay/)
  listeners.get('vas:opening-complete')()
  assert.equal(calls.play, 1)
  calls.state = 1
  calls.options.events.onStateChange({ data: 1 })
  assert.equal(attributes.get('aria-pressed'), 'true')
  assert.equal(status.textContent, 'Jesús, te seguiré')
  listeners.get('button:click')()
  assert.equal(calls.pause, 1)
  calls.options.events.onAutoplayBlocked()
  assert.equal(calls.mute,0,'a late browser event must not restart music after a manual pause')
})

test('blocked audible autoplay falls back to muted inline video and one tap enables sound',async()=>{
  const {listeners,calls,soundPrompt,caption,attributes}=await createPlayer()
  calls.options.events.onReady();listeners.get('vas:opening-complete')()
  calls.options.events.onAutoplayBlocked()
  assert.equal(calls.mute,1);assert.equal(calls.play,2);assert.equal(soundPrompt.hidden,false)
  calls.state=1;calls.options.events.onStateChange({data:1})
  assert.match(caption.textContent,/sin sonido/)
  assert.equal(attributes.get('aria-label'),'Activar sonido de la música')
  listeners.get('sound:click')()
  assert.equal(calls.unMute,1);assert.equal(calls.play,3)
  calls.options.events.onStateChange({data:1})
  assert.equal(soundPrompt.hidden,true);assert.equal(attributes.get('aria-pressed'),'true')
  listeners.get('button:click')();assert.equal(calls.pause,1)
})

test('late API readiness observes an already finished intro; hidden pages wait until visible',async()=>{
  const {calls,listeners,document}=await createPlayer({openingComplete:true,hidden:true})
  calls.options.events.onReady();assert.equal(calls.play,0)
  document.hidden=false;listeners.get('visibilitychange')();assert.equal(calls.play,1)
  listeners.get('visibilitychange')();assert.equal(calls.play,1)
})

test('silent autoplay failures also fall back once; repeated blocking leaves an explicit play action',async()=>{
  const {calls,listeners,timers,soundPrompt}=await createPlayer()
  calls.options.events.onReady();listeners.get('vas:opening-complete')()
  const watchdog=[...timers.values()].find(timer=>timer.delay===4000)
  watchdog.fn();assert.equal(calls.mute,1);assert.equal(calls.play,2)
  calls.options.events.onAutoplayBlocked();assert.equal(calls.play,2)
  assert.equal(soundPrompt.hidden,false)
})
