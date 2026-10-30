import pg from 'pg'
import { ImapFlow } from 'imapflow'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_BOUNCE_BYTES, parseDeliveryReport, recordDeliveryReport } from '../lib/email-bounce.mjs'

export async function syncEmailBounces(db, client) {
  const acquired = await db.query('SELECT pg_try_advisory_lock(2026,3519) AS locked')
  if (!acquired.rows[0]?.locked) return { skipped: true }
  try {
    const state = (await db.query('SELECT cursors FROM email_bounce_sync WHERE id=1')).rows[0]
    const cursors = state?.cursors || {}
    await db.query('UPDATE email_bounce_sync SET attempted_at=now() WHERE id=1')
    await client.connect()
    const available = await client.list()
    const folders = available.filter(folder => !folder.flags?.has('\\Noselect') &&
      (folder.path.toUpperCase() === 'INBOX' || /(?:^|[./])(spam|junk|promociones|trash)$/i.test(folder.path))).slice(0, 8)
    if (!folders.some(folder => folder.path.toUpperCase() === 'INBOX')) throw Error('mailbox_missing')
    let recorded = 0, oversized = false
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder.path, { readOnly: true })
      try {
        const validity = String(client.mailbox.uidValidity)
        const old = cursors[folder.path]
        const after = old?.validity === validity ? Number(old.uid) : 0
        const since = new Date(Date.now() - 30 * 86400_000)
        const matches = await client.search({ since, ...(after ? { uid: `${after + 1}:*` } : {}),
          or: [{ from: 'mailer-daemon' }, { from: 'postmaster' }, { header: { 'content-type': 'multipart/report' } }] }, { uid: true })
        const uids = (matches || []).filter(uid => uid > after).sort((a, b) => a - b).slice(0, 40)
        let last = after
        for (const uid of uids) {
          const meta = await client.fetchOne(String(uid), { size: true }, { uid: true })
          if (!meta) { last = uid; continue }
          if (meta.size > MAX_BOUNCE_BYTES) { oversized = true; last = uid; continue }
          const message = await client.fetchOne(String(uid), { source: { maxLength: MAX_BOUNCE_BYTES } }, { uid: true })
          if (message?.source) {
            const reports = await parseDeliveryReport(message.source)
            for (const report of reports) {
              const key = createHash('sha256').update(`${folder.path}|${validity}|${uid}|${report.emailId}|${report.recipient}|${report.action}`).digest('hex')
              if (await recordDeliveryReport(db, report, key)) recorded++
            }
          }
          last = uid
        }
        cursors[folder.path] = { validity, uid: last }
        // Checkpoint each completed folder. A network failure never skips the
        // rest; duplicate DSNs are harmless because report_key is unique.
        await db.query('UPDATE email_bounce_sync SET cursors=$1::jsonb WHERE id=1', [JSON.stringify(cursors)])
      } finally { lock.release() }
    }
    await db.query('UPDATE email_bounce_sync SET checked_at=now(),last_error_code=$1 WHERE id=1', [oversized ? 'report_too_large' : null])
    if (recorded) console.log(`Email delivery reports recorded: ${recorded}`)
    return { recorded }
  } catch {
    await db.query("UPDATE email_bounce_sync SET last_error_code='mailbox_check_failed' WHERE id=1")
    console.error('Email bounce check failed; will retry without interrupting delivery')
    return { failed: true }
  } finally {
    try { await client.logout() } catch { client.close() }
    await db.query('SELECT pg_advisory_unlock(2026,3519)')
  }
}

export function imapClient(env = process.env) {
  const client = new ImapFlow({ host: env.IMAP_HOST || env.SMTP_HOST, port: 993, secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, logger: false, disableAutoIdle: true,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
    maxLiteralSize: MAX_BOUNCE_BYTES + 8192, maxLineLength: 64 * 1024, maxResponseSize: MAX_BOUNCE_BYTES + 16384 })
  client.on('error', () => {}) // syncEmailBounces reports failures without logging mailbox content.
  return client
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  pool.on('error', () => console.error('Email bounce database connection interrupted; will retry'))
  try {
    do {
      try {
        const db = await pool.connect()
        try { await syncEmailBounces(db, imapClient()) } finally { db.release() }
      } catch { console.error('Email bounce monitor unavailable; will retry without stopping the site') }
      if (process.argv.includes('--once')) break
      await new Promise(resolve => setTimeout(resolve, 120_000))
    } while (true)
  } finally { await pool.end() }
}
