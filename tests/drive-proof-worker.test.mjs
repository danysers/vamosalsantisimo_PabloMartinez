import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertWritableFolder, existingCopy, uploadCopy } from '../scripts/drive-proof-worker.mjs'

function mockFetch(handlers, callback) {
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const handler = handlers.shift()
    assert.ok(handler, `Unexpected request: ${url}`)
    return handler(String(url), options)
  }
  return Promise.resolve().then(callback).finally(() => { globalThis.fetch = original })
}

const json = value => Response.json(value)

test('Drive proof copy refuses publicly shared folders', async () => {
  await mockFetch([
    () => json({ id: 'folder123456', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } }),
    () => json({ permissions: [{ id: 'owner', type: 'user', role: 'owner' }, { id: 'public', type: 'anyone', role: 'writer' }] }),
  ], async () => assert.rejects(assertWritableFolder('folder123456', 'token'), /explicit opt-in/))
})

test('Drive proof copy accepts an owner-only writable folder', async () => {
  await mockFetch([
    () => json({ id: 'folder123456', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } }),
    () => json({ permissions: [{ id: 'owner', type: 'user', role: 'owner' }] }),
  ], async () => assert.doesNotReject(assertWritableFolder('folder123456', 'token')))
})

test('explicit organizer opt-in permits a link-shared folder', async () => {
  await mockFetch([
    () => json({ id: 'folder123456', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } }),
    () => json({ permissions: [{ id: 'owner', type: 'user', role: 'owner' }, { id: 'public', type: 'anyone', role: 'writer' }] }),
  ], async () => assert.doesNotReject(assertWritableFolder('folder123456', 'token', true)))
})

test('Drive proof upload sets private folder, stable idempotency key and requested filename', async () => {
  const proof = { id: 'b7eb1915-61a4-497e-8be2-9ed7382d5a7d', drive_file_name: '12345678_2026-10-28_142500_b7eb1915.png',
    content_type: 'image/png', data: Buffer.from([1, 2, 3]) }
  await mockFetch([
    url => { const q = new URL(url).searchParams.get('q'); assert.match(q, /paymentProofId/); return json({ files: [] }) },
    (url, options) => {
      assert.match(url, /uploadType=multipart/)
      assert.equal(options.method, 'POST')
      const body = Buffer.from(options.body).toString('latin1')
      assert.match(body, /12345678_2026-10-28_142500_b7eb1915\.png/)
      assert.match(body, /paymentProofId/)
      assert.match(body, /folder123456/)
      return json({ id: 'drive-file', name: proof.drive_file_name, parents: ['folder123456'] })
    },
  ], async () => {
    assert.equal(await existingCopy('folder123456', proof.id, 'token'), null)
    assert.equal((await uploadCopy('folder123456', proof, 'token')).id, 'drive-file')
  })
})
