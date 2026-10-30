import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../lib/admin-api'
import { readSmallJson } from '../../../../lib/read-small-json'
import { incidentSchema } from '../../../../lib/incident-policy'
import { recordIncident, readIncidents } from '../../../../lib/operational-incidents'
export async function GET(request: NextRequest) {
  const access = await authorizeOperator(request, ['configuration', 'registration_operator'], false)
  if ('response' in access) return access.response
  return privateReply(await readIncidents(access.eventSlug, request.nextUrl.searchParams.get('q') || ''), 200)
}
export async function POST(request: NextRequest) {
  const access = await authorizeOperator(request, ['configuration', 'registration_operator'])
  if ('response' in access) return access.response
  try {
    const event = incidentSchema.parse(await readSmallJson(request))
    const stored = await recordIncident(event, 'client')
    return privateReply({ stored, trackingId: event.correlationId }, stored ? 202 : 503)
  } catch { return privateReply({ error: 'Solicitud inválida.' }, 400) }
}
