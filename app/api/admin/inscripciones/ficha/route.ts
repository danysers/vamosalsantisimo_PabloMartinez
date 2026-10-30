import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { editAdminRegistration, readAdminRegistration } from '../../../../../lib/registration-admin'
import { readSmallJson } from '../../../../../lib/read-small-json'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
    if ('response' in operator) return operator.response
    const reference = request.nextUrl.searchParams.get('reference') || ''
    if (!/^[A-Za-z0-9_-]{10,80}$/.test(reference)) return privateReply({ error: 'Referencia inválida.' }, 400)
    const registration = await readAdminRegistration(getDb(), operator.eventSlug, reference)
    return registration ? privateReply({ registration }, 200) : privateReply({ error: 'Inscripción no encontrada.' }, 404)
  } catch { return unavailable() }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    let body: unknown
    try { body = await readSmallJson(request, 12 * 1024) } catch { return privateReply({ error: 'Solicitud inválida o demasiado grande.' }, 400) }
    const result = await editAdminRegistration(getDb(), operator.eventSlug, operator.operatorId, body)
    return privateReply(result.body, result.code)
  } catch { return unavailable() }
}

function unavailable() {
  const correlation = randomUUID()
  console.error(JSON.stringify({ event: 'admin_registration_details_unavailable', correlation }))
  return privateReply({ error: 'No pudimos completar la operación. Recargá la ficha antes de reintentar.', correlation }, 503)
}
