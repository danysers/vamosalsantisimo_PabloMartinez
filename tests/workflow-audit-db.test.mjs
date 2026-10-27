import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'

test('registration and payment state changes keep a dated append-only audit trail', {
  skip: !process.env.DATABASE_URL && 'Set a disposable, migrated PostgreSQL DATABASE_URL',
}, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('BEGIN')
  try {
    const event = await client.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,now()) RETURNING id',
      [`audit-test-${randomUUID()}`, 'Audit test'])
    const workshop = await client.query('INSERT INTO workshops (event_id,starts_at) VALUES ($1,now()) RETURNING id', [event.rows[0].id])
    const registration = await client.query(`INSERT INTO registrations
      (workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
      VALUES ($1,$2,$3,$4,'Test Audit','test audit','audit@example.invalid','audit@example.invalid','3700000000','3700000000') RETURNING id`,
    [workshop.rows[0].id, randomUUID(), randomBytes(32).toString('hex'), randomUUID()])
    const id = registration.rows[0].id
    await client.query("UPDATE registrations SET status='confirmed' WHERE id=$1", [id])
    const attempt = await client.query(`INSERT INTO payment_attempts (registration_id,idempotency_key,source,amount_minor)
      VALUES ($1,$2,'bank_transfer',10000) RETURNING id`, [id, randomUUID()])
    await client.query("UPDATE payment_attempts SET status='pending' WHERE id=$1", [attempt.rows[0].id])
    const timeline = await client.query('SELECT action,created_at FROM audit_log WHERE subject_id=$1 OR subject_id=$2 ORDER BY created_at,id',
      [id, attempt.rows[0].id])
    assert.deepEqual(timeline.rows.map(row => row.action).sort(), [
      'payment.created', 'payment.state_changed', 'registration.created', 'registration.status_changed',
    ])
    assert.ok(timeline.rows.every(row => row.created_at instanceof Date))
  } finally { await client.query('ROLLBACK'); await client.end() }
})
