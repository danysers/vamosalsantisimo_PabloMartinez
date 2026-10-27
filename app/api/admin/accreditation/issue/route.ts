import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { issueAccreditation } from '../../../../../lib/accreditation-workflow'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { registrations } from '../../../../../lib/schema'

export const runtime = 'nodejs'
const payload = z.object({ reference: z.string().trim().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/) }).strict()

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = payload.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({ error: 'Referencia inválida.' }, 400)
    const db = getDb()
    const [registration] = await db.select({ id: registrations.id }).from(registrations).where(eq(registrations.reference, parsed.data.reference)).limit(1)
    if (!registration) return privateReply({ error: 'Inscripción no encontrada.' }, 404)
    const result = await issueAccreditation(db, { registrationId: registration.id, eventSlug: operator.eventSlug, operatorId: operator.operatorId })
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`accreditation_issue_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo emitir la acreditación.', correlation }, 503)
  }
}
