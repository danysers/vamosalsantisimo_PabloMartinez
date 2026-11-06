import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncFlyers } from '../scripts/flyer-sync.mjs'
import { validFlyerCommit, flyerFilenamePattern } from '../lib/flyer-media.mjs'

const image = Buffer.from('89504e470d0a1a0a0000000d49484452000004380000078000000000', 'hex')
const md5 = createHash('md5').update(image).digest('hex'), sha256 = createHash('sha256').update(image).digest('hex')
const owner = { owners: [{ emailAddress: 'danysers@gmail.com' }] }
const make = version => ({ schema: 1, version, job: String(version).repeat(64), generatedAt: 123,
  files: ['historia', 'muro'].map((format, i) => ({ id: `approved_file_${i}`, name: `flyer-evento-${format}-v${version}.png`,
    format, page: 1, pages: 1, size: image.length, md5, sha256 })) })

test('rejects partial, duplicate, wrong-format and path-injection commits', () => {
  const good = make(3)
  assert.ok(validFlyerCommit(good))
  assert.ok(!validFlyerCommit({ ...good, files: good.files.slice(0, 1) }))
  assert.ok(!validFlyerCommit({ ...good, files: [good.files[0], good.files[0]] }))
  assert.ok(!validFlyerCommit({ ...good, files: [{ ...good.files[0], name: '../../secret.png' }, good.files[1]] }))
  assert.ok(!flyerFilenamePattern.test('../flyer-evento-historia-v3-' + md5 + '.png'))
})

test('only publishes a complete verified pair; failed next version leaves last good manifest', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vas-flyer-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const original = global.fetch
  t.after(() => { global.fetch = original })
  let commit = make(3), corrupt = false, downloads = 0
  global.fetch = async address => {
    const url = new URL(address)
    if (url.searchParams.has('q')) return Response.json({ files: [
      { id: 'commit_id_12345', name: `flyers-evento-publicados-v${commit.version}.json`, mimeType: 'application/json', ...owner,
        appProperties: { vasType: 'event-commit', vasJob: commit.job, vasVersion: String(commit.version) } },
      ...commit.files.map(f => ({ ...f, ...owner, mimeType: 'image/png', md5Checksum: f.md5,
        appProperties: { vasType: 'event-flyer', vasJob: commit.job, vasVersion: String(commit.version) } })),
    ] })
    if (!url.searchParams.has('alt')) return Response.json({ id: url.pathname.split('/').at(-1), mimeType: 'application/vnd.google-apps.folder', ...owner })
    if (url.pathname.includes('commit_id_')) return Response.json(commit)
    downloads++
    return new Response(corrupt ? Buffer.alloc(image.length) : image)
  }
  const first = await syncFlyers('test', root)
  assert.equal(first.version, 3)
  assert.equal(downloads, 2)
  await syncFlyers('test', root)
  assert.equal(downloads, 2, 'unchanged pair does not download again')
  commit = make(4); corrupt = true
  await assert.rejects(syncFlyers('test', root), /checksum/)
  assert.equal(JSON.parse(await readFile(join(root, 'manifest.json'))).version, 3)
})
