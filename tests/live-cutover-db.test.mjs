import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
import { enableLiveWorkshop } from '../scripts/prepare-live.mjs'
import { processEmailJob } from '../scripts/email-worker.mjs'
register('./ts-server-loader.mjs',import.meta.url)

test('live activation preserves old data, rejects historical payments and sends normal mail only for new records',{
  skip:!process.env.DATABASE_URL && 'Requires the disposable migrated test database',
},async()=>{
  const [{getDb},{enrollWorkshop},payments,accreditation]=await Promise.all([
    import('../lib/db.ts'),import('../lib/workshop-enrollment.ts'),import('../lib/workshop-payments.ts'),import('../lib/accreditation-workflow.ts'),
  ])
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),db=getDb(),slug='live-'+randomUUID()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,REGISTRATION_EMAIL_READY:'1',MP_ENVIRONMENT:'test',MP_CHECKOUT_ENABLED:'1',
    WORKSHOP_CHECKOUT_TOKEN_KEY:'live-cutover-checkout-test-'.repeat(3),ACCREDITATION_TOKEN_KEY_ID:'live-test',
    ACCREDITATION_TOKEN_KEY:randomBytes(32).toString('base64url'),MP_ACCESS_TOKEN:'test-only-credential',
    MP_SELLER_USER_ID:'123',MP_APPLICATION_ID:'456',SITE_ORIGIN:'https://example.invalid',MP_WEBHOOK_SECRET:'test-webhook-secret-no-network'})
  try{
    const event=(await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Live cutover test','2026-12-19T18:00:00Z') RETURNING id",[slug])).rows[0]
    const workshop=(await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,capacity) VALUES($1,'2026-12-19T18:00:00Z',true,1) RETURNING id",[event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)',[workshop.id])
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164,reminder_email) VALUES($1,'live.alias','Banco','5493704258770','organizer@example.invalid')",[workshop.id])
    const operator=(await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'registration_operator') RETURNING id",['operator-'+randomUUID()+'@example.invalid'])).rows[0]
    const input={firstName:'Ana',lastName:'Ensayo',documentNumber:'98765432',birthDate:'1990-01-01',phone:'3704123456',email:'ana@example.invalid',country:'Argentina',province:'Formosa',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'bank_transfer'}
    const old=await enrollWorkshop({...input,creationKey:randomUUID()});assert.equal(old.code,201)
    const access={reference:old.body.reference,accessToken:old.body.paymentAccessToken}
    const approved=await accreditation.verifyManualPayment(db,{reference:access.reference,eventSlug:slug,operatorId:operator.id,note:'Verificación ficticia anterior',manualReference:'BEFORE-LIVE'})
    assert.equal(approved.code,200)
    const oldId=(await pool.query('SELECT id,is_test FROM registrations WHERE reference=$1',[access.reference])).rows[0]
    assert.equal(oldId.is_test,true)
    const before=(await pool.query('SELECT count(*)::int AS count FROM registrations WHERE workshop_id=$1',[workshop.id])).rows[0].count
    const cutover=await enableLiveWorkshop(pool,slug)
    assert.equal((await enableLiveWorkshop(pool,slug)).getTime(),cutover.getTime(),'restart must keep the same cutover')
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM registrations WHERE workshop_id=$1',[workshop.id])).rows[0].count,before)
    assert.equal((await pool.query('SELECT registration_is_current($1) AS current,registration_has_approved_payment($1) AS paid',[oldId.id])).rows[0].current,false)
    assert.equal((await pool.query("SELECT status FROM payment_attempts WHERE registration_id=$1",[oldId.id])).rows[0].status,'approved','historical payment evidence is preserved')
    const credential=(await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1',[oldId.id])).rows[0]
    await assert.rejects(pool.query('INSERT INTO check_ins(registration_id,credential_id,scanned_by) VALUES($1,$2,$3)',[oldId.id,credential.id,operator.id]),/invalid accreditation for check-in/)
    process.env.MP_ENVIRONMENT='production';process.env.WORKSHOP_SANDBOX_REGISTRATIONS='0'
    const oldStatus=await payments.workshopPaymentStatus(access,false)
    assert.equal(oldStatus.historical,true);assert.equal(oldStatus.canChangeMethod,false);assert.equal(oldStatus.checkoutUrl,null)
    await assert.rejects(payments.startWorkshopCheckout(access,async()=>{throw Error('Provider must not be called')}),/Historical enrollment/)
    await assert.rejects(payments.changeWorkshopPaymentMethod({...access,attemptId:oldStatus.attemptId,method:'mercado_pago'}),/ensayo anterior/)
    const oldJob=(await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND kind='registration_received'",[oldId.id])).rows[0]
    const messages=[],fakeSmtp={sendMail:async message=>{messages.push(message);return{accepted:[message.to]}}}
    assert.equal(await processEmailJob(pool,fakeSmtp,oldJob,'contactos@vamosalsantisimo.com'),'cancelled')
    assert.equal(messages.length,0)
    const fresh=await enrollWorkshop({...input,creationKey:randomUUID()})
    assert.equal(fresh.code,201,JSON.stringify(fresh.body))
    assert.notEqual(fresh.body.reference,old.body.reference,'old identity must not block a real enrollment')
    const real=(await pool.query('SELECT id,is_test,registration_is_current(id) AS current FROM registrations WHERE reference=$1',[fresh.body.reference])).rows[0]
    assert.equal(real.is_test,false);assert.equal(real.current,true)
    const job=(await pool.query("SELECT * FROM email_outbox WHERE registration_id=$1 AND kind='registration_received'",[real.id])).rows[0]
    process.env.MP_ENVIRONMENT='test';process.env.WORKSHOP_SANDBOX_REGISTRATIONS='1'
    assert.equal(await processEmailJob(pool,fakeSmtp,job,'contactos@vamosalsantisimo.com'),'sent')
    assert.doesNotMatch(messages[0].subject,/PRUEBA/);assert.doesNotMatch(messages[0].text,/MODO DE PRUEBA|sin cargos reales/)
    process.env.MP_ENVIRONMENT='production';process.env.WORKSHOP_SANDBOX_REGISTRATIONS='0'
    const paid=await accreditation.verifyManualPayment(db,{reference:fresh.body.reference,eventSlug:slug,operatorId:operator.id,note:'Pago real simulado en base descartable',manualReference:'LIVE-FIXTURE'})
    assert.equal(paid.code,200)
    const status=await payments.workshopPaymentStatus({reference:fresh.body.reference,accessToken:fresh.body.paymentAccessToken},false)
    assert.equal(status.testMode,false);assert.equal(status.historical,false);assert.ok(status.accreditation?.qrDataUrl)
    const defaultRow=(await pool.query(`INSERT INTO registrations(workshop_id,reference,access_token_hash,creation_key,name,normalized_name,email,normalized_email,phone,normalized_phone)
      VALUES($1,$2,$3,$4,'Old process','old process','old@example.invalid','old@example.invalid','3704999999','3704999999') RETURNING id`,[workshop.id,randomUUID(),randomBytes(32).toString('hex'),randomUUID()])).rows[0]
    assert.equal((await pool.query('SELECT registration_is_current($1) AS current',[defaultRow.id])).rows[0].current,false,'an older process without the live marker must fail closed')
  }finally{await pool.end();await db.$client.end()}
})
