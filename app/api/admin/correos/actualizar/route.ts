import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { requestBounceSync, waitForBounceSync } from '../../../../../lib/manual-bounce-sync'

export const runtime = 'nodejs'
const schema = z.object({ requestId: z.uuid() }).strict()
export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    let input: z.infer<typeof schema>
    try { input = schema.parse(await readSmallJson(request)) } catch { return privateReply({ error: 'Solicitud inválida.' }, 400) }
    const requestState = await requestBounceSync(getDb(), operator.operatorId, input.requestId)
    const status = requestState.started ? await waitForBounceSync(requestState.requestId) : requestState.status
    return privateReply({ status, cached: !!requestState.cached, pending: status === 'queued' || status === 'running' }, status === 'queued' || status === 'running' ? 202 : 200)
  } catch { return privateReply({ error: 'No pudimos solicitar la consulta de correos. Reintentá en unos instantes.' }, 503) }
}
