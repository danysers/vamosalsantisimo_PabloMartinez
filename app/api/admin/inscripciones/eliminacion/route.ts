import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'
import { changeRegistrationDeletion } from '../../../../../lib/registration-deletion'

export const runtime = 'nodejs'
const schema = z.object({ reference: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  operation: z.enum(['delete', 'restore']), confirmation: z.string().max(40).optional() }).strict()

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = schema.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({ error: 'Revisá la confirmación.' }, 400)
    const result = await changeRegistrationDeletion(getDb(), { ...parsed.data, ...operator })
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`registration_deletion_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo guardar el cambio. Actualizá la lista antes de reintentar.', correlation }, 503)
  }
}
