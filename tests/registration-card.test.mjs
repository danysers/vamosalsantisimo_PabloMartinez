import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs',import.meta.url)
const {createRegistrationQr,registrationQrReference,verifyRegistrationQr}=await import('../lib/registration-qr.ts')
const {hashAccreditationQr}=await import('../lib/accreditation-token.ts')

test('registration QR has a separate signed purpose and cannot be treated as a paid credential',()=>{
  process.env.WORKSHOP_CHECKOUT_TOKEN_KEY='registration-qr-test-key-'.repeat(3)
  const value=createRegistrationQr('person-a','reference12345','creation-a')
  assert.equal(registrationQrReference(value),'reference12345')
  assert.equal(verifyRegistrationQr(value,'person-a','reference12345','creation-a'),true)
  assert.equal(verifyRegistrationQr(value,'person-b','reference12345','creation-a'),false)
  assert.equal(verifyRegistrationQr(value,'person-a','reference12345','creation-b'),false)
  assert.throws(()=>hashAccreditationQr(value))
})

test('on-site registration has a printable QR without approving payment; it admits only after payment and resumes only with private proof',{
  skip:!process.env.DATABASE_URL&&'Requires a disposable migrated PostgreSQL database',
},async()=>{
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:'registration-card-'+randomUUID(),WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),
    ACCREDITATION_TOKEN_KEY_ID:'registration-card-test',ACCREDITATION_TOKEN_KEY:randomBytes(32).toString('base64url'),MP_ENVIRONMENT:'test'})
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const {enrollWorkshop}=await import('../lib/workshop-enrollment.ts')
  const {workshopPaymentStatus}=await import('../lib/workshop-payments.ts')
  const {admitAccreditation,verifyManualPayment}=await import('../lib/accreditation-workflow.ts')
  const {getDb}=await import('../lib/db.ts')
  const {individualRegistrationSchema}=await import('../lib/workshop-input.ts')
  try {
    const event=(await pool.query('INSERT INTO events(slug,title,starts_at)VALUES($1,$2,$3)RETURNING id',[process.env.WORKSHOP_EVENT_SLUG,'Registration card test','2026-12-19T18:00:00Z'])).rows[0]
    const workshop=(await pool.query('INSERT INTO workshops(event_id,starts_at,registration_open)VALUES($1,$2,true)RETURNING id',[event.id,'2026-12-19T18:00:00Z'])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor)VALUES($1,1,1000000)',[workshop.id])
    await pool.query('INSERT INTO workshop_payment_settings(workshop_id)VALUES($1)',[workshop.id])
    const operator=(await pool.query("INSERT INTO admin_users(email,role)VALUES($1,'registration_operator')RETURNING id",['card-'+randomUUID()+'@example.invalid'])).rows[0]
    const input={firstName:'Daniela',lastName:'Prueba',documentNumber:'12345678',nickname:'Dany',birthDate:'1990-01-01',phone:'3704000000',email:'card@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'on_site',creationKey:randomUUID()}
    const {creationKey,...payload}=input
    assert.equal(individualRegistrationSchema.safeParse(payload).success,true)
    assert.equal(individualRegistrationSchema.safeParse({...payload,nickname:undefined}).success,true)
    assert.equal(individualRegistrationSchema.safeParse({...payload,nickname:'x'.repeat(81)}).success,false)
    const enrolled=await enrollWorkshop(input)
    assert.equal(enrolled.code,201)
    assert.equal(enrolled.body.amountMinor,null,'cash registration has no invented price before the door price is defined')
    const access={reference:enrolled.body.reference,accessToken:enrolled.body.paymentAccessToken}
    const row=(await pool.query('SELECT id FROM registrations WHERE reference=$1',[access.reference])).rows[0]
    const value=createRegistrationQr(row.id,access.reference,creationKey)
    const state=await workshopPaymentStatus(access,false)
    assert.equal(state.status,'pending');assert.equal(state.registrationStatus,'pending')
    assert.equal(state.amountMinor,null)
    const pendingQuote=await pool.query(`SELECT p.amount_minor,a.base_amount_minor,a.due_amount_minor,a.promotion_id
      FROM payment_attempts p JOIN payment_allocations a ON a.attempt_id=p.id WHERE p.id=$1`,[state.attemptId])
    assert.deepEqual(pendingQuote.rows[0],{amount_minor:null,base_amount_minor:null,due_amount_minor:null,promotion_id:null})
    assert.equal(state.nickname,'Dany');assert.equal(state.accreditation,null)
    assert.match(state.registrationCard.qrDataUrl,/^data:image\/png;base64,iVBOR/)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accreditation_credentials WHERE registration_id=$1',[row.id])).rows[0].n,0)
    const scan={qrValue:value,eventSlug:process.env.WORKSHOP_EVENT_SLUG,operatorId:operator.id,entryPoint:'Test reception'}
    assert.equal((await admitAccreditation(getDb(),scan)).body.result,'not_eligible')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM check_ins WHERE registration_id=$1',[row.id])).rows[0].n,0)
    assert.equal((await admitAccreditation(getDb(),{...scan,eventSlug:'another-event'})).code,404)
    const duplicate=await enrollWorkshop({...input,creationKey:randomUUID()})
    assert.equal(duplicate.code,409);assert.equal(duplicate.body.reference,undefined)
    const invalid=await enrollWorkshop({...input,creationKey:randomUUID(),resumeReceipts:[{reference:access.reference,accessToken:'x'.repeat(43)}]})
    assert.equal(invalid.code,409)
    const resumed=await enrollWorkshop({...input,nickname:'Dani',creationKey:randomUUID(),resumeReceipts:[access]})
    assert.equal(resumed.code,200);assert.equal(resumed.body.resumed,true);assert.equal(resumed.body.reference,access.reference)
    assert.equal((await workshopPaymentStatus(access,false)).nickname,'Dani')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM registrations WHERE workshop_id=$1',[workshop.id])).rows[0].n,1)
    const approval={reference:access.reference,eventSlug:process.env.WORKSHOP_EVENT_SLUG,operatorId:operator.id,note:'Local test payment',manualReference:'TEST-ONLY'}
    const unpriced=await verifyManualPayment(getDb(),approval)
    assert.equal(unpriced.code,409,'an undefined cash price cannot produce paid accreditation')
    await pool.query('UPDATE workshop_payment_settings SET on_site_price_minor=2000000 WHERE workshop_id=$1',[workshop.id])
    const paid=await verifyManualPayment(getDb(),approval)
    assert.equal(paid.code,200)
    const final=await workshopPaymentStatus(access,false)
    assert.equal(final.amountMinor,2_000_000)
    const history=await pool.query(`SELECT status,amount_minor,replaces_attempt_id FROM payment_attempts WHERE registration_id=$1 ORDER BY created_at`,[row.id])
    assert.equal(history.rows.length,2)
    assert.equal(history.rows[0].status,'cancelled');assert.equal(history.rows[0].amount_minor,null)
    assert.equal(history.rows[1].status,'approved');assert.equal(history.rows[1].amount_minor,2_000_000)
    assert.equal(history.rows[1].replaces_attempt_id,state.attemptId)
    assert.equal(final.registrationCard,null);assert.equal(final.status,'approved');assert.ok(final.accreditation)
    assert.equal((await admitAccreditation(getDb(),scan)).body.result,'admitted')
    assert.equal((await admitAccreditation(getDb(),scan)).body.result,'already_admitted')
  } finally {await pool.end()}
})
