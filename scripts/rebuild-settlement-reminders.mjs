import pg from 'pg'
import { planSettlementReminders } from '../lib/settlement-plan.ts'

if (!process.env.DATABASE_URL || !process.env.WORKSHOP_EVENT_SLUG) throw new Error('Database and workshop slug are required')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query('BEGIN')
try {
  const result = await client.query(`
    SELECT w.id,w.starts_at,s.funds_needed_days_before,s.reminder_lead_days,s.reminder_email
    FROM workshops w JOIN events e ON e.id=w.event_id
    JOIN workshop_payment_settings s ON s.workshop_id=w.id
    WHERE e.slug=$1 FOR UPDATE OF w,s
  `, [process.env.WORKSHOP_EVENT_SLUG])
  const workshop = result.rows[0]
  if (!workshop || !workshop.reminder_email) throw new Error('Set the organizer reminder email first')
  const options = (await client.query(`
    SELECT release_days,fee_basis_points,fee_includes_tax
    FROM settlement_options WHERE workshop_id=$1 AND active=true
      AND fee_basis_points IS NOT NULL AND checked_at IS NOT NULL
  `, [workshop.id])).rows
  const plan = planSettlementReminders({
    eventStartsAt: workshop.starts_at,
    fundsBeforeDays: workshop.funds_needed_days_before,
    reminderLeadDays: workshop.reminder_lead_days,
    options: options.map(o => ({ releaseDays: o.release_days, feeBasisPoints: o.fee_basis_points, feeIncludesTax: o.fee_includes_tax })),
  })
  await client.query(`
    UPDATE settlement_reminders SET cancelled_at=now()
    WHERE workshop_id=$1 AND sent_at IS NULL AND acknowledged_at IS NULL AND cancelled_at IS NULL
  `, [workshop.id])
  for (const step of plan.steps) {
    const saved = await client.query(`
      INSERT INTO settlement_reminders
        (workshop_id,recommended_release_days,switch_at,remind_at,target_available_at,email_to)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (workshop_id,switch_at) DO UPDATE SET
        recommended_release_days=EXCLUDED.recommended_release_days,
        remind_at=EXCLUDED.remind_at,target_available_at=EXCLUDED.target_available_at,
        email_to=EXCLUDED.email_to,cancelled_at=NULL
      WHERE settlement_reminders.sent_at IS NULL AND settlement_reminders.acknowledged_at IS NULL
      RETURNING id,remind_at
    `, [workshop.id, step.recommendedReleaseDays, step.switchAt, step.remindAt, step.targetAvailableAt, workshop.reminder_email])
    if (!saved.rows[0]) continue
    const reminder = saved.rows[0]
    await client.query(`
      INSERT INTO email_outbox (dedupe_key,kind,to_email,settlement_reminder_id,next_attempt_at)
      VALUES ($1,'settlement_reminder',$2,$3,GREATEST($4::timestamptz,now()))
      ON CONFLICT (dedupe_key) DO UPDATE SET
        status='queued',to_email=EXCLUDED.to_email,next_attempt_at=EXCLUDED.next_attempt_at
      WHERE email_outbox.status <> 'sent'
    `, [`settlement:${reminder.id}`, workshop.reminder_email, reminder.id, reminder.remind_at])
  }
  await client.query('COMMIT')
  console.log(`Settlement reminders prepared: ${plan.steps.length}; target ${plan.targetAvailableAt.toISOString()}. Account changes remain manual.`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
