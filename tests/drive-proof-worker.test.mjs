import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertWritableFolder, existingCopy, uploadCopy, syncOne } from '../scripts/drive-proof-worker.mjs'

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

const pendingProof = { id: 'b7eb1915-61a4-497e-8be2-9ed7382d5a7d', drive_file_name: 'TEST-COMPROBANTE.png',
  content_type: 'image/png', data: Buffer.from([1, 2, 3]) }

function assertDestinationQuery(url) {
  const q = new URL(url).searchParams.get('q')
  assert.ok(q.includes("'folder123456' in parents"))
  assert.ok(q.includes(`appProperties has { key='paymentProofId' and value='${pendingProof.id}' }`))
  assert.ok(q.includes('trashed = false'))
}

test('Drive proof success requires folder membership even when parents is omitted', async () => {
  const writes = []
  const pool = { query: async (sql, values) => { assert.match(sql, /drive_synced_at=now\(\)/); writes.push(values) } }
  await mockFetch([
    url => { assertDestinationQuery(url); return json({ files: [] }) },
    () => json({ id: 'new-copy', name: pendingProof.drive_file_name }),
    url => { assertDestinationQuery(url); assert.equal(writes.length, 0)
      return json({ files: [{ id: 'new-copy', name: pendingProof.drive_file_name }] }) },
  ], () => syncOne(pool, 'folder123456', 'token', pendingProof))
  assert.deepEqual(writes, [[pendingProof.id, 'new-copy']])
})

test('Drive proof outside the destination is never marked synced', async () => {
  const pool = { query: async () => assert.fail('Unverified copy must not update the database') }
  await mockFetch([
    () => json({ files: [] }),
    () => json({ id: 'new-copy', name: pendingProof.drive_file_name, parents: ['folder123456'] }),
    url => { assertDestinationQuery(url); return json({ files: [] }) },
  ], () => assert.rejects(syncOne(pool, 'folder123456', 'token', pendingProof), /destination could not be verified/))
})

test('Drive retry reuses a folder-verified copy without uploading again', async () => {
  let writes = 0
  const pool = { query: async (_sql, values) => { writes++; assert.deepEqual(values, [pendingProof.id, 'existing-copy']) } }
  await mockFetch([
    url => { assertDestinationQuery(url); return json({ files: [{ id: 'existing-copy', name: pendingProof.drive_file_name }] }) },
  ], () => syncOne(pool, 'folder123456', 'token', pendingProof))
  assert.equal(writes, 1)
})

test('Drive duplicate copies and changed filenames are not marked synced', async () => {
  const pool = { query: async () => assert.fail('Unexpected Drive copies must not update the database') }
  await mockFetch([
    () => json({ files: [{ id: 'copy1' }, { id: 'copy2' }] }),
  ], () => assert.rejects(syncOne(pool, 'folder123456', 'token', pendingProof), /Multiple Drive copies/))
  await mockFetch([
    () => json({ files: [{ id: 'copy1', name: 'unexpected.png' }] }),
  ], () => assert.rejects(syncOne(pool, 'folder123456', 'token', pendingProof), /unexpected file/))
})
