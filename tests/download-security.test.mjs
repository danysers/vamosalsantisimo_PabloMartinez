import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundedDownload } from '../lib/bounded-download.mjs'

test('chunked and dishonest download lengths cannot exceed the byte budget', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)) },
      cancel() { cancelled = true } })
    await assert.rejects(boundedDownload(new Response(stream, { headers }), 2048), /size limit/)
    assert.equal(cancelled, true)
  }
  assert.deepEqual(await boundedDownload(new Response('safe'), 4), Buffer.from('safe'))
})
