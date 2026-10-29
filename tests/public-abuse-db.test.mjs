import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { register } from 'node:module'
import { spawn } from 'node:child_process'
import pg from 'pg'
register('./ts-server-loader.mjs', import.meta.url)

test('public operation budgets are atomic, expire and block before processing files or payments', {
  skip: !process.env.DATABASE_URL && 'Requires disposable PostgreSQL',
}, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  // Separate namespace: never exhaust the budgets used by other test cases.
  const schema = 'abuse_' + randomUUID().replaceAll('-', '')
  await pool.query(`CREATE SCHEMA "${schema}"`)
  await pool.query(`CREATE TABLE "${schema}".rate_limits (key text PRIMARY KEY, count integer NOT NULL, window_end timestamptz NOT NULL)`)
  const url = new URL(process.env.DATABASE_URL)
  url.searchParams.set('options', `-csearch_path=${schema}`)
  process.env.DATABASE_URL = url.href
  const { allowPublicOperation } = await import('../lib/request-rate-limit.ts')
  const results = await Promise.all(Array.from({ length: 40 }, () => allowPublicOperation('proof-upload')))
  assert.equal(results.filter(Boolean).length, 30)
  await pool.query(`UPDATE "${schema}".rate_limits SET window_end=now()-interval '1 second'`)
  assert.equal(await allowPublicOperation('proof-upload'), true)
  const reset = await pool.query(`SELECT count FROM "${schema}".rate_limits WHERE key='public-operation:proof-upload'`)
  assert.equal(reset.rows[0].count, 1)
  for (const [operation, maximum] of [['proof-upload',30],['payment-method',60],['payment-status',3000]]) {
    await pool.query(`INSERT INTO "${schema}".rate_limits VALUES ($1,$2,now()+interval '1 minute')
      ON CONFLICT (key) DO UPDATE SET count=excluded.count,window_end=excluded.window_end`, [`public-operation:${operation}`,maximum])
  }
  const base = 'http://localhost:31634'
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '31634'], {
    stdio: 'ignore', windowsHide: true, env: { ...process.env, APP_SURFACE:'public', SITE_ORIGIN:base, REGISTRATION_EMAIL_READY:'1' },
  })
  try {
    let ready = false
    for (let i=0;i<100;i++) {
      try { if ((await fetch(base)).ok) { ready=true;break } } catch {}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    assert.ok(ready)
    for (const [path,body,type] of [
      ['comprobante','malformed multipart never needs parsing','multipart/form-data; boundary=attack'],
      ['estado',JSON.stringify({reference:'random-reference',accessToken:'x'.repeat(43)}),'application/json'],
      ['metodo',JSON.stringify({reference:'random-reference',accessToken:'x'.repeat(43),attemptId:randomUUID(),method:'bank_transfer'}),'application/json'],
    ]) {
      const response=await fetch(base+'/api/taller/pagos/'+path,{method:'POST',headers:{origin:base,'content-type':type,'x-forwarded-for':'1.2.3.4'},body})
      assert.equal(response.status,429,path)
      assert.equal(response.headers.get('retry-after'),'60')
    }
  } finally { server.kill(); await pool.end() }
})
