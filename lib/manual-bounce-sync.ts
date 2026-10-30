import 'server-only'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import type { getDb } from './db'

export async function requestBounceSync(db: ReturnType<typeof getDb>, operatorId: string, requestId: string) {
  return db.transaction(async tx => {
    const result = await tx.execute(sql`SELECT *,requested_at>now()-interval '60 seconds' AS recent,
      attempted_at>now()-interval '2 minutes' AS active FROM email_bounce_sync WHERE id=1 FOR UPDATE`)
    const row = result.rows[0]
    if (!row) throw new Error('Bounce state unavailable')
    if (row.request_id === requestId) return { requestId, status: String(row.request_status), started: false }
    if ((row.request_status === 'queued' && row.recent) || (row.request_status === 'running' && row.active))
      return { requestId: String(row.request_id), status: String(row.request_status), started: false }
    if (row.recent) return { requestId: String(row.request_id), status: String(row.request_status), started: false, cached: true }
    await tx.execute(sql`UPDATE email_bounce_sync SET request_id=${requestId}::uuid,requested_at=now(),requested_by=${operatorId}::uuid,
      request_status='queued',last_error_code=NULL WHERE id=1`)
    await tx.execute(sql`SELECT pg_notify('vas_email_bounce_requested',${requestId})`)
    return { requestId, status: 'queued', started: true }
  })
}

// Only the explicit button request opens this short-lived listener. There is
// no periodic IMAP request, browser refresh timer or database polling loop.
export async function waitForBounceSync(requestId: string, timeoutMs = 25_000) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 })
  let finish: (status: string) => void = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  client.on('error', () => finish('running'))
  try {
    await client.connect()
    let finished = false
    const completion = new Promise<string>(resolve => {
      finish = status => { if (!finished) { finished = true; resolve(status) } }
      timer = setTimeout(() => finish('running'), timeoutMs)
    })
    client.on('notification', message => {
      if (message.channel !== 'vas_email_bounce_finished' || message.payload !== requestId) return
      void client.query('SELECT request_status FROM email_bounce_sync WHERE id=1 AND completed_request_id=$1', [requestId])
        .then(result => finish(result.rows[0]?.request_status || 'running')).catch(() => finish('running'))
    })
    await client.query('LISTEN vas_email_bounce_finished')
    const state = await client.query('SELECT request_status FROM email_bounce_sync WHERE id=1 AND completed_request_id=$1', [requestId])
    if (state.rows[0]) finish(state.rows[0].request_status)
    return await completion
  } catch { return 'running' }
  finally { if (timer) clearTimeout(timer); await client.end().catch(() => {}) }
}
