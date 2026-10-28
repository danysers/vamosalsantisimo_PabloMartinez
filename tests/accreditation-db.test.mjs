import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { createAccreditationQr, encryptAccreditationQr } from '../lib/accreditation-token.ts'

test('database issues QR only for complete, approved registrations and admits once', {
  skip: !process.env.DATABASE_URL && 'Set a disposable, migrated PostgreSQL DATABASE_URL',
}, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query('BEGIN')
  try {
    let failureNumber = 0
    async function rejectsInSavepoint(operation, pattern) {
      const savepoint = `expected_failure_${++failureNumber}`
      await client.query(`SAVEPOINT ${savepoint}`)
      try { await assert.rejects(operation(), pattern) }
      finally {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        await client.query(`RELEASE SAVEPOINT ${savepoint}`)
      }
    }
    const [event] = (await client.query(
      'INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,now()) RETURNING id',
      [`accreditation-test-${randomUUID()}`, 'Test accreditation'],
    )).rows
    const [workshop] = (await client.query(
      'INSERT INTO workshops (event_id,starts_at) VALUES ($1,now()) RETURNING id', [event.id],
    )).rows
    const [operator] = (await client.query(
      'INSERT INTO admin_users (email,role) VALUES ($1,$2) RETURNING id',
      [`scanner-${randomUUID()}@example.invalid`, 'admission_operator'],
    )).rows
    const [registration] = (await client.query(
      `INSERT INTO registrations (workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [workshop.id, `ref-${randomUUID()}`, randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), randomUUID(),
        'Ana Pérez', 'ana pérez', 'ana@example.invalid', 'ana@example.invalid', '3704123456', '3704123456'],
    )).rows
    const qr = createAccreditationQr()
    const encrypted = encryptAccreditationQr(qr.qrValue, randomBytes(32).toString('base64url'), registration.id, 1)
    const issue = (reason = 'paid') => client.query(
      `INSERT INTO accreditation_credentials
       (registration_id,version,token_hash,token_ciphertext,token_iv,token_auth_tag,encryption_key_id,reason,expires_at)
       VALUES ($1,1,$2,$3,$4,$5,'local-test',$6,now()+interval '1 day') RETURNING id`,
      [registration.id, qr.tokenHash, encrypted.tokenCiphertext, encrypted.tokenIv, encrypted.tokenAuthTag, reason],
    )
    await rejectsInSavepoint(issue, /accreditation requires confirmed registration/)
    await client.query('UPDATE registrations SET status=$1 WHERE id=$2', ['confirmed', registration.id])
    await rejectsInSavepoint(issue, /accreditation requires complete intake/)
    await client.query(
      `INSERT INTO registration_intakes (registration_id,first_name,last_name,birth_date,ecclesial_state,payment_difficulty)
       VALUES ($1,'Ana','Pérez','1996-05-02','laico',false)`, [registration.id],
    )
    await rejectsInSavepoint(issue, /accreditation requires verified full payment/)
    const [attempt] = (await client.query(
      `INSERT INTO payment_attempts (registration_id,idempotency_key,source,status,amount_minor,paid_amount_minor,manual_verified_by,manual_verified_at)
       VALUES ($1,$2,'manual','approved',10000,10000,$3,now()) RETURNING id`, [registration.id, randomUUID(), operator.id],
    )).rows
    const [credential] = (await issue()).rows
    await client.query(
      'INSERT INTO check_ins (registration_id,credential_id,scanned_by) VALUES ($1,$2,$3)',
      [registration.id, credential.id, operator.id],
    )
    await rejectsInSavepoint(() => client.query(
      'INSERT INTO check_ins (registration_id,credential_id,scanned_by) VALUES ($1,$2,$3)',
      [registration.id, credential.id, operator.id],
    ), /check_ins_registration_id_unique/)
    await client.query('UPDATE payment_attempts SET status=$1 WHERE id=$2', ['refunded', attempt.id])
    const revoked = (await client.query('SELECT revoked_at FROM accreditation_credentials WHERE id=$1', [credential.id])).rows[0]
    assert.ok(revoked.revoked_at)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
