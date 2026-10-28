import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOperator, privateReply } from '../../../../../lib/admin-api'
import { verifyManualPayment } from '../../../../../lib/accreditation-workflow'
import { getDb } from '../../../../../lib/db'
import { readSmallJson } from '../../../../../lib/read-small-json'

export const runtime = 'nodejs'

const payload = z.object({
  reference: z.string().trim().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/),
  note: z.string().trim().min(5).max(1000),
  manualReference: z.string().trim().max(120).default(''),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const operator = await authorizeOperator(request, ['configuration', 'registration_operator'])
    if ('response' in operator) return operator.response
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateReply({ error: 'Solicitud inválida.' }, 400)
    const parsed = payload.safeParse(await readSmallJson(request))
    if (!parsed.success) return privateReply({ error: 'Revisá la referencia y la nota de verificación.' }, 400)
    const result = await verifyManualPayment(getDb(), { ...parsed.data, eventSlug: operator.eventSlug, operatorId: operator.operatorId })
    return privateReply(result.body, result.code)
  } catch {
    const correlation = randomUUID()
    console.error(`manual_payment_verification_failed correlation=${correlation}`)
    return privateReply({ error: 'No se pudo verificar el pago. No se registró como aprobado.', correlation }, 503)
  }
}
