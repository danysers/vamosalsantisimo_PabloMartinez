import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseSponsorLinks, safeSponsorHref, sponsorNameKey, validSponsorLinks } from '../lib/sponsor-links.mjs'
import { sponsorOwnerEmails } from '../lib/sponsor-media.mjs'
import { syncSponsors } from '../scripts/sponsor-sync-worker.mjs'

test('TXT supports names, accents, CSV quotes, blank URLs and HTTPS without active content', () => {
  const links = parseSponsorLinks('\uFEFF# comentario\r\nJosé Motos.jpg, https://www.instagram.com/jose/\r\n"Marca, SA",https://example.com/?a=1,b=2\nSin red,')
  assert.equal(sponsorNameKey(links[0].name), sponsorNameKey('JOSE-motos'))
  assert.equal(links[1].name, 'Marca, SA')
  assert.equal(links[2].href, null)
  assert.equal(validSponsorLinks(links), true)
  for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//example.com', 'http://example.com',
    'https://name:password@example.com', 'https://127.0.0.1', 'https://[::1]', 'https://server.local', 'https://example.com/\nattack']) {
    assert.equal(safeSponsorHref(href), null, href)
    assert.throws(() => parseSponsorLinks(`Marca,${href}`))
  }
  assert.throws(() => parseSponsorLinks('Marca,https://example.com\nMÁRCA.png,https://example.org'))
  assert.throws(() => parseSponsorLinks('a'.repeat(65537)))
  assert.equal(validSponsorLinks([{ name: 'X', href: 'javascript:alert(1)' }]), false)
})

test('owner TXT synchronizes links atomically; malformed or modified content retains last gallery', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vas-sponsor-links-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous })
  let content = 'Mila Club,https://www.instagram.com/milaclub.ar/'
  let trusted = true, corrupt = false, duplicate = false
  globalThis.fetch = async url => {
    if (String(url).includes('?alt=media')) return new Response(content)
    if (String(url).includes('/files?')) {
      const file = { id: 'drive_links_2026', name: 'redes-sponsors.txt', mimeType: 'text/plain',
        size: String(Buffer.byteLength(content)), md5Checksum: corrupt ? '0'.repeat(32) : createHash('md5').update(content).digest('hex'),
        owners: [{ emailAddress: trusted ? sponsorOwnerEmails[0] : 'other@example.com' }] }
      return Response.json({ files: duplicate ? [file, { ...file, id: 'drive_links_copy' }] : [file] })
    }
    return Response.json({ id: '1-ab3D4gRzZ_DHzfvssBR-LnfLPOS6i68', mimeType: 'application/vnd.google-apps.folder',
      owners: [{ emailAddress: sponsorOwnerEmails[0] }] })
  }
  const first = await syncSponsors('private-test-token', root)
  assert.equal(first.links[0].href, 'https://www.instagram.com/milaclub.ar/')
  const before = await readFile(join(root, 'manifest.json'), 'utf8')
  content = 'Mila Club,javascript:alert(1)'
  await assert.rejects(syncSponsors('private-test-token', root), /Invalid.*row/)
  assert.equal(await readFile(join(root, 'manifest.json'), 'utf8'), before)
  content = 'Mila Club,https://example.com/'; corrupt = true
  await assert.rejects(syncSponsors('private-test-token', root), /checksum/)
  corrupt = false; duplicate = true
  await assert.rejects(syncSponsors('private-test-token', root), /only one/)
  duplicate = false; trusted = false
  const ignored = await syncSponsors('private-test-token', root)
  assert.deepEqual(ignored.links, [], 'other owners cannot publish link instructions')
})
