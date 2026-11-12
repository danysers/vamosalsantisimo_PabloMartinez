import { createHash, randomUUID } from 'node:crypto'
import { sponsorFolderId, sponsorOwnerEmails } from './sponsor-media.mjs'

const api = 'https://www.googleapis.com/drive/v3/files'
const uploadApi = 'https://www.googleapis.com/upload/drive/v3/files'
const validDriveId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(value)

export class SponsorDriveError extends Error {
  constructor(message = 'La integración con Google Drive no está disponible.') {
    super(message)
    this.name = 'SponsorDriveError'
  }
}

function requiredEnv(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new SponsorDriveError()
  return value
}

function isTrusted(file) {
  return Array.isArray(file?.owners) && file.owners.some(owner => sponsorOwnerEmails.includes(owner.emailAddress?.toLowerCase()))
}

async function responseJson(response) {
  if (!response.ok) throw new SponsorDriveError()
  try { return await response.json() } catch { throw new SponsorDriveError() }
}

export async function driveAccessToken({ fetchImpl = fetch, env = process.env } = {}) {
  const body = new URLSearchParams({ client_id: requiredEnv(env, 'DRIVE_OAUTH_CLIENT_ID'),
    client_secret: requiredEnv(env, 'DRIVE_OAUTH_CLIENT_SECRET'),
    refresh_token: requiredEnv(env, 'DRIVE_OAUTH_REFRESH_TOKEN'), grant_type: 'refresh_token' })
  let response
  try {
    response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST',
      signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  } catch { throw new SponsorDriveError() }
  const data = await responseJson(response)
  if (typeof data.access_token !== 'string' || !data.access_token) throw new SponsorDriveError()
  return data.access_token
}

async function driveJson(url, token, { fetchImpl = fetch, method = 'GET', headers = {}, body } = {}) {
  let response
  try {
    response = await fetchImpl(url, { method, signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers }, body })
  } catch { throw new SponsorDriveError() }
  return responseJson(response)
}

async function verifyFolder(token, fetchImpl) {
  const folder = await driveJson(`${api}/${encodeURIComponent(sponsorFolderId)}?fields=id,mimeType,trashed,owners(emailAddress)`, token, { fetchImpl })
  if (folder.id !== sponsorFolderId || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !isTrusted(folder)) {
    throw new SponsorDriveError()
  }
}

async function verifyExistingFile(fileId, token, fetchImpl) {
  const file = await driveJson(`${api}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,trashed,owners(emailAddress)`, token, { fetchImpl })
  if (file.id !== fileId || file.trashed || !Array.isArray(file.parents) || !file.parents.includes(sponsorFolderId) || !isTrusted(file)) {
    throw new SponsorDriveError()
  }
  return file
}

function multipartBody(metadata, mimeType, bytes) {
  const boundary = `vas-sponsor-${randomUUID().replaceAll('-', '')}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { boundary, body }
}

function verifyUploadResult(file, { id, name, mimeType, bytes }) {
  const checksum = createHash('md5').update(bytes).digest('hex')
  if (!file || (id && file.id !== id) || !validDriveId(file.id) || file.name !== name ||
      file.mimeType !== mimeType || Number(file.size) !== bytes.length || file.md5Checksum !== checksum || !isTrusted(file)) {
    throw new SponsorDriveError()
  }
  return { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: bytes.length }
}

/** @param {{name: string, mimeType: string, bytes: Buffer, fileId?: string, token: string, fetchImpl?: typeof fetch}} options */
export async function uploadSponsorLogo({ name, mimeType, bytes, fileId, token, fetchImpl = fetch }) {
  if (!token || !Buffer.isBuffer(bytes) || !bytes.length) throw new SponsorDriveError()
  await verifyFolder(token, fetchImpl)
  if (fileId) await verifyExistingFile(fileId, token, fetchImpl)
  const metadata = fileId ? { name, mimeType } : { name, mimeType, parents: [sponsorFolderId] }
  const { boundary, body } = multipartBody(metadata, mimeType, bytes)
  const query = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,size,md5Checksum,mimeType,owners(emailAddress)' })
  const url = fileId ? `${uploadApi}/${encodeURIComponent(fileId)}?${query}` : `${uploadApi}?${query}`
  const result = await driveJson(url, token, { fetchImpl, method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
  return verifyUploadResult(result, { id: fileId, name, mimeType, bytes })
}

export async function renameSponsorLogo({ fileId, name, token, fetchImpl = fetch }) {
  if (!token || !fileId || !name) throw new SponsorDriveError()
  await verifyFolder(token, fetchImpl)
  await verifyExistingFile(fileId, token, fetchImpl)
  const query = new URLSearchParams({ fields: 'id,name,mimeType,size,md5Checksum,owners(emailAddress)' })
  const file = await driveJson(`${api}/${encodeURIComponent(fileId)}?${query}`, token, { fetchImpl, method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  if (file.id !== fileId || !validDriveId(file.id) || file.name !== name || !isTrusted(file)) throw new SponsorDriveError()
  return { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: Number(file.size) }
}

export async function trashSponsorLogo({ fileId, token, fetchImpl = fetch }) {
  if (!token || !fileId) return false
  try {
    await verifyFolder(token, fetchImpl)
    await verifyExistingFile(fileId, token, fetchImpl)
    const query = new URLSearchParams({ fields: 'id,trashed' })
    const result = await driveJson(`${api}/${encodeURIComponent(fileId)}?${query}`, token, { fetchImpl, method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
    return result.id === fileId && result.trashed === true
  } catch { return false }
}
