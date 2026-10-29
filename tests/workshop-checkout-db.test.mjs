import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'

register('./ts-server-loader.mjs',import.meta.url)

test('registration → one ARS 16000 checkout → verified payment and one QR → refund revokes entry', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable, migrated PostgreSQL database',
},async () => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const slug='mp-checkout-test-'+randomUUID()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),
    MP_CHECKOUT_ENABLED:'1',MP_ACCESS_TOKEN:'FAKE_LOCAL_TEST_TOKEN',MP_SELLER_USER_ID:'111',MP_APPLICATION_ID:'222',MP_ENVIRONMENT:'test',
    SITE_ORIGIN:'https://checkout.example.invalid',MP_PUBLIC_ORIGIN:'https://checkout.example.invalid',ACCREDITATION_TOKEN_KEY_ID:'test-key',ACCREDITATION_TOKEN_KEY:randomBytes(32).toString('base64url')})
  const {enrollWorkshop}=await import('../lib/workshop-enrollment.ts')
  const {startWorkshopCheckout,reconcileWorkshopOrder,workshopPaymentStatus,persistMercadoPagoNotification,changeWorkshopPaymentMethod}=await import('../lib/workshop-payments.ts')
  const event=await pool.query('INSERT INTO events(slug,title,starts_at) VALUES($1,$2,$3) RETURNING id',[slug,'Local checkout test','2026-12-19T18:00:00Z'])
  const workshop=await pool.query('INSERT INTO workshops(event_id,starts_at,registration_open) VALUES($1,$2,true) RETURNING id',[event.rows[0].id,'2026-12-19T18:00:00Z'])
  const workshopId=workshop.rows[0].id
  await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1500000)',[workshopId])
  await pool.query('INSERT INTO workshop_payment_settings(workshop_id,mercado_pago_enabled,online_service_fee_minor) VALUES($1,true,100000)',[workshopId])
  const input={firstName:'Prueba',lastName:'Pago',documentNumber:'12345678',birthDate:'1990-01-01',phone:'370 4123456',email:'checkout-test@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'mercado_pago',creationKey:randomUUID()}
  const enrolled=await enrollWorkshop(input)
  assert.equal(enrolled.code,201,JSON.stringify(enrolled.body))
  assert.equal(enrolled.body.amountMinor,1_600_000)
  assert.equal(enrolled.body.baseAmountMinor,1_500_000)
  assert.equal(enrolled.body.feeMinor,100_000)
  const replay=await enrollWorkshop(input)
  assert.equal(replay.code,200)
  assert.deepEqual(replay.body,enrolled.body)
  const access={reference:enrolled.body.reference,accessToken:enrolled.body.paymentAccessToken}
  const {checkoutReturnToken}=await import('../lib/checkout-access.ts')
  const {restoreWorkshopPaymentReturn}=await import('../lib/workshop-payments.ts')
  const receiptRow=(await pool.query('SELECT id,creation_key FROM registrations WHERE reference=$1',[access.reference])).rows[0]
  const returnToken=checkoutReturnToken(access.reference,receiptRow.id,receiptRow.creation_key)
  assert.deepEqual(await restoreWorkshopPaymentReturn({reference:access.reference,returnToken}),access)
  await assert.rejects(restoreWorkshopPaymentReturn({reference:access.reference,returnToken:returnToken.slice(0,-1)+(returnToken.endsWith('a')?'b':'a')}),/access denied/)
  assert.equal((await pool.query('SELECT status FROM registrations WHERE id=$1',[receiptRow.id])).rows[0].status,'pending','return access cannot confirm an unpaid registration')
  assert.equal((await workshopPaymentStatus(access,false)).accreditation,null,'an unpaid registration never exposes a QR')
  await assert.rejects(workshopPaymentStatus({...access,accessToken:'x'.repeat(43)},false),/access denied/)
  const attempt=(await pool.query('SELECT * FROM payment_attempts WHERE registration_id IN(SELECT id FROM registrations WHERE workshop_id=$1)',[workshopId])).rows[0]
  assert.equal(attempt.provider_fee_minor,100_000)
  await assert.rejects(pool.query('UPDATE payment_attempts SET provider_fee_minor=1 WHERE id=$1',[attempt.id]),/payment quote is immutable/)
  const orderId='ORDTST'+randomBytes(12).toString('hex').toUpperCase()
  const url='https://www.mercadopago.com.ar/checkout/v1/redirect?order_id='+orderId
  let creates=0
  const create=async (order,key) => {
    creates++;assert.equal(order.amountMinor,1_600_000);assert.equal(order.reference,attempt.external_reference);assert.equal(key,attempt.idempotency_key)
    const redirect=new URL(order.returnUrl)
    assert.equal(redirect.origin,'https://checkout.example.invalid')
    assert.equal(redirect.searchParams.get('reference'),access.reference)
    assert.deepEqual(await restoreWorkshopPaymentReturn({reference:access.reference,returnToken:new URLSearchParams(redirect.hash.slice(1)).get('return')}),access)
    return {id:orderId,checkoutUrl:url}
  }
  const [a,b]=await Promise.all([startWorkshopCheckout(access,create),startWorkshopCheckout(access,create)])
  assert.deepEqual(a,b);assert.equal(creates,1)
  await pool.query('UPDATE workshop_lots SET amount_minor=2000000 WHERE workshop_id=$1',[workshopId])
  assert.equal((await startWorkshopCheckout(access,create)).amountMinor,1_600_000)
  assert.equal(creates,1,'retry reuses the same provider checkout and frozen amount')
  await assert.rejects(startWorkshopCheckout({...access,accessToken:'x'.repeat(43)},create),/access denied/)
  const approved={id:orderId,external_reference:attempt.external_reference,country_code:'ARG',currency:'ARS',total_amount:'16000.00',total_paid_amount:'16000.00',status:'processed',status_detail:'accredited',user_id:'111',integration_data:{application_id:'222'},last_updated_date:'2026-10-28T01:00:00Z',transactions:{
    payments:[{id:'PAY'+randomBytes(12).toString('hex').toUpperCase(),status:'processed',status_detail:'accredited',amount:'16000.00',paid_amount:'16000.00',payment_method:{type:'credit_card',id:'visa',installments:1}}],refunds:[],chargebacks:[],}}
  await reconcileWorkshopOrder(orderId,async () => approved)
  await reconcileWorkshopOrder(orderId,async () => approved)
  const state=await workshopPaymentStatus(access,false)
  assert.equal(state.status,'approved');assert.equal(state.registrationStatus,'confirmed')
  await assert.rejects(changeWorkshopPaymentMethod({...access,attemptId:attempt.id,method:'on_site'}),/confirmado/)
  assert.equal(state.emailStatus,'queued','approval queues a QR email without claiming it was sent')
  assert.match(state.accreditation.qrDataUrl,/^data:image\/png;base64,iVBOR/)
  assert.equal(state.accreditation.startsAt,'2026-12-19T18:00:00.000Z')
  assert.equal(state.testMode,true)
  assert.equal((await workshopPaymentStatus(access,false)).accreditation.qrDataUrl,state.accreditation.qrDataUrl,'refresh reuses the email credential')
  process.env.ACCREDITATION_TOKEN_KEY_ID='wrong-key'
  assert.equal((await workshopPaymentStatus(access,false)).accreditation,null,'a credential encrypted with another key stays private')
  process.env.ACCREDITATION_TOKEN_KEY_ID='test-key'
  const originalCredential=(await pool.query('SELECT id,issued_at,expires_at FROM accreditation_credentials WHERE registration_id=$1',[attempt.registration_id])).rows[0]
  await pool.query("UPDATE accreditation_credentials SET issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[originalCredential.id])
  assert.equal((await workshopPaymentStatus(access,false)).accreditation,null,'an expired credential cannot be displayed or printed')
  await pool.query('UPDATE accreditation_credentials SET issued_at=$2,expires_at=$3 WHERE id=$1',[originalCredential.id,originalCredential.issued_at,originalCredential.expires_at])
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accreditation_credentials WHERE registration_id=$1',[attempt.registration_id])).rows[0].n,1)
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'",[attempt.registration_id])).rows[0].n,1)
  const {parseMercadoPagoNotification}=await import('../lib/mercado-pago-notification.ts')
  const rawNotice={action:'order.processed',type:'order',application_id:'222',user_id:'111',live_mode:false,
    date_created:new Date().toISOString(),data:{id:orderId,version:1}}
  const notice={...parseMercadoPagoNotification(rawNotice,{orderId,applicationId:'222',sellerUserId:'111',liveMode:false}),requestId:randomUUID()}
  let reads=0
  const load=async()=>{reads++;return approved}
  await persistMercadoPagoNotification({...notice,requestId:randomUUID()},load)
  await persistMercadoPagoNotification(notice,load)
  assert.equal(reads,1,'a processed notification is not executed again')
  const refunded={...approved,status:'refunded',status_detail:'refunded',last_updated_date:'2026-10-28T02:00:00Z',transactions:{...approved.transactions,refunds:[{id:'REF'+randomBytes(12).toString('hex').toUpperCase(),transaction_id:approved.transactions.payments[0].id,amount:'16000.00',status:'processed'}]}}
  await reconcileWorkshopOrder(orderId,async()=>refunded)
  const afterRefund=await workshopPaymentStatus(access,false)
  assert.equal(afterRefund.status,'refunded')
  assert.equal(afterRefund.accreditation,null,'a refunded payment removes the QR from the public status response')
  const credential=(await pool.query('SELECT revoked_at FROM accreditation_credentials WHERE registration_id=$1',[attempt.registration_id])).rows[0]
  assert.ok(credential.revoked_at)
  await reconcileWorkshopOrder(orderId,async()=>approved)
  assert.equal((await workshopPaymentStatus(access,false)).status,'refunded','an older approved projection cannot undo a refund')
  await pool.end()
})

