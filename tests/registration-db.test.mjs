import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes, createHmac } from 'node:crypto'
import pg from 'pg'

const databaseUrl = process.env.DATABASE_URL

test('registration persists, retries and distinguishes relatives', { skip: !databaseUrl && 'Set a disposable PostgreSQL DATABASE_URL' }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const slug = `test-${randomUUID()}`
  const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id', [slug,'Test only',new Date('2026-12-19T23:00:00Z')])
  const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at,capacity,registration_open) VALUES ($1,$2,NULL,true) RETURNING id', [event.rows[0].id, new Date('2026-12-19T20:00:00Z')])
  const port = 31583
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',String(port)], {
    cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, WORKSHOP_EVENT_SLUG: slug },
  })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'server unavailable')
    const token = randomBytes(32).toString('hex')
    // Historical Zod 3 accepted a hexadecimal v9 UUID; changing the validator must not reject existing clients.
    const generatedKey = randomUUID()
    const key = `${generatedKey.slice(0, 14)}9${generatedKey.slice(15)}`
    const send = (name, accessToken=token, idempotencyKey=key, email='family@example.invalid', phone='+54 9 11 2222-3333') => fetch(`${base}/api/inscripciones`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ name, email, phone, accessToken }),
    })
    const first = await send('Ana María Pérez')
    assert.equal(first.status, 201)
    const body = await first.json()
    assert.equal(body.status, 'pending')
    assert.match(body.reference, /^[A-Za-z0-9_-]{10,}$/)
    const replay = await send('Ana María Pérez')
    assert.equal(replay.status, 200)
    assert.deepEqual(await replay.json(), body)
    for (const changed of [
      ['Otra Persona', 'family@example.invalid', '+54 9 11 2222-3333'],
      ['Ana María Pérez', 'other@example.invalid', '+54 9 11 2222-3333'],
      ['Ana María Pérez', 'family@example.invalid', '+54 9 11 0000-0000'],
    ]) {
      const tamperedReplay = await send(changed[0], token, key, changed[1], changed[2])
      assert.equal(tamperedReplay.status, 409)
      assert.deepEqual(await tamperedReplay.json(), { error: 'Revisá tu inscripción anterior o contactá a la organización.' })
    }
    const duplicate = await send('Ana María Pérez', randomBytes(32).toString('hex'), randomUUID())
    assert.equal(duplicate.status, 409)
    assert.deepEqual(await duplicate.json(), { error: 'Revisá tu inscripción anterior o contactá a la organización.' })
    const relative = await send('Luis Pérez', randomBytes(32).toString('hex'), randomUUID())
    assert.equal(relative.status, 201)
    assert.equal((await relative.json()).status, 'pending')
    const ownStatus = await fetch(`${base}/api/estado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: token }) })
    assert.equal(ownStatus.status, 200)
    assert.deepEqual(await ownStatus.json(), body)
    assert.equal(ownStatus.headers.get('cache-control'), 'no-store')
    const ownRegistration = await pool.query('SELECT id FROM registrations WHERE workshop_id=$1 AND reference=$2',[workshop.rows[0].id,body.reference])
    await pool.query('UPDATE reservations SET expires_at=now()-interval \'1 minute\' WHERE registration_id=$1',[ownRegistration.rows[0].id])
    const expired = await fetch(`${base}/api/estado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: token }) })
    assert.equal(expired.status, 200)
    assert.deepEqual(await expired.json(), { reference: body.reference, status: 'expired' })
    const replayExpired = await send('Ana María Pérez')
    assert.equal(replayExpired.status, 200)
    assert.deepEqual(await replayExpired.json(), { reference: body.reference, status: 'expired' })
    const stranger = await fetch(`${base}/api/estado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: randomBytes(32).toString('hex') }) })
    assert.equal(stranger.status, 404)
    assert.deepEqual(await stranger.json(), { error: 'No encontramos esa inscripción.' })
    assert.equal((await fetch(`${base}/api/estado?email=family@example.invalid`)).status, 405)
    const tampered = await fetch(`${base}/api/inscripciones`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ name: 'Otra Persona', email: 'family@example.invalid', phone: '5491122223333', accessToken: randomBytes(32).toString('hex'), amount: 1 }) })
    assert.equal(tampered.status, 400)
    assert.deepEqual(await tampered.json(), { error: 'Solicitud inválida.' })
    const persisted = await pool.query('SELECT count(*)::int AS count FROM registrations WHERE workshop_id=$1', [workshop.rows[0].id])
    assert.equal(persisted.rows[0].count, 2)
    const reservations = await pool.query('SELECT count(*)::int AS count FROM reservations WHERE status=$1', ['held'])
    assert.ok(reservations.rows[0].count >= 2)
  } finally {
    server.kill()
    await pool.query('DELETE FROM reservations WHERE registration_id IN (SELECT id FROM registrations WHERE workshop_id=$1)', [workshop.rows[0].id])
    await pool.query('DELETE FROM registrations WHERE workshop_id=$1', [workshop.rows[0].id])
    await pool.query('DELETE FROM workshops WHERE id=$1',[workshop.rows[0].id])
    await pool.query('DELETE FROM events WHERE id=$1',[event.rows[0].id])
    await pool.end()
  }
})

test('only one request wins the final seat; waitlist is explicit and closure rejects writes', { skip: !databaseUrl && 'Set a disposable PostgreSQL DATABASE_URL' }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const slug = `test-${randomUUID()}`
  const event = await pool.query('INSERT INTO events (slug,title,starts_at) VALUES ($1,$2,$3) RETURNING id', [slug,'Capacity test',new Date('2026-12-19T23:00:00Z')])
  const workshop = await pool.query('INSERT INTO workshops (event_id,starts_at,capacity,registration_open) VALUES ($1,$2,1,true) RETURNING id', [event.rows[0].id,new Date('2026-12-19T20:00:00Z')])
  const port = 31584
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',String(port)], {
    cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, WORKSHOP_EVENT_SLUG: slug },
  })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const send = name => fetch(`${base}/api/inscripciones`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name, email: `${name.split(' ')[0].toLowerCase()}@example.invalid`, phone: '5491122223333', accessToken: randomBytes(32).toString('hex') }),
    })
    const contenders = await Promise.all([send('Ana Pérez'),send('Luis Pérez')])
    assert.deepEqual(contenders.map(r=>r.status).sort(), [201,409])
    const approved = contenders.find(r => r.status === 201)
    assert.equal((await approved.json()).status, 'pending')
    const refused = contenders.find(r => r.status === 409)
    assert.deepEqual(await refused.json(), { error: 'El taller está completo.' })
    await pool.query('UPDATE workshops SET waitlist_enabled=true WHERE id=$1',[workshop.rows[0].id])
    const waiting = await send('Clara Pérez')
    assert.equal(waiting.status, 201)
    assert.equal((await waiting.json()).status, 'waiting')
    const held = await pool.query('SELECT count(*)::int AS count FROM reservations r JOIN registrations g ON g.id=r.registration_id WHERE g.workshop_id=$1',[workshop.rows[0].id])
    assert.equal(held.rows[0].count, 1)
    await pool.query('UPDATE workshops SET registration_open=false WHERE id=$1',[workshop.rows[0].id])
    const closed = await send('Pedro Pérez')
    assert.equal(closed.status, 503)
    assert.deepEqual(await closed.json(), { error: 'Las inscripciones todavía no están habilitadas.' })
  } finally {
    server.kill()
    await pool.query('DELETE FROM reservations WHERE registration_id IN (SELECT id FROM registrations WHERE workshop_id=$1)',[workshop.rows[0].id])
    await pool.query('DELETE FROM registrations WHERE workshop_id=$1',[workshop.rows[0].id])
    await pool.query('DELETE FROM workshops WHERE id=$1',[workshop.rows[0].id])
    await pool.query('DELETE FROM events WHERE id=$1',[event.rows[0].id])
    await pool.end()
  }
})

test('trusted proxy IP requests hit a durable rate limit', { skip: !databaseUrl && 'Set a disposable PostgreSQL DATABASE_URL' }, async () => {
  const port = 31585
  const secret = 'local-test-only-key-32-bytes-long-not-production'
  const ip = `2001:db8::${randomBytes(2).toString('hex')}`
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, WORKSHOP_EVENT_SLUG: `absent-${randomUUID()}`, TRUST_REVERSE_PROXY: '1', RATE_LIMIT_HMAC_KEY: secret },
  })
  const base = `http://localhost:${port}`
  try {
    let ready = false
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const statuses = []
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${base}/api/inscripciones`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-real-ip': ip },
        body: JSON.stringify({ name: 'Ana Pérez', email: 'ana@example.invalid', phone: '5491122223333', accessToken: randomBytes(32).toString('hex') }),
      })
      statuses.push(response.status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    assert.deepEqual(statuses, [...Array(10).fill(503),429])
  } finally {
    server.kill()
    const bucket = `registration:ip:${createHmac('sha256', secret).update(ip).digest('hex')}`
    await pool.query('DELETE FROM rate_limits WHERE key=$1', [bucket])
    await pool.end()
  }
})
