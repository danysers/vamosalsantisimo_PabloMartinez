import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('public cached flyers have immutable safe media; panel and unknown files remain hidden', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vas-flyer-http-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000004380000078000000000', 'hex')
  const md5 = createHash('md5').update(png).digest('hex'), sha256 = createHash('sha256').update(png).digest('hex')
  const files = ['historia', 'muro'].map((format, i) => ({ id: `drive_file_${i}`, name: `flyer-evento-${format}-v3.png`,
    filename: `flyer-evento-${format}-v3-${md5}.png`, format, page: 1, pages: 1, size: png.length, md5, sha256 }))
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ schema: 1, version: 3, job: 'a'.repeat(64), generatedAt: 123, files }))
  for (const file of files) await writeFile(join(root, file.filename), png)
  for (const [surface, port] of [['public', 31643], ['panel', 31644]]) {
    const base = `http://localhost:${port}`
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', String(port)], {
      stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE: surface, FLYER_CACHE_DIR: root,
        DATABASE_URL: '', BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: 'disposable-flyer-test-'.repeat(4) },
    })
    try {
      let ready = false
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + (surface === 'panel' ? '/admin' : '/'))).ok) { ready = true; break } } catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.ok(ready)
      const manifest = await fetch(base + '/api/flyers')
      if (surface === 'panel') { assert.equal(manifest.status, 404); continue }
      const data = await manifest.json()
      assert.equal(data.version, 3)
      const media = await fetch(base + data.files[0].image)
      assert.equal(media.status, 200)
      assert.equal(media.headers.get('content-type'), 'image/png')
      assert.match(media.headers.get('cache-control'), /immutable/)
      assert.deepEqual(Buffer.from(await media.arrayBuffer()), png)
      assert.equal((await fetch(base + '/api/flyers/media/' + files[0].filename.replace(md5, '0'.repeat(32)))).status, 404)
      assert.equal((await fetch(base + '/api/flyers/media/manifest.json')).status, 404)
      // An already open tab may still download V3 after the active manifest advances.
      await writeFile(join(root, 'manifest.json'), '{}')
      assert.equal((await fetch(base + data.files[0].image)).status, 200)
    } finally { server.kill() }
  }
})
