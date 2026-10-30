import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs',import.meta.url)

test('administrative operations preserve payment facts and enforce owner, replay, eligibility, capacity and QR controls',{
  skip:!process.env.DATABASE_URL&&'Requires a disposable migrated PostgreSQL database',
},async t=>{
  const [{getDb},{enrollWorkshop},{readRegistrationOperations,editRegistrationOperations},{issueAccreditation}]=await Promise.all([
    import('../lib/db.ts'),import('../lib/workshop-enrollment.ts'),import('../lib/registration-operations.ts'),import('../lib/accreditation-workflow.ts')])
  const db=getDb(),pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),slug='operations-'+randomUUID()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,REGISTRATION_EMAIL_READY:'1',MP_CHECKOUT_ENABLED:'1',MP_ENVIRONMENT:'production',
    MP_WEBHOOK_SECRET:'fake-local-test-secret',MP_ACCESS_TOKEN:'FAKE_LOCAL_TEST_TOKEN',MP_SELLER_USER_ID:'111',MP_APPLICATION_ID:'222',MP_PUBLIC_ORIGIN:'https://example.invalid',
    WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),ACCREDITATION_TOKEN_KEY_ID:'operations-test',ACCREDITATION_TOKEN_KEY:randomBytes(32).toString('base64url')})
  try{
    const event=(await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Operations test','2026-12-19T18:00:00Z') RETURNING id",[slug])).rows[0]
    const workshop=(await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id",[event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)',[workshop.id])
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,mercado_pago_enabled,transfer_alias,transfer_provider,proof_whatsapp_e164,on_site_price_minor) VALUES($1,true,'ops.alias','Banco','5493704258770',2000000)",[workshop.id])
    const owner=(await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id",['owner-'+randomUUID()+'@example.invalid'])).rows[0]
    const limited=(await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'registration_operator') RETURNING id",['limited-'+randomUUID()+'@example.invalid'])).rows[0]
    let n=0
    async function enroll(method='bank_transfer'){
      n++;const result=await enrollWorkshop({firstName:'Prueba'+n,lastName:'Gestión',documentNumber:String(88001000+n),email:`operations${n}@example.invalid`,phone:'370400'+String(1000+n),birthDate:'1990-01-01',ecclesialState:'laico',paymentDifficulty:false,paymentMethod:method,creationKey:randomUUID()})
      assert.equal(result.code,201,JSON.stringify(result.body));return result.body.reference
    }
    const read=ref=>readRegistrationOperations(db,slug,ref)
    const payload=async(ref,overrides={})=>{
      const s=await read(ref);return {reference:ref,version:s.version,requestId:randomUUID(),registrationStatus:s.registrationStatus,paymentMethod:s.paymentMethod,paymentStatus:s.paymentStatus,amountMinor:s.amountMinor,paidAmountMinor:s.paidAmountMinor,feeMinor:s.feeMinor,manualReference:s.manualReference,registeredAt:s.registeredAt,qrAction:'keep',waiver:'keep',undoAdmission:false,confirmGroup:false,confirmPayment:false,confirmQrChange:false,notify:false,reason:'Corrección ficticia en base descartable',...overrides}
    }
    const edit=async data=>{try{return await editRegistrationOperations(db,slug,owner.id,data)}catch(error){throw new Error(error.cause?.message||error.message)}}
    const ref=await enroll(),original=(await pool.query('SELECT p.* FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id WHERE r.reference=$1',[ref])).rows[0]
    let approvedCredential
    await t.test('owner only, strict data and stale version; unpaid confirmation rolls back',async()=>{
      const input=await payload(ref)
      assert.equal((await editRegistrationOperations(db,slug,limited.id,input)).code,403)
      assert.equal((await edit({...input,providerStatus:'accredited'})).code,400)
      assert.equal((await edit({...input,version:'0'.repeat(32)})).code,409)
      assert.equal((await edit({...input,registrationStatus:'confirmed'})).code,400)
      assert.equal((await pool.query('SELECT count(*)::int n FROM registration_admin_changes WHERE registration_id=$1',[original.registration_id])).rows[0].n,0)
    })
    await t.test('correct and approve amount once, keep original transaction, issue one QR without sending mail',async()=>{
      const before=(await pool.query("SELECT count(*)::int n FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'",[original.registration_id])).rows[0].n
      const input=await payload(ref,{registrationStatus:'confirmed',paymentStatus:'approved',amountMinor:1500000,paidAmountMinor:1500000,confirmPayment:true})
      const result=await edit(input);assert.equal(result.code,200,JSON.stringify(result.body))
      assert.equal((await edit(input)).body.replayed,true)
      assert.equal((await edit({...input,reason:'Distinto contenido con mismo identificador'})).code,409)
      const after=(await pool.query('SELECT * FROM payment_attempts WHERE id=$1',[original.id])).rows[0]
      assert.equal(after.status,'pending');assert.equal(after.amount_minor,1000000);assert.ok(after.superseded_by_admin)
      assert.equal((await read(ref)).amountMinor,1500000)
      approvedCredential=(await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1 AND revoked_at IS NULL',[original.registration_id])).rows[0].id
      assert.equal((await pool.query("SELECT count(*)::int n FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'",[original.registration_id])).rows[0].n,before)
      assert.equal((await pool.query('SELECT workshop_lot_paid_places($1,1) n',[workshop.id])).rows[0].n,1)
      await assert.rejects(pool.query('UPDATE payment_allocations SET due_amount_minor=1 WHERE attempt_id IN(SELECT id FROM payment_attempts WHERE admin_change_id=$1)',[input.requestId]),/immutable/)
    })
    await t.test('manual email queue reuses the QR; revocation blocks automatic issuer until restored',async()=>{
      assert.equal((await edit(await payload(ref,{notify:true}))).code,200)
      const queued=(await pool.query("SELECT credential_id FROM email_outbox WHERE registration_id=$1 AND kind='accreditation_ready'",[original.registration_id])).rows
      assert.equal(queued.length,1);assert.equal(queued[0].credential_id,approvedCredential)
      assert.equal((await edit(await payload(ref,{qrAction:'revoke',confirmQrChange:true}))).code,200)
      assert.equal((await issueAccreditation(db,{registrationId:original.registration_id,eventSlug:slug,operatorId:owner.id})).body.blocked,true)
      assert.equal((await edit(await payload(ref))).code,200)
      assert.equal((await read(ref)).qrBlocked,true,'keeping a revoked QR must preserve the explicit block')
      assert.equal((await pool.query('SELECT count(*)::int n FROM accreditation_credentials WHERE registration_id=$1 AND revoked_at IS NULL',[original.registration_id])).rows[0].n,0)
      assert.equal((await edit(await payload(ref,{qrAction:'reissue',confirmQrChange:true}))).code,200)
      assert.notEqual((await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1 AND revoked_at IS NULL',[original.registration_id])).rows[0].id,approvedCredential)
    })
    await t.test('cash does not advance lots, changing dates preserves original live-cutover timestamp',async()=>{
      const oldCreated=(await pool.query('SELECT created_at FROM registrations WHERE id=$1',[original.registration_id])).rows[0].created_at
      const result=await edit(await payload(ref,{paymentMethod:'on_site',amountMinor:2000000,paidAmountMinor:2000000,confirmPayment:true,registeredAt:'2026-10-01T12:00:00Z'}))
      assert.equal(result.code,200,JSON.stringify(result.body));assert.equal((await read(ref)).paymentMethod,'on_site')
      assert.equal((await pool.query('SELECT workshop_lot_paid_places($1,1) n',[workshop.id])).rows[0].n,0)
      const row=(await pool.query('SELECT created_at,registration_is_current(id) current FROM registrations WHERE id=$1',[original.registration_id])).rows[0]
      assert.equal(row.created_at.getTime(),oldCreated.getTime());assert.equal(row.current,true)
    })
    await t.test('Mercado Pago administrative approval does not forge provider verification',async()=>{
      const mp=await enroll('mercado_pago')
      const result=await edit(await payload(mp,{registrationStatus:'confirmed',paymentStatus:'approved',paidAmountMinor:(await read(mp)).amountMinor,confirmPayment:true}))
      assert.equal(result.code,200,JSON.stringify(result.body))
      const p=(await pool.query('SELECT p.* FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id WHERE r.reference=$1 AND p.superseded_by_admin IS NULL',[mp])).rows[0]
      assert.equal(p.source,'manual');assert.equal(p.reported_source,'mercado_pago');assert.equal(p.provider_order_id,null);assert.ok(p.manual_verified_by)
    })
    await t.test('undoing admission requires confirmation and retains the previous entry in the audit',async()=>{
      const credential=(await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1 AND revoked_at IS NULL',[original.registration_id])).rows[0]
      await pool.query('INSERT INTO check_ins(registration_id,credential_id,scanned_by,entry_point) VALUES($1,$2,$3,\'Prueba local\')',[original.registration_id,credential.id,owner.id])
      assert.equal((await edit(await payload(ref,{registrationStatus:'cancelled'}))).code,409)
      const input=await payload(ref,{undoAdmission:true,confirmQrChange:true})
      assert.equal((await edit(input)).code,200)
      assert.equal((await read(ref)).admitted,false)
      const change=(await pool.query('SELECT changes FROM registration_admin_changes WHERE id=$1',[input.requestId])).rows[0]
      assert.equal(change.changes.before.previousAdmission.entry_point,'Prueba local')
      assert.ok(change.changes.before.previousAdmission.scanned_at)
    })
    await t.test('none plus a waiver enables free accreditation; revoke or in-flight mail conflicts roll back',async()=>{
      const free=await enroll(),id=(await pool.query('SELECT id FROM registrations WHERE reference=$1',[free])).rows[0].id
      assert.equal((await edit(await payload(free,{paymentMethod:'none',amountMinor:null,registrationStatus:'confirmed',waiver:'grant',confirmPayment:true}))).code,200)
      assert.equal((await read(free)).waived,true)
      assert.equal((await edit(await payload(free,{waiver:'revoke'}))).code,400)
      assert.equal((await read(free)).waived,true)
      await pool.query("INSERT INTO email_outbox(dedupe_key,kind,to_email,registration_id,status) VALUES($1,'registration_received','fake@example.invalid',$2,'sending')",[randomUUID(),id])
      assert.equal((await edit(await payload(free,{registrationStatus:'cancelled'}))).code,409)
      assert.equal((await read(free)).registrationStatus,'confirmed')
    })
    await t.test('operational DTO contains no access capability or personal data',async()=>{
      assert.doesNotMatch(JSON.stringify(await read(ref)),/creation_key|token|ciphertext|provider_order_id|email|document_number|payer_name/)
    })
    await t.test('group correction requires confirmation, preserves members and updates lot counts once',async()=>{
      const {quoteOrCreateGroup}=await import('../lib/workshop-admin.ts')
      const people=[1,2].map(i=>({firstName:'Grupo'+i,lastName:'Operación',documentNumber:'8800200'+i,birthDate:'1990-01-01',phone:'37040100'+i+'0',email:`ops-group${i}@example.invalid`,ecclesialState:'laico'}))
      const draft={mode:'new',people,payerIndex:0,paymentMethod:'bank_transfer',promotionId:null,idempotencyKey:randomUUID(),eventSlug:slug,operatorId:owner.id}
      const preview=await quoteOrCreateGroup(db,draft,false);assert.equal(preview.code,200)
      const created=await quoteOrCreateGroup(db,{...draft,expectedQuoteHash:preview.body.quoteHash},true)
      assert.equal(created.code,201,JSON.stringify(created.body))
      const member=created.body.references[1]
      const input=await payload(member,{paymentStatus:'approved',registrationStatus:'confirmed',amountMinor:3000001,paidAmountMinor:3000001,confirmPayment:true})
      assert.equal((await edit(input)).code,400)
      const result=await edit({...input,confirmGroup:true});assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(result.body.members,2)
      for(const reference of created.body.references){const state=await read(reference);assert.equal(state.registrationStatus,'confirmed');assert.equal(state.amountMinor,3000001);assert.equal(state.members,2)}
      const allocated=(await pool.query('SELECT sum(due_amount_minor)::int total,count(*)::int n FROM payment_allocations WHERE admin_change_id=$1',[input.requestId])).rows[0]
      assert.equal(allocated.total,3000001);assert.equal(allocated.n,2)
    })
    await t.test('capacity restoration failure leaves the cancelled record unchanged',async()=>{
      const reference=await enroll()
      assert.equal((await edit(await payload(reference,{registrationStatus:'cancelled'}))).code,200)
      await pool.query('UPDATE workshops SET capacity=1 WHERE id=$1',[workshop.id])
      assert.equal((await edit(await payload(reference,{registrationStatus:'pending'}))).code,409)
      assert.equal((await read(reference)).registrationStatus,'cancelled')
      await pool.query('UPDATE workshops SET capacity=NULL WHERE id=$1',[workshop.id])
    })
    await t.test('a processing Mercado Pago order cannot be replaced; a safely cancelled checkout can',async()=>{
      const reference=await enroll('mercado_pago')
      const p=(await pool.query('SELECT p.* FROM payment_attempts p JOIN registrations r ON r.id=p.registration_id WHERE r.reference=$1',[reference])).rows[0]
      const orderId='ORD'+randomBytes(12).toString('hex').toUpperCase()
      await pool.query('UPDATE payment_attempts SET provider_order_id=$1 WHERE id=$2',[orderId,p.id])
      const order={id:orderId,external_reference:p.external_reference,country_code:'ARG',currency:'ARS',total_amount:(p.amount_minor/100).toFixed(2),total_paid_amount:'0.00',status:'processing',user_id:'111',integration_data:{application_id:'222'},live_mode:true}
      let cancellations=0
      const provider={load:async()=>order,cancel:async()=>{cancellations++;order.status='canceled'}}
      const input=await payload(reference,{paymentMethod:'bank_transfer',feeMinor:0,confirmPayment:true})
      assert.equal((await editRegistrationOperations(db,slug,owner.id,input,provider)).code,409)
      assert.equal(cancellations,0);assert.equal((await read(reference)).paymentMethod,'mercado_pago')
      order.status='created'
      const changed=await editRegistrationOperations(db,slug,owner.id,input,provider)
      assert.equal(changed.code,200,JSON.stringify(changed.body));assert.equal(cancellations,1);assert.equal((await read(reference)).paymentMethod,'bank_transfer')
    })
    await t.test('legacy unpriced cash permits registration edits without inventing a charge',async()=>{
      await pool.query('UPDATE workshop_payment_settings SET on_site_price_minor=NULL WHERE workshop_id=$1',[workshop.id])
      const reference=await enroll('on_site')
      assert.equal((await read(reference)).amountMinor,null)
      const result=await edit(await payload(reference,{registrationStatus:'cancelled'}))
      assert.equal(result.code,200,JSON.stringify(result.body))
      assert.equal((await read(reference)).amountMinor,null)
    })
  }finally{await pool.end();await db.$client.end()}
})
