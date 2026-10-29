import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import vm from 'node:vm'
import { createMemoryGate, isTrafficEntry, parseHostMemory, trafficWaitHtml } from '../lib/traffic-guard.mjs'
import { alertCooldownMs, alertRetryMs, checkMemoryAlert } from '../scripts/traffic-monitor.mjs'

const fixture = available => `MemTotal: 1000000 kB\nMemFree: 100 kB\nMemAvailable: ${available} kB\nCached: 500000 kB\n`
const high = parseHostMemory(fixture(90000))
const logger = { info() {}, error() {} }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function temporary(run) {
  const root = await mkdtemp(join(tmpdir(), 'vas-traffic-'))
  try { return await run(root) }
  finally {
    assert.equal(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')), true)
    assert.ok(basename(root).startsWith('vas-traffic-'))
    await rm(root, { recursive: true, force: true })
  }
}

test('host memory counts available reclaimable cache and rejects incomplete or impossible metrics', () => {
  assert.equal(parseHostMemory(fixture(600000)).usedPercent, 40)
  assert.equal(high.usedPercent, 91)
  for (const source of ['', 'MemTotal: 1 kB\nMemFree: 0 kB', fixture(1000001), fixture(-1), fixture(0).replace('1000000', '0')]) {
    assert.throws(() => parseHostMemory(source), /memory_metrics/)
  }
})

test('admission enters at 90%, avoids flapping, recovers at 85%, and caches the cheap sample', () => {
  let time = 0, available = 100000, reads = 0
  const sample = createMemoryGate({ now: () => time, read: () => { reads++; return parseHostMemory(fixture(available)) } })
  assert.equal(sample().waiting, true)
  available = 110000
  assert.equal(sample().waiting, true)
  assert.equal(reads, 1)
  time += 1000
  assert.equal(sample().waiting, true, '89% remains held until the recovery threshold')
  available = 150000; time += 1000
  assert.equal(sample().waiting, false)
  assert.equal(reads, 3)
})

test('unavailable memory measurements do not crash the page or leave an indefinite hold', () => {
  let broken = false
  const sample = createMemoryGate({ cacheMs: 0, read: () => { if (broken) throw Error(); return high } })
  assert.equal(sample().waiting, true)
  broken = true
  assert.deepEqual(sample(), { waiting: false, available: false })
})

test('admission targets pages while preserving payments, credentials, API, admin and assets', () => {
  for (const path of ['/', '/formacion', '/formacion/index.html', '/formacion/inscripcion/', '/inscripcion',
    '/pagina%20principal%20con%20efecto/index.html', '/donaciones']) assert.equal(isTrafficEntry('GET', path), true, path)
  for (const path of ['/formacion/pago', '/formacion/comprobante/index.html', '/taller/comprobante',
    '/api/mercado-pago/webhook', '/api/taller/pagos/retorno', '/api/taller/pagos/checkout',
    '/api/taller/pagos/comprobante', '/admin', '/_next/image', '/traffic-wait.js', '/formacion/app.css',
    '/robots.txt', '/sitemap.xml', '/%ZZ']) assert.equal(isTrafficEntry('GET', path), false, path)
  assert.equal(isTrafficEntry('POST', '/formacion/inscripcion'), false)
  assert.equal(isTrafficEntry('HEAD', '/'), true)
})

test('memory alert persists its hourly cooldown across fresh monitor invocations', async () => temporary(async root => {
  let count = 0
  const now = Date.now()
  const send = async message => { count++; assert.match(message.subject, /memoria alta/); assert.match(message.text, /91.0%/); assert.match(message.text, /Argentina/) }
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now, logger }), 'sent')
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now: now + 30_000, logger }), 'cooldown')
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now: now + alertCooldownMs, logger }), 'sent')
  assert.equal(count, 2)
  assert.equal(JSON.parse(await readFile(join(root, 'alert.json'), 'utf8')).sentAt, now + alertCooldownMs)
}))

test('SMTP failures back off without removing the last successful alert cooldown', async () => temporary(async root => {
  const now = Date.now()
  let calls = 0
  const send = async () => { calls++; throw Error('simulated SMTP failure') }
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now, logger }), 'failed')
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now: now + alertRetryMs - 1, logger }), 'cooldown')
  assert.equal(await checkMemoryAlert({ memory: high, root, send, now: now + alertRetryMs, logger }), 'failed')
  assert.equal(calls, 2)
}))

test('overlapping deployments share a lock so they do not send the same alert simultaneously', async () => temporary(async root => {
  let release, sending
  const started = new Promise(resolve => { sending = resolve })
  const first = checkMemoryAlert({ memory: high, root, logger, send: async () => {
    sending(); await new Promise(resolve => { release = resolve })
  } })
  await started
  assert.equal(await checkMemoryAlert({ memory: high, root, logger, send: async () => assert.fail('duplicate delivery') }), 'locked')
  release()
  assert.equal(await first, 'sent')
}))

