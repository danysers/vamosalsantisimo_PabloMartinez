import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { authorizeOperator, privateReply } from '../../../../../../lib/admin-api'
import { getDb } from '../../../../../../lib/db'
import { groupRequestSchema } from '../../../../../../lib/group-request-schema'
import { readSmallJson } from '../../../../../../lib/read-small-json'
import { quoteOrCreateGroup } from '../../../../../../lib/workshop-admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = groupRequestSchema.safeParse(await readSmallJson(request, 32_768))
    if (!parsed.success) return privateReply({ error: 'Revisá los integrantes, el pagador y la forma de pago.' }, 400)
    const result = await quoteOrCreateGroup(getDb(), { ...parsed.data, eventSlug: operator.eventSlug }, false)
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`group_quote_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo calcular el grupo.', correlation }, 503)
  }
}
