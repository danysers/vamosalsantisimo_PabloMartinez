import 'server-only'
import { sql } from 'drizzle-orm'
import type { getDb } from './db'
import { normalizeIdentity } from './registration-policy'
import { personalLabels, registrationEditSchema, type PersonalFields } from './registration-edit-policy'

type Db = ReturnType<typeof getDb>
const versionSql = sql`md5(r.updated_at::text || '|' || COALESCE(i.updated_at::text,''))`
const dateString = (value: unknown) => value == null ? null : new Date(String(value)).toISOString()
const string = (value: unknown) => value == null ? '' : String(value)

function personal(row: Record<string, unknown>): PersonalFields {
  return { firstName: string(row.first_name), lastName: string(row.last_name), documentNumber: string(row.document_number),
    nickname: string(row.nickname), email: string(row.email), phone: string(row.phone),
    birthDate: string(row.birth_date).slice(0, 10), country: string(row.country), province: string(row.province), locality: string(row.locality),
    prayerGroup: string(row.prayer_group), movement: string(row.movement), occupation: string(row.occupation),
    ecclesialState: (row.ecclesial_state || '') as PersonalFields['ecclesialState'] }
}

export async function readAdminRegistration(db: Db, eventSlug: string, reference: string) {
  const found = await db.execute(sql`SELECT r.id,r.reference,r.name,r.email,r.accreditation_email,r.phone,r.status,r.created_at AS registered_at,r.updated_at,
    r.deleted_at,r.archived_at,i.*,i.birth_date::text AS birth_date,${versionSql} AS version,
    registration_is_current(r.id) AS current
    FROM registrations r JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
    LEFT JOIN registration_intakes i ON i.registration_id=r.id
    WHERE e.slug=${eventSlug} AND r.reference=${reference} LIMIT 1`)
  const row = found.rows[0]
  if (!row) return null
  const id = String(row.id)
  const [payments, proofs, credentials, emails, history, bounceSync] = await Promise.all([
    db.execute(sql`SELECT p.id,p.status,p.source,p.created_at,p.manual_verified_at,p.manual_reference,
      COALESCE(a.due_amount_minor,p.amount_minor) AS amount_minor,p.amount_minor AS transaction_amount_minor,
      p.paid_amount_minor,(SELECT count(*)::int FROM payment_allocations x WHERE x.attempt_id=p.id) AS members
      FROM payment_attempts p LEFT JOIN payment_allocations a ON a.attempt_id=p.id AND a.registration_id=${id}
      WHERE a.id IS NOT NULL OR (p.registration_id=${id} AND NOT EXISTS(SELECT 1 FROM payment_allocations x WHERE x.attempt_id=p.id))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 10`),
    db.execute(sql`SELECT id,filename,uploaded_at FROM payment_proofs WHERE registration_id=${id} ORDER BY uploaded_at DESC LIMIT 10`),
    db.execute(sql`SELECT (registration_is_current(${id}) AND EXISTS(SELECT 1 FROM registrations WHERE id=${id} AND status='confirmed') AND EXISTS(SELECT 1 FROM accreditation_credentials WHERE registration_id=${id} AND revoked_at IS NULL AND expires_at>now())) AS issued,
      (SELECT scanned_at FROM check_ins WHERE registration_id=${id} LIMIT 1) AS admitted_at,
      (SELECT status FROM assistance_requests WHERE registration_id=${id} LIMIT 1) AS assistance_status`),
    db.execute(sql`SELECT m.id,m.kind,m.status,m.to_email,m.sent_at,m.created_at,m.last_error_code,m.manual_resend,
      d.action AS delivery_action,d.enhanced_status,d.reason_code,d.diagnostic,d.reported_at
      FROM email_outbox m LEFT JOIN LATERAL(SELECT action,enhanced_status,reason_code,diagnostic,reported_at FROM email_delivery_reports
        WHERE email_id=m.id ORDER BY (action='failed') DESC,reported_at DESC LIMIT 1)d ON true
      WHERE m.registration_id=${id} ORDER BY m.created_at DESC LIMIT 20`),
    db.execute(sql`SELECT l.reason,l.changes,l.created_at,COALESCE(u.name,'Operador') AS operator_name FROM audit_log l
      LEFT JOIN admin_users o ON o.id=l.actor_id LEFT JOIN "user" u ON u.id=o.auth_user_id
      WHERE l.subject_id=${id} AND l.action IN ('registration.updated','accreditation.email_recipient_updated','accreditation.email_resent') ORDER BY l.created_at DESC LIMIT 10`),
    db.execute(sql`SELECT checked_at,last_error_code FROM email_bounce_sync WHERE id=1`),
  ])
  return { reference: String(row.reference), name: String(row.name), status: String(row.status),
    version: String(row.version), editable: row.current === true && !!row.registration_id,
    archived: !!row.archived_at, deleted: !!row.deleted_at, createdAt: dateString(row.registered_at),
    fields: personal(row), paymentDifficulty: !!row.payment_difficulty, paymentDifficultyNotes: string(row.payment_difficulty_notes),
    payments: payments.rows.map(p => ({ id: String(p.id), status: String(p.status), source: String(p.source),
      amountMinor: p.amount_minor == null ? null : Number(p.amount_minor), transactionAmountMinor: p.transaction_amount_minor == null ? null : Number(p.transaction_amount_minor),
      paidAmountMinor: Number(p.paid_amount_minor), members: Number(p.members), createdAt: dateString(p.created_at),
      verifiedAt: dateString(p.manual_verified_at), manualReference: string(p.manual_reference) })),
    proofs: proofs.rows.map(p => ({ id: String(p.id), filename: string(p.filename), uploadedAt: dateString(p.uploaded_at) })),
    credential: { issued: credentials.rows[0]?.issued === true, admittedAt: dateString(credentials.rows[0]?.admitted_at),
      assistanceStatus: string(credentials.rows[0]?.assistance_status) },
    accreditationEmail: string(row.accreditation_email),
    bounceSync: { checkedAt: dateString(bounceSync.rows[0]?.checked_at), error: !!bounceSync.rows[0]?.last_error_code,
      stale: !bounceSync.rows[0]?.checked_at || Date.now() - new Date(String(bounceSync.rows[0].checked_at)).getTime() > 15 * 60_000 },
    emails: emails.rows.map(e => ({ id: String(e.id), kind: String(e.kind), status: String(e.status), toEmail: String(e.to_email), sentAt: dateString(e.sent_at), createdAt: dateString(e.created_at),
      manualResend: !!e.manual_resend, errorCode: string(e.last_error_code), deliveryAction: string(e.delivery_action), enhancedStatus: string(e.enhanced_status),
      reasonCode: string(e.reason_code), diagnostic: string(e.diagnostic), reportedAt: dateString(e.reported_at) })),
    history: history.rows.map(h => ({ reason: string(h.reason), changes: h.changes as { fields?: string[] }, createdAt: dateString(h.created_at), operator: string(h.operator_name) })),
  }
}
export type AdminRegistration = NonNullable<Awaited<ReturnType<typeof readAdminRegistration>>>

