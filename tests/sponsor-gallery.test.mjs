import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { sponsorFromDrive, sponsorOwnerEmails, validSponsorManifest } from '../lib/sponsor-media.mjs'
import { syncSponsors } from '../scripts/sponsor-sync-worker.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9xkAAAAASUVORK5CYII=', 'base64')
const checksum = createHash('md5').update(png).digest('hex')
const file = { id: 'drive_logo_2026', name: 'Nueva marca.png', mimeType: 'image/png',
  size: String(png.length), md5Checksum: checksum, createdTime: '2026-10-28T00:00:00Z',
  owners: [{ emailAddress: sponsorOwnerEmails[0] }] }

test('only owner-uploaded bounded raster images are eligible', () => {
  assert.equal(sponsorFromDrive(file)?.name, 'Nueva marca')
  assert.equal(sponsorFromDrive({ ...file, owners: [{ emailAddress: sponsorOwnerEmails[1] }] })?.name, 'Nueva marca')
  assert.equal(sponsorFromDrive({ ...file, mimeType: 'image/svg+xml' }), null)
  assert.equal(sponsorFromDrive({ ...file, size: '9000000' }), null)
  assert.equal(sponsorFromDrive({ ...file, owners: [{ emailAddress: 'other@example.com' }] }), null)
})

test('Drive sync downloads an owner image and publishes an atomic manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vas-sponsors-test-'))
  const previous = globalThis.fetch
  globalThis.fetch = async (url) => {
    const value = String(url)
    if (value.includes('?alt=media')) return new Response(png, { headers: { 'content-length': String(png.length) } })
    if (value.includes('/files?')) return Response.json({ files: [file] })
    return Response.json({ id: '1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68',
      mimeType: 'application/vnd.google-apps.folder', owners: [{ emailAddress: sponsorOwnerEmails[0] }] })
  }
  try {
    const manifest = await syncSponsors('test-token', root)
    assert.equal(manifest.files.length, 1)
    assert.equal(validSponsorManifest(manifest), true)
    assert.deepEqual(await readFile(join(root, manifest.files[0].filename)), png)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')), manifest)
  } finally { globalThis.fetch = previous; await rm(root, { recursive: true, force: true }) }
})

test('published HTML keeps Mila above the original brands and avoids ad-blocked class names', async () => {
  const html = await readFile(new URL('../public/pagina principal con efecto/index.html', import.meta.url), 'utf8')
  const section = html.slice(html.indexOf('<section class="sponsors"'), html.indexOf('</section>', html.indexOf('<section class="sponsors"')))
  assert.ok(section.indexOf('mila-blanco-sobre-negro.png') < section.indexOf('alma-verde.png'))
  assert.match(section, /class="brand-grid"/)
  assert.match(html, /\.brand-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
  assert.doesNotMatch(section, /class="[^"]*\bsponsor(?:-link)?\b/)
})
