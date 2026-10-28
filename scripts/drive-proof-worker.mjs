import pg from 'pg'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const RETRY_LIMIT = 10

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function googleJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options, signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}`)
  return response.json()
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('DRIVE_OAUTH_CLIENT_ID'),
      client_secret: required('DRIVE_OAUTH_CLIENT_SECRET'),
      refresh_token: required('DRIVE_OAUTH_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error(`Google OAuth HTTP ${response.status}`)
  const body = await response.json()
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('Google OAuth returned no access token')
  return body.access_token
}

// Link-shared folders require an explicit operator opt-in. The organizer has
// accepted this setting for the specified destination, but credentials and
// activation still live only in the deployment environment.
export async function assertWritableFolder(folderId, token, allowLinkSharing = false) {
  const folder = await googleJson(`${API}/files/${encodeURIComponent(folderId)}?fields=id,mimeType,trashed,capabilities(canAddChildren)`, token)
  if (folder.id !== folderId || folder.mimeType !== FOLDER_MIME || folder.trashed || !folder.capabilities?.canAddChildren) {
    throw new Error('Drive destination is not a writable folder')
  }
  let pageToken = ''
  let inspected = 0
  do {
    const query = new URLSearchParams({ fields: 'nextPageToken,permissions(id,type,role)', pageSize: '100' })
    if (pageToken) query.set('pageToken', pageToken)
    const page = await googleJson(`${API}/files/${encodeURIComponent(folderId)}/permissions?${query}`, token)
    if (!Array.isArray(page.permissions)) throw new Error('Drive destination sharing could not be verified')
    if (!allowLinkSharing && page.permissions.some(permission => permission.type === 'anyone'))
      throw new Error('Drive destination has link sharing; explicit opt-in is required')
    inspected += page.permissions.length
    pageToken = page.nextPageToken || ''
  } while (pageToken)
  if (!inspected) throw new Error('Drive destination permissions could not be verified')
}

export async function existingCopy(folderId, proofId, token) {
  const q = `'${folderId}' in parents and appProperties has { key='paymentProofId' and value='${proofId}' } and trashed = false`
  const params = new URLSearchParams({ q, fields: 'files(id,name,parents)', pageSize: '2' })
  const result = await googleJson(`${API}/files?${params}`, token)
  if (!Array.isArray(result.files)) throw new Error('Drive lookup was incomplete')
  if (result.files.length > 1) throw new Error('Multiple Drive copies found for proof')
  return result.files[0] || null
}

export async function uploadCopy(folderId, proof, token) {
  const boundary = `vas-proof-${proof.id}`
  const metadata = { name: proof.drive_file_name, parents: [folderId], appProperties: { paymentProofId: proof.id } }
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${proof.content_type}\r\n\r\n`),
    proof.data,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  return googleJson(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,parents`, token, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })
}

async function claim(pool) {
  const result = await pool.query(`
    WITH selected AS (
      SELECT id FROM payment_proofs
      WHERE document_number IS NOT NULL AND drive_file_name IS NOT NULL AND drive_file_id IS NULL
        AND drive_attempt_count < $1 AND drive_next_attempt_at <= now()
      ORDER BY uploaded_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE payment_proofs p SET drive_attempt_count=p.drive_attempt_count+1,
      drive_next_attempt_at=now()+interval '15 minutes'
    FROM selected WHERE p.id=selected.id
    RETURNING p.id,p.drive_file_name,p.content_type,p.data,p.drive_attempt_count
  `, [RETRY_LIMIT])
  return result.rows[0] || null
}

async function syncOne(pool, folderId, token, proof) {
  const copy = await existingCopy(folderId, proof.id, token) || await uploadCopy(folderId, proof, token)
  if (!copy.id || copy.name !== proof.drive_file_name || !copy.parents?.includes(folderId)) {
    throw new Error('Drive returned an unexpected file')
  }
  await pool.query(`UPDATE payment_proofs SET drive_file_id=$2,drive_synced_at=now(),
    drive_last_error=NULL WHERE id=$1 AND drive_file_id IS NULL`, [proof.id, copy.id])
}

async function run() {
  const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 2 })
  const folderId = required('DRIVE_FOLDER_ID')
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(folderId)) throw new Error('Invalid DRIVE_FOLDER_ID')
  let stopping = false
  process.on('SIGTERM', () => { stopping = true })
  process.on('SIGINT', () => { stopping = true })
  try {
    while (!stopping) {
      try {
        const token = await accessToken()
        await assertWritableFolder(folderId, token, process.env.DRIVE_ALLOW_LINK_SHARING === '1')
        const proof = await claim(pool)
        if (proof) {
          try { await syncOne(pool, folderId, token, proof) }
          catch (error) {
            const code = error instanceof Error ? error.message.slice(0, 120) : 'Unknown Drive error'
            const delay = Math.min(86_400, 60 * 2 ** Math.min(proof.drive_attempt_count, 10))
            await pool.query(`UPDATE payment_proofs SET drive_last_error=$2,
              drive_next_attempt_at=now()+($3::integer * interval '1 second') WHERE id=$1 AND drive_file_id IS NULL`,
            [proof.id, code, delay])
            console.error(`Drive proof sync failed: ${code}`)
          }
          continue
        }
      } catch (error) {
        console.error(`Drive proof worker paused: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
      await new Promise(resolve => setTimeout(resolve, 30_000))
    }
  } finally { await pool.end() }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch(error => { console.error(error instanceof Error ? error.message : 'Drive worker failed'); process.exitCode = 1 })
}
