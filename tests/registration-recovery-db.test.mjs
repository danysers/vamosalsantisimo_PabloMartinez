import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes,randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { register } from 'node:module'
import pg from 'pg'
import { decryptRecoveryCode } from '../lib/recovery-code.ts'
import { processEmailJob } from '../scripts/email-worker.mjs'

register('./ts-server-loader.mjs',import.meta.url)
test('DNI/reference recovery proves email ownership, limits guesses, rejects replay and enables only private proof upload',{
  skip:!process.env.DATABASE_URL && 'Use a disposable migrated PostgreSQL database',
},async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const slug='recovery-'+randomUUID(),reference=randomBytes(12).toString('base64url'),creationKey=randomUUID()
  const port=31609,origin='http://localhost:'+port,key='recovery-db-test-secret-'.repeat(3)
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY=key
  const event=(await pool.query('INSERT INTO events(slug,title,starts_at) VALUES($1,$2,$3) RETURNING id',[slug,'Recovery test','2026-12-19T18:00:00Z'])).rows[0]
  const workshop=(await pool.query('INSERT INTO workshops(event_id,starts_at,registration_open) VALUES($1,$2,true) RETURNING id',[event.id,'2026-12-19T18:00:00Z'])).rows[0]
  const lot=(await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000) RETURNING id',[workshop.id])).rows[0]
  const record=(await pool.query(`INSERT INTO registrations(workshop_id,reference,creation_key,access_token_hash,name,normalized_name,email,normalized_email,phone,normalized_phone)
    VALUES($1,$2,$3,$4,'Ana Prueba','ana prueba','ana@example.invalid','ana@example.invalid','3704123456','3704123456') RETURNING id`,[workshop.id,reference,creationKey,randomBytes(32).toString('hex')])).rows[0]
  await pool.query("INSERT INTO registration_intakes(registration_id,first_name,last_name,document_number,birth_date,ecclesial_state,payment_difficulty) VALUES($1,'Ana','Prueba','87654321','1990-04-15','laico',false)",[record.id])
  const attempt=(await pool.query("INSERT INTO payment_attempts(registration_id,idempotency_key,source,status,amount_minor) VALUES($1,$2,'bank_transfer','created',1000000) RETURNING id",[record.id,randomUUID()])).rows[0]
  await pool.query('INSERT INTO payment_allocations(attempt_id,registration_id,lot_id,lot_number,base_amount_minor,discount_minor,due_amount_minor) VALUES($1,$2,$3,1,1000000,0,1000000)',[attempt.id,record.id,lot.id])
  await pool.query("UPDATE payment_attempts SET status='pending' WHERE id=$1",[attempt.id])
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{stdio:'ignore',env:{...process.env,WORKSHOP_EVENT_SLUG:slug,SITE_ORIGIN:origin,WORKSHOP_CHECKOUT_TOKEN_KEY:key}})
  const send=body=>fetch(origin+'/api/taller/inscripciones/recuperar',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  try{
    for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
    const absent=await send({action:'request',identifier:'NONEXISTENT-REFERENCE'}),unknown=await absent.json()
    assert.equal(absent.status,202);assert.deepEqual(Object.keys(unknown).sort(),['challengeId','message'])
    const first=await(await send({action:'request',identifier:'87.654.321'})).json()
    assert.equal(first.message,unknown.message)
    const getCode=async id=>{const row=(await pool.query('SELECT * FROM registration_recoveries WHERE id=$1',[id])).rows[0];return decryptRecoveryCode(id,row.code_encrypted)}
    const code=await getCode(first.challengeId),wrong=String((Number(code)+1)%1000000).padStart(6,'0')
    for(let i=0;i<5;i++)assert.equal((await send({action:'verify',challengeId:first.challengeId,code:wrong})).status,400)
    assert.equal((await send({action:'verify',challengeId:first.challengeId,code})).status,400)
    const second=await(await send({action:'request',identifier:reference})).json(),validCode=await getCode(second.challengeId)
    const job=(await pool.query('SELECT * FROM email_outbox WHERE recovery_id=$1',[second.challengeId])).rows[0]
    let message;assert.equal(await processEmailJob(pool,{sendMail:async m=>{message=m;return{accepted:[m.to]}}},job,'contactos@vamosalsantisimo.com'),'sent')
    assert.match(message.text,new RegExp(validCode));assert.match(message.text,/15 minutos/)
    const accessResponse=await send({action:'verify',challengeId:second.challengeId,code:validCode}),access=await accessResponse.json()
    assert.equal(accessResponse.status,200);assert.equal(access.reference,reference);assert.equal(access.accessToken.length,43)
    assert.equal((await send({action:'verify',challengeId:second.challengeId,code:validCode})).status,400)
    const form=new FormData();form.set('reference',reference);form.set('accessToken',access.accessToken)
    form.set('comprobante',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')],{type:'image/png'}),'test.png')
    const upload=await fetch(origin+'/api/taller/pagos/comprobante',{method:'POST',headers:{Origin:origin},body:form})
    assert.equal(upload.status,201,await upload.text())
    assert.equal((await pool.query('SELECT status FROM payment_attempts WHERE id=$1',[attempt.id])).rows[0].status,'pending')
    const expired=await(await send({action:'request',identifier:reference})).json(),expiredCode=await getCode(expired.challengeId)
    await pool.query("UPDATE registration_recoveries SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.challengeId])
    assert.equal((await send({action:'verify',challengeId:expired.challengeId,code:expiredCode})).status,400)
  }finally{server.kill();await pool.end()}
})
