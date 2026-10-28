import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {register} from 'node:module'
import pg from 'pg'
register('./ts-server-loader.mjs',import.meta.url)

test('verified account costs produce an auditable plan and opt-in, deduplicated reminders',{
  skip:!process.env.DATABASE_URL&&'Requires a disposable migrated database',
},async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL})
  const {getDb}=await import('../lib/db.ts')
  const {configureWorkshopSettlement,readWorkshopSettlement,recordProviderSettlement}=await import('../lib/workshop-settlement.ts')
  const db=getDb(),slug='settlement-test-'+randomUUID(),now=new Date('2026-10-27T15:00:00Z')
  try {
    const event=(await pool.query('INSERT INTO events(slug,title,starts_at)VALUES($1,$2,$3)RETURNING id',[slug,'Settlement test','2026-12-19T18:00:00Z'])).rows[0]
    const workshop=(await pool.query('INSERT INTO workshops(event_id,starts_at)VALUES($1,$2)RETURNING id',[event.id,'2026-12-19T18:00:00Z'])).rows[0]
    await pool.query('INSERT INTO workshop_payment_settings(workshop_id,reminder_email)VALUES($1,$2)',[workshop.id,'organizer@example.invalid'])
    const initial=await readWorkshopSettlement(db,slug,now)
    assert.equal(initial.plan,null)
    const input={eventSlug:slug,operatorId:null,fundsBeforeDays:3,reminderLeadDays:3,reminderEmail:'organizer@example.invalid',feeIncludesTax:false,
      prepareReminders:false,options:[{releaseDays:35,feeBasisPoints:153},{releaseDays:18,feeBasisPoints:348},{releaseDays:10,feeBasisPoints:450},{releaseDays:0,feeBasisPoints:645}]}
    assert.deepEqual(await configureWorkshopSettlement(db,input,now),{recommendedReleaseDays:35,prepared:0})
    const saved=await readWorkshopSettlement(db,slug,now)
    assert.equal(saved.plan.targetAvailableAt.toISOString(),'2026-12-16T03:00:00.000Z')
    assert.equal(saved.plan.feeBasisPoints,153)
    assert.equal(saved.providerChangeNeeded,true,'planning does not claim the merchant settings were changed')
    assert.equal(saved.reminders.length,0,'saving fees alone never schedules email')
    await assert.rejects(recordProviderSettlement(db,{eventSlug:slug,operatorId:null,releaseDays:35,feeBasisPoints:645},now),/Recheck provider costs/)
    await recordProviderSettlement(db,{eventSlug:slug,operatorId:null,releaseDays:35,feeBasisPoints:153},now)
    assert.equal((await readWorkshopSettlement(db,slug,now)).providerChangeNeeded,false)
    assert.equal((await readWorkshopSettlement(db,slug,new Date('2026-11-11T03:00:00Z'))).providerChangeNeeded,true)
    assert.equal((await configureWorkshopSettlement(db,{...input,prepareReminders:true},now)).prepared,3)
    await configureWorkshopSettlement(db,{...input,prepareReminders:true},now)
    const count=await pool.query(`SELECT count(*)::int AS n FROM email_outbox WHERE settlement_reminder_id IN
      (SELECT id FROM settlement_reminders WHERE workshop_id=$1)`,[workshop.id])
    assert.equal(count.rows[0].n,3,'rebuilding never duplicates a notification')
    await configureWorkshopSettlement(db,{...input,prepareReminders:false},now)
    assert.equal((await readWorkshopSettlement(db,slug,now)).reminders.length,0)
    const queued=await pool.query(`SELECT count(*)::int AS n FROM email_outbox WHERE status IN('queued','failed') AND settlement_reminder_id IN
      (SELECT id FROM settlement_reminders WHERE workshop_id=$1)`,[workshop.id])
    assert.equal(queued.rows[0].n,0,'turning notifications off cancels pending mail')
    await assert.rejects(configureWorkshopSettlement(db,{...input,options:[input.options[0],input.options[0],...input.options.slice(2)]},now),/Invalid settlement/)
    const late=new Date('2026-11-20T03:00:00Z')
    assert.equal((await configureWorkshopSettlement(db,{...input,prepareReminders:true},late)).prepared,2,'no historic changes are emailed on activation')
    const audit=await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE subject_id=$1 AND action='settlement.plan_configured'",[workshop.id])
    assert.ok(audit.rows[0].n>=4)
  } finally {await pool.end()}
})
