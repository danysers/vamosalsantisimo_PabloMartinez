import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query('BEGIN')
try {
  const slug = 'formacion-catolica-2026'
  const startsAt = '2026-12-19T18:00:00.000Z' // 15:00 in Argentina.
  await client.query(
    `INSERT INTO events (slug,title,starts_at,venue)
     VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO NOTHING`,
    [slug, 'Taller de Formación Católica', startsAt, 'Parroquia San Luis de Francia, Formosa'],
  )
  const [{ id: eventId }] = (await client.query('SELECT id FROM events WHERE slug=$1', [slug])).rows
  await client.query(
    `INSERT INTO workshops (event_id,starts_at,venue,registration_open)
     VALUES ($1,$2,$3,false) ON CONFLICT (event_id) DO NOTHING`,
    [eventId, startsAt, 'Parroquia San Luis de Francia, Formosa'],
  )
  const [{ id: workshopId }] = (await client.query('SELECT id FROM workshops WHERE event_id=$1', [eventId])).rows
  for (const [number, amountMinor] of [[1, 1_000_000], [2, 1_500_000], [3, 2_000_000]]) {
    await client.query(
      `INSERT INTO workshop_lots (workshop_id,number,amount_minor)
       VALUES ($1,$2,$3) ON CONFLICT (workshop_id,number) DO NOTHING`,
      [workshopId, number, amountMinor],
    )
  }
  for (const [code, bundleSize, payablePeople] of [['3X2', 3, 2], ['2X1', 2, 1]]) {
    await client.query(
      `INSERT INTO workshop_promotions (workshop_id,code,kind,bundle_size,payable_people,active)
       VALUES ($1,$2,'bundle',$3,$4,false) ON CONFLICT (workshop_id,code) DO NOTHING`,
      [workshopId, code, bundleSize, payablePeople],
    )
  }
  await client.query(
    `INSERT INTO workshop_payment_settings
       (workshop_id,mercado_pago_enabled,transfer_enabled,on_site_enabled,transfer_alias,
        transfer_provider,transfer_holder,transfer_document,proof_whatsapp_e164,funds_needed_days_before,reminder_email,reminder_lead_days)
     VALUES ($1,false,true,true,'vamosalsantisimo','Personal Pay','Sergio Daniel Servin','39320953','5493718632884',3,'danysers@gmail.com',3)
     ON CONFLICT (workshop_id) DO NOTHING`, [workshopId],
  )
  // Suggestions only. Each tier must be verified against the merchant's own
  // account and filled with its current fee before reminders are scheduled.
  for (const releaseDays of [35, 18, 10, 0]) {
    await client.query(
      `INSERT INTO settlement_options (workshop_id,release_days,active)
       VALUES ($1,$2,false) ON CONFLICT (workshop_id,release_days) DO NOTHING`,
      [workshopId, releaseDays],
    )
  }
  await client.query('COMMIT')
  console.log('Workshop catalog seeded. Registration and Mercado Pago remain closed.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
