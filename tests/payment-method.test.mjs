import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs',import.meta.url)
const { inspectUnpaidCheckoutOrder } = await import('../lib/checkout-method-contract.ts')

test('cancellation checks merchant, identity, total, environment and lack of any money movement',()=>{
  const expected={orderId:'ORDTST12345678',externalReference:'ref',amountMinor:1_100_000,sellerUserId:'111',applicationId:'222',liveMode:false}
  const raw={id:expected.orderId,external_reference:'ref',total_amount:'11000.00',currency:'ARS',country_code:'ARG',user_id:'111',integration_data:{application_id:'222'},status:'created'}
  assert.equal(inspectUnpaidCheckoutOrder(raw,expected).canceled,false)
  assert.equal(inspectUnpaidCheckoutOrder({...raw,status:'canceled'},expected).canceled,true)
  for(const change of [{id:'ORDTSTOTHER'}, {external_reference:'other'}, {total_amount:'10000'}, {currency:'USD'}, {user_id:'999'},
    {integration_data:{application_id:'999'}},{live_mode:true},{status:'processing'},{status:'processed'}, {total_paid_amount:'1'},
    {transactions:{payments:[{status:'processed',paid_amount:'11000'}]}}, {transactions:{refunds:[{}]}}]) {
    assert.throws(()=>inspectUnpaidCheckoutOrder({...raw,...change},expected))
  }
})

