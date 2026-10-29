import pg from 'pg'
import nodemailer from 'nodemailer'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function enableLiveWorkshop(pool, eventSlug) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT w.id,w.live_started_at FROM workshops w
      JOIN events e ON e.id=w.event_id WHERE e.slug=$1 FOR UPDATE OF w`, [eventSlug])
    if (rows.length !== 1) throw new Error('Live workshop is missing')
    const workshop = rows[0]
    const preserved = Number((await client.query('SELECT count(*) AS total FROM registrations WHERE workshop_id=$1', [workshop.id])).rows[0].total)
    const settings = await client.query(`SELECT s.workshop_id,l.amount_minor,s.transfer_enabled,s.transfer_alias
      FROM workshop_payment_settings s JOIN workshops w ON w.id=s.workshop_id
      JOIN workshop_lots l ON l.workshop_id=w.id AND l.number=w.active_lot WHERE w.id=$1`, [workshop.id])
    if (settings.rows.length !== 1 || settings.rows[0].amount_minor <= 0) throw new Error('Live price is missing')
    if (settings.rows[0].transfer_enabled && (!settings.rows[0].transfer_alias || /NO TRANSFERIR|PRUEBA/i.test(settings.rows[0].transfer_alias))) throw new Error('Live transfer recipient is missing')
    const result = await client.query(`UPDATE workshops SET live_started_at=coalesce(live_started_at,clock_timestamp()),registration_open=true
      WHERE id=$1 RETURNING live_started_at`, [workshop.id])
    await client.query('UPDATE workshop_payment_settings SET mercado_pago_enabled=true WHERE workshop_id=$1', [workshop.id])
    if (!workshop.live_started_at) await client.query(`INSERT INTO audit_log(action,subject_id,changes)
      VALUES ('workshop.live_enabled',$1,$2::jsonb)`, [workshop.id, JSON.stringify({ liveStartedAt:result.rows[0].live_started_at.toISOString(), previousRegistrationsPreserved:true, preservedRegistrations:preserved })])
    await client.query('COMMIT')
    console.log('Live transition preserved '+preserved+' existing registrations')
    return result.rows[0].live_started_at
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

async function main() {
  if (process.env.MP_ENVIRONMENT !== 'production' || process.env.MP_CHECKOUT_ENABLED !== '1' ||
      process.env.WORKSHOP_LIVE_MODE !== '1' || process.env.REGISTRATION_EMAIL_READY !== '1' ||
      process.env.WORKSHOP_SANDBOX_REGISTRATIONS === '1' || process.env.WORKSHOP_LOCAL_TEST_MODE === '1') throw new Error('Explicit live configuration is required')
  for (const key of ['DATABASE_URL','WORKSHOP_EVENT_SLUG','MP_ACCESS_TOKEN','MP_SELLER_USER_ID','MP_APPLICATION_ID',
    'WORKSHOP_CHECKOUT_TOKEN_KEY','MP_WEBHOOK_SECRET','SITE_ORIGIN','SMTP_HOST','SMTP_USER','SMTP_PASS']) {
    if (!process.env[key]) throw new Error('Missing live setting: '+key)
  }
  if (process.env.MP_WEBHOOK_SECRET.length<16 || process.env.WORKSHOP_CHECKOUT_TOKEN_KEY.length<32 || new URL(process.env.SITE_ORIGIN).protocol!=='https:') throw new Error('Invalid live configuration')
  const identity = await fetch('https://api.mercadopago.com/users/me', {
    headers:{ Authorization:'Bearer '+process.env.MP_ACCESS_TOKEN }, signal:AbortSignal.timeout(15000),
  })
  if (!identity.ok) throw new Error('Live merchant verification unavailable')
  const merchant = await identity.json()
  if (String(merchant.id)!==process.env.MP_SELLER_USER_ID || merchant.tags?.includes('test_user')) throw new Error('Live merchant identity mismatch')
  const port=Number(process.env.SMTP_PORT)
  if (![465,587].includes(port)) throw new Error('Invalid SMTP port')
  const transport=nodemailer.createTransport({ host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port===587,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000 })
  try { await transport.verify() } finally { transport.close() }
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1})
  try { await enableLiveWorkshop(pool,process.env.WORKSHOP_EVENT_SLUG) } finally { await pool.end() }
  console.log('Live merchant and SMTP verified; real registration enabled; previous records preserved')
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main()
