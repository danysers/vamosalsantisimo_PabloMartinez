// The regular mail worker also catches up after restarts or an interrupted
// payment flow. PostgreSQL owns the lock and the durable transition/outbox.
export async function processLotAutomation(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const due = await client.query(`SELECT id FROM workshops
      WHERE lot_automation_enabled AND registration_open AND active_lot<3 AND starts_at>now()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 20`)
    for (const row of due.rows) await client.query('SELECT advance_workshop_lot($1)', [row.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
