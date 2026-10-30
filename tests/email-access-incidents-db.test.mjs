import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { register } from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs',import.meta.url)

test('personal email links, existing credentials and bounded diagnostics integrate without real SMTP or payments',{
  skip:!process.env.DATABASE_URL||process.env.RUN_PAYMENT_PROOF_DB_TEST!=='1'?'Requires a disposable migrated PostgreSQL database':false,
},async t=>{
  const [{getDb},{enrollWorkshop},{verifyManualPayment},{reviewAssistance},{processEmailJob},{readWorkshopEmailLink},tokens,proofs,incidents]=await Promise.all([
    import('../lib/db.ts'),import('../lib/workshop-enrollment.ts'),import('../lib/accreditation-workflow.ts'),import('../lib/assistance-review.ts'),
    import('../scripts/email-worker.mjs'),import('../lib/workshop-email-access.ts'),import('../lib/email-link-token.ts'),import('../lib/payment-proof.ts'),import('../lib/operational-incidents.ts'),
  ])
  const slug='email-access-'+randomUUID(),pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),db=getDb()
  Object.assign(process.env,{WORKSHOP_EVENT_SLUG:slug,WORKSHOP_CHECKOUT_TOKEN_KEY:randomBytes(48).toString('base64url'),
    ACCREDITATION_TOKEN_KEY:randomBytes(32).toString('base64url'),ACCREDITATION_TOKEN_KEY_ID:'email-access-test',
    REGISTRATION_EMAIL_READY:'1',MP_ENVIRONMENT:'production',SITE_ORIGIN:'https://vamosalsantisimo.com'})
  const messages=[],transport={sendMail:async message=>{messages.push(message);return {accepted:[message.to]}}}
  const emailUrl=(message,purpose)=>new URL(message.text.match(new RegExp('https://[^\\s]+#'+purpose+'=[^\\s]+'))?.[0]||assert.fail('Missing '+purpose+' email link'))
  const requestFrom=url=>({reference:url.searchParams.get('reference'),token:new URLSearchParams(url.hash.slice(1)).get(url.pathname.endsWith('comprobante')?'proof':'pass'),purpose:url.pathname.endsWith('comprobante')?'proof':'pass'})
  try {
    const event=(await pool.query("INSERT INTO events(slug,title,starts_at) VALUES($1,'Email access test','2026-12-19T18:00:00Z') RETURNING id",[slug])).rows[0]
    const workshop=(await pool.query("INSERT INTO workshops(event_id,starts_at,registration_open,live_started_at) VALUES($1,'2026-12-19T18:00:00Z',true,now()-interval '1 day') RETURNING id",[event.id])).rows[0]
    await pool.query('INSERT INTO workshop_lots(workshop_id,number,amount_minor) VALUES($1,1,1000000)',[workshop.id])
    await pool.query("INSERT INTO workshop_payment_settings(workshop_id,transfer_alias,transfer_provider,proof_whatsapp_e164,on_site_price_minor,reminder_email) VALUES($1,'test.alias','Banco','5493704258770',2000000,'organizer@example.invalid')",[workshop.id])
    const operator=(await pool.query("INSERT INTO admin_users(email,role) VALUES($1,'configuration') RETURNING id",['access-'+randomUUID()+'@example.invalid'])).rows[0]
    async function person(index,method='bank_transfer',assistance=false){
      const result=await enrollWorkshop({firstName:'Persona'+index,lastName:'Prueba',documentNumber:'9988000'+index,email:'access'+index+'@example.invalid',phone:'+549370400100'+index,
        birthDate:'1990-01-01',ecclesialState:'laico',country:'Argentina',province:'Formosa',locality:'Formosa',paymentDifficulty:assistance,
        paymentDifficultyNotes:assistance?'Ayuda ficticia descartable':'',...(assistance?{}:{paymentMethod:method}),creationKey:randomUUID()})
      assert.equal(result.code,201,JSON.stringify(result.body))
      return (await pool.query('SELECT * FROM registrations WHERE reference=$1',[result.body.reference])).rows[0]
    }
    async function send(registration,kind){
      const job=(await pool.query('SELECT * FROM email_outbox WHERE registration_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 1',[registration.id,kind])).rows[0]
      assert.ok(job,kind);assert.equal(await processEmailJob(pool,transport,job,'sender@example.invalid'),'sent');return messages.at(-1)
    }
    const bank=await person(1)
    const registrationMessage=await send(bank,'registration_received'),proofUrl=emailUrl(registrationMessage,'proof'),access=requestFrom(proofUrl)
    assert.equal(proofUrl.origin,process.env.SITE_ORIGIN)
    assert.equal((await readWorkshopEmailLink(access)).canUpload,true)
    assert.equal(await readWorkshopEmailLink({...access,purpose:'pass'}),null)
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
    assert.equal((await proofs.submitPaymentProof({reference:bank.reference,accessToken:access.token,emailLink:true,filename:'private-name.png',bytes:png})).code,201)
    assert.equal((await readWorkshopEmailLink(access)).proofSubmitted,true)
    await assert.rejects(import('../lib/workshop-payments.ts').then(m=>m.startWorkshopCheckout({reference:bank.reference,accessToken:access.token})))
    const approved=await verifyManualPayment(db,{reference:bank.reference,eventSlug:slug,operatorId:operator.id,note:'Prueba descartable',manualReference:'TEST-'+randomUUID()})
    assert.equal(approved.code,200)
    const before=(await pool.query('SELECT id,token_hash FROM accreditation_credentials WHERE registration_id=$1',[bank.id])).rows
    const confirmation=await send(bank,'accreditation_ready'),passAccess=requestFrom(emailUrl(confirmation,'pass'))
    const pass=await readWorkshopEmailLink(passAccess)
    assert.equal(pass.passAvailable,true);assert.match(pass.accreditation.qrDataUrl,/^data:image\/png;base64,/)
    assert.deepEqual((await pool.query('SELECT id,token_hash FROM accreditation_credentials WHERE registration_id=$1',[bank.id])).rows,before)
    assert.equal((await proofs.submitPaymentProof({reference:bank.reference,accessToken:passAccess.token,emailLink:true,filename:'private-name.png',bytes:png})).code,404)
    const {decryptAccreditationQr,hashAccreditationQr}=await import('../lib/accreditation-token.ts')
    const credential=(await pool.query('SELECT * FROM accreditation_credentials WHERE registration_id=$1',[bank.id])).rows[0]
    const qr=decryptAccreditationQr({tokenCiphertext:credential.token_ciphertext,tokenIv:credential.token_iv,tokenAuthTag:credential.token_auth_tag},process.env.ACCREDITATION_TOKEN_KEY,bank.id,credential.version)
    const QRCode=(await import('qrcode')).default
    assert.equal(pass.accreditation.qrDataUrl,await QRCode.toDataURL(qr,{width:480,margin:2,errorCorrectionLevel:'M'}))
    assert.equal(hashAccreditationQr(qr),credential.token_hash)

    const aid=await person(2,'bank_transfer',true)
    assert.equal((await reviewAssistance(db,{registrationId:aid.id,eventSlug:slug,operatorId:operator.id,decision:'approved',note:'Prueba ayuda'})).code,200)
    const aidAccess=requestFrom(emailUrl(await send(aid,'accreditation_ready'),'pass'))
    assert.equal((await readWorkshopEmailLink(aidAccess)).passAvailable,true)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_attempts WHERE registration_id=$1',[aid.id])).rows[0].n,0)

    const cash=await person(3,'on_site'),cashReceipt=await send(cash,'registration_received')
    assert.equal((await readWorkshopEmailLink(requestFrom(emailUrl(cashReceipt,'proof')))).canUpload,false)
    assert.equal((await verifyManualPayment(db,{reference:cash.reference,eventSlug:slug,operatorId:operator.id,note:'Efectivo ficticio',manualReference:'CASH-'+randomUUID()})).code,200)
    const cashMail=await send(cash,'accreditation_ready')
    assert.doesNotMatch(cashMail.text,/#pass=|Abrí tu volante personal/)
    assert.ok(cashMail.attachments[0].content.length>0,'confirmed cash keeps its emailed QR; only the 3D pass is excluded')
    const cashCredential=(await pool.query('SELECT id FROM accreditation_credentials WHERE registration_id=$1',[cash.id])).rows[0]
    const forgedCash=tokens.emailLinkToken('pass',{id:cash.id,reference:cash.reference,creationKey:cash.creation_key,email:cash.email+'|',credentialId:cashCredential.id},new Date('2026-12-20T18:00:00Z'))
    assert.equal(await readWorkshopEmailLink({reference:cash.reference,token:forgedCash,purpose:'pass'}),null)

    await t.test('diagnostics are correlated, idempotent, private and bounded',async()=>{
      const correlationId=randomUUID(),incident={correlationId,operation:'proof_upload',code:'upload_network',fileType:'image/png',fileSize:100,outcome:'saved'}
      assert.equal(await incidents.recordIncident(incident,'client',{reference:bank.reference,token:access.token,purpose:'proof'}),true)
      assert.equal(await incidents.recordIncident(incident,'client',{reference:bank.reference,token:access.token,purpose:'proof'}),true)
      let rows=(await pool.query('SELECT * FROM operational_incidents WHERE correlation_id=$1',[correlationId])).rows
      assert.equal(rows.length,1);assert.equal(rows[0].registration_id,bank.id)
      assert.doesNotMatch(JSON.stringify(rows[0].details),/private-name|token|email|reference|bytes/)
      assert.equal((await incidents.readIncidents(slug,bank.reference)).rows.length,1)
      assert.equal((await incidents.readIncidents('unrelated-event')).rows.length,0)
      const fakeId=randomUUID()
      await incidents.recordIncident({...incident,correlationId:fakeId},'client',{reference:bank.reference,token:'x'.repeat(43)})
      assert.equal((await pool.query('SELECT registration_id FROM operational_incidents WHERE correlation_id=$1',[fakeId])).rows[0].registration_id,null)
      const burst=await Promise.all(Array.from({length:200},()=>incidents.recordIncident({...incident,correlationId:randomUUID()},'server')))
      assert.equal(burst.filter(Boolean).length,1,'a concurrent diagnostic burst never queues multiple database writers')
      for(let i=0;i<60;i++)assert.equal(incidents.admitIncidentReport(),true)
      assert.equal(incidents.admitIncidentReport(),false,'reject excess intake before asking PostgreSQL for a connection')
      await pool.query("INSERT INTO operational_incidents(event_slug,correlation_id,source,operation,code,created_at) VALUES($1,$2,'client','page','runtime_exception',now()-interval '31 days')",[slug,randomUUID()])
      await pool.query("INSERT INTO operational_incidents(event_slug,correlation_id,source,operation,code) SELECT $1,gen_random_uuid(),'client','page','runtime_exception' FROM generate_series(1,5010)",[slug])
      await incidents.recordIncident({...incident,correlationId:randomUUID()},'server')
      assert.ok((await pool.query('SELECT count(*)::int AS n FROM operational_incidents')).rows[0].n<=5000)
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM operational_incidents WHERE created_at<now()-interval '30 days'")).rows[0].n,0)
    })
    await pool.query('UPDATE registrations SET email=$1 WHERE id=$2',['changed@example.invalid',bank.id])
    assert.equal(await readWorkshopEmailLink(access),null)
    assert.equal(await readWorkshopEmailLink(passAccess),null)
    await pool.query('UPDATE accreditation_credentials SET revoked_at=now(),revocation_reason=$1 WHERE registration_id=$2',['Prueba revocación',aid.id])
    assert.equal(await readWorkshopEmailLink(aidAccess),null)
  } finally {await pool.end()}
})