test('normal memory does not send email and corrupt alert state stops delivery without spamming', async () => temporary(async root => {
  const send = async () => assert.fail('unexpected email')
  assert.equal(await checkMemoryAlert({ memory: parseHostMemory(fixture(500000)), root, send, logger }), 'normal')
  await writeFile(join(root, 'alert.json'), 'invalid')
  await assert.rejects(checkMemoryAlert({ memory: high, root, send, logger }))
}))

test('wait screen retries once after 30–35 seconds without polling or changing the destination', async () => {
  const source = await readFile(new URL('../public/traffic-wait.js', import.meta.url), 'utf8')
  const nodes = { 'traffic-countdown': {}, 'traffic-status': {} }
  let time = 1000, tick, reloads = 0
  const location = { reload() { reloads++ }, href: 'https://example.invalid/formacion?preserve=yes#section' }
  vm.runInNewContext(source, { document: { getElementById: id => nodes[id] },
    Date: { now: () => time }, Math: { random: () => 0.5, ceil: Math.ceil, floor: Math.floor, max: Math.max },
    window: { location }, setInterval(fn) { tick = fn; return 1 }, clearInterval() {} })
  assert.equal(nodes['traffic-countdown'].textContent, '33')
  time += 32_000; tick(); assert.equal(reloads, 0)
  time += 1000; tick(); tick(); assert.equal(reloads, 1)
  assert.equal(location.href, 'https://example.invalid/formacion?preserve=yes#section')
  assert.ok(Buffer.byteLength(trafficWaitHtml) < 6000)
})

test('production HTTP admission holds entry pages, preserves critical paths and releases safely', async () => temporary(async root => {
  const meminfo = join(root, 'meminfo')
  await writeFile(meminfo, fixture(90000))
  for (const [surface, enabled, port] of [['public', '1', 31731], ['public', '0', 31732], ['panel', '1', 31733]]) {
    const base = `http://localhost:${port}`
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface, DATABASE_URL: '',
        BETTER_AUTH_URL: '', BETTER_AUTH_SECRET: '', TRAFFIC_GUARD_ENABLED: enabled, TRAFFIC_GUARD_MEMINFO_PATH: meminfo },
    })
    try {
      let ready = false
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + '/traffic-wait.js')).status === 200 || surface === 'panel' && (await fetch(base + '/admin')).status === 200) { ready = true; break } } catch {}
        await pause(100)
      }
      assert.ok(ready)
      if (surface === 'panel') {
        assert.equal((await fetch(base + '/admin')).status, 200)
        assert.equal((await fetch(base + '/formacion')).status, 404)
      } else if (enabled === '0') assert.equal((await fetch(base + '/')).status, 200)
      else {
        for (const path of ['/', '/formacion', '/formacion/inscripcion', '/pagina%20principal%20con%20efecto/index.html']) {
          const response = await fetch(base + path, { headers: { 'x-traffic-bypass': '1', 'x-real-ip': '127.0.0.1' } })
          assert.equal(response.status, 503, path)
          assert.equal(response.headers.get('retry-after'), '30')
          assert.match(response.headers.get('cache-control'), /no-store/)
          assert.equal(response.headers.get('cdn-cache-control'), 'no-store')
          assert.match(response.headers.get('content-security-policy'), /script-src 'self'/)
          assert.match(await response.text(), /Estamos preparando/)
        }
        const head = await fetch(base + '/', { method: 'HEAD' })
        assert.equal(head.status, 503); assert.equal(await head.text(), '')
        for (const path of ['/formacion/pago', '/formacion/comprobante', '/traffic-wait.js', '/formacion/checkout.js']) {
          assert.equal((await fetch(base + path)).status, 200, path)
        }
        assert.equal((await fetch(base + '/admin')).status, 404)
        assert.equal((await fetch(base + '/api/test-db')).status, 404)
        const api = await fetch(base + '/api/taller/configuracion')
        assert.match(api.headers.get('content-type'), /application\/json/)
        await writeFile(meminfo, fixture(110000)); await pause(1100)
        assert.equal((await fetch(base + '/')).status, 503)
        await writeFile(meminfo, fixture(150000)); await pause(1100)
        assert.equal((await fetch(base + '/')).status, 200)
        await writeFile(meminfo, fixture(90000)); await pause(1100)
        assert.equal((await fetch(base + '/')).status, 503)
        await rm(meminfo); await pause(1100)
        assert.equal((await fetch(base + '/')).status, 200, 'unavailable metrics must fail open')
        await writeFile(meminfo, fixture(90000))
      }
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = new Promise(resolve => server.once('exit', resolve))
        server.kill()
        await exited
      }
    }
  }
}))