test('all three active lot prices reach the same Checkout integration and previous quotes remain frozen', {
  skip: !process.env.DATABASE_URL && 'Requires a disposable, migrated PostgreSQL database',
}, async () => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const slug='mp-lots-test-'+randomUUID()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),
    MP_CHECKOUT_ENABLED:'1',MP_ACCESS_TOKEN:'FAKE_LOCAL_TEST_TOKEN',MP_SELLER_USER_ID:'111',MP_APPLICATION_ID:'222',MP_ENVIRONMENT:'test',SITE_ORIGIN:'http://localhost:3000'})
  const {enrollWorkshop}=await import('../lib/workshop-enrollment.ts')
  const {startWorkshopCheckout}=await import('../lib/workshop-payments.ts')
  try {
    const event=await pool.query('INSERT INTO events(slug,title,starts_at)VALUES($1,$2,$3)RETURNING id',[slug,'Lot test','2026-12-19T18:00:00Z'])
    const workshop=await pool.query('INSERT INTO workshops(event_id,starts_at,registration_open)VALUES($1,$2,true)RETURNING id',[event.rows[0].id,'2026-12-19T18:00:00Z'])
    const id=workshop.rows[0].id
    await pool.query('INSERT INTO workshop_payment_settings(workshop_id,mercado_pago_enabled,online_service_fee_minor)VALUES($1,true,100000)',[id])
    const paid=[]
    for(const [number,base] of [[1,1000000],[2,1500000],[3,2000000]]) {
      await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor)VALUES($1,$2,$3)',[id,number,base])
      await pool.query('UPDATE workshops SET active_lot=$1 WHERE id=$2',[number,id])
      const receipt=await enrollWorkshop({firstName:'Persona',lastName:['Uno','Dos','Tres'][number-1],documentNumber:`1234567${number}`,birthDate:'1990-01-01',phone:'3704123456',email:'lots@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'mercado_pago',creationKey:randomUUID()})
      assert.equal(receipt.code,201)
      assert.equal(receipt.body.amountMinor,base+100000)
      assert.equal(receipt.body.baseAmountMinor,base)
      const access={reference:receipt.body.reference,accessToken:receipt.body.paymentAccessToken}
      const checkout=await startWorkshopCheckout(access,async input=>{
        assert.equal(input.amountMinor,base+100000)
        const orderId='ORDTST'+randomBytes(12).toString('hex').toUpperCase()
        return{id:orderId,checkoutUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id='+orderId}
      })
      paid.push({access,amount:checkout.amountMinor})
    }
    await pool.query('UPDATE workshop_lots SET amount_minor=2500000 WHERE workshop_id=$1',[id])
    for(const old of paid) {
      const same=await startWorkshopCheckout(old.access,async()=>{throw new Error('Must reuse the saved order')})
      assert.equal(same.amountMinor,old.amount)
    }
  } finally {await pool.end()}
})
