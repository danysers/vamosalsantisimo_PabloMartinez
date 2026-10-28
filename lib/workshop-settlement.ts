import 'server-only'
import { sql } from 'drizzle-orm'
import type { getDb } from './db'
import { recommendSettlementAt, type SettlementOption } from './settlement-plan'

type Db = ReturnType<typeof getDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type SettlementConfig = {
  fundsBeforeDays: number; reminderLeadDays: number; reminderEmail: string
  feeIncludesTax: boolean; options: Array<{ releaseDays: number; feeBasisPoints: number }>
  prepareReminders: boolean
}

async function workshop(db: Db | Tx, slug: string, lock = false) {
  const found = await db.execute(sql`SELECT w.id,w.starts_at,s.funds_needed_days_before,s.reminder_lead_days,s.reminder_email
    FROM workshops w JOIN events e ON e.id=w.event_id JOIN workshop_payment_settings s ON s.workshop_id=w.id
    WHERE e.slug=${slug} ${lock ? sql`FOR UPDATE OF w,s` : sql``}`)
  const row = found.rows[0]
  if (!row) throw new Error('Workshop not found')
  return row
}

export async function readWorkshopSettlement(db: Db, slug: string, now = new Date()) {
  const row = await workshop(db, slug)
  const result = await db.execute(sql`SELECT release_days,fee_basis_points,fee_includes_tax,active,checked_at
    FROM settlement_options WHERE workshop_id=${String(row.id)} ORDER BY release_days DESC`)
  const options = result.rows.map(option => ({ releaseDays:Number(option.release_days),
    feeBasisPoints:option.fee_basis_points == null ? null : Number(option.fee_basis_points),
    feeIncludesTax:option.fee_includes_tax === true, active:option.active === true,
    checkedAt:option.checked_at ? new Date(String(option.checked_at)).toISOString() : null }))
  const eligible = options.filter(option => option.active && option.checkedAt && option.feeBasisPoints !== null)
  let plan = null
  if (eligible.length) {
    try { plan = recommendSettlementAt({ eventStartsAt:new Date(String(row.starts_at)),
      fundsBeforeDays:Number(row.funds_needed_days_before),reminderLeadDays:Number(row.reminder_lead_days),
      options:eligible as SettlementOption[],now }) } catch { /* Incomplete/differently taxed rates cannot be compared. */ }
  }
  const history = await db.execute(sql`SELECT changes,created_at FROM audit_log
    WHERE subject_id=${String(row.id)} AND action='settlement.provider_setting_confirmed' ORDER BY created_at DESC LIMIT 1`)
  const last = history.rows[0]
  const changes = last?.changes as { releaseDays?:number; feeBasisPoints?:number } | undefined
  const recordedSetting = changes?.releaseDays != null ? { releaseDays:changes.releaseDays,
    feeBasisPoints:changes.feeBasisPoints,checkedAt:new Date(String(last.created_at)).toISOString() } : null
  const reminders = await db.execute(sql`SELECT id,recommended_release_days,switch_at,remind_at,sent_at,acknowledged_at
    FROM settlement_reminders WHERE workshop_id=${String(row.id)} AND cancelled_at IS NULL ORDER BY switch_at`)
  return { eventStartsAt:new Date(String(row.starts_at)).toISOString(),fundsBeforeDays:Number(row.funds_needed_days_before),
    reminderLeadDays:Number(row.reminder_lead_days),reminderEmail:String(row.reminder_email || ''),
    options,plan,recordedSetting,providerChangeNeeded:!!plan && recordedSetting?.releaseDays !== plan.recommendedReleaseDays,
    reminders:reminders.rows.map(reminder => ({ id:String(reminder.id),releaseDays:Number(reminder.recommended_release_days),
      switchAt:new Date(String(reminder.switch_at)).toISOString(),remindAt:new Date(String(reminder.remind_at)).toISOString(),
      sentAt:reminder.sent_at ? new Date(String(reminder.sent_at)).toISOString() : null,
      acknowledgedAt:reminder.acknowledged_at ? new Date(String(reminder.acknowledged_at)).toISOString() : null })) }
}

