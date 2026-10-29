import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundedDownload } from '../lib/bounded-download.mjs'
import { matchesImageSignature, maxSponsorBytes, maxSponsors, sponsorCacheDir, sponsorFolderId, sponsorFromDrive, sponsorOwnerEmails } from '../lib/sponsor-media.mjs'

const api = 'https://www.googleapis.com/drive/v3'
const intervalMs = 5 * 60_000

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: required('DRIVE_OAUTH_CLIENT_ID'),
      client_secret: required('DRIVE_OAUTH_CLIENT_SECRET'), refresh_token: required('DRIVE_OAUTH_REFRESH_TOKEN'),
      grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error(`Google OAuth HTTP ${response.status}`)
  const data = await response.json()
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Google OAuth returned no access token')
  return data.access_token
}

async function googleJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}`)
  return response.json()
}

async function listSponsorFiles(token) {
  const folder = await googleJson(`${api}/files/${encodeURIComponent(sponsorFolderId)}?fields=id,mimeType,trashed,owners(emailAddress)`, token)
  if (folder.id !== sponsorFolderId || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.trashed ||
      !folder.owners?.some(owner => sponsorOwnerEmails.includes(owner.emailAddress?.toLowerCase()))) {
    throw new Error('Sponsor folder identity or owner does not match')
  }
  const files = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({ q: `'${sponsorFolderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime,createdTime,owners(emailAddress))',
      pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await googleJson(`${api}/files?${params}`, token)
    if (!Array.isArray(page.files)) throw new Error('Invalid Drive folder listing')
    files.push(...page.files)
    if (files.length > 1000) throw new Error('Sponsor folder exceeds sync limit')
    pageToken = page.nextPageToken || ''
  } while (pageToken)
  return files.sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')) ||
    String(a.id).localeCompare(String(b.id))).map(file => sponsorFromDrive(file)).filter(Boolean).slice(0, maxSponsors)
}

async function downloadSponsor(file, token, root) {
  const target = join(root, file.filename)
  try { if ((await stat(target)).size === file.size) return } catch { /* first download */ }
  const response = await fetch(`${api}/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Sponsor download HTTP ${response.status}`)
  const data = await boundedDownload(response, maxSponsorBytes)
  if (data.length !== file.size || data.length > maxSponsorBytes || !matchesImageSignature(data, file.mimeType) ||
      createHash('md5').update(data).digest('hex') !== file.filename.split('-').at(-1).split('.')[0]) {
    throw new Error(`Invalid sponsor image ${file.id}`)
  }
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
  await rename(temporary, target)
}

export async function syncSponsors(token, root = sponsorCacheDir) {
  const files = await listSponsorFiles(token)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const published = []
  for (const file of files) {
    try { await downloadSponsor(file, token, root); published.push(file) }
    catch (error) { console.error(`Sponsor ${file.id} skipped: ${error instanceof Error ? error.message : 'download error'}`) }
  }
  const manifest = { version: 1, files: published }
  const current = await readFile(join(root, 'manifest.json'), 'utf8').catch(() => '')
  const next = JSON.stringify(manifest)
  if (current !== next) {
    const temporary = join(root, `manifest.${process.pid}.tmp`)
    await writeFile(temporary, next, { mode: 0o600 })
    await rename(temporary, join(root, 'manifest.json'))
    console.info(`Sponsor gallery updated: ${published.length} Drive logos`)
  }
  return manifest
}

async function run() {
  let stopping = false
  process.on('SIGTERM', () => { stopping = true })
  process.on('SIGINT', () => { stopping = true })
  while (!stopping) {
    try { await syncSponsors(await accessToken()) }
    catch (error) { console.error(`Sponsor sync paused: ${error instanceof Error ? error.message : 'unknown error'}`) }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch(error => { console.error(error); process.exitCode = 1 })
}