test('payment method changes preserve one registration, quote and reference; cancellation is verified and retries deduplicate',{
  skip:!process.env.DATABASE_URL&&'Requires a disposable migrated PostgreSQL database',
},async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const slug='method-test-'+randomUUID()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),MP_CHECKOUT_ENABLED:'1',MP_ACCESS_TOKEN:'FAKE_LOCAL_TEST_TOKEN',MP_SELLER_USER_ID:'111',MP_APPLICATION_ID:'222',MP_ENVIRONMENT:'test',SITE_ORIGIN:'http://localhost:3000'})
  const {enrollWorkshop}=await import('../lib/workshop-enrollment.ts')
  const {changeWorkshopPaymentMethod,workshopPaymentStatus,startWorkshopCheckout}=await import('../lib/workshop-payments.ts')
  try {
    const event=(await pool.query('INSERT INTO events(slug,title,starts_at)VALUES($1,$2,$3)RETURNING id',[slug,'Method test','2026-12-19T18:00:00Z'])).rows[0]
    const workshop=(await pool.query('INSERT INTO workshops(event_id,starts_at,registration_open)VALUES($1,$2,true)RETURNING id',[event.id,'2026-12-19T18:00:00Z'])).rows[0]
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,mercado_pago_enabled,transfer_enabled,on_site_enabled,transfer_alias,transfer_provider,proof_whatsapp_e164)VALUES($1,true,true,true,'test.alias','Banco de prueba','5493704000000')",[workshop.id])
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor)VALUES($1,1,1000000)',[workshop.id])
    const receipt=await enrollWorkshop({firstName:'Persona',lastName:'Prueba',birthDate:'1990-01-01',phone:'3704123456',email:'method@example.invalid',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:'on_site',creationKey:randomUUID()})
    assert.equal(receipt.code,201)
    const access={reference:receipt.body.reference,accessToken:receipt.body.paymentAccessToken}
    assert.equal(access.accessToken.length,43)
    const original=await workshopPaymentStatus(access,false)
    assert.equal(original.paymentMethod,'on_site');assert.equal(original.canChangeMethod,true)
    await pool.query('UPDATE workshop_lots SET amount_minor=2000000 WHERE workshop_id=$1',[workshop.id])
    const online=await changeWorkshopPaymentMethod({...access,attemptId:original.attemptId,method:'mercado_pago'})
    assert.equal(online.amountMinor,1_100_000,'the original lot quote is preserved')
    assert.equal(online.baseAmountMinor,1_000_000)
    await assert.rejects(startWorkshopCheckout({...access,accessToken:'x'.repeat(43)}),/access denied/)
    const orderId='ORDTST'+randomBytes(12).toString('hex').toUpperCase()
    await startWorkshopCheckout(access,async()=>({id:orderId,checkoutUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id='+orderId}))
    const attempt=(await pool.query('SELECT external_reference FROM payment_attempts WHERE id=$1',[online.attemptId])).rows[0]
    const raw={id:orderId,external_reference:attempt.external_reference,total_amount:'11000.00',currency:'ARS',country_code:'ARG',user_id:'111',integration_data:{application_id:'222'},status:'created'}
    let cancellations=0,reads=0,canceled=false,key
    const provider={load:async()=>{reads++;return{...raw,status:canceled?'canceled':'created'}},cancel:async(id,k)=>{assert.equal(id,orderId);key=k;cancellations++;canceled=true}}
    await assert.rejects(changeWorkshopPaymentMethod({...access,accessToken:'x'.repeat(43),attemptId:online.attemptId,method:'bank_transfer'},provider),/access denied/)
    const blocked={load:async()=>({...raw,status:'processing'}),cancel:async()=>{throw new Error('Must not cancel processing payments')}}
    await assert.rejects(changeWorkshopPaymentMethod({...access,attemptId:online.attemptId,method:'bank_transfer'},blocked),/procesándose/)
    assert.equal((await workshopPaymentStatus(access,false)).attemptId,online.attemptId)
    const input={...access,attemptId:online.attemptId,method:'bank_transfer'}
    const [a,b]=await Promise.all([changeWorkshopPaymentMethod(input,provider),changeWorkshopPaymentMethod(input,provider)])
    assert.equal(a.attemptId,b.attemptId)
    assert.equal(a.reference,access.reference);assert.equal(a.paymentMethod,'bank_transfer');assert.equal(a.amountMinor,1_000_000);assert.equal(a.feeMinor,0)
    assert.equal(a.transfer.alias,'test.alias');assert.match(a.transfer.whatsappUrl,/^https:\/\/wa.me\//)
    assert.equal(cancellations,1);assert.equal(reads,2);assert.match(key,/^[a-f0-9-]{36}$/)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM registrations WHERE workshop_id=$1',[workshop.id])).rows[0].n,1)
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_attempts WHERE registration_id=(SELECT id FROM registrations WHERE reference=$1) AND status='pending'",[access.reference])).rows[0].n,1)
    await assert.rejects(changeWorkshopPaymentMethod({...access,attemptId:online.attemptId,method:'on_site'},provider),/cambió/)
    const again=await changeWorkshopPaymentMethod({...access,attemptId:a.attemptId,method:'mercado_pago'})
    assert.equal(again.amountMinor,1_100_000)
    // A timeout may have canceled the old checkout remotely before rollback.
    // A retry reads its canceled state and must not submit another cancellation.
    const laterId='ORDTST'+randomBytes(12).toString('hex').toUpperCase()
    await startWorkshopCheckout(access,async()=>({id:laterId,checkoutUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id='+laterId}))
    const later=(await pool.query('SELECT external_reference FROM payment_attempts WHERE id=$1',[again.attemptId])).rows[0]
    let remoteCanceled=false
    const interrupted={load:async()=>({...raw,id:laterId,external_reference:later.external_reference,status:remoteCanceled?'canceled':'created'}),cancel:async()=>{remoteCanceled=true;throw new Error('Response lost')}}
    const retry={...access,attemptId:again.attemptId,method:'on_site'}
    await assert.rejects(changeWorkshopPaymentMethod(retry,interrupted),/cerrar el pago/)
    assert.equal((await workshopPaymentStatus(access,false)).attemptId,again.attemptId)
    const recovered=await changeWorkshopPaymentMethod(retry,interrupted)
    assert.equal(recovered.paymentMethod,'on_site');assert.equal(recovered.reference,access.reference)
    await assert.rejects(pool.query('UPDATE payment_attempts SET replaces_attempt_id=NULL WHERE id=$1',[recovered.attemptId]),/predecessor is immutable/)
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("UPDATE payment_attempts SET status='cancelled' WHERE id=$1",[recovered.attemptId])
      const fake=(await client.query("INSERT INTO payment_attempts(registration_id,replaces_attempt_id,source,amount_minor,idempotency_key)SELECT registration_id,id,'bank_transfer',999999,$2 FROM payment_attempts WHERE id=$1 RETURNING id",[recovered.attemptId,randomUUID()])).rows[0]
      await assert.rejects(client.query('INSERT INTO payment_allocations(attempt_id,registration_id,lot_id,lot_number,base_amount_minor,discount_minor,due_amount_minor)SELECT $1,registration_id,lot_id,lot_number,999999,0,999999 FROM payment_allocations WHERE attempt_id=$2',[fake.id,recovered.attemptId]),/copy its original allocation exactly/)
    } finally {await client.query('ROLLBACK');client.release()}
    await pool.query("UPDATE payment_attempts SET status='review' WHERE id=$1",[recovered.attemptId])
    await assert.rejects(changeWorkshopPaymentMethod({...access,attemptId:recovered.attemptId,method:'bank_transfer'}),/revisión/)
  } finally {await pool.end()}
})
