import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { searchPendingIndividualRegistrations } from '../../../../../lib/workshop-admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
    if ('response' in operator) return operator.response
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (query.length > 100) return privateReply({ error: 'Búsqueda demasiado larga.' }, 400)
    const registrations = await searchPendingIndividualRegistrations(getDb(), operator.eventSlug, query)
    return privateReply({ registrations }, 200)
  } catch {
    const correlation = randomUUID()
    console.error(`pending_registrations_search_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo buscar inscripciones.', correlation }, 503)
  }
}
