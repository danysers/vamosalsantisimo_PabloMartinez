import pg from 'pg'
import nodemailer from 'nodemailer'

if (process.env.WORKSHOP_SANDBOX_REGISTRATIONS !== '1' || process.env.MP_ENVIRONMENT !== 'test' || process.env.MP_CHECKOUT_ENABLED !== '1') {
  throw new Error('Sandbox registration requires explicit test checkout configuration')
}
for (const key of ['DATABASE_URL', 'MP_ACCESS_TOKEN', 'MP_SELLER_USER_ID', 'MP_APPLICATION_ID', 'WORKSHOP_CHECKOUT_TOKEN_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  if (!process.env[key]) throw new Error(`Missing sandbox setting: ${key}`)
}
const port = Number(process.env.SMTP_PORT)
if (![465, 587].includes(port)) throw new Error('Invalid SMTP port')
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
  requireTLS: port === 587, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 })
try { await transport.verify() } finally { transport.close() }
console.log('Sandbox SMTP connection verified')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
const client = await pool.connect()
try {
  await client.query('BEGIN')
  const { rows } = await client.query('SELECT w.id FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=$1 FOR UPDATE', [process.env.WORKSHOP_EVENT_SLUG])
  if (rows.length !== 1) throw new Error('Sandbox workshop is missing')
  await client.query('UPDATE workshops SET registration_open=true WHERE id=$1', [rows[0].id])
  await client.query(`UPDATE workshop_payment_settings
    SET mercado_pago_enabled=true, transfer_enabled=true, on_site_enabled=true,
        transfer_alias=CASE WHEN transfer_alias='NO TRANSFERIR - SOLO PRUEBA' THEN 'vamosalsantisimo' ELSE transfer_alias END,
        transfer_provider=CASE WHEN transfer_provider='Simulación (no transferir)' THEN 'Personal Pay' ELSE transfer_provider END,
        transfer_holder=CASE WHEN transfer_holder='Participante de prueba' THEN 'Sergio Daniel Servin' ELSE transfer_holder END,
        transfer_document=CASE WHEN transfer_alias='NO TRANSFERIR - SOLO PRUEBA' THEN '39320953' ELSE transfer_document END
    WHERE workshop_id=$1`, [rows[0].id])
  await client.query('COMMIT')
  console.log('Sandbox registration enabled with all three configured payment methods')
} catch (error) { await client.query('ROLLBACK'); throw error }
finally { client.release(); await pool.end() }
