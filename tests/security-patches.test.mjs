import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { debianFixes, picomatchFixes } from '../notifications/settlement-alerts/security-patches.mjs'

test('watch list includes all 39 distinct Debian advisories', async () => {
  const watch = JSON.parse(await readFile(new URL('../notifications/settlement-alerts/security-watch.json', import.meta.url), 'utf8'))
  const ids = Object.values(watch).flat()
  assert.equal(ids.length, 39)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every(id => /^CVE-\d{4}-\d+$/.test(id)))
})

test('only patches for the deployed Debian release and source package trigger a notice', () => {
  const id = 'CVE-2026-100290'
  const entry = {
    id: 'DEBIAN-' + id,
    affected: [
      { package: { name: 'glibc', ecosystem: 'Debian:14' }, ranges: [{ events: [{ fixed: '2.43-7' }] }] },
      { package: { name: 'glibc', ecosystem: 'Debian:13' }, ranges: [{ events: [{ introduced: '0' }] }] },
    ],
  }
  assert.deepEqual(debianFixes(entry, 'glibc', id), [])
  entry.affected[1].ranges[0].events.push({ fixed: '2.41-12+deb13u5' })
  assert.deepEqual(debianFixes(entry, 'glibc', id), ['2.41-12+deb13u5'])
  assert.throws(() => debianFixes(entry, 'openssl', id), /DEBIAN_RECORD_MISSING/)
})

test('only a confirmed stable picomatch fix qualifies', () => {
  const p = { ecosystem: 'npm', name: 'picomatch' }
  const entry = {
    ghsa_id: 'GHSA-fc5q-39xc-vjpf',
    vulnerabilities: [
      { package: p, first_patched_version: null },
      { package: p, first_patched_version: '4.0.8-beta.1' },
      { package: p, first_patched_version: { identifier: '4.0.8' } },
      { package: { ...p, name: 'other' }, first_patched_version: '5.0.0' },
    ],
  }
  assert.deepEqual(picomatchFixes(entry), ['4.0.8'])
  assert.deepEqual(picomatchFixes({ ...entry, withdrawn_at: '2026-11-18' }), [])
})
