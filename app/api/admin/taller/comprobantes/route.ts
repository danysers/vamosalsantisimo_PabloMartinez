import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
    if ('response' in operator) return operator.response
    const result = await getDb().execute(sql`
      SELECT proof.id,proof.uploaded_at,proof.filename,proof.size_bytes,
        r.reference,r.name,r.status AS registration_status,NOT registration_is_current(r.id) AS historical,
        p.status AS payment_status,p.amount_minor
      FROM payment_proofs proof
      JOIN payment_attempts p ON p.id=proof.payment_attempt_id
      JOIN registrations r ON r.id=proof.registration_id
      JOIN workshops w ON w.id=r.workshop_id JOIN events e ON e.id=w.event_id
      WHERE e.slug=${operator.eventSlug} AND r.deleted_at IS NULL AND r.archived_at IS NULL
      ORDER BY proof.uploaded_at DESC LIMIT 100
    `)
    return privateReply({ proofs: result.rows }, 200)
  } catch {
    const correlation = randomUUID()
    console.error(`proof_list_failed correlation=${correlation}`)
    return privateReply({ error: 'No pudimos consultar los comprobantes.', correlation }, 503)
  }
}