export async function configureWorkshopSettlement(db: Db, input: SettlementConfig & { eventSlug:string; operatorId:string | null }, now = new Date()) {
  const expected = [0,10,18,35]
  if (input.options.length !== 4 || [...input.options].sort((a,b)=>a.releaseDays-b.releaseDays).some((row,i)=>row.releaseDays!==expected[i]) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.reminderEmail)) throw new Error('Invalid settlement configuration')
  return db.transaction(async tx => {
    const row = await workshop(tx,input.eventSlug,true)
    const options = input.options.map(option=>({...option,feeIncludesTax:input.feeIncludesTax}))
    const plan = recommendSettlementAt({eventStartsAt:new Date(String(row.starts_at)),fundsBeforeDays:input.fundsBeforeDays,
      reminderLeadDays:input.reminderLeadDays,options,now})
    await tx.execute(sql`UPDATE workshop_payment_settings SET funds_needed_days_before=${input.fundsBeforeDays},
      reminder_lead_days=${input.reminderLeadDays},reminder_email=${input.reminderEmail},updated_at=${now} WHERE workshop_id=${String(row.id)}`)
    for (const option of options) await tx.execute(sql`INSERT INTO settlement_options
      (workshop_id,release_days,fee_basis_points,fee_includes_tax,active,checked_at,updated_at)
      VALUES(${String(row.id)},${option.releaseDays},${option.feeBasisPoints},${option.feeIncludesTax},true,${now},${now})
      ON CONFLICT(workshop_id,release_days) DO UPDATE SET fee_basis_points=EXCLUDED.fee_basis_points,
        fee_includes_tax=EXCLUDED.fee_includes_tax,active=true,checked_at=EXCLUDED.checked_at,updated_at=EXCLUDED.updated_at`)
    // Do not compare an old, differently scoped option left in the catalog.
    await tx.execute(sql`UPDATE settlement_options SET active=false WHERE workshop_id=${String(row.id)} AND release_days NOT IN(0,10,18,35)`)
    await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error_code='settlement_plan_replaced'
      WHERE kind='settlement_reminder' AND status IN('queued','failed') AND settlement_reminder_id IN
      (SELECT id FROM settlement_reminders WHERE workshop_id=${String(row.id)} AND sent_at IS NULL AND acknowledged_at IS NULL)`)
    await tx.execute(sql`UPDATE settlement_reminders SET cancelled_at=${now}
      WHERE workshop_id=${String(row.id)} AND sent_at IS NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL`)
    let prepared = 0
    if (input.prepareReminders) for (const step of plan.steps.filter(step=>step.switchAt > now)) {
      const saved = await tx.execute(sql`INSERT INTO settlement_reminders
        (workshop_id,recommended_release_days,switch_at,remind_at,target_available_at,email_to)
        VALUES(${String(row.id)},${step.recommendedReleaseDays},${step.switchAt},${step.remindAt},${step.targetAvailableAt},${input.reminderEmail})
        ON CONFLICT(workshop_id,switch_at) DO UPDATE SET recommended_release_days=EXCLUDED.recommended_release_days,
          remind_at=EXCLUDED.remind_at,target_available_at=EXCLUDED.target_available_at,email_to=EXCLUDED.email_to,cancelled_at=NULL
        WHERE settlement_reminders.sent_at IS NULL AND settlement_reminders.acknowledged_at IS NULL RETURNING id`)
      if (!saved.rows[0]) continue
      const reminderId = String(saved.rows[0].id)
      const message = await tx.execute(sql`INSERT INTO email_outbox(dedupe_key,kind,to_email,settlement_reminder_id,next_attempt_at)
        VALUES(${`settlement:${reminderId}`},'settlement_reminder',${input.reminderEmail},${reminderId},${new Date(Math.max(step.remindAt.getTime(),now.getTime()))})
        ON CONFLICT(dedupe_key) DO UPDATE SET status='queued',to_email=EXCLUDED.to_email,next_attempt_at=EXCLUDED.next_attempt_at
        WHERE email_outbox.status IN('queued','failed','cancelled') RETURNING id`)
      if (message.rows.length) prepared++
    }
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,changes) VALUES(${input.operatorId},
      'settlement.plan_configured',${String(row.id)},${JSON.stringify({fundsBeforeDays:input.fundsBeforeDays,
        reminderLeadDays:input.reminderLeadDays,feeIncludesTax:input.feeIncludesTax,options:input.options,prepared})}::jsonb)`)
    return { recommendedReleaseDays:plan.recommendedReleaseDays,prepared }
  })
}

export async function recordProviderSettlement(db:Db, input:{eventSlug:string;operatorId:string | null;releaseDays:number;feeBasisPoints:number}, now = new Date()) {
  return db.transaction(async tx=>{
    const row = await workshop(tx,input.eventSlug,true)
    const verified = await tx.execute(sql`SELECT fee_basis_points FROM settlement_options WHERE workshop_id=${String(row.id)}
      AND release_days=${input.releaseDays} AND active=true AND checked_at IS NOT NULL`)
    if (!verified.rows.length || Number(verified.rows[0].fee_basis_points)!==input.feeBasisPoints) throw new Error('Recheck provider costs before recording the change')
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,changes)VALUES(${input.operatorId},
      'settlement.provider_setting_confirmed',${String(row.id)},${JSON.stringify({releaseDays:input.releaseDays,feeBasisPoints:input.feeBasisPoints,source:'merchant_ui'})}::jsonb)`)
    await tx.execute(sql`UPDATE settlement_reminders SET acknowledged_at=${now},acknowledged_by=${input.operatorId}
      WHERE workshop_id=${String(row.id)} AND recommended_release_days=${input.releaseDays} AND switch_at<=${now}
        AND acknowledged_at IS NULL AND cancelled_at IS NULL`)
    return { recorded:true }
  })
}
