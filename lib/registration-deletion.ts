import 'server-only'
import { sql } from 'drizzle-orm'
import type { getDb } from './db'
import { issueAccreditationAfterApproval } from './accreditation-workflow'

export async function changeRegistrationDeletion(db: ReturnType<typeof getDb>, input: {
  eventSlug: string; operatorId: string; reference: string; operation: 'delete' | 'restore' | 'archive' | 'unarchive'; confirmation?: string
}) {
  if (input.operation === 'delete' && input.confirmation?.trim().toUpperCase() !== 'ELIMINAR') {
    return { code: 400, body: { error: 'Escribí ELIMINAR para confirmar.' } }
  }
  return db.transaction(async tx => {
    const workshop = await tx.execute(sql`SELECT w.id,w.capacity,w.starts_at FROM workshops w JOIN events e ON e.id=w.event_id
      WHERE e.slug=${input.eventSlug} FOR UPDATE OF w`)
    const w = workshop.rows[0]
    if (!w) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    const found = await tx.execute(sql`SELECT r.*,i.document_number,i.registration_id AS intake_id FROM registrations r
      LEFT JOIN registration_intakes i ON i.registration_id=r.id
      WHERE r.reference=${input.reference} AND r.workshop_id=${String(w.id)} FOR UPDATE OF r`)
    const row = found.rows[0]
    if (!row) return { code: 404, body: { error: 'Inscripción no encontrada.' } }
    const archiveOperation = input.operation === 'archive' || input.operation === 'unarchive'
    const hiding = input.operation === 'delete' || input.operation === 'archive'
    const hidden = archiveOperation ? row.archived_at != null : row.deleted_at != null
    const result = { ok: true, deleted: archiveOperation ? row.deleted_at != null : hiding,
      archived: archiveOperation ? hiding : row.archived_at != null }
    if (hidden === hiding) return { code: 200, body: { ...result, replayed: true } }
    if (hiding) {
      const admitted = await tx.execute(sql`SELECT 1 FROM check_ins WHERE registration_id=${String(row.id)}
        AND registration_is_live(${String(row.id)}) LIMIT 1`)
      if (admitted.rows.length) return { code: 409, body: { error: 'Esta persona ya ingresó al taller. Conservamos su registro para el control de asistencia.' } }
    }
    if (!hiding) {
      // A restored trial remains historical. A real record cannot displace a
      // newer enrollment or overbook a seat released while it was deleted.
      const live = await tx.execute(sql`SELECT registration_is_live(${String(row.id)}) AS live`)
      const otherHidden = archiveOperation ? row.deleted_at != null : row.archived_at != null
      if (live.rows[0]?.live && !otherHidden && row.status !== 'cancelled') {
        const duplicate = await tx.execute(sql`SELECT r.id FROM registrations r
          LEFT JOIN registration_intakes i ON i.registration_id=r.id
          WHERE r.workshop_id=${String(w.id)} AND r.id<>${String(row.id)} AND registration_is_current(r.id)
            AND r.status<>'cancelled' AND (
              (${row.document_number != null} AND i.document_number=${row.document_number == null ? '' : String(row.document_number)}) OR
              (r.normalized_name=${String(row.normalized_name)} AND
                (r.normalized_email=${String(row.normalized_email)} OR r.normalized_phone=${String(row.normalized_phone)}))) LIMIT 1`)
        if (duplicate.rows.length) return { code: 409, body: { error: 'Ya existe otra inscripción activa de esta persona. Revisala antes de restaurar.' } }
        const capacity = await tx.execute(sql`SELECT
          (${row.status === 'confirmed'} OR EXISTS(SELECT 1 FROM reservations WHERE registration_id=${String(row.id)}
            AND (status='used' OR (status='held' AND expires_at>now()))) OR
            EXISTS(SELECT 1 FROM payment_attempts p JOIN payment_allocations a ON a.attempt_id=p.id
              WHERE a.registration_id=${String(row.id)} AND p.status='approved' AND p.paid_amount_minor>=p.amount_minor)) AS needs_seat,
          (SELECT count(*)::int FROM registrations r
            WHERE r.workshop_id=${String(w.id)} AND registration_is_current(r.id) AND
              (r.status='confirmed' OR EXISTS(SELECT 1 FROM reservations h WHERE h.registration_id=r.id
                AND (h.status='used' OR (h.status='held' AND h.expires_at>now()))))) AS occupied`)
        if (w.capacity != null && capacity.rows[0]?.needs_seat && Number(capacity.rows[0].occupied) >= Number(w.capacity)) {
          return { code: 409, body: { error: 'No quedan lugares disponibles para restaurar esta inscripción.' } }
        }
      }
    }
    if (archiveOperation) await tx.execute(hiding
      ? sql`UPDATE registrations SET archived_at=now(),archived_by=${input.operatorId},updated_at=now() WHERE id=${String(row.id)}`
      : sql`UPDATE registrations SET archived_at=NULL,archived_by=NULL,updated_at=now() WHERE id=${String(row.id)}`)
    else await tx.execute(input.operation === 'delete'
      ? sql`UPDATE registrations SET deleted_at=now(),deleted_by=${input.operatorId},updated_at=now() WHERE id=${String(row.id)}`
      : sql`UPDATE registrations SET deleted_at=NULL,deleted_by=NULL,updated_at=now() WHERE id=${String(row.id)}`)
    if (hiding) {
      await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error_code=${archiveOperation ? 'registration_archived' : 'registration_deleted'}
        WHERE registration_id=${String(row.id)} AND status IN ('queued','failed','sending')`)
    } else {
      const paid = await tx.execute(sql`SELECT registration_has_approved_payment(${String(row.id)}) AS paid`)
      if (paid.rows[0]?.paid && row.intake_id && ['pending','confirmed'].includes(String(row.status)) &&
          new Date(String(w.starts_at)).getTime() + 86_400_000 > Date.now()) {
        const issued = await issueAccreditationAfterApproval(tx, { registrationId: String(row.id), eventSlug: input.eventSlug, operatorId: input.operatorId })
        if (issued.code !== 200 && issued.code !== 201) throw new Error('Restored accreditation unavailable')
        await tx.execute(sql`UPDATE reservations SET status='used' WHERE registration_id=${String(row.id)}`)
      }
      await tx.execute(sql`SELECT advance_workshop_lot(${String(w.id)})`)
    }
    const action = { delete: 'registration.deleted', restore: 'registration.restored',
      archive: 'registration.archived', unarchive: 'registration.unarchived' }[input.operation]
    await tx.execute(sql`INSERT INTO audit_log(actor_id,action,subject_id,changes)
      VALUES(${input.operatorId},${action},
        ${String(row.id)},${JSON.stringify({ recoverable: true })}::jsonb)`)
    return { code: 200, body: result }
  })
}