export async function editAdminRegistration(db: Db, eventSlug: string, operatorId: string, data: unknown) {
  const parsed = registrationEditSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = personalLabels[String(issue?.path[0]) as keyof PersonalFields]
    return { code: 400, body: { error: issue?.code === 'custom' ? issue.message : field ? `Revisá el campo ${field.toLowerCase()}.` : 'Revisá los datos y el motivo de la corrección.' } }
  }
  const input = parsed.data
  const identity = normalizeIdentity({ name: `${input.firstName} ${input.lastName}`, email: input.email, phone: input.phone })
  return db.transaction(async tx => {
    // Same ordering/lock as enrollment, groups and archival; prevents concurrent
    // identity changes or new enrollments passing the duplicate check together.
    const workshop = await tx.execute(sql`SELECT w.id FROM workshops w JOIN events e ON e.id=w.event_id WHERE e.slug=${eventSlug} FOR UPDATE OF w`)
    if (!workshop.rows[0]) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    const found = await tx.execute(sql`SELECT r.id,r.email,r.phone,i.*,i.birth_date::text AS birth_date,${versionSql} AS version,registration_is_current(r.id) AS current
      FROM registrations r LEFT JOIN registration_intakes i ON i.registration_id=r.id
      WHERE r.workshop_id=${String(workshop.rows[0].id)} AND r.reference=${input.reference} FOR UPDATE OF r`)
    const row = found.rows[0]
    if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    if (!row.current || !row.registration_id) return { code: 409, body: { error: 'Este registro es de consulta. Restauralo o desarchivalo antes de editar.' } }
    if (row.version !== input.version) return { code: 409, body: { error: 'La inscripción cambió mientras la editabas. Recargá la ficha antes de guardar.', conflict: true } }
    const duplicate = await tx.execute(sql`SELECT 1 FROM registrations r LEFT JOIN registration_intakes i ON i.registration_id=r.id
      WHERE r.workshop_id=${String(workshop.rows[0].id)} AND r.id<>${String(row.id)} AND registration_is_current(r.id)
      AND ((${input.documentNumber !== ''} AND i.document_number=${input.documentNumber}) OR
        (r.normalized_name=${identity.name} AND (r.normalized_email=${identity.email} OR r.normalized_phone=${identity.phone}))) LIMIT 1`)
    if (duplicate.rows.length) return { code: 409, body: { error: 'Los datos coinciden con otra inscripción activa. Revisá el D.N.I. y el contacto.' } }
    const emailChanged = String(row.email).trim().toLowerCase() !== input.email
    if (emailChanged && !input.confirmEmailChange) return { code: 400, body: { error: 'Confirmá la corrección de la dirección de correo.' } }
    if (emailChanged) {
      const jobs = await tx.execute(sql`SELECT status FROM email_outbox WHERE registration_id=${String(row.id)}
        AND lower(to_email)=lower(${String(row.email)}) AND status IN ('queued','failed','sending')
        AND kind IN ('registration_received','payment_instructions','group_payment_notice','accreditation_ready','registration_access','assistance_approved','assistance_declined') FOR UPDATE`)
      if (jobs.rows.some(job => job.status === 'sending')) return { code: 409, body: { error: 'Hay un correo en envío. Esperá unos minutos antes de corregir la dirección.' } }
      await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error_code='recipient_corrected_by_operator'
        WHERE registration_id=${String(row.id)} AND lower(to_email)=lower(${String(row.email)}) AND status IN ('queued','failed')
        AND kind IN ('registration_received','payment_instructions','group_payment_notice','accreditation_ready','registration_access','assistance_approved','assistance_declined')`)
      await tx.execute(sql`UPDATE registration_recoveries SET consumed_at=now(),code_encrypted='' WHERE registration_id=${String(row.id)} AND consumed_at IS NULL`)
    }
    // Payment records, provider data, access keys, QR credentials and statuses
    // are deliberately outside the editable schema and are never updated here.
    await tx.execute(sql`UPDATE registrations SET name=${`${input.firstName} ${input.lastName}`},normalized_name=${identity.name},
      email=${input.email},normalized_email=${identity.email},phone=${input.phone},normalized_phone=${identity.phone},updated_at=now()
      WHERE id=${String(row.id)}`)
    const optional = (value: string) => value || null
    await tx.execute(sql`UPDATE registration_intakes SET first_name=${input.firstName},last_name=${input.lastName},document_number=${optional(input.documentNumber)},
      nickname=${optional(input.nickname)},country=${optional(input.country)},province=${optional(input.province)},locality=${optional(input.locality)},
      birth_date=${input.birthDate},prayer_group=${optional(input.prayerGroup)},movement=${optional(input.movement)},
      ecclesial_state=${input.ecclesialState},occupation=${optional(input.occupation)},updated_at=now() WHERE registration_id=${String(row.id)}`)
    const previous = personal(row)
    const fields = (Object.keys(previous) as (keyof PersonalFields)[]).filter(key => previous[key] !== input[key])
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,reason,changes)
      VALUES(${operatorId},'registration.updated',${String(row.id)},${input.reason},${JSON.stringify({ fields, emailChanged })}::jsonb)`)
    return { code: 200, body: { ok: true, emailChanged } }
  })
}
