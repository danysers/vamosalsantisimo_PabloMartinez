import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { validateSponsorLogo } from '../lib/sponsor-admin.mjs'
import { readSponsorForm } from '../lib/sponsor-upload.mjs'

test('WhatsApp JPEG metadata, orientation and appended JFXX are cleaned before storage', async () => {
  const original = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#f00' } })
    .withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: 'PRIVATE-ARTIST', Copyright: 'PRIVATE-DATA' } }).jpeg().toBuffer()
  const input = Buffer.concat([original, Buffer.from([255,224,0,7]), Buffer.from('JFXX\0')])
  const result = await validateSponsorLogo('application/octet-stream', input)
  assert.equal(result.error, undefined)
  const meta = await sharp(result.bytes).metadata()
  assert.equal(meta.width, 10); assert.equal(meta.height, 20)
  for (const key of ['exif', 'xmp', 'icc', 'iptc', 'orientation']) assert.equal(meta[key], undefined, key)
  assert.equal(result.bytes.includes(Buffer.from('PRIVATE')), false)
  assert.equal(result.bytes.includes(Buffer.from('JFXX')), false)
})

test('cleaning keeps transparency, bounds dimensions and ignores missing mobile MIME', async () => {
  const png = await sharp({ create: { width: 3000, height: 100, channels: 4, background: '#00000000' } }).png().toBuffer()
  const clean = await validateSponsorLogo('', png)
  assert.equal(clean.error, undefined)
  const meta = await sharp(clean.bytes).metadata()
  assert.equal(meta.width, 2048); assert.equal(meta.hasAlpha, true)
})

test('rejects SVG, fake extension payloads, truncated pixels and animation', async () => {
  assert.ok((await validateSponsorLogo('image/png', Buffer.from('<svg onload="alert(1)"/>'))).error)
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).png().toBuffer()
  assert.ok((await validateSponsorLogo('image/png', png.subarray(0, 40))).error)
  const frames = Buffer.concat([Buffer.alloc(12, 255), Buffer.alloc(12, 0)])
  const animated = await sharp(frames, { raw: { width: 2, height: 4, pageHeight: 2, channels: 3 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2)
  assert.ok((await validateSponsorLogo('image/webp', animated)).error)
})

test('multipart works without Content-Length, refuses duplicates and measures actual bytes', async () => {
  const form = new FormData(); form.set('brandName', 'Marca')
  const request = () => new Request('https://example.test', { method: 'POST', body: form })
  assert.equal((await readSponsorForm(request())).get('brandName'), 'Marca')
  const tooLarge = new Request('https://example.test', { method: 'POST', body: 'x'.repeat(30),
    headers: { 'content-type': 'multipart/form-data; boundary=test', 'content-length': '1' } })
  await assert.rejects(() => readSponsorForm(tooLarge, 10), error => error.status === 413)
  form.append('brandName', 'Duplicada')
  await assert.rejects(() => readSponsorForm(request()), error => error.status === 400)
})

test('slow upload is cancelled within deadline', async () => {
  let cancelled = false
  const request = new Request('https://example.test', { method: 'POST', duplex: 'half',
    headers: { 'content-type': 'multipart/form-data; boundary=slow' },
    body: new ReadableStream({ cancel() { cancelled = true } }) })
  await assert.rejects(() => readSponsorForm(request, 100, 20), error => error.status === 408)
  assert.equal(cancelled, true)
})
