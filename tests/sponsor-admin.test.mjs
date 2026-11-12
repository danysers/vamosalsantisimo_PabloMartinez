import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { normalizeSponsorFields, sponsorLogoFilename, validateSponsorLogo } from '../lib/sponsor-admin.mjs'
import { driveAccessToken, SponsorDriveError, uploadSponsorLogo } from '../lib/sponsor-drive-upload.mjs'
import { sponsorFolderId } from '../lib/sponsor-media.mjs'

const require = createRequire(import.meta.url)
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const trustedOwner = { emailAddress: 'danysers@gmail.com' }
const image = () => sharp({ create: { width: 2, height: 2, channels: 4, background: '#245fc5' } }).png().toBuffer()

test('sponsor fields require brand and titular while normalizing optional data', () => {
  assert.deepEqual(normalizeSponsorFields({ brandName: '  Alma Verde ', ownerName: ' Titular Uno ', phone: '', email: ' CONTACTO@EXAMPLE.COM ', announcement: ' Gracias  ' }), {
    value: { brandName: 'Alma Verde', ownerName: 'Titular Uno', phone: null, email: 'contacto@example.com', announcement: 'Gracias' },
  })
  assert.match(normalizeSponsorFields({ brandName: '', ownerName: 'Titular' }).error, /marca es obligatorio/)
  assert.match(normalizeSponsorFields({ brandName: 'Marca', ownerName: '' }).error, /titular es obligatorio/)
  assert.match(normalizeSponsorFields({ brandName: 'Marca', ownerName: 'Titular', email: 'no-es-correo' }).error, /correo válido/)
})

test('sponsor logo validator accepts bounded static raster formats only', async () => {
  const png = await image()
  assert.deepEqual(await validateSponsorLogo('image/png', png), { mimeType: 'image/png', extension: 'png', sizeBytes: png.length })
  assert.match((await validateSponsorLogo('image/jpeg', png)).error, /no coincide/)
  assert.match((await validateSponsorLogo('image/svg+xml', png)).error, /PNG, JPG o WebP/)
  assert.match((await validateSponsorLogo('image/png', Buffer.alloc(4 * 1024 * 1024 + 1))).error, /4 MiB/)
})

test('Drive filename sanitization prevents path and extension injection', () => {
  assert.equal(sponsorLogoFilename(' Marca/Uno?. ', 'image/png'), 'Marca Uno.png')
  assert.equal(sponsorLogoFilename('Marca', 'image/svg+xml'), null)
})

test('Drive token exchange uses configured OAuth secrets and returns only access token', async () => {
  let request
  const token = await driveAccessToken({ env: { DRIVE_OAUTH_CLIENT_ID: 'client', DRIVE_OAUTH_CLIENT_SECRET: 'secret', DRIVE_OAUTH_REFRESH_TOKEN: 'refresh' },
    fetchImpl: async (url, options) => { request = { url, options }; return Response.json({ access_token: 'access' }) } })
  assert.equal(token, 'access')
  assert.equal(request.url, 'https://oauth2.googleapis.com/token')
  assert.equal(new URLSearchParams(request.options.body).get('refresh_token'), 'refresh')
  await assert.rejects(() => driveAccessToken({ env: {}, fetchImpl: async () => Response.json({ access_token: 'unused' }) }), SponsorDriveError)
})

test('Drive logo upload validates the folder and checks uploaded owner and checksum', async () => {
  const png = await image()
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes(`/files/${sponsorFolderId}?`)) return Response.json({ id: sponsorFolderId,
      mimeType: 'application/vnd.google-apps.folder', trashed: false, owners: [trustedOwner] })
    return Response.json({ id: 'sponsor-file-12345', name: 'Marca.png', size: String(png.length),
      md5Checksum: createHash('md5').update(png).digest('hex'), mimeType: 'image/png', owners: [trustedOwner] })
  }
  const file = await uploadSponsorLogo({ name: 'Marca.png', mimeType: 'image/png', bytes: png, token: 'access', fetchImpl })
  assert.deepEqual(file, { id: 'sponsor-file-12345', name: 'Marca.png', mimeType: 'image/png', sizeBytes: png.length })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.method, 'POST')
  assert.match(calls[1].options.body.toString(), new RegExp(sponsorFolderId))
  assert.match(calls[1].options.headers['Content-Type'], /multipart\/related/)
})

test('Drive upload refuses a folder not owned by an authorized account', async () => {
  const png = await image()
  let uploadCalled = false
  const fetchImpl = async (url) => {
    if (String(url).includes(`/files/${sponsorFolderId}?`)) return Response.json({ id: sponsorFolderId,
      mimeType: 'application/vnd.google-apps.folder', trashed: false, owners: [{ emailAddress: 'unknown@example.com' }] })
    uploadCalled = true
    return Response.json({})
  }
  await assert.rejects(() => uploadSponsorLogo({ name: 'Marca.png', mimeType: 'image/png', bytes: png, token: 'access', fetchImpl }), SponsorDriveError)
  assert.equal(uploadCalled, false)
})
