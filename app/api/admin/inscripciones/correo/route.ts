import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { manageAccreditationEmail } from '../../../../../lib/accreditation-email-admin'
import { readSmallJson } from '../../../../../lib/read-small-json'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    let body: unknown
    try { body = await readSmallJson(request, 4096) } catch { return privateReply({ error: 'Solicitud inválida o demasiado grande.' }, 400) }
    const result = await manageAccreditationEmail(getDb(), operator.eventSlug, operator.operatorId, body)
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(JSON.stringify({ event: 'admin_accreditation_email_unavailable', correlation }))
    return privateReply({ error: 'No pudimos confirmar la operación. Recargá la ficha antes de reintentar.', correlation }, 503)
  }
}
