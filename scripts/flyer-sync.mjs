import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { boundedDownload } from '../lib/bounded-download.mjs'
import { sponsorOwnerEmails, matchesImageSignature } from '../lib/sponsor-media.mjs'
import { flyerCacheDir, flyerFolderId, flyerFilename, maxFlyerBytes, validFlyerCommit, validFlyerManifest } from '../lib/flyer-media.mjs'

const api = 'https://www.googleapis.com/drive/v3/files'
const trusted = file => file.owners?.some(owner => sponsorOwnerEmails.includes(owner.emailAddress?.toLowerCase()))
async function drive(url, token, max = 512 * 1024) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Flyer Drive HTTP ${response.status}`)
  return boundedDownload(response, max)
}

export async function syncFlyers(token, root = flyerCacheDir) {
  const folder = JSON.parse((await drive(`${api}/${flyerFolderId}?fields=id,mimeType,trashed,owners(emailAddress)`, token)).toString())
  if (folder.id !== flyerFolderId || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !trusted(folder)) throw new Error('Flyer folder mismatch')
  const listed = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({ q: `'${flyerFolderId}' in parents and trashed = false`, pageSize: '100',
      fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,owners(emailAddress),appProperties)' })
    if (pageToken) params.set('pageToken', pageToken)
    const page = JSON.parse((await drive(`${api}?${params}`, token)).toString())
    if (!Array.isArray(page.files)) throw new Error('Invalid flyer listing')
    listed.push(...page.files)
    if (listed.length > 1000) throw new Error('Flyer folder exceeds limit')
    pageToken = page.nextPageToken || ''
  } while (pageToken)
  const candidates = listed.filter(file => trusted(file) && file.mimeType === 'application/json' &&
    /^flyers-evento-publicados-v\d{1,5}\.json$/.test(file.name || '') && file.appProperties?.vasType === 'event-commit')
    .sort((a, b) => Number(b.appProperties.vasVersion) - Number(a.appProperties.vasVersion))
  const previous = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8').catch(() => 'null'))
  for (const candidate of candidates.slice(0, 10)) {
    const version = Number(candidate.appProperties.vasVersion)
    if (validFlyerManifest(previous) && version <= previous.version) return previous
    const commit = JSON.parse((await drive(`${api}/${candidate.id}?alt=media`, token, 32 * 1024)).toString())
    if (!validFlyerCommit(commit) || commit.version !== version || commit.job !== candidate.appProperties.vasJob) continue
    const files = commit.files.map(file => ({ ...file, filename: flyerFilename(file) }))
    if (!files.every(file => listed.some(remote => remote.id === file.id && trusted(remote) && remote.name === file.name &&
      remote.mimeType === 'image/png' && Number(remote.size) === file.size && remote.md5Checksum === file.md5 &&
      remote.appProperties?.vasType === 'event-flyer' && remote.appProperties?.vasJob === commit.job &&
      remote.appProperties?.vasVersion === String(version)))) continue
    await mkdir(root, { recursive: true, mode: 0o700 })
    for (const file of files) {
      const target = join(root, file.filename)
      try { if ((await stat(target)).size === file.size) continue } catch { /* new version */ }
      const data = await drive(`${api}/${file.id}?alt=media`, token, maxFlyerBytes)
      if (data.length !== file.size || !matchesImageSignature(data, 'image/png') ||
          createHash('md5').update(data).digest('hex') !== file.md5 ||
          createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('Flyer checksum mismatch')
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, data, { mode: 0o600 })
      await rename(temporary, target)
    }
    const manifest = { ...commit, files }
    const temporary = join(root, `manifest.${process.pid}.tmp`)
    await writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 })
    await rename(temporary, join(root, 'manifest.json'))
    console.info(`Event flyer cache updated: V${version}, ${files.length} verified images`)
    return manifest
  }
  return previous
}
