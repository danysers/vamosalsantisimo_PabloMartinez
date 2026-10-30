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
    let recorded = 0, warning = null
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
          if (meta.size > MAX_BOUNCE_BYTES) { warning = 'report_too_large'; last = uid; continue }
          const message = await client.fetchOne(String(uid), { source: { maxLength: MAX_BOUNCE_BYTES } }, { uid: true })
          if (message?.source) {
            let reports
            try { reports = await parseDeliveryReport(message.source) }
            catch { warning = 'invalid_report'; last = uid; continue }
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
    await db.query('UPDATE email_bounce_sync SET checked_at=now(),last_error_code=$1 WHERE id=1', [warning])
    if (recorded) console.log(`Email delivery reports recorded: ${recorded}`)
    return { recorded }
  } catch {
    await db.query("UPDATE email_bounce_sync SET last_error_code='mailbox_check_failed' WHERE id=1")
    console.error('Manual email bounce check failed; another check requires an operator request')
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
export async function processRequestedBounceSync(db, makeClient = imapClient) {
  const claim = await db.query(`UPDATE email_bounce_sync SET request_status='running',attempted_at=now()
    WHERE id=1 AND request_status='queued' AND request_id IS NOT NULL RETURNING request_id`)
  const request = claim.rows[0]
  if (!request) return { idle: true }
  const result = await syncEmailBounces(db, makeClient())
  const failed = result.failed || result.skipped
  await db.query(`UPDATE email_bounce_sync SET request_status=$2,completed_request_id=$1,completed_at=now(),
    last_error_code=CASE WHEN $3 THEN 'mailbox_check_busy' ELSE last_error_code END WHERE id=1 AND request_id=$1`,
  [request.request_id, failed ? 'failed' : 'succeeded', !!result.skipped])
  await db.query("SELECT pg_notify('vas_email_bounce_finished',$1)", [request.request_id])
  return { ...result, requestId: request.request_id }
}

export async function listenForBounceRequests(db, makeClient = imapClient) {
  let processing = false, requested = false
  const run = async () => {
    if (processing) return
    processing = true
    try {
      do { requested = false; await processRequestedBounceSync(db, makeClient) } while (requested)
    }
    catch { console.error('Manual bounce request could not finish') }
    finally { processing = false }
  }
  const notification = message => { if (message.channel === 'vas_email_bounce_requested') { requested = true; void run() } }
  db.on('notification', notification)
  try {
    await db.query('LISTEN vas_email_bounce_requested')
    // Resume only an explicitly queued request; an idle startup never opens IMAP.
    const closed = new Promise(resolve => { db.once('end', resolve); db.once('error', resolve) })
    await run()
    await closed
  } finally { db.off('notification', notification) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  do {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 })
    db.on('error', () => {})
    try {
      await db.connect()
      if (process.argv.includes('--once')) await processRequestedBounceSync(db)
      else await listenForBounceRequests(db)
    } catch { console.error('Manual bounce listener database unavailable') }
    finally { await db.end().catch(() => {}) }
    if (process.argv.includes('--once')) break
    // Reconnect a broken LISTEN connection; this never schedules an IMAP scan.
    await new Promise(resolve => setTimeout(resolve, 5000))
  } while (true)
}
